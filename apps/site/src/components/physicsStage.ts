import { createBox3D, TRANSFORM_STRIDE, type Box3D, type PhysicsWorld, type TransformBatch } from "box3d-wasm";
import Stats from "stats.js";
import { WebGLRenderer } from "three";
import * as THREE from "three/webgpu";
import { color, float, mix, oscSine, pass, time } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pane } from "tweakpane";
import type {
  ControlDefinition,
  InstancedBodies,
  MaterialRole,
  ScenarioContext,
  ScenarioDefinition,
  ScenarioInstance,
  ScenarioParams,
  SimBody
} from "../lib/scenarios";

type StageVariant = "hero" | "example";
type RendererBackend = "webgpu-tsl" | "webgl";
type StageRenderer = THREE.WebGPURenderer | WebGLRenderer;

type RuntimeMetrics = {
  frameMs: number;
  physicsMs: number;
  bodies: number;
  awake: number;
  drawCalls: number;
  triangles: number;
  backend: RendererBackend;
};

const FIXED_STEP = 1 / 60;

function cloneDefaults(defaults: ScenarioParams) {
  return Object.fromEntries(Object.entries(defaults)) as ScenarioParams;
}

function scenarioSignature(scenario: ScenarioDefinition) {
  return JSON.stringify({
    defaults: scenario.defaults,
    controls: scenario.controls.map((folder) => ({
      title: folder.title,
      controls: folder.controls.map(({ key, label, min, max, step }) => ({ key, label, min, max, step }))
    }))
  });
}

function storageKey(scenario: ScenarioDefinition) {
  return `box3d-wasm.settings.${scenario.id}`;
}

function loadParams(scenario: ScenarioDefinition) {
  const defaults = cloneDefaults(scenario.defaults);
  const signature = scenarioSignature(scenario);
  const stored = localStorage.getItem(storageKey(scenario));

  if (!stored) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(stored) as { signature?: string; values?: ScenarioParams };
    if (parsed.signature !== signature || !parsed.values) {
      localStorage.removeItem(storageKey(scenario));
      return defaults;
    }

    return { ...defaults, ...parsed.values };
  } catch {
    localStorage.removeItem(storageKey(scenario));
    return defaults;
  }
}

function saveParams(scenario: ScenarioDefinition, params: ScenarioParams) {
  localStorage.setItem(
    storageKey(scenario),
    JSON.stringify({
      signature: scenarioSignature(scenario),
      values: params
    })
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        materials.add(entry);
      }
    } else if (material) {
      materials.add(material);
    }
  });

  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
}

function hex(colorValue: string) {
  return new THREE.Color(colorValue).getHex();
}

function makeStandardMaterial(
  backend: RendererBackend,
  colorValue: string,
  options: {
    metalness?: number;
    roughness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    pulse?: boolean;
  } = {}
) {
  if (backend === "webgpu-tsl") {
    const material = new THREE.MeshStandardNodeMaterial();
    const baseColor = color(hex(colorValue));
    material.colorNode = options.pulse ? mix(baseColor, color(0xffffff), oscSine(time.mul(0.7)).mul(0.12)) : baseColor;
    material.roughnessNode = float(options.roughness ?? 0.62);
    material.metalnessNode = float(options.metalness ?? 0.14);

    if (options.emissive) {
      const pulse = options.pulse ? oscSine(time.mul(1.2)).mul(0.35).add(0.2) : float(options.emissiveIntensity ?? 0.3);
      material.emissiveNode = color(hex(options.emissive)).mul(pulse);
    }

    if (options.transparent || options.opacity !== undefined) {
      material.transparent = true;
      material.opacityNode = float(options.opacity ?? 0.75);
      material.opacity = options.opacity ?? 0.75;
    }

    return material;
  }

  return new THREE.MeshStandardMaterial({
    color: colorValue,
    roughness: options.roughness ?? 0.62,
    metalness: options.metalness ?? 0.14,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissive ? (options.emissiveIntensity ?? 0.3) : 0,
    transparent: options.transparent,
    opacity: options.opacity
  });
}

