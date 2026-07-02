import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { ScenarioDefinition, SimBody, Transform, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const GARDEN_HALF = 14;
const PLANT_BOUND = GARDEN_HALF - 1.5;
const GUST_DURATION = 1.9;
// Joint springs alone can't right a toppled chain (soft constraints deflect
// ~6g/(L·ω²) per joint and never recover from flat), so every body also gets
// a rest-position spring each frame. Gains verified headlessly: a gust-force
// bend of 0.8 m returns to zero lean.
const RIGHTING_STIFFNESS = 25;
const RIGHTING_DAMPING = 3;

type PlantKind = "sunbloom" | "lantern" | "reed" | "fern";

type PlantBody = {
  sim: SimBody;
  mass: number;
  /** 0..1 wind multiplier — tips catch more breeze than the base. */
  exposure: number;
  /** World-space rest position the righting spring pulls back toward. */
  rest: Vec3;
};

type Plant = {
  kind: PlantKind;
  rootX: number;
  rootZ: number;
  reach: number;
  phase: number;
  age: number;
  bodies: PlantBody[];
  grow: { object: THREE.Object3D; delay: number }[];
};

type Burst = {
  shell: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  radius: number;
};

// Slight overshoot so plants pop past full size and settle back.
function easeOutBack(t: number) {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export const windgardenScenario: ScenarioDefinition = {
  id: "wind-garden",
  title: "Wind Garden",
  eyebrow: "Procedural spring-joint flora",
  deck: "Click the moonlit soil to grow glowing plants, then stir them with gusts and cursor sweeps — every stem is a chain of spring-jointed bodies.",
  description:
    "Each plant is grown procedurally at your click point: stems are capsule chains linked by spherical joints whose springs restore the rest pose, so sunblooms, lantern bulbs, reeds, and ferns all sway back upright after every disturbance. Wind is real force — an ambient breeze, gust bursts, and a cursor brush that pushes bodies as you sweep across the bed. Click a plant to flick it and watch the spring chain ripple.",
  accent: "#8ef2a3",
  category: "fun",
  visuals: {
    lighting: "night",
    background: "#060a13",
    fog: { color: "#060a13", near: 24, far: 80 },
    grid: false,
    bloom: { strength: 0.55, radius: 0.25, threshold: 0.55 }
  },
  hint: "Click the soil to plant a seed — sweep the cursor through plants to stir them",
  defaults: {
    starters: 7,
    maxPlants: 26,
    breeze: 4,
    gustPower: 26,
    brushRadius: 3.2,
    brushPower: 14,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Garden",
      controls: [
        { key: "starters", label: "Starter plants", min: 0, max: 14, step: 1 },
        { key: "maxPlants", label: "Max plants", min: 6, max: 40, step: 1, rebuild: false }
      ]
    },
    {
      title: "Wind",
      controls: [
        { key: "breeze", label: "Breeze", min: 0, max: 12, step: 0.1, rebuild: false },
        { key: "gustPower", label: "Gust power", min: 6, max: 60, step: 1, rebuild: false },
        { key: "brushRadius", label: "Brush radius", min: 1, max: 7, step: 0.1, rebuild: false },
        { key: "brushPower", label: "Brush power", min: 1, max: 40, step: 0.5, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "gust", title: "Summon gust" },
    { id: "seed", title: "Plant random seed" },
    { id: "reset", title: "Replant garden" }
  ],
  camera: {
    position: [0, 8.5, 15.5],
    target: [0, 2, 0],
    fov: 48
  },
  gravity: () => [0, -10, 0],
  setup(ctx) {
    const world = ctx.world;

    // Moonlit fill so the bed reads at night without washing out the bloom.
    const fill = new THREE.HemisphereLight(0x41597a, 0x1c2a20, 1.9);
    ctx.scene.add(fill);

    // ----------------------------------------------------------------- soil
    ctx.addBox({
      type: BodyType.Static,
      position: [0, -0.5, 0],
      halfExtents: [GARDEN_HALF + 2, 0.5, GARDEN_HALF + 2],
      material: ctx.colorMaterial("#20351f", { roughness: 0.95, metalness: 0 }),
      friction: 0.8,
      receiveShadow: true
    });

    // Low stone ring marks the plantable bed.
    const stoneMaterial = ctx.colorMaterial("#3d4452", { roughness: 0.8, metalness: 0.1 });
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const wobble = 0.86 + Math.sin(i * 7.3) * 0.05;
      ctx.addSphere({
        type: BodyType.Static,
        position: [Math.cos(angle) * GARDEN_HALF * wobble, 0.05, Math.sin(angle) * GARDEN_HALF * wobble],
        radius: 0.3 + Math.abs(Math.sin(i * 3.1)) * 0.16,
        material: stoneMaterial,
        castShadow: false
      });
    }

    // Visual-only grass tufts scattered across the bed.
    const tuftGeometry = new THREE.ConeGeometry(0.05, 0.34, 5);
    tuftGeometry.translate(0, 0.17, 0);
    const tuftMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x2f5c34, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3c7040, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x27492c, roughness: 0.9 })
    ];
    for (let i = 0; i < 60; i += 1) {
      const tuft = new THREE.Mesh(tuftGeometry, tuftMaterials[i % tuftMaterials.length]);
      const radius = Math.sqrt(Math.abs(Math.sin(i * 12.9898)) ) * (GARDEN_HALF - 1);
      const angle = i * 2.39996; // golden-angle spiral spread
      tuft.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      tuft.rotation.set((Math.sin(i * 3.7)) * 0.3, i, (Math.cos(i * 5.1)) * 0.3);
      tuft.scale.setScalar(0.7 + Math.abs(Math.sin(i * 1.7)) * 0.9);
      ctx.scene.add(tuft);
    }

    // ------------------------------------------------------------ fireflies
    const fireflyCount = 90;
    const fireflyBase = new Float32Array(fireflyCount * 3);
    const fireflyPositions = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i += 1) {
      fireflyBase[i * 3] = (Math.random() * 2 - 1) * (GARDEN_HALF + 2);
      fireflyBase[i * 3 + 1] = 0.5 + Math.random() * 4.5;
      fireflyBase[i * 3 + 2] = (Math.random() * 2 - 1) * (GARDEN_HALF + 2);
    }
    fireflyPositions.set(fireflyBase);
    const fireflyGeometry = new THREE.BufferGeometry();
    const fireflyAttribute = new THREE.BufferAttribute(fireflyPositions, 3);
    fireflyGeometry.setAttribute("position", fireflyAttribute);
    const fireflies = new THREE.Points(
      fireflyGeometry,
      new THREE.PointsMaterial({
        color: 0xd8ffa0,
        size: 0.09,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ctx.scene.add(fireflies);

    // ------------------------------------------------------------ materials
    const stemMaterial = ctx.colorMaterial("#3f7d46", { roughness: 0.7, metalness: 0 });
    const reedStemMaterial = ctx.colorMaterial("#5d9b52", { roughness: 0.75, metalness: 0 });
    const fernStemMaterial = ctx.colorMaterial("#2f6b4f", { roughness: 0.7, metalness: 0 });
    const flowerPalettes = [
      { petal: "#ff8fb5", core: "#ffe08a" },
      { petal: "#c48bff", core: "#9fffe0" },
      { petal: "#ffab5e", core: "#fff2b0" },
      { petal: "#7fd0ff", core: "#eaffff" }
    ];
    const lanternColors = ["#ffb347", "#6ef2d0", "#ff7ac8"];
    const petalGeometry = new THREE.SphereGeometry(1, 10, 8);
    petalGeometry.scale(0.19, 0.05, 0.1);
    const leafGeometry = new THREE.ConeGeometry(1, 1, 6);
    leafGeometry.scale(0.09, 0.55, 0.028);
    leafGeometry.translate(0, 0.27, 0);

    // --------------------------------------------------------- plant system
    const plants: Plant[] = [];
    const bodyToPlant = new Map<number, Plant>();
    let plantCursor = 0;
    const kindCycle: PlantKind[] = ["sunbloom", "lantern", "reed", "fern"];
    const scratchTransform: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const scratchVelocity = {
      linear: [0, 0, 0] as [number, number, number],
      angular: [0, 0, 0] as [number, number, number]
    };

    const registerBody = (plant: Plant, sim: SimBody, exposure: number, rest: Vec3) => {
      plant.bodies.push({ sim, mass: world.getBodyMass(sim.body), exposure, rest });
      bodyToPlant.set(sim.body, plant);
      // Grown in from nothing, staggered bottom-to-top.
      sim.object.scale.setScalar(0.001);
      plant.grow.push({ object: sim.object, delay: plant.grow.length * 0.13 });
    };

    /** Chain of dynamic capsules spring-jointed to a buried static anchor. */
    const buildStem = (
      plant: Plant,
      x: number,
      z: number,
      segments: number,
      segmentLength: number,
      radius: number,
      taper: number,
      material: THREE.Material,
      hertz: number,
      dampingRatio: number
    ): SimBody => {
      const anchor = ctx.addBox({
        type: BodyType.Static,
        position: [x, -0.4, z],
        halfExtents: [0.1, 0.1, 0.1],
        material: stoneMaterial,
        castShadow: false,
        receiveShadow: false
      });
      let previous = anchor;
      let top = anchor;
      for (let i = 0; i < segments; i += 1) {
        const segmentRadius = radius * (1 - taper * (i / Math.max(1, segments - 1)));
        const centerY = segmentLength * i + segmentLength / 2;
        const segment = ctx.addCapsule({
          type: BodyType.Dynamic,
          position: [x, centerY, z],
          halfHeight: Math.max(0.02, segmentLength / 2 - segmentRadius - 0.02),
          radius: segmentRadius,
          material,
          density: 0.5,
          friction: 0.4,
          castShadow: false
        });
        world.createSphericalJoint(previous.body, segment.body, [x, segmentLength * i, z], {
          hertz,
          dampingRatio
        });
        registerBody(plant, segment, (i + 1) / segments, [x, centerY, z]);
        previous = segment;
        top = segment;
      }
      return top;
    };

    const buildSunbloom = (plant: Plant, x: number, z: number, size: number) => {
      const segments = 4;
      const segmentLength = 0.62 * size;
      const top = buildStem(plant, x, z, segments, segmentLength, 0.05, 0.4, stemMaterial, 6, 0.6);
      const stemTopY = segmentLength * segments;
      const head = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [x, stemTopY + 0.19, z],
        radius: 0.16,
        material: ctx.colorMaterial("#365f3b", { roughness: 0.7 }),
        density: 0.2,
        castShadow: false
      });
      world.createSphericalJoint(top.body, head.body, [x, stemTopY, z], { hertz: 7, dampingRatio: 0.6 });
      registerBody(plant, head, 1, [x, stemTopY + 0.19, z]);

      const palette = flowerPalettes[Math.floor(Math.random() * flowerPalettes.length)];
      const petalMaterial = new THREE.MeshStandardMaterial({
        color: palette.petal,
        roughness: 0.55,
        emissive: palette.petal,
        emissiveIntensity: 0.35
      });
      const petals = 8;
      for (let i = 0; i < petals; i += 1) {
        const angle = (i / petals) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeometry, petalMaterial);
        petal.position.set(Math.cos(angle) * 0.21, 0.06, Math.sin(angle) * 0.21);
        petal.rotation.set(0.35 * Math.sin(angle), -angle, 0.35 * Math.cos(angle));
        head.object.add(petal);
      }
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 10),
        new THREE.MeshStandardMaterial({
          color: palette.core,
          emissive: palette.core,
          emissiveIntensity: 2.4,
          roughness: 0.4
        })
      );
      core.position.y = 0.1;
      head.object.add(core);
      plant.reach = stemTopY + 0.5;
    };

    const buildLantern = (plant: Plant, x: number, z: number, size: number) => {
      const segments = 3;
      const segmentLength = 0.58 * size;
      const top = buildStem(plant, x, z, segments, segmentLength, 0.045, 0.35, fernStemMaterial, 6, 0.6);
      const stemTopY = segmentLength * segments;
      const color = lanternColors[Math.floor(Math.random() * lanternColors.length)];
      const bulb = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [x, stemTopY + 0.22, z],
        radius: 0.19,
        material: ctx.colorMaterial(color, { roughness: 0.3, emissive: color, emissiveIntensity: 2.2 }),
        density: 0.15,
        castShadow: false
      });
      world.createSphericalJoint(top.body, bulb.body, [x, stemTopY, z], { hertz: 7, dampingRatio: 0.6 });
      registerBody(plant, bulb, 1, [x, stemTopY + 0.22, z]);
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.14, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.7 })
      );
      cap.position.y = 0.22;
      bulb.object.add(cap);
      plant.reach = stemTopY + 0.6;
    };

    const buildReed = (plant: Plant, x: number, z: number, size: number) => {
      const stems = 3;
      let tallest = 0;
      for (let i = 0; i < stems; i += 1) {
        const angle = (i / stems) * Math.PI * 2 + plant.phase;
        const ox = x + Math.cos(angle) * 0.14;
        const oz = z + Math.sin(angle) * 0.14;
        const segmentLength = (0.55 + Math.random() * 0.2) * size;
        const top = buildStem(plant, ox, oz, 2, segmentLength, 0.03, 0.3, reedStemMaterial, 4, 0.5);
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 8, 6),
          new THREE.MeshStandardMaterial({
            color: 0xd8ffa0,
            emissive: 0xd8ffa0,
            emissiveIntensity: 1.8,
            roughness: 0.5
          })
        );
        bead.position.y = segmentLength / 2;
        top.object.add(bead);
        tallest = Math.max(tallest, segmentLength * 2);
      }
      plant.reach = tallest + 0.3;
    };

    const buildFern = (plant: Plant, x: number, z: number, size: number) => {
      const segments = 3;
      const segmentLength = 0.6 * size;
      const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x4da26b,
        roughness: 0.65,
        emissive: 0x1c4d2e,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide
      });
      buildStem(plant, x, z, segments, segmentLength, 0.04, 0.45, fernStemMaterial, 6, 0.6);
      // Leaves ride each stem segment so they bend with the physics chain.
      for (let i = 0; i < segments; i += 1) {
        const segment = plant.bodies[plant.bodies.length - segments + i].sim;
        const leaves = 4 - i;
        for (let leaf = 0; leaf < leaves; leaf += 1) {
          const angle = leaf * 2.4 + i * 0.9;
          const blade = new THREE.Mesh(leafGeometry, leafMaterial);
          blade.position.set(Math.cos(angle) * 0.04, -0.1 + leaf * 0.1, Math.sin(angle) * 0.04);
          blade.rotation.set(0, -angle, 0.9 - i * 0.15);
          blade.scale.setScalar((1.4 - i * 0.3) * size);
          segment.object.add(blade);
        }
      }
      plant.reach = segmentLength * segments + 0.4;
    };

    const plantSeed = (x: number, z: number): Plant | undefined => {
      const maxPlants = Math.round(numberParam(ctx.params, "maxPlants"));
      if (plants.length >= maxPlants) {
        return undefined;
      }
      const px = Math.max(-PLANT_BOUND, Math.min(PLANT_BOUND, x));
      const pz = Math.max(-PLANT_BOUND, Math.min(PLANT_BOUND, z));
      const kind = kindCycle[plantCursor % kindCycle.length];
      plantCursor += 1;
      const plant: Plant = {
        kind,
        rootX: px,
        rootZ: pz,
        reach: 1,
        phase: Math.random() * Math.PI * 2,
        age: 0,
        bodies: [],
        grow: []
      };
      const size = 0.85 + Math.random() * 0.45;
      if (kind === "sunbloom") {
        buildSunbloom(plant, px, pz, size);
      } else if (kind === "lantern") {
        buildLantern(plant, px, pz, size);
      } else if (kind === "reed") {
        buildReed(plant, px, pz, size);
      } else {
        buildFern(plant, px, pz, size);
      }
      plants.push(plant);
      spawnBurst([px, 0.3, pz], 0x9dffb0, 1.1, 0.5);
      return plant;
    };

    // -------------------------------------------------------------- FX pool
    const bursts: Burst[] = [];
    for (let i = 0; i < 6; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
      shell.visible = false;
      ctx.scene.add(shell);
      bursts.push({ shell, material, age: 1, duration: 1, radius: 1 });
    }
    let burstCursor = 0;
    function spawnBurst(position: Vec3, color: number, radius: number, duration: number) {
      const burst = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % bursts.length;
      burst.shell.position.set(position[0], position[1], position[2]);
      burst.material.color.setHex(color);
      burst.age = 0;
      burst.duration = duration;
      burst.radius = radius;
      burst.shell.visible = true;
    }

    // ----------------------------------------------------------- wind state
    let windAngle = Math.random() * Math.PI * 2;
    let gustTimer = 0;
    const windDir = new THREE.Vector3(1, 0, 0);

    const summonGust = () => {
      gustTimer = GUST_DURATION;
      windAngle += (Math.random() - 0.5) * 1.2;
    };

    // --------------------------------------------------------- cursor brush
    const canvas = ctx.domElement;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const cursorPoint = new THREE.Vector3();
    const cursorVelocity = new THREE.Vector3();
    const cursorHit = new THREE.Vector3();
    let cursorActive = false;
    let lastMoveTime = 0;

    const onPointerMove = (event: PointerEvent) => {
      // Skip while dragging so orbiting the camera doesn't double as wind.
      if (event.buttons !== 0) {
        cursorActive = false;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointerNdc, ctx.camera);
      if (!raycaster.ray.intersectPlane(groundPlane, cursorHit)) {
        cursorActive = false;
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastMoveTime) / 1000);
      lastMoveTime = now;
      if (cursorActive && dt > 0) {
        const vx = (cursorHit.x - cursorPoint.x) / dt;
        const vz = (cursorHit.z - cursorPoint.z) / dt;
        cursorVelocity.x += (vx - cursorVelocity.x) * 0.4;
        cursorVelocity.z += (vz - cursorVelocity.z) * 0.4;
      }
      cursorPoint.copy(cursorHit);
      cursorActive = true;
    };
    canvas.addEventListener("pointermove", onPointerMove);

    // -------------------------------------------------------- starter plants
    const starters = Math.round(numberParam(ctx.params, "starters"));
    for (let i = 0; i < starters; i += 1) {
      const angle = i * 2.39996 + 0.7;
      const radius = 2.5 + (i / Math.max(1, starters - 1)) * (PLANT_BOUND - 4);
      plantSeed(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    // ---------------------------------------------------------------- loop
    return {
      actions: {
        gust: summonGust,
        seed: () => {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.sqrt(Math.random()) * (PLANT_BOUND - 1);
          plantSeed(Math.cos(angle) * radius, Math.sin(angle) * radius);
        },
        reset: () => undefined
      },
      onPointerDown: (point, bodyHandle) => {
        const plant = bodyHandle !== undefined ? bodyToPlant.get(bodyHandle) : undefined;
        if (plant && bodyHandle !== undefined) {
          // Flick the clicked plant and let the spring chain ripple.
          const mass = world.getBodyMass(bodyHandle);
          world.setBodyAwake(bodyHandle, true);
          world.applyImpulseAtPoint(
            bodyHandle,
            [(Math.random() - 0.5) * 2 * mass, 3.5 * mass, (Math.random() - 0.5) * 2 * mass],
            point
          );
          spawnBurst(point, 0xcaffdd, 0.6, 0.35);
          return;
        }
        if (Math.abs(point[0]) <= GARDEN_HALF && Math.abs(point[2]) <= GARDEN_HALF) {
          plantSeed(point[0], point[2]);
        }
      },
      update: (delta, elapsed) => {
        const breeze = numberParam(ctx.params, "breeze");
        const gustPower = numberParam(ctx.params, "gustPower");
        const brushRadius = numberParam(ctx.params, "brushRadius");
        const brushPower = numberParam(ctx.params, "brushPower");

        // Wind direction drifts slowly; gusts decay over their envelope.
        windAngle += delta * 0.07;
        windDir.set(Math.cos(windAngle), 0, Math.sin(windAngle));
        let gustEnvelope = 0;
        if (gustTimer > 0) {
          gustTimer = Math.max(0, gustTimer - delta);
          gustEnvelope = Math.sin(Math.PI * (1 - gustTimer / GUST_DURATION));
        }

        cursorVelocity.multiplyScalar(Math.pow(0.01, delta));
        const cursorSpeed = Math.hypot(cursorVelocity.x, cursorVelocity.z);
        const brushing = cursorActive && cursorSpeed > 0.6;
        // Forces accumulate until the world steps — don't stack them while paused.
        const applyForces = !ctx.params.paused;

        for (const plant of plants) {
          plant.age += delta;
          for (const entry of plant.grow) {
            const t = Math.min(1, Math.max(0, (plant.age - entry.delay) / 0.55));
            if (t < 1) {
              entry.object.scale.setScalar(Math.max(0.001, easeOutBack(t)));
            } else if (entry.object.scale.x !== 1) {
              entry.object.scale.setScalar(1);
            }
          }

          // Ambient sway: layered sines, unique phase per plant.
          const sway =
            breeze *
            (0.55 * Math.sin(elapsed * 1.15 + plant.phase) +
              0.3 * Math.sin(elapsed * 2.63 + plant.phase * 2.1) +
              0.15 * Math.sin(elapsed * 5.1 + plant.phase * 0.7));
          const gust = gustEnvelope * gustPower;

          const brushDx = plant.rootX - cursorPoint.x;
          const brushDz = plant.rootZ - cursorPoint.z;
          const plantNearBrush =
            brushing && brushDx * brushDx + brushDz * brushDz < (brushRadius + plant.reach) ** 2;

          if (!applyForces) {
            continue;
          }

          for (const body of plant.bodies) {
            world.getBodyTransform(body.sim.body, scratchTransform);
            world.getBodyVelocity(body.sim.body, scratchVelocity);
            const px = scratchTransform.position[0];
            const py = scratchTransform.position[1];
            const pz = scratchTransform.position[2];

            // Righting spring toward the rest pose plus velocity damping.
            let fx =
              ((body.rest[0] - px) * RIGHTING_STIFFNESS - scratchVelocity.linear[0] * RIGHTING_DAMPING) * body.mass;
            let fy =
              ((body.rest[1] - py) * RIGHTING_STIFFNESS - scratchVelocity.linear[1] * RIGHTING_DAMPING) * body.mass;
            let fz =
              ((body.rest[2] - pz) * RIGHTING_STIFFNESS - scratchVelocity.linear[2] * RIGHTING_DAMPING) * body.mass;

            const windScale = body.exposure * body.mass;
            fx += windDir.x * (sway + gust) * windScale;
            fz += windDir.z * (sway + gust) * windScale;

            if (plantNearBrush) {
              const dx = px - cursorPoint.x;
              const dz = pz - cursorPoint.z;
              const distance = Math.hypot(dx, dz);
              if (distance < brushRadius) {
                const falloff = 1 - distance / brushRadius;
                const push = brushPower * falloff * Math.min(1, cursorSpeed / 14) * body.mass;
                fx += (cursorVelocity.x / cursorSpeed) * push;
                fz += (cursorVelocity.z / cursorSpeed) * push;
                fy += push * 0.15;
              }
            }

            world.setBodyAwake(body.sim.body, true);
            world.applyForce(body.sim.body, [fx, fy, fz]);
          }
        }

        // Fireflies drift on layered sines; the gust shoves them downwind.
        const gustPush = gustEnvelope * 1.6;
        for (let i = 0; i < fireflyCount; i += 1) {
          const phase = i * 1.37;
          fireflyPositions[i * 3] =
            fireflyBase[i * 3] + Math.sin(elapsed * 0.45 + phase) * 1.1 + windDir.x * gustPush;
          fireflyPositions[i * 3 + 1] =
            fireflyBase[i * 3 + 1] + Math.sin(elapsed * 0.9 + phase * 2.3) * 0.5;
          fireflyPositions[i * 3 + 2] =
            fireflyBase[i * 3 + 2] + Math.cos(elapsed * 0.32 + phase) * 1.1 + windDir.z * gustPush;
        }
        fireflyAttribute.needsUpdate = true;
        (fireflies.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(elapsed * 1.7) * 0.25;

        for (const burst of bursts) {
          if (burst.age >= burst.duration) {
            continue;
          }
          burst.age += delta;
          const t = Math.min(1, burst.age / burst.duration);
          const eased = 1 - (1 - t) * (1 - t);
          burst.shell.scale.setScalar(0.1 + eased * burst.radius);
          burst.material.opacity = 0.5 * (1 - t);
          if (t >= 1) {
            burst.shell.visible = false;
          }
        }
      },
      metrics: () => {
        const maxPlants = Math.round(numberParam(ctx.params, "maxPlants"));
        return {
          Plants: `${plants.length}/${maxPlants}`,
          Bodies: plants.reduce((sum, plant) => sum + plant.bodies.length, 0),
          Wind: gustTimer > 0 ? "GUSTING" : "breeze",
          Bed: plants.length >= maxPlants ? "full — replant to clear" : "click soil to plant"
        };
      },
      dispose: () => {
        canvas.removeEventListener("pointermove", onPointerMove);
      }
    };
  }
};
