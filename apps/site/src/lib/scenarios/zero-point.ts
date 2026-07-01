import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { ScenarioDefinition, SimBody, Transform, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const ARENA_HALF = 22;
const WALL_HEIGHT = 3.2;
const EYE_HEIGHT = 1.7;
const PLAYER_GRAVITY = 26;
const HEAD_BONE = 5;

// Impact speeds (m/s) that trigger scoring events. The world hit-event
// threshold sits below all of them so the engine reports every candidate.
const HIT_EVENT_THRESHOLD = 3;
const CRYSTAL_SHATTER_SPEED = 5;
const BARREL_DETONATE_SPEED = 6.5;
const SENTRY_KNOCK_SPEED = 7;

type PropKind = "crate" | "orb" | "barrel" | "crystal" | "debris" | "bone";

type Barrel = { body: number; home: Vec3; object: THREE.Object3D; alive: boolean; timer: number };
type Crystal = { body: number; object: THREE.Object3D; alive: boolean };
type Sentry = { human: number; bones: SimBody[]; joint: number; alive: boolean };

type Burst = {
  light: THREE.PointLight;
  shell: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  radius: number;
  intensity: number;
};

function styleText(element: HTMLElement, css: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, css);
}

export const zeropointScenario: ScenarioDefinition = {
  id: "zero-point",
  title: "Zero-Point",
  eyebrow: "First-person gravity gun",
  deck: "Lock the pointer, rip crates out of stacks with a zero-point rig, and launch them through crystals, powder barrels, and dangling sentries.",
  description:
    "A Half-Life 2 style gravity gun running on real physics: the rig pulls any dynamic body into a velocity-controlled hold, then launches it down your view ray. Impacts are engine contact hit events streamed out of WASM — fast collisions shatter containment crystals, detonate barrels with real radial impulses, and cut sentries loose from their suspension fields. Every crate, bone, and shard of debris is a live body you can grab.",
  accent: "#54d8ff",
  category: "games",
  firstPerson: true,
  visuals: {
    lighting: "night",
    background: "#04060d",
    fog: { color: "#04060d", near: 26, far: 92 },
    grid: false,
    bloom: { strength: 0.35, radius: 0.1, threshold: 0.5 }
  },
  defaults: {
    crates: 34,
    barrels: 7,
    crystals: 9,
    sentries: 3,
    debris: 48,
    grabRange: 17,
    holdDistance: 2.6,
    launchPower: 44,
    puntPower: 26,
    moveSpeed: 7,
    jumpPower: 8.5,
    mouseSense: 1,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Yard (rebuilds)",
      controls: [
        { key: "crates", label: "Crates", min: 10, max: 70, step: 1 },
        { key: "barrels", label: "Powder barrels", min: 0, max: 12, step: 1 },
        { key: "crystals", label: "Crystals", min: 3, max: 12, step: 1 },
        { key: "sentries", label: "Sentries", min: 0, max: 4, step: 1 },
        { key: "debris", label: "Debris field", min: 0, max: 120, step: 1 }
      ]
    },
    {
      title: "Rig tuning",
      controls: [
        { key: "grabRange", label: "Grab range", min: 8, max: 30, step: 0.5, rebuild: false },
        { key: "holdDistance", label: "Hold distance", min: 1.8, max: 4.2, step: 0.1, rebuild: false },
        { key: "launchPower", label: "Launch power", min: 20, max: 70, step: 1, rebuild: false },
        { key: "puntPower", label: "Punt power", min: 10, max: 60, step: 1, rebuild: false }
      ]
    },
    {
      title: "Movement",
      controls: [
        { key: "moveSpeed", label: "Run speed", min: 4, max: 12, step: 0.5, rebuild: false },
        { key: "jumpPower", label: "Jump power", min: 5, max: 14, step: 0.5, rebuild: false },
        { key: "mouseSense", label: "Mouse sense", min: 0.4, max: 2, step: 0.05, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "rain", title: "Crate rain" },
    { id: "detonate", title: "Detonate barrels" },
    { id: "reset", title: "Rebuild yard" }
  ],
  camera: {
    position: [0, EYE_HEIGHT, 15],
    target: [0, 1.5, 0],
    fov: 74
  },
  gravity: () => [0, -14, 0],
  setup(ctx) {
    const camera = ctx.camera as THREE.PerspectiveCamera;
    const world = ctx.world;
    world.setHitEventThreshold(HIT_EVENT_THRESHOLD);

    // The stage's night preset is too dark for gameplay readability at
    // eye level — lift the floor with a cool fill.
    const fill = new THREE.HemisphereLight(0x4a5f8a, 0x232a38, 2.2);
    ctx.scene.add(fill);

    // ---------------------------------------------------------------- arena
    ctx.addBox({
      type: BodyType.Static,
      position: [0, -0.5, 0],
      halfExtents: [ARENA_HALF + 3, 0.5, ARENA_HALF + 3],
      material: ctx.colorMaterial("#222a3d", { roughness: 0.85, metalness: 0.1 }),
      friction: 0.8,
      receiveShadow: true
    });

    const wallMaterial = ctx.colorMaterial("#2b3550", { roughness: 0.65, metalness: 0.3 });
    const trimMaterial = new THREE.MeshBasicMaterial({ color: 0x2fbde8 });
    const wallSpecs: { position: Vec3; halfExtents: Vec3 }[] = [
      { position: [0, WALL_HEIGHT / 2, -ARENA_HALF - 0.6], halfExtents: [ARENA_HALF + 1.2, WALL_HEIGHT / 2, 0.6] },
      { position: [0, WALL_HEIGHT / 2, ARENA_HALF + 0.6], halfExtents: [ARENA_HALF + 1.2, WALL_HEIGHT / 2, 0.6] },
      { position: [-ARENA_HALF - 0.6, WALL_HEIGHT / 2, 0], halfExtents: [0.6, WALL_HEIGHT / 2, ARENA_HALF + 1.2] },
      { position: [ARENA_HALF + 0.6, WALL_HEIGHT / 2, 0], halfExtents: [0.6, WALL_HEIGHT / 2, ARENA_HALF + 1.2] }
    ];
    for (const spec of wallSpecs) {
      ctx.addBox({
        type: BodyType.Static,
        position: spec.position,
        halfExtents: spec.halfExtents,
        material: wallMaterial,
        friction: 0.5
      });
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(spec.halfExtents[0] * 2, 0.07, spec.halfExtents[2] * 2),
        trimMaterial
      );
      trim.position.set(spec.position[0], WALL_HEIGHT + 0.04, spec.position[2]);
      ctx.scene.add(trim);
    }

    // Corner pylons with warm point lights so the yard reads at night.
    const pylonMaterial = ctx.colorMaterial("#232b3d", { roughness: 0.55, metalness: 0.4 });
    const pylonTipMaterial = new THREE.MeshBasicMaterial({ color: 0x69e4ff });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (ARENA_HALF - 2.4);
        const z = sz * (ARENA_HALF - 2.4);
        ctx.addBox({
          type: BodyType.Static,
          position: [x, 2.1, z],
          halfExtents: [0.22, 2.1, 0.22],
          material: pylonMaterial
        });
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), pylonTipMaterial);
        tip.position.set(x, 4.45, z);
        ctx.scene.add(tip);
        const glow = new THREE.PointLight(0x58c8f2, 70, 30, 1.6);
        glow.position.set(x, 4.3, z);
        ctx.scene.add(glow);
      }
    }

    // -------------------------------------------------------------- lookups
    const propKind = new Map<number, PropKind>();
    const bodyByObject = new Map<THREE.Object3D, number>();
    const simByBody = new Map<number, SimBody>();
    const raycastTargets: THREE.Object3D[] = [];

    const registerProp = (sim: SimBody, kind: PropKind) => {
      propKind.set(sim.body, kind);
      bodyByObject.set(sim.object, sim.body);
      simByBody.set(sim.body, sim);
      raycastTargets.push(sim.object);
      return sim;
    };

    // --------------------------------------------------------------- crates
    const crateCount = Math.round(numberParam(ctx.params, "crates"));
    const cratePalette = [
      ctx.colorMaterial("#7a6248", { roughness: 0.85, metalness: 0.05 }),
      ctx.colorMaterial("#8a7355", { roughness: 0.8, metalness: 0.05 }),
      ctx.colorMaterial("#4c5a70", { roughness: 0.5, metalness: 0.45 })
    ];
    const clusterCenters: Vec3[] = [
      [-9, 0, -6], [8, 0, -9], [-12, 0, 7], [11, 0, 8], [0, 0, -12], [-4, 0, 12], [14, 0, -1]
    ];
    for (let i = 0; i < crateCount; i += 1) {
      const cluster = clusterCenters[i % clusterCenters.length];
      const tier = Math.floor(i / clusterCenters.length);
      const half = 0.3 + ((i * 7) % 3) * 0.07;
      const jitterX = Math.sin(i * 12.9898) * 1.1;
      const jitterZ = Math.cos(i * 78.233) * 1.1;
      registerProp(
        ctx.addBox({
          type: BodyType.Dynamic,
          position: [cluster[0] + jitterX, half + tier * 0.95, cluster[2] + jitterZ],
          halfExtents: [half, half, half],
          material: cratePalette[i % cratePalette.length],
          density: 0.9,
          friction: 0.6,
          restitution: 0.06
        }),
        "crate"
      );
    }

    // ----------------------------------------------------------- metal orbs
    const orbMaterial = ctx.colorMaterial("#9fb2c8", { roughness: 0.25, metalness: 0.9 });
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + 0.5;
      registerProp(
        ctx.addSphere({
          type: BodyType.Dynamic,
          position: [Math.cos(angle) * 6.5, 0.4, Math.sin(angle) * 6.5],
          radius: 0.36,
          material: orbMaterial,
          density: 2.4,
          friction: 0.4,
          restitution: 0.3,
          rollingResistance: 0.015
        }),
        "orb"
      );
    }

    // --------------------------------------------------------------- debris
    const debrisCount = Math.round(numberParam(ctx.params, "debris"));
    let debrisGroup: { bodies: number[]; mesh: THREE.InstancedMesh } | undefined;
    if (debrisCount > 0) {
      debrisGroup = ctx.addInstancedBoxes({
        count: debrisCount,
        halfExtents: [0.16, 0.16, 0.16],
        material: ctx.colorMaterial("#39445c", { roughness: 0.6, metalness: 0.3 }),
        position: (index) => [
          Math.sin(index * 127.1) * (ARENA_HALF - 4),
          0.18 + (index % 3) * 0.05,
          Math.cos(index * 311.7) * (ARENA_HALF - 4)
        ],
        density: 0.6,
        friction: 0.55,
        restitution: 0.1
      });
      raycastTargets.push(debrisGroup.mesh);
      for (const handle of debrisGroup.bodies) {
        propKind.set(handle, "debris");
      }
    }

    // -------------------------------------------------------------- barrels
    const barrelCount = Math.round(numberParam(ctx.params, "barrels"));
    const barrelMaterial = ctx.colorMaterial("#a03227", { roughness: 0.5, metalness: 0.35 });
    const barrelBandMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a2e });
    const barrels: Barrel[] = [];
    const barrelByBody = new Map<number, Barrel>();
    const barrelSpots: Vec3[] = [
      [-6.5, 0, -10], [10, 0, -6], [-13, 0, 2.5], [6, 0, 11.5], [-2, 0, -15.5],
      [15.5, 0, 4], [-8.5, 0, 14], [2.5, 0, 6], [-16, 0, -6], [13, 0, 12],
      [4, 0, -4], [-4, 0, 3]
    ];
    for (let i = 0; i < Math.min(barrelCount, barrelSpots.length); i += 1) {
      const home: Vec3 = [barrelSpots[i][0], 0.68, barrelSpots[i][2]];
      const sim = ctx.addCapsule({
        type: BodyType.Dynamic,
        position: home,
        halfHeight: 0.34,
        radius: 0.3,
        material: barrelMaterial,
        density: 1.1,
        friction: 0.5,
        restitution: 0.05
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.1, 18, 1, true), barrelBandMaterial);
      sim.object.add(band);
      registerProp(sim, "barrel");
      world.setBodyHitEvents(sim.body, true);
      const barrel: Barrel = { body: sim.body, home, object: sim.object, alive: true, timer: 0 };
      barrels.push(barrel);
      barrelByBody.set(sim.body, barrel);
    }

    // ------------------------------------------------------------- crystals
    const crystalCount = Math.round(numberParam(ctx.params, "crystals"));
    const pedestalMaterial = ctx.colorMaterial("#2a3348", { roughness: 0.6, metalness: 0.4 });
    const crystalShellMaterial = ctx.colorMaterial("#8adfff", { roughness: 0.15, metalness: 0.05 });
    const crystalCoreMaterial = new THREE.MeshBasicMaterial({ color: 0x77ecff });
    const crystals: Crystal[] = [];
    const crystalByBody = new Map<number, Crystal>();
    const crystalSpots: { position: Vec3; height: number }[] = [
      { position: [0, 0, 0], height: 3.4 },
      { position: [-7.5, 0, -3.5], height: 1.6 }, { position: [7.5, 0, -3.5], height: 1.6 },
      { position: [-7.5, 0, 4.5], height: 1.6 }, { position: [7.5, 0, 4.5], height: 1.6 },
      { position: [-15, 0, -12], height: 0.9 }, { position: [15, 0, -12], height: 0.9 },
      { position: [-15, 0, 12.5], height: 0.9 }, { position: [15, 0, 12.5], height: 0.9 },
      { position: [0, 0, -16.5], height: 2.2 }, { position: [0, 0, 16.5], height: 2.2 },
      { position: [-18, 0, 1], height: 1.2 }
    ];
    for (let i = 0; i < Math.min(crystalCount, crystalSpots.length); i += 1) {
      const spot = crystalSpots[i];
      ctx.addBox({
        type: BodyType.Static,
        position: [spot.position[0], spot.height / 2, spot.position[2]],
        halfExtents: [0.28, spot.height / 2, 0.28],
        material: pedestalMaterial
      });
      const sim = ctx.addBox({
        type: BodyType.Dynamic,
        position: [spot.position[0], spot.height + 0.34, spot.position[2]],
        halfExtents: [0.3, 0.3, 0.3],
        material: crystalShellMaterial,
        density: 0.7,
        friction: 0.5,
        restitution: 0.15
      });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), crystalCoreMaterial);
      sim.object.add(core);
      registerProp(sim, "crystal");
      world.setBodyHitEvents(sim.body, true);
      const crystal: Crystal = { body: sim.body, object: sim.object, alive: true };
      crystals.push(crystal);
      crystalByBody.set(sim.body, crystal);
    }

    // ------------------------------------------------------------- sentries
    // Ragdolls dangling from "suspension field" emitters by the head bone —
    // a springy distance joint keeps them upright until a hard hit cuts it.
    const sentryCount = Math.round(numberParam(ctx.params, "sentries"));
    const emitterMaterial = new THREE.MeshBasicMaterial({ color: 0x8f7bff });
    const sentries: Sentry[] = [];
    const sentryByBody = new Map<number, Sentry>();
    const sentryAngles = [0.35, 2.3, 4.2, 5.5];
    const scratchTransform: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    for (let i = 0; i < Math.min(sentryCount, sentryAngles.length); i += 1) {
      const angle = sentryAngles[i];
      const x = Math.cos(angle) * 12.5;
      const z = Math.sin(angle) * 12.5;
      const anchor = ctx.addBox({
        type: BodyType.Static,
        position: [x, 5, z],
        halfExtents: [0.18, 0.18, 0.18],
        material: emitterMaterial,
        castShadow: false
      });
      const emitterLight = new THREE.PointLight(0x8f7bff, 12, 8, 2);
      emitterLight.position.set(x, 4.7, z);
      ctx.scene.add(emitterLight);

      const { human, bodies } = ctx.addHuman([x, 2.1, z], {
        frictionTorque: 3,
        hertz: 1,
        dampingRatio: 0.6
      });
      const head = bodies[HEAD_BONE];
      world.getBodyTransform(head.body, scratchTransform);
      const headPos: Vec3 = [
        scratchTransform.position[0],
        scratchTransform.position[1],
        scratchTransform.position[2]
      ];
      const joint = world.createDistanceJoint(anchor.body, head.body, [x, 5, z], headPos, {
        length: Math.max(0.4, 5 - headPos[1]) * 0.96,
        hertz: 1.6,
        dampingRatio: 0.3
      });
      const sentry: Sentry = { human, bones: bodies, joint, alive: true };
      sentries.push(sentry);
      for (const bone of bodies) {
        propKind.set(bone.body, "bone");
        bodyByObject.set(bone.object, bone.body);
        simByBody.set(bone.body, bone);
        raycastTargets.push(bone.object);
        sentryByBody.set(bone.body, sentry);
        world.setBodyHitEvents(bone.body, true);
      }
    }

    // ------------------------------------------------------------ viewmodel
    ctx.scene.add(camera);
    const viewmodel = new THREE.Group();
    const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.35, metalness: 0.8 });
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), gunMetal);
    gunBody.position.z = 0.08;
    viewmodel.add(gunBody);
    const prongMaterial = new THREE.MeshStandardMaterial({
      color: 0x39445c,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0x2fbde8,
      emissiveIntensity: 0.25
    });
    for (let i = 0; i < 3; i += 1) {
      const prong = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.2), prongMaterial);
      const spread = (i / 3) * Math.PI * 2 + Math.PI / 6;
      prong.position.set(Math.cos(spread) * 0.075, Math.sin(spread) * 0.075, -0.2);
      prong.rotation.set(-Math.sin(spread) * 0.42, Math.cos(spread) * 0.42, 0);
      viewmodel.add(prong);
    }
    // Kept dim at idle so bloom doesn't smear the viewmodel into a corner
    // halo; brightened per-frame while grabbing/punting.
    const coreBaseColor = new THREE.Color(0x66e6ff);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: coreBaseColor.clone().multiplyScalar(0.3) });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), coreMaterial);
    core.position.z = -0.14;
    viewmodel.add(core);
    const muzzleLight = new THREE.PointLight(0x59d6ff, 0, 6, 2);
    muzzleLight.position.z = -0.3;
    viewmodel.add(muzzleLight);
    viewmodel.position.set(0.34, -0.32, -0.72);
    viewmodel.traverse((child) => {
      child.castShadow = false;
      child.receiveShadow = false;
    });
    camera.add(viewmodel);

    // Beam from the rig muzzle to the held body.
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x54d8ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.05, 1, 8, 1, true), beamMaterial);
    beam.visible = false;
    ctx.scene.add(beam);

    // ------------------------------------------------------------- FX pool
    const bursts: Burst[] = [];
    for (let i = 0; i < 10; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), material);
      shell.visible = false;
      const light = new THREE.PointLight(0xffffff, 0, 16, 1.6);
      ctx.scene.add(shell, light);
      bursts.push({ light, shell, material, age: 1, duration: 1, radius: 1, intensity: 0 });
    }
    let burstCursor = 0;
    const spawnBurst = (position: THREE.Vector3 | Vec3, color: number, radius: number, intensity: number, duration = 0.4) => {
      const burst = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % bursts.length;
      const [x, y, z] = position instanceof THREE.Vector3 ? [position.x, position.y, position.z] : position;
      burst.shell.position.set(x, y, z);
      burst.light.position.set(x, y + 0.2, z);
      burst.material.color.setHex(color);
      burst.light.color.setHex(color);
      burst.age = 0;
      burst.duration = duration;
      burst.radius = radius;
      burst.intensity = intensity;
      burst.shell.visible = true;
    };

    // -------------------------------------------------------------- overlay
    const host = ctx.domElement.parentElement ?? ctx.domElement;
    const overlay = document.createElement("div");
    styleText(overlay, {
      position: "absolute",
      inset: "0",
      zIndex: "4",
      pointerEvents: "none",
      fontFamily: "inherit"
    });

    const crosshair = document.createElement("div");
    styleText(crosshair, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      transform: "translate(-50%, -50%)",
      background: "rgba(255, 255, 255, 0.65)",
      boxShadow: "0 0 6px rgba(120, 220, 255, 0.6)",
      transition: "background 0.12s ease, box-shadow 0.12s ease"
    });
    const crossRing = document.createElement("div");
    styleText(crossRing, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "26px",
      height: "26px",
      borderRadius: "50%",
      border: "1.5px solid rgba(140, 225, 255, 0.35)",
      transform: "translate(-50%, -50%)",
      transition: "border-color 0.12s ease, width 0.12s ease, height 0.12s ease"
    });
    const stateLabel = document.createElement("div");
    styleText(stateLabel, {
      position: "absolute",
      left: "50%",
      top: "calc(50% + 30px)",
      transform: "translateX(-50%)",
      color: "rgba(160, 230, 255, 0.85)",
      fontSize: "0.7rem",
      fontWeight: "650",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    });
    const popup = document.createElement("div");
    styleText(popup, {
      position: "absolute",
      left: "50%",
      top: "38%",
      transform: "translateX(-50%)",
      color: "#8ef0ff",
      fontSize: "1.05rem",
      fontWeight: "750",
      letterSpacing: "0.1em",
      textShadow: "0 0 18px rgba(90, 220, 255, 0.8)",
      opacity: "0",
      transition: "opacity 0.25s ease, top 0.7s ease",
      whiteSpace: "nowrap"
    });
    const lockPanel = document.createElement("div");
    styleText(lockPanel, {
      position: "absolute",
      inset: "0",
      display: "grid",
      placeItems: "center",
      background: "rgba(4, 7, 14, 0.62)",
      backdropFilter: "blur(3px)"
    });
    lockPanel.innerHTML = `
      <div style="text-align:center;color:#d7f4ff;max-width:420px;padding:20px">
        <div style="font-size:0.72rem;letter-spacing:0.3em;color:#54d8ff;font-weight:700">ZERO-POINT ENERGY FIELD MANIPULATOR</div>
        <div style="font-size:2rem;font-weight:800;margin:10px 0 14px;letter-spacing:0.06em">ZERO-POINT</div>
        <div style="font-size:0.85rem;line-height:1.9;color:#a9c6d8">
          <b style="color:#e8f7ff">WASD</b> move &nbsp;·&nbsp; <b style="color:#e8f7ff">Shift</b> sprint &nbsp;·&nbsp; <b style="color:#e8f7ff">Space</b> jump<br/>
          <b style="color:#ffb46a">Right click</b> grab / drop &nbsp;·&nbsp; <b style="color:#ffb46a">Left click</b> launch / punt<br/>
          Shatter every crystal. Barrels explode. Sentries fall.
        </div>
        <div style="margin-top:18px;font-size:0.8rem;letter-spacing:0.22em;color:#7ef2c2;font-weight:700;animation:hint-float 2.2s ease-in-out infinite">CLICK TO ENGAGE</div>
      </div>
    `;
    const banner = document.createElement("div");
    styleText(banner, {
      position: "absolute",
      left: "50%",
      top: "20%",
      transform: "translateX(-50%)",
      color: "#a3ffd9",
      fontSize: "1.5rem",
      fontWeight: "800",
      letterSpacing: "0.24em",
      textShadow: "0 0 26px rgba(110, 255, 200, 0.9)",
      opacity: "0",
      transition: "opacity 0.8s ease",
      whiteSpace: "nowrap"
    });
    overlay.append(crosshair, crossRing, stateLabel, popup, banner, lockPanel);
    host.appendChild(overlay);

    let popupTimer = 0;
    const showPopup = (text: string, color: string) => {
      popup.textContent = text;
      popup.style.color = color;
      popup.style.opacity = "1";
      popup.style.top = "38%";
      requestAnimationFrame(() => {
        popup.style.top = "33%";
      });
      popupTimer = 1.1;
    };

    // ---------------------------------------------------------------- input
    const canvas = ctx.domElement;
    let locked = false;
    let yaw = 0;
    let pitch = -0.04;
    const pressed = new Set<string>();

    const onLockChange = () => {
      locked = document.pointerLockElement === canvas;
      lockPanel.style.display = locked ? "none" : "grid";
      if (!locked) {
        pressed.clear();
      }
    };
    const onCanvasClick = () => {
      if (!locked) {
        canvas.requestPointerLock();
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!locked) {
        return;
      }
      const sense = 0.0022 * numberParam(ctx.params, "mouseSense");
      yaw -= event.movementX * sense;
      pitch -= event.movementY * sense;
      pitch = Math.max(-1.51, Math.min(1.51, pitch));
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!locked) {
        return;
      }
      if (event.button === 0) {
        triggerPrimary();
      } else if (event.button === 2) {
        triggerSecondary();
      }
    };
    const onContextMenu = (event: Event) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!locked) {
        return;
      }
      const key = event.key.toLowerCase();
      pressed.add(key);
      if (key === " " || key === "shift") {
        event.preventDefault();
      }
      if (key === "e") {
        triggerSecondary();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key.toLowerCase());
    };

    document.addEventListener("pointerlockchange", onLockChange);
    canvas.addEventListener("click", onCanvasClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // --------------------------------------------------------------- player
    const playerPos = new THREE.Vector3(0, EYE_HEIGHT, 15);
    const playerVel = new THREE.Vector3();
    let grounded = true;
    let bobPhase = 0;

    // ----------------------------------------------------------- rig state
    const raycaster = new THREE.Raycaster();
    const screenCenter = new THREE.Vector2(0, 0);
    const scratchVelocity = { linear: [0, 0, 0] as [number, number, number], angular: [0, 0, 0] as [number, number, number] };
    const camDir = new THREE.Vector3();
    const holdPoint = new THREE.Vector3();
    const bodyPos = new THREE.Vector3();
    const delta3 = new THREE.Vector3();
    const muzzleWorld = new THREE.Vector3();
    const beamMid = new THREE.Vector3();
    const beamUp = new THREE.Vector3(0, 1, 0);

    type RigState = { mode: "idle" | "pulling" | "holding"; body: number; mesh?: THREE.Mesh; original?: THREE.Material | THREE.Material[] };
    const rig: RigState = { mode: "idle", body: 0 };
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa04d,
      roughness: 0.4,
      metalness: 0.3,
      emissive: 0xff7a18,
      emissiveIntensity: 0.9
    });

    let recoil = 0;
    let corePulse = 0;
    let score = 0;
    let crystalsDown = 0;
    let sentriesDown = 0;
    let barrelsDown = 0;
    let cleared = false;

    const findHighlightMesh = (object: THREE.Object3D): THREE.Mesh | undefined => {
      let found: THREE.Mesh | undefined;
      object.traverse((child) => {
        if (!found && (child as THREE.Mesh).isMesh && !((child as unknown as { isLineSegments?: boolean }).isLineSegments)) {
          found = child as THREE.Mesh;
        }
      });
      return found;
    };

    const applyHighlight = (body: number) => {
      const sim = simByBody.get(body);
      if (!sim) {
        return;
      }
      const mesh = findHighlightMesh(sim.object);
      if (mesh) {
        rig.mesh = mesh;
        rig.original = mesh.material;
        mesh.material = highlightMaterial;
      }
    };

    const clearHighlight = () => {
      if (rig.mesh && rig.original) {
        rig.mesh.material = rig.original;
      }
      rig.mesh = undefined;
      rig.original = undefined;
    };

    const releaseRig = () => {
      clearHighlight();
      rig.mode = "idle";
      rig.body = 0;
      beam.visible = false;
    };

    const resolveRayBody = (): { body: number; distance: number } | undefined => {
      raycaster.setFromCamera(screenCenter, camera);
      raycaster.far = numberParam(ctx.params, "grabRange");
      const hits = raycaster.intersectObjects(raycastTargets, true);
      for (const hit of hits) {
        if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined && debrisGroup) {
          if (hit.object === debrisGroup.mesh) {
            return { body: debrisGroup.bodies[hit.instanceId], distance: hit.distance };
          }
          continue;
        }
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          const body = bodyByObject.get(node);
          if (body !== undefined) {
            return { body, distance: hit.distance };
          }
          node = node.parent;
        }
      }
      return undefined;
    };

    const triggerSecondary = () => {
      if (rig.mode !== "idle") {
        releaseRig();
        return;
      }
      const hit = resolveRayBody();
      if (!hit) {
        return;
      }
      rig.mode = "pulling";
      rig.body = hit.body;
      world.setBodyAwake(hit.body, true);
      applyHighlight(hit.body);
      corePulse = 1;
    };

    const triggerPrimary = () => {
      camera.getWorldDirection(camDir);
      if (rig.mode !== "idle") {
        // Launch the carried body down the view ray.
        const power = numberParam(ctx.params, "launchPower");
        world.setBodyVelocity(
          rig.body,
          [camDir.x * power, camDir.y * power + 1.5, camDir.z * power],
          [Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5]
        );
        world.setBodyAwake(rig.body, true);
        releaseRig();
        recoil = 1;
        corePulse = 1.6;
        core.getWorldPosition(muzzleWorld);
        spawnBurst(muzzleWorld, 0x66e6ff, 0.6, 30, 0.22);
        return;
      }

      // Punt: kick whatever is under the crosshair without carrying it.
      const hit = resolveRayBody();
      recoil = 0.7;
      corePulse = 1.2;
      if (!hit) {
        return;
      }
      const punt = numberParam(ctx.params, "puntPower");
      const mass = Math.min(world.getBodyMass(hit.body), 5);
      world.setBodyAwake(hit.body, true);
      world.applyImpulse(hit.body, [
        camDir.x * punt * mass,
        (camDir.y + 0.12) * punt * mass,
        camDir.z * punt * mass
      ]);
      world.getBodyTransform(hit.body, scratchTransform);
      spawnBurst(scratchTransform.position, 0x8be2ff, 1, 22, 0.28);
    };

    // ------------------------------------------------------------- scoring
    const parkBody = (body: number, index: number) => {
      world.setBodyGravityScale(body, 0);
      world.setBodyVelocity(body, [0, 0, 0], [0, 0, 0]);
      world.setBodyTransform(body, [index * 3 - 40, -46, 44]);
      world.setBodyAwake(body, false);
    };

    const detonateBarrel = (barrel: Barrel, index: number) => {
      if (!barrel.alive) {
        return;
      }
      barrel.alive = false;
      barrel.timer = 6;
      barrelsDown += 1;
      score += 150;
      if (rig.body === barrel.body) {
        releaseRig();
      }
      world.getBodyTransform(barrel.body, scratchTransform);
      const at: Vec3 = [scratchTransform.position[0], scratchTransform.position[1], scratchTransform.position[2]];
      barrel.object.visible = false;
      parkBody(barrel.body, index);
      world.explode(at, 4.6, 1, 58);
      spawnBurst(at, 0xff7a2e, 4.4, 220, 0.5);
      showPopup("+150 BARREL DETONATED", "#ffb46a");
    };

    const shatterCrystal = (crystal: Crystal, index: number) => {
      if (!crystal.alive) {
        return;
      }
      crystal.alive = false;
      crystalsDown += 1;
      score += 100;
      if (rig.body === crystal.body) {
        releaseRig();
      }
      world.getBodyTransform(crystal.body, scratchTransform);
      spawnBurst(scratchTransform.position, 0x77ecff, 2.6, 120, 0.45);
      crystal.object.visible = false;
      parkBody(crystal.body, index + 20);
      showPopup("+100 CRYSTAL SHATTERED", "#8ef0ff");
      if (crystalsDown === crystals.length && !cleared) {
        cleared = true;
        score += 500;
        banner.textContent = `YARD CLEARED — SCORE ${score}`;
        banner.style.opacity = "1";
        spawnBurst([0, 3, 0], 0xa3ffd9, 9, 320, 0.9);
      }
    };

    const dropSentry = (sentry: Sentry) => {
      if (!sentry.alive) {
        return;
      }
      sentry.alive = false;
      sentriesDown += 1;
      score += 250;
      world.destroyJoint(sentry.joint);
      ctx.world.humanApplyRandomImpulse(sentry.human, 6);
      world.getBodyTransform(sentry.bones[HEAD_BONE].body, scratchTransform);
      spawnBurst(scratchTransform.position, 0xb49bff, 2.2, 90, 0.4);
      showPopup("+250 SENTRY DOWN", "#c9b3ff");
    };

    const processHitEvents = () => {
      const events = world.readHitEvents(64);
      let fxBudget = 2;
      for (const event of events) {
        for (const body of [event.bodyA, event.bodyB]) {
          const kind = propKind.get(body);
          if (kind === "barrel" && event.approachSpeed > BARREL_DETONATE_SPEED) {
            const barrel = barrelByBody.get(body);
            if (barrel) {
              detonateBarrel(barrel, barrels.indexOf(barrel));
            }
          } else if (kind === "crystal" && event.approachSpeed > CRYSTAL_SHATTER_SPEED) {
            const crystal = crystalByBody.get(body);
            if (crystal) {
              shatterCrystal(crystal, crystals.indexOf(crystal));
            }
          } else if (kind === "bone" && event.approachSpeed > SENTRY_KNOCK_SPEED) {
            const sentry = sentryByBody.get(body);
            if (sentry) {
              dropSentry(sentry);
            }
          }
        }
        if (event.approachSpeed > 11 && fxBudget > 0) {
          fxBudget -= 1;
          spawnBurst(event.point, 0xaad9ff, 0.9, 16, 0.24);
        }
      }
    };

    // ---------------------------------------------------------------- loop
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const wish = new THREE.Vector3();

    return {
      actions: {
        rain: () => {
          let dropped = 0;
          for (const [body, kind] of propKind) {
            if (kind !== "crate" || dropped >= 14) {
              continue;
            }
            dropped += 1;
            world.setBodyTransform(body, [
              playerPos.x + Math.sin(dropped * 2.4) * 5,
              13 + dropped * 0.8,
              playerPos.z + Math.cos(dropped * 2.4) * 5
            ]);
            world.setBodyVelocity(body, [0, 0, 0], [2, 3, 1]);
            world.setBodyGravityScale(body, 1);
            world.setBodyAwake(body, true);
          }
        },
        detonate: () => {
          barrels.forEach((barrel, index) => {
            if (barrel.alive) {
              window.setTimeout(() => detonateBarrel(barrel, index), index * 130);
            }
          });
        },
        reset: () => undefined
      },
      update: (delta, elapsed) => {
        // ---- player controller
        camera.rotation.order = "YXZ";
        camera.rotation.set(pitch, yaw, 0);

        if (locked) {
          camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          right.crossVectors(forward, beamUp).normalize();
          wish.set(0, 0, 0);
          if (pressed.has("w")) wish.add(forward);
          if (pressed.has("s")) wish.sub(forward);
          if (pressed.has("d")) wish.add(right);
          if (pressed.has("a")) wish.sub(right);
          const sprint = pressed.has("shift") ? 1.55 : 1;
          const speed = numberParam(ctx.params, "moveSpeed") * sprint;
          if (wish.lengthSq() > 0) {
            wish.normalize().multiplyScalar(speed);
          }
          const accel = grounded ? 11 : 3.2;
          playerVel.x += (wish.x - playerVel.x) * Math.min(1, accel * delta);
          playerVel.z += (wish.z - playerVel.z) * Math.min(1, accel * delta);
          if (pressed.has(" ") && grounded) {
            playerVel.y = numberParam(ctx.params, "jumpPower");
            grounded = false;
          }
        } else {
          playerVel.x *= 0.9;
          playerVel.z *= 0.9;
        }

        playerVel.y -= PLAYER_GRAVITY * delta;
        playerPos.addScaledVector(playerVel, delta);
        if (playerPos.y <= EYE_HEIGHT) {
          playerPos.y = EYE_HEIGHT;
          playerVel.y = 0;
          grounded = true;
        }
        const bound = ARENA_HALF - 0.9;
        playerPos.x = Math.max(-bound, Math.min(bound, playerPos.x));
        playerPos.z = Math.max(-bound, Math.min(bound, playerPos.z));

        const planarSpeed = Math.hypot(playerVel.x, playerVel.z);
        bobPhase += delta * (4 + planarSpeed * 1.35);
        const bob = grounded ? Math.sin(bobPhase) * Math.min(0.035, planarSpeed * 0.006) : 0;
        camera.position.set(playerPos.x, playerPos.y + bob, playerPos.z);

        // ---- viewmodel juice
        recoil = Math.max(0, recoil - delta * 6);
        corePulse = Math.max(0, corePulse - delta * 3);
        viewmodel.position.z = -0.72 + recoil * 0.14;
        viewmodel.rotation.x = recoil * 0.16;
        const holdGlow = rig.mode === "holding" ? 0.5 : rig.mode === "pulling" ? 0.3 : 0;
        const pulse = 0.8 + Math.sin(elapsed * 6) * 0.12 + corePulse + holdGlow;
        core.scale.setScalar(0.9 + pulse * 0.25);
        // Idle stays almost dark; grab/punt action drives the flare.
        const action = Math.min(1.4, corePulse + holdGlow);
        coreMaterial.color.copy(coreBaseColor).multiplyScalar(0.3 + action * 0.7);
        muzzleLight.intensity = 0.5 + action * 6;

        // ---- rig state machine
        camera.getWorldDirection(camDir);
        if (rig.mode !== "idle") {
          const range = numberParam(ctx.params, "grabRange");
          const holdDistance = numberParam(ctx.params, "holdDistance");
          holdPoint.copy(camera.position).addScaledVector(camDir, holdDistance);
          world.getBodyTransform(rig.body, scratchTransform);
          bodyPos.set(scratchTransform.position[0], scratchTransform.position[1], scratchTransform.position[2]);
          delta3.copy(holdPoint).sub(bodyPos);
          const distance = delta3.length();

          if (distance > range * 1.35) {
            releaseRig();
          } else {
            if (rig.mode === "pulling" && distance < 1.1) {
              rig.mode = "holding";
            }
            const gain = rig.mode === "holding" ? 16 : 9;
            const maxSpeed = rig.mode === "holding" ? 34 : 22;
            delta3.multiplyScalar(gain);
            if (delta3.length() > maxSpeed) {
              delta3.setLength(maxSpeed);
            }
            const angular = world.getBodyVelocity(rig.body, scratchVelocity).angular;
            world.setBodyVelocity(
              rig.body,
              [delta3.x, delta3.y, delta3.z],
              [angular[0] * 0.86, angular[1] * 0.86, angular[2] * 0.86]
            );
            world.setBodyAwake(rig.body, true);

            // Beam from muzzle to body.
            core.getWorldPosition(muzzleWorld);
            beamMid.copy(muzzleWorld).add(bodyPos).multiplyScalar(0.5);
            beam.position.copy(beamMid);
            const length = muzzleWorld.distanceTo(bodyPos);
            beam.scale.set(1, Math.max(0.001, length), 1);
            delta3.copy(bodyPos).sub(muzzleWorld).normalize();
            beam.quaternion.setFromUnitVectors(beamUp, delta3);
            beam.visible = true;
          }
        }

        // ---- crosshair feedback
        if (locked) {
          if (rig.mode !== "idle") {
            crosshair.style.background = "rgba(255, 170, 90, 0.95)";
            crossRing.style.borderColor = "rgba(255, 170, 90, 0.7)";
            stateLabel.textContent = rig.mode === "holding" ? "LMB launch · RMB drop" : "pulling…";
          } else {
            const target = resolveRayBody();
            if (target) {
              crosshair.style.background = "rgba(120, 235, 255, 0.95)";
              crossRing.style.borderColor = "rgba(120, 235, 255, 0.65)";
              stateLabel.textContent = "RMB grab · LMB punt";
            } else {
              crosshair.style.background = "rgba(255, 255, 255, 0.55)";
              crossRing.style.borderColor = "rgba(140, 225, 255, 0.3)";
              stateLabel.textContent = "";
            }
          }
        } else {
          stateLabel.textContent = "";
        }

        if (popupTimer > 0) {
          popupTimer -= delta;
          if (popupTimer <= 0) {
            popup.style.opacity = "0";
          }
        }

        // ---- world events
        // The hit-event buffer only refreshes when the world steps; while
        // paused it would replay the same events every frame.
        if (!ctx.params.paused) {
          processHitEvents();
        }

        for (const barrel of barrels) {
          if (!barrel.alive) {
            barrel.timer -= delta;
            if (barrel.timer <= 0) {
              barrel.alive = true;
              barrel.object.visible = true;
              world.setBodyGravityScale(barrel.body, 1);
              world.setBodyTransform(barrel.body, barrel.home);
              world.setBodyVelocity(barrel.body, [0, 0, 0], [0, 0, 0]);
              world.setBodyAwake(barrel.body, true);
              spawnBurst(barrel.home, 0xff5a2e, 1.2, 26, 0.35);
            }
          }
        }

        // ---- FX pool
        for (const burst of bursts) {
          if (burst.age >= burst.duration) {
            continue;
          }
          burst.age += delta;
          const t = Math.min(1, burst.age / burst.duration);
          const eased = 1 - (1 - t) * (1 - t);
          burst.shell.scale.setScalar(0.1 + eased * burst.radius);
          burst.material.opacity = 0.55 * (1 - t);
          burst.light.intensity = burst.intensity * (1 - t);
          if (t >= 1) {
            burst.shell.visible = false;
            burst.light.intensity = 0;
          }
        }
      },
      metrics: () => ({
        Score: score,
        Crystals: `${crystalsDown}/${crystals.length}`,
        Sentries: `${sentriesDown}/${sentries.length}`,
        Barrels: barrelsDown,
        Rig: rig.mode.toUpperCase()
      }),
      dispose: () => {
        document.removeEventListener("pointerlockchange", onLockChange);
        canvas.removeEventListener("click", onCanvasClick);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
        overlay.remove();
        // The viewmodel leaves the scene graph with the camera, so the stage
        // never disposes it — free its GPU resources here.
        viewmodel.traverse((child) => {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (mesh.material && !Array.isArray(mesh.material)) {
            mesh.material.dispose();
          }
        });
        camera.remove(viewmodel);
        ctx.scene.remove(camera);
      }
    };
  }
};