function createMaterials(accent: string, backend: RendererBackend) {
  const cache = new Map<MaterialRole, THREE.Material>();
  const make = (
    key: MaterialRole,
    colorValue: string,
    options: Parameters<typeof makeStandardMaterial>[2] = {}
  ) => {
    const material = makeStandardMaterial(backend, colorValue, options);
    cache.set(key, material);
    return material;
  };

  make("ground", "#2f3b37", { roughness: 0.82, metalness: 0.05 });
  make("wall", "#65716c", { roughness: 0.7, metalness: 0.22 });
  make("primary", "#257569", { roughness: 0.48, metalness: 0.18 });
  make("secondary", "#d8705f", { roughness: 0.56, metalness: 0.16 });
  make("accent", accent, { roughness: 0.42, metalness: 0.28, emissive: accent, pulse: true });
  make("danger", "#e84d5f", { roughness: 0.5, metalness: 0.22, emissive: "#34070d", emissiveIntensity: 0.35 });
  make("reward", "#f4c84d", { roughness: 0.36, metalness: 0.38, emissive: "#3a2c00", emissiveIntensity: 0.28, pulse: true });
  make("glass", "#9ee7db", { roughness: 0.14, metalness: 0.02, transparent: true, opacity: 0.44 });
  make("debug", "#2ad8c2", { roughness: 0.3, emissive: "#123a34", emissiveIntensity: 0.35 });

  const colorCache = new Map<string, THREE.Material>();

  return {
    role(role: MaterialRole) {
      return cache.get(role)!;
    },
    color(colorValue: string, options: { metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number } = {}) {
      const key = JSON.stringify([backend, colorValue, options]);
      const existing = colorCache.get(key);
      if (existing) {
        return existing;
      }

      const material = makeStandardMaterial(backend, colorValue, {
        metalness: options.metalness ?? 0.16,
        roughness: options.roughness ?? 0.55,
        emissive: options.emissive,
        emissiveIntensity: options.emissive ? (options.emissiveIntensity ?? 0.3) : 0
      });
      colorCache.set(key, material);
      return material;
    }
  };
}

function configureShadow(light: THREE.DirectionalLight, extent: number) {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -extent;
  light.shadow.camera.right = extent;
  light.shadow.camera.top = extent;
  light.shadow.camera.bottom = -extent;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = Math.max(34, extent * 3.4);
}

function addLights(scene: THREE.Scene, extent = 14, preset: "studio" | "night" = "studio") {
  if (preset === "night") {
    scene.add(new THREE.HemisphereLight(0x33456e, 0x080b12, 0.66));

    const moon = new THREE.DirectionalLight(0x9db8ff, 1.15);
    moon.position.set(-5, 9, 3.5).normalize().multiplyScalar(Math.max(10, extent));
    configureShadow(moon, extent);
    scene.add(moon);

    const ember = new THREE.DirectionalLight(0xff9a5c, 0.24);
    ember.position.set(6, 2.5, -5);
    scene.add(ember);
    return;
  }

  scene.add(new THREE.HemisphereLight(0xbfe4de, 0x38453f, 0.82));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4.5, 8, 4.2).normalize().multiplyScalar(Math.max(10, extent));
  configureShadow(key, extent);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x98d8ff, 1.0);
  rim.position.set(-6, 5, -5);
  scene.add(rim);
}

function createPanelGrid() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x7fa096, transparent: true, opacity: 0.26 });
  const geometry = new THREE.BufferGeometry();
  const points: number[] = [];
  const span = 10;

  for (let i = -span; i <= span; i += 1) {
    points.push(-span, 0.012, i, span, 0.012, i);
    points.push(i, 0.012, -span, i, 0.012, span);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, material));
  return group;
}

function addBoxEdges(mesh: THREE.Mesh, colorValue = 0x18221f) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: colorValue, transparent: true, opacity: 0.32 })
  );
  edges.renderOrder = 2;
  mesh.add(edges);
}

async function createRenderer(variant: StageVariant): Promise<{ renderer: StageRenderer; backend: RendererBackend; warning?: string }> {
  if ("gpu" in navigator) {
    try {
      const renderer = new THREE.WebGPURenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
      await renderer.init();
      setupRenderer(renderer, variant);
      const backend = renderer as unknown as {
        backend?: { device?: { lost?: Promise<{ reason?: string; message?: string }> } };
      };
      backend.backend?.device?.lost?.then((info) => {
        if (info.reason === "unknown") {
          console.warn("WebGPU device lost", info.message);
        }
      });
      return { renderer, backend: "webgpu-tsl" };
    } catch (error) {
      console.warn("WebGPU init failed, falling back to WebGL", error);
    }
  }

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  setupRenderer(renderer, variant);
  return { renderer, backend: "webgl", warning: "WebGPU unavailable, using WebGL fallback" };
}

function setupRenderer(renderer: StageRenderer, variant: StageVariant) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = variant === "hero" ? 1.1 : 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.domElement.className = "physics-canvas";
}

export class PhysicsStage {
  readonly element: HTMLElement;

  #hostElement: HTMLDivElement;
  #diagnosticsElement: HTMLElement;
  #metricsElement: HTMLDivElement;
  #hintElement: HTMLDivElement | undefined;
  #scenario: ScenarioDefinition;
  #variant: StageVariant;
  #disposed = false;
  #animationFrame = 0;
  #rebuildTimer = 0;
  #currentWorld: PhysicsWorld | undefined;
  #currentInstance: ScenarioInstance | undefined;
  #currentLandmarks: THREE.Group | undefined;
  #currentBodies: SimBody[] = [];
  #instancedGroups: InstancedBodies[] = [];
  #transformBatch: TransformBatch | undefined;
  #batchBodies: SimBody[] = [];
  #box3d: Box3D | undefined;
  #renderer: StageRenderer | undefined;
  #backend: RendererBackend = "webgl";
  #scene: THREE.Scene | undefined;
  #camera: THREE.PerspectiveCamera | undefined;
  #postProcessing: THREE.RenderPipeline | undefined;
  #composer: EffectComposer | undefined;
  #orbit: OrbitControls | undefined;
  #pane: Pane | undefined;
  #stats: Stats | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #raycaster = new THREE.Raycaster();
  #pointerNdc = new THREE.Vector2();
  #groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  #pointerDownAt = 0;
  #pointerDownPos: [number, number] = [0, 0];
  #tmpMatrix = new THREE.Matrix4();
  #tmpPosition = new THREE.Vector3();
  #tmpQuaternion = new THREE.Quaternion();
  #tmpScale = new THREE.Vector3(1, 1, 1);
  #lastTime = performance.now();
  #accumulator = 0;
  #elapsed = 0;
  #frameCounter = 0;
  #diagnosticsVisible = true;
  #params: ScenarioParams;
  #metrics: RuntimeMetrics = {
    frameMs: 0,
    physicsMs: 0,
    bodies: 0,
    awake: 0,
    drawCalls: 0,
    triangles: 0,
    backend: "webgl"
  };

  constructor(mount: HTMLElement, scenario: ScenarioDefinition, variant: StageVariant = "example") {
    this.#scenario = scenario;
    this.#variant = variant;
    this.#params = loadParams(scenario);
    this.element = document.createElement("div");
    this.element.className = `physics-stage physics-stage--${variant}`;
    this.element.innerHTML = `
      <div class="physics-host" aria-label="${scenario.title} physics simulation"></div>
      <aside class="diagnostics-shell">
        <div class="metrics-readout"></div>
      </aside>
    `;
    mount.replaceChildren(this.element);

    this.#hostElement = this.element.querySelector(".physics-host")!;
    this.#diagnosticsElement = this.element.querySelector(".diagnostics-shell")!;
    this.#metricsElement = this.element.querySelector(".metrics-readout")!;

    if (scenario.hint) {
      this.#hintElement = document.createElement("div");
      this.#hintElement.className = "stage-hint";
      this.#hintElement.textContent = scenario.hint;
      this.element.appendChild(this.#hintElement);
    }

    void this.#mount();
  }

  destroy() {
    this.#disposed = true;
    window.clearTimeout(this.#rebuildTimer);
    cancelAnimationFrame(this.#animationFrame);
    window.removeEventListener("keydown", this.#onKeydown);
    this.#renderer?.domElement.removeEventListener("pointerdown", this.#onPointerDown);
    this.#renderer?.domElement.removeEventListener("pointerup", this.#onPointerUp);
    this.#resizeObserver?.disconnect();
    this.#currentInstance?.dispose?.();
    this.#transformBatch?.dispose();
    this.#transformBatch = undefined;
    this.#currentWorld?.dispose();
    this.#pane?.dispose();
    this.#postProcessing?.dispose();
    this.#composer?.dispose();
    this.#renderer?.dispose();
    this.#orbit?.dispose();

    if (this.#scene) {
      for (const child of [...this.#scene.children]) {
        this.#scene.remove(child);
        disposeObject(child);
      }
    }

    this.element.remove();
  }

  async #mount() {
    let rendererBundle: Awaited<ReturnType<typeof createRenderer>>;
    try {
      rendererBundle = await createRenderer(this.#variant);
    } catch (error) {
      this.#hostElement.classList.add("physics-host--unavailable");
      this.#metricsElement.textContent = `Renderer unavailable: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }

    if (this.#disposed) {
      rendererBundle.renderer.dispose();
      return;
    }

    this.#renderer = rendererBundle.renderer;
    this.#backend = rendererBundle.backend;
    this.#metrics.backend = rendererBundle.backend;
    this.#hostElement.appendChild(this.#renderer.domElement);

    this.#scene = new THREE.Scene();
    // Scale fog to the scenario's framing so far cameras don't fog the scene out.
    const camPosition = new THREE.Vector3(...this.#scenario.camera.position);
    const camTarget = new THREE.Vector3(...this.#scenario.camera.target);
    const camDistance = camPosition.distanceTo(camTarget);
    const visuals = this.#scenario.visuals;
    if (visuals?.fog !== false) {
      const fogColor = hex(visuals?.fog?.color ?? "#101514");
      this.#scene.fog = new THREE.Fog(
        fogColor,
        visuals?.fog?.near ?? Math.max(14, camDistance * 1.1),
        visuals?.fog?.far ?? Math.max(30, camDistance * 2.4)
      );
    }
    if (visuals?.background) {
      this.#scene.background = new THREE.Color(hex(visuals.background));
    }

    this.#camera = new THREE.PerspectiveCamera(this.#scenario.camera.fov ?? 43, 1, 0.05, 200);
    this.#camera.position.copy(camPosition);
    this.#setupPostProcessing();

    this.#orbit = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#orbit.enableDamping = true;
    this.#orbit.dampingFactor = 0.08;
    this.#orbit.target.copy(camTarget);
    this.#orbit.maxDistance = Math.max(40, camDistance * 1.8);
    this.#orbit.minDistance = 3.5;
    this.#orbit.update();

    this.#stats = new Stats();
    this.#stats.showPanel(0);
    this.#stats.dom.className = "stats-readout";
    this.#diagnosticsElement.appendChild(this.#stats.dom);

    this.#pane = new Pane({
      title: this.#scenario.title,
      container: this.#diagnosticsElement
    });
    this.#pane.element.classList.add("stage-pane");

    this.#bindPane();
    this.#resizeObserver = new ResizeObserver(this.#resize);
    this.#resizeObserver.observe(this.#hostElement);
    window.addEventListener("keydown", this.#onKeydown);
    this.#renderer.domElement.addEventListener("pointerdown", this.#onPointerDown);
    this.#renderer.domElement.addEventListener("pointerup", this.#onPointerUp);

    if (rendererBundle.warning) {
      this.#metricsElement.dataset.warning = rendererBundle.warning;
    }

    createBox3D()
      .then((loaded) => {
        if (this.#disposed) {
          return;
        }

        this.#box3d = loaded;
        this.#resize();
        this.#rebuildScene();
        this.#updateMetrics();
        this.#animationFrame = requestAnimationFrame(this.#frame);
      })
      .catch((error) => {
        this.#metricsElement.textContent = `WASM load failed: ${error instanceof Error ? error.message : String(error)}`;
      });
  }

  #bindPane() {
    if (!this.#pane) {
      return;
    }

    for (const folderDefinition of this.#scenario.controls) {
      const folder = this.#pane.addFolder({ title: folderDefinition.title, expanded: true });
      for (const control of folderDefinition.controls) {
        this.#bindControl(folder, control);
      }
    }

    const actionsFolder = this.#pane.addFolder({ title: "Scenario actions", expanded: true });
    for (const action of this.#scenario.actions) {
      actionsFolder.addButton({ title: action.title }).on("click", () => {
        if (action.id === "reset") {
          this.#rebuildScene();
          return;
        }
        this.#currentInstance?.actions?.[action.id]?.();
      });
    }
    actionsFolder.addButton({ title: "Reset defaults" }).on("click", this.#resetParams);
  }

  #bindControl(folder: ReturnType<Pane["addFolder"]>, definition: ControlDefinition) {
    const value = this.#params[definition.key];
    const options =
      typeof value === "number"
        ? {
            label: definition.label,
            min: definition.min,
            max: definition.max,
            step: definition.step
          }
        : {
            label: definition.label
          };

    const binding = folder.addBinding(this.#params, definition.key, options);
    binding.on("change", () => {
      saveParams(this.#scenario, this.#params);
      if (definition.key === "showLandmarks" && this.#currentLandmarks) {
        this.#currentLandmarks.visible = Boolean(this.#params.showLandmarks);
      }
      if (definition.rebuild !== false) {
        this.#scheduleRebuild();
      }
    });
  }

  #setupPostProcessing() {
    const bloomOptions = this.#scenario.visuals?.bloom;
    if (!bloomOptions || !this.#renderer || !this.#scene || !this.#camera) {
      return;
    }

    const strength = bloomOptions.strength ?? 0.6;
    const radius = bloomOptions.radius ?? 0.45;
    const threshold = bloomOptions.threshold ?? 0.62;

    if (this.#backend === "webgpu-tsl") {
      const scenePass = pass(this.#scene, this.#camera);
      const post = new THREE.RenderPipeline(this.#renderer as THREE.WebGPURenderer);
      post.outputNode = scenePass.add(bloom(scenePass, strength, radius, threshold));
      this.#postProcessing = post;
      return;
    }

    const composer = new EffectComposer(this.#renderer as WebGLRenderer);
    composer.addPass(new RenderPass(this.#scene, this.#camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold));
    composer.addPass(new OutputPass());
    this.#composer = composer;
  }

  #scheduleRebuild = () => {
    window.clearTimeout(this.#rebuildTimer);
    this.#rebuildTimer = window.setTimeout(() => {
      this.#rebuildScene();
    }, 90);
  };

  #resetParams = () => {
    const defaults = cloneDefaults(this.#scenario.defaults);
    for (const key of Object.keys(this.#params)) {
      delete this.#params[key];
    }
    Object.assign(this.#params, defaults);
    saveParams(this.#scenario, this.#params);
    this.#pane?.refresh();
    this.#rebuildScene();
  };

  #resize = () => {
    if (!this.#renderer || !this.#camera) {
      return;
    }

    const rect = this.#hostElement.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.#renderer.setSize(width, height, false);
    this.#composer?.setSize(width, height);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  };

  #makeContext(world: PhysicsWorld, materials: ReturnType<typeof createMaterials>, landmarkGroup: THREE.Group): ScenarioContext {
    const scene = this.#scene!;
    const addBody = (body: SimBody) => {
      this.#currentBodies.push(body);
      scene.add(body.object);
      return body;
    };

    return {
      world,
      scene,
      camera: this.#camera!,
      landmarkGroup,
      params: this.#params,
      material: (role) => materials.role(role),
      colorMaterial: (colorValue, options) => materials.color(colorValue, options),
      addBox: (options) => {
        const body = world.createBox({
          type: options.type,
          position: options.position,
          halfExtents: options.halfExtents,
          density: options.density,
          friction: options.friction,
          restitution: options.restitution,
          rollingResistance: options.rollingResistance,
          bullet: options.bullet
        });
        if (options.rotation) {
          world.setBodyTransform(body, options.position, options.rotation);
        }
        const geometry = new THREE.BoxGeometry(options.halfExtents[0] * 2, options.halfExtents[1] * 2, options.halfExtents[2] * 2);
        const mesh = new THREE.Mesh(geometry, options.material);
        mesh.castShadow = options.castShadow ?? options.type === 2;
        mesh.receiveShadow = options.receiveShadow ?? options.type !== 2;
        addBoxEdges(mesh);
        mesh.position.set(options.position[0], options.position[1], options.position[2]);
        if (options.rotation) {
          mesh.quaternion.set(options.rotation[0], options.rotation[1], options.rotation[2], options.rotation[3]);
        }
        return addBody({
          body,
          object: mesh,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
          origin: [options.position[0], options.position[1], options.position[2]],
          dynamic: options.type !== 0
        });
      },
      addSphere: (options) => {
        const body = world.createSphere({
          type: options.type,
          position: options.position,
          radius: options.radius,
          density: options.density,
          friction: options.friction,
          restitution: options.restitution,
          rollingResistance: options.rollingResistance,
          bullet: options.bullet
        });
        const group = new THREE.Group();
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 32, 18), options.material);
        sphere.castShadow = options.castShadow ?? options.type === 2;
        sphere.receiveShadow = options.receiveShadow ?? true;
        const ringMaterial = new THREE.LineBasicMaterial({ color: 0x121614, transparent: true, opacity: 0.34 });
        const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TorusGeometry(options.radius * 1.03, 0.012, 6, 44)), ringMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(sphere, ring);
        group.position.set(options.position[0], options.position[1], options.position[2]);
        return addBody({
          body,
          object: group,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
          origin: [options.position[0], options.position[1], options.position[2]],
          dynamic: options.type !== 0
        });
      },
      addCapsule: (options) => {
        const body = world.createCapsule({
          type: options.type,
          position: options.position,
          halfHeight: options.halfHeight,
          radius: options.radius,
          density: options.density,
          friction: options.friction,
          restitution: options.restitution,
          rollingResistance: options.rollingResistance,
          bullet: options.bullet
        });
        const mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(options.radius, options.halfHeight * 2, 6, 22),
          options.material
        );
        mesh.castShadow = options.castShadow ?? options.type === 2;
        mesh.receiveShadow = options.receiveShadow ?? true;
        mesh.position.set(options.position[0], options.position[1], options.position[2]);
        return addBody({
          body,
          object: mesh,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
          origin: [options.position[0], options.position[1], options.position[2]],
          dynamic: options.type !== 0
        });
      },
      addInstancedBoxes: (options) => {
        const geometry = new THREE.BoxGeometry(options.halfExtents[0] * 2, options.halfExtents[1] * 2, options.halfExtents[2] * 2);
        return this.#addInstancedGroup(world, geometry, options, (position) =>
          world.createBox({
            type: 2,
            position,
            halfExtents: options.halfExtents,
            density: options.density,
            friction: options.friction,
            restitution: options.restitution
          })
        );
      },
      addHuman: (position, options) => {
        const ragdoll = world.spawnHuman(position, options);
        const bodies: SimBody[] = [];
        const materialFor = options?.material;
        for (let i = 0; i < ragdoll.bones.length; i += 1) {
          const handle = ragdoll.bones[i];
          const capsule = world.getBodyCapsule(handle);
          const group = new THREE.Group();
          if (capsule) {
            const from = new THREE.Vector3(...capsule.center1);
            const to = new THREE.Vector3(...capsule.center2);
            const axis = to.clone().sub(from);
            const length = axis.length();
            const mesh = new THREE.Mesh(
              new THREE.CapsuleGeometry(capsule.radius, length, 6, 16),
              materialFor?.(i) ?? materials.role(i === 0 || i > 5 ? "primary" : i === 5 ? "reward" : "secondary")
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.copy(from).add(to).multiplyScalar(0.5);
            if (length > 1e-5) {
              mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
            }
            group.add(mesh);
          }
          const transform = world.getBodyTransform(handle);
          group.position.set(...transform.position);
          group.quaternion.set(...transform.rotation);
          const body: SimBody = {
            body: handle,
            object: group,
            transform,
            origin: [transform.position[0], transform.position[1], transform.position[2]],
            dynamic: true
          };
          bodies.push(addBody(body));
        }
        return { human: ragdoll.human, bodies };
      },
      addInstancedSpheres: (options) => {
        const geometry = new THREE.SphereGeometry(options.radius, 18, 12);
        return this.#addInstancedGroup(world, geometry, options, (position) =>
          world.createSphere({
            type: 2,
            position,
            radius: options.radius,
            density: options.density,
            friction: options.friction,
            restitution: options.restitution,
            rollingResistance: options.rollingResistance
          })
        );
      },
      addLandmarkSphere: (position, radius, colorValue) => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 18, 12),
          new THREE.MeshBasicMaterial({ color: colorValue, transparent: true, opacity: 0.78 })
        );
        marker.position.set(position[0], position[1], position[2]);
        landmarkGroup.add(marker);
      },
      addLandmarkLine: (from, to, colorValue) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(from[0], from[1], from[2]),
          new THREE.Vector3(to[0], to[1], to[2])
        ]);
        const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colorValue, transparent: true, opacity: 0.88 }));
        landmarkGroup.add(line);
      }
    };
  }

  #addInstancedGroup(
    world: PhysicsWorld,
    geometry: THREE.BufferGeometry,
    options: {
      count: number;
      material: THREE.Material;
      position: (index: number) => readonly [number, number, number];
      rotation?: (index: number) => readonly [number, number, number, number];
    },
    createBody: (position: readonly [number, number, number]) => number
  ): InstancedBodies {
    const scene = this.#scene!;
    const mesh = new THREE.InstancedMesh(geometry, options.material, options.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const bodies: number[] = [];
    for (let i = 0; i < options.count; i += 1) {
      const position = options.position(i);
      const rotation = options.rotation?.(i);
      const handle = createBody(position);
      if (rotation) {
        world.setBodyTransform(handle, position, rotation);
        this.#tmpQuaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      } else {
        this.#tmpQuaternion.identity();
      }
      bodies.push(handle);
      this.#tmpPosition.set(position[0], position[1], position[2]);
      this.#tmpMatrix.compose(this.#tmpPosition, this.#tmpQuaternion, this.#tmpScale);
      mesh.setMatrixAt(i, this.#tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);

    const group: InstancedBodies = { bodies, mesh };
    this.#instancedGroups.push(group);
    return group;
  }

  #rebuildBatch() {
    this.#transformBatch?.dispose();
    this.#transformBatch = undefined;
    this.#batchBodies = this.#currentBodies.filter((body) => body.dynamic);

    const handles: number[] = this.#batchBodies.map((body) => body.body);
    for (const group of this.#instancedGroups) {
      for (const handle of group.bodies) {
        handles.push(handle);
      }
    }

    if (handles.length > 0 && this.#currentWorld) {
      this.#transformBatch = this.#currentWorld.createTransformBatch(handles);
    }
  }

  #rebuildScene() {
    if (!this.#box3d || this.#disposed || !this.#scene) {
      return;
    }

    this.#currentInstance?.dispose?.();
    this.#transformBatch?.dispose();
    this.#transformBatch = undefined;
    this.#currentWorld?.dispose();
    this.#currentWorld = undefined;
    this.#currentInstance = undefined;
    this.#currentLandmarks = undefined;
    this.#currentBodies = [];
    this.#instancedGroups = [];
    this.#batchBodies = [];
    this.#accumulator = 0;
    this.#elapsed = 0;

    for (const child of [...this.#scene.children]) {
      this.#scene.remove(child);
      disposeObject(child);
    }

    const camPosition = new THREE.Vector3(...this.#scenario.camera.position);
    const camTarget = new THREE.Vector3(...this.#scenario.camera.target);
    const visuals = this.#scenario.visuals;
    addLights(this.#scene, Math.max(14, camPosition.distanceTo(camTarget) * 0.8), visuals?.lighting ?? "studio");
    if (visuals?.grid !== false) {
      this.#scene.add(createPanelGrid());
    }

    const materials = createMaterials(this.#scenario.accent, this.#backend);
    const world = this.#box3d.createWorld(this.#scenario.gravity(this.#params));
    this.#currentWorld = world;
    const landmarkGroup = new THREE.Group();
    landmarkGroup.name = "landmarkDebugLayer";
    landmarkGroup.visible = Boolean(this.#params.showLandmarks);
    this.#scene.add(landmarkGroup);
    this.#currentLandmarks = landmarkGroup;

    this.#currentInstance = this.#scenario.setup(this.#makeContext(world, materials, landmarkGroup));
    this.#rebuildBatch();
  }

  #updateBodyTransforms() {
    if (!this.#transformBatch) {
      return;
    }

    const data = this.#transformBatch.read();
    let awake = 0;
    let offset = 0;

    for (const body of this.#batchBodies) {
      const px = data[offset];
      const py = data[offset + 1];
      const pz = data[offset + 2];
      const qx = data[offset + 3];
      const qy = data[offset + 4];
      const qz = data[offset + 5];
      const qw = data[offset + 6];
      awake += data[offset + 7];
      body.transform.position[0] = px;
      body.transform.position[1] = py;
      body.transform.position[2] = pz;
      body.transform.rotation[0] = qx;
      body.transform.rotation[1] = qy;
      body.transform.rotation[2] = qz;
      body.transform.rotation[3] = qw;
      body.object.position.set(px, py, pz);
      body.object.quaternion.set(qx, qy, qz, qw);
      offset += TRANSFORM_STRIDE;
    }

    for (const group of this.#instancedGroups) {
      const count = group.bodies.length;
      for (let i = 0; i < count; i += 1) {
        this.#tmpPosition.set(data[offset], data[offset + 1], data[offset + 2]);
        this.#tmpQuaternion.set(data[offset + 3], data[offset + 4], data[offset + 5], data[offset + 6]);
        awake += data[offset + 7];
        this.#tmpMatrix.compose(this.#tmpPosition, this.#tmpQuaternion, this.#tmpScale);
        group.mesh.setMatrixAt(i, this.#tmpMatrix);
        offset += TRANSFORM_STRIDE;
      }
      group.mesh.instanceMatrix.needsUpdate = true;
    }

    this.#metrics.awake = awake;
    this.#metrics.bodies = this.#transformBatch.count;
  }

  #updateMetrics() {
    const scenarioMetrics = this.#currentInstance?.metrics?.() ?? {};
    const warning = this.#metricsElement.dataset.warning ? `<span>${this.#metricsElement.dataset.warning}</span>` : "";
    this.#metricsElement.innerHTML = [
      `<span>Backend ${this.#metrics.backend}</span>`,
      `<span>Frame ${this.#metrics.frameMs.toFixed(1)} ms</span>`,
      `<span>Physics ${this.#metrics.physicsMs.toFixed(2)} ms</span>`,
      `<span>Bodies ${this.#metrics.bodies}</span>`,
      `<span>Awake ${this.#metrics.awake}</span>`,
      `<span>Calls ${this.#metrics.drawCalls}</span>`,
      `<span>Triangles ${this.#metrics.triangles}</span>`,
      warning,
      ...Object.entries(scenarioMetrics).map(([key, value]) => `<span>${key} ${value}</span>`)
    ].join("");
  }

  #onPointerDown = (event: PointerEvent) => {
    this.#pointerDownAt = performance.now();
    this.#pointerDownPos = [event.clientX, event.clientY];
  };

  #onPointerUp = (event: PointerEvent) => {
    const elapsed = performance.now() - this.#pointerDownAt;
    const moved = Math.hypot(event.clientX - this.#pointerDownPos[0], event.clientY - this.#pointerDownPos[1]);
    if (elapsed > 320 || moved > 9) {
      return;
    }

    this.#handleStageClick(event);
  };

  #handleStageClick(event: PointerEvent) {
    if (!this.#renderer || !this.#camera || !this.#currentWorld) {
      return;
    }

    const rect = this.#renderer.domElement.getBoundingClientRect();
    this.#pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.#raycaster.setFromCamera(this.#pointerNdc, this.#camera);

    const targets: THREE.Object3D[] = this.#batchBodies.map((body) => body.object);
    for (const group of this.#instancedGroups) {
      targets.push(group.mesh);
    }

    let point: [number, number, number] | undefined;
    let bodyHandle: number | undefined;

    const hits = this.#raycaster.intersectObjects(targets, true);
    const hit = hits[0];
    if (hit) {
      point = [hit.point.x, hit.point.y, hit.point.z];
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        const group = this.#instancedGroups.find((entry) => entry.mesh === hit.object);
        bodyHandle = group?.bodies[hit.instanceId];
      } else {
        let node: THREE.Object3D | null = hit.object;
        while (node && bodyHandle === undefined) {
          const owner = this.#batchBodies.find((body) => body.object === node);
          if (owner) {
            bodyHandle = owner.body;
          }
          node = node.parent;
        }
      }
    } else {
      const intersection = new THREE.Vector3();
      if (this.#raycaster.ray.intersectPlane(this.#groundPlane, intersection)) {
        point = [intersection.x, intersection.y, intersection.z];
      }
    }

    if (!point) {
      return;
    }

    this.#hintElement?.classList.add("is-dismissed");

    if (this.#currentInstance?.onPointerDown) {
      this.#currentInstance.onPointerDown(point, bodyHandle);
      return;
    }

    // Default interaction: shockwave at the clicked point, extra kick to a hit body.
    this.#currentWorld.explode(point, 2.8, 1, 42);
    if (bodyHandle !== undefined) {
      this.#currentWorld.applyImpulseAtPoint(
        bodyHandle,
        [0, 5 * this.#currentWorld.getBodyMass(bodyHandle), 0],
        point
      );
    }
  }

  #frame = (now: number) => {
    if (!this.#renderer || !this.#scene || !this.#camera || !this.#stats || !this.#orbit) {
      return;
    }

    this.#stats.begin();
    const delta = Math.min((now - this.#lastTime) / 1000, 0.1);
    this.#lastTime = now;
    this.#elapsed += delta;
    this.#metrics.frameMs = delta * 1000;

    if (this.#currentWorld && !this.#params.paused) {
      this.#accumulator += delta;
      let steps = 0;
      const physicsStart = performance.now();
      while (this.#accumulator >= FIXED_STEP && steps < 5) {
        this.#currentWorld.step(FIXED_STEP, 4);
        this.#accumulator -= FIXED_STEP;
        steps += 1;
      }
      // Only sample on frames that actually stepped, otherwise high-refresh
      // displays report 0 most of the time.
      if (steps > 0) {
        this.#metrics.physicsMs = (performance.now() - physicsStart) / steps;
      }
    }

    this.#updateBodyTransforms();
    this.#currentInstance?.update?.(delta, this.#elapsed);
    if (this.#currentLandmarks) {
      this.#currentLandmarks.visible = Boolean(this.#params.showLandmarks);
    }

    this.#orbit.update();
    if (this.#postProcessing) {
      this.#postProcessing.render();
    } else if (this.#composer) {
      this.#composer.render();
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }
    // WebGPU's info.render.calls is cumulative since app start; drawCalls and
    // triangles are per-frame on both backends (WebGL calls per-frame too).
    const renderInfo = this.#renderer.info.render as { calls: number; drawCalls?: number; triangles: number };
    this.#metrics.drawCalls = renderInfo.drawCalls ?? renderInfo.calls;
    this.#metrics.triangles = renderInfo.triangles;

    this.#frameCounter += 1;
    if (this.#frameCounter % 12 === 0) {
      this.#updateMetrics();
      this.#pane?.refresh();
    }

    this.#stats.end();
    this.#animationFrame = requestAnimationFrame(this.#frame);
  };

  #onKeydown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      this.#diagnosticsVisible = !this.#diagnosticsVisible;
      this.#diagnosticsElement.classList.toggle("is-hidden", !this.#diagnosticsVisible);
    }

    if (event.key.toLowerCase() === "m" && "showLandmarks" in this.#params) {
      this.#params.showLandmarks = !this.#params.showLandmarks;
      saveParams(this.#scenario, this.#params);
      if (this.#currentLandmarks) {
        this.#currentLandmarks.visible = Boolean(this.#params.showLandmarks);
      }
      this.#pane?.refresh();
    }

    if (event.key === ".") {
      this.#resetParams();
    }
  };
}
