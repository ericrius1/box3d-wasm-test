import { BodyType, type HumanOptions, type PhysicsWorld, type Quat, type Transform, type Vec3 } from "box3d-wasm";
import * as THREE from "three/webgpu";

export type ParamValue = number | boolean;
export type ScenarioParams = Record<string, ParamValue>;

export type ControlDefinition = {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  rebuild?: boolean;
};

export type ControlFolder = {
  title: string;
  controls: ControlDefinition[];
};

export type ScenarioAction = {
  id: string;
  title: string;
};

export type ScenarioCamera = {
  position: Vec3;
  target: Vec3;
  fov?: number;
};

export type ScenarioCategory = "fun" | "samples" | "performance";

export type SimBody = {
  body: number;
  object: THREE.Object3D;
  transform: Transform;
  origin: [number, number, number];
  dynamic: boolean;
};

export type InstancedBodies = {
  bodies: number[];
  mesh: THREE.InstancedMesh;
};

export type MaterialRole =
  | "ground"
  | "wall"
  | "primary"
  | "secondary"
  | "accent"
  | "danger"
  | "reward"
  | "glass"
  | "debug";

export type ScenarioContext = {
  world: PhysicsWorld;
  scene: THREE.Scene;
  landmarkGroup: THREE.Group;
  params: ScenarioParams;
  material(role: MaterialRole): THREE.Material;
  colorMaterial(color: string, options?: { metalness?: number; roughness?: number; emissive?: string }): THREE.Material;
  addBox(options: {
    type: typeof BodyType[keyof typeof BodyType];
    position: Vec3;
    halfExtents: Vec3;
    material: THREE.Material;
    rotation?: Quat;
    density?: number;
    friction?: number;
    restitution?: number;
    rollingResistance?: number;
    bullet?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
  }): SimBody;
  addSphere(options: {
    type: typeof BodyType[keyof typeof BodyType];
    position: Vec3;
    radius: number;
    material: THREE.Material;
    density?: number;
    friction?: number;
    restitution?: number;
    rollingResistance?: number;
    bullet?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
  }): SimBody;
  addCapsule(options: {
    type: typeof BodyType[keyof typeof BodyType];
    position: Vec3;
    halfHeight: number;
    radius: number;
    material: THREE.Material;
    density?: number;
    friction?: number;
    restitution?: number;
    rollingResistance?: number;
    bullet?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
  }): SimBody;
  addInstancedBoxes(options: {
    count: number;
    halfExtents: Vec3;
    material: THREE.Material;
    position: (index: number) => Vec3;
    rotation?: (index: number) => Quat;
    density?: number;
    friction?: number;
    restitution?: number;
  }): InstancedBodies;
  addInstancedSpheres(options: {
    count: number;
    radius: number;
    material: THREE.Material;
    position: (index: number) => Vec3;
    density?: number;
    friction?: number;
    restitution?: number;
    rollingResistance?: number;
  }): InstancedBodies;
  addHuman(
    position: Vec3,
    options?: HumanOptions & { material?: (boneIndex: number) => THREE.Material }
  ): { human: number; bodies: SimBody[] };
  addLandmarkSphere(position: Vec3, radius: number, color: string): void;
  addLandmarkLine(from: Vec3, to: Vec3, color: string): void;
};

export type ScenarioInstance = {
  actions?: Record<string, () => void>;
  update?: (delta: number, elapsed: number) => void;
  metrics?: () => Record<string, string | number>;
  onPointerDown?: (point: Vec3, bodyHandle?: number) => void;
  dispose?: () => void;
};

export type ScenarioDefinition = {
  id: string;
  title: string;
  eyebrow: string;
  deck: string;
  description: string;
  accent: string;
  category: ScenarioCategory;
  hint?: string;
  defaults: ScenarioParams;
  controls: ControlFolder[];
  actions: ScenarioAction[];
  camera: ScenarioCamera;
  gravity(params: ScenarioParams): Vec3;
  setup(ctx: ScenarioContext): ScenarioInstance;
};

function numberParam(params: ScenarioParams, key: string) {
  return Number(params[key] ?? 0);
}

function boolParam(params: ScenarioParams, key: string) {
  return Boolean(params[key]);
}

function setBodyPose(world: PhysicsWorld, body: SimBody, position: Vec3) {
  world.setBodyTransform(body.body, position, [0, 0, 0, 1]);
  body.object.position.set(position[0], position[1], position[2]);
}

function formatSpeed(value: number) {
  return `${value.toFixed(1)} m/s`;
}

/** Y component of the body's up axis after rotation; < ~0.75 means it tipped over. */
function uprightness(rotation: readonly [number, number, number, number]) {
  const [x, , z] = rotation;
  return 1 - 2 * (x * x + z * z);
}

const baseDebugControls: ControlFolder = {
  title: "Debug / overlays",
  controls: [
    { key: "paused", label: "Paused", rebuild: false },
    { key: "showLandmarks", label: "Landmarks", rebuild: false }
  ]
};

export const heroScenario: ScenarioDefinition = {
  id: "landing-lab",
  title: "box3d-wasm",
  eyebrow: "Box3D in the browser",
  deck: "Rigid bodies, impulses, and browser-native demos with a typed WebAssembly wrapper.",
  description:
    "A compact proving ground for the package: boxes, spheres, and capsules simulated in Box3D, rendered in Three.js, and wired to real pointer input.",
  accent: "#27c7a9",
  category: "fun",
  hint: "Click or tap the pile — every blast is a real Box3D impulse",
  defaults: {
    gravity: -14,
    pieceCount: 36,
    pulseEvery: 5,
    pulsePower: 84,
    clickPower: 66,
    autoPulse: true,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Landing scene",
      controls: [
        { key: "gravity", label: "Gravity", min: -24, max: -3, step: 0.5 },
        { key: "pieceCount", label: "Pieces", min: 12, max: 72, step: 1 },
        { key: "autoPulse", label: "Auto pulse", rebuild: false },
        { key: "pulseEvery", label: "Pulse interval", min: 1.5, max: 9, step: 0.25, rebuild: false },
        { key: "pulsePower", label: "Pulse power", min: 20, max: 160, step: 2, rebuild: false },
        { key: "clickPower", label: "Click power", min: 12, max: 160, step: 2, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "pulse", title: "Pulse center" },
    { id: "rain", title: "Drop shapes" },
    { id: "reset", title: "Reset scene" }
  ],
  camera: {
    position: [9.4, 6.8, 10.2],
    target: [0.4, 1.7, 0],
    fov: 43
  },
  gravity: (params) => [0, numberParam(params, "gravity"), 0],
  setup(ctx) {
    const pieces: SimBody[] = [];
    const pieceCount = Math.round(numberParam(ctx.params, "pieceCount"));
    let lastPulse = 0;
    let clicks = 0;

    ctx.addBox({
      type: BodyType.Static,
      position: [0, -0.35, 0],
      halfExtents: [6.2, 0.3, 4.8],
      material: ctx.material("ground"),
      friction: 0.9,
      receiveShadow: true
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [-5.6, 1.05, 0],
      halfExtents: [0.2, 1.1, 4.8],
      material: ctx.material("wall"),
      friction: 0.7
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [5.6, 1.05, 0],
      halfExtents: [0.2, 1.1, 4.8],
      material: ctx.material("wall"),
      friction: 0.7
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [0, 1.05, -4.55],
      halfExtents: [5.6, 1.1, 0.2],
      material: ctx.material("wall"),
      friction: 0.7
    });

    // Central emissive totem the blasts orbit around.
    for (let level = 0; level < 4; level += 1) {
      pieces.push(
        ctx.addBox({
          type: BodyType.Dynamic,
          position: [0, 0.42 + level * 0.85, 0],
          halfExtents: [0.42 - level * 0.05, 0.42, 0.42 - level * 0.05],
          material: ctx.material("accent"),
          density: 2.2,
          friction: 0.7,
          restitution: 0.05
        })
      );
    }

    const spawnPiece = (i: number, yBoost = 0) => {
      const ring = 1.6 + (i % 4) * 0.85;
      const angle = i * 2.39996; // golden angle keeps the ring evenly seeded
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring * 0.72;
      const y = 0.4 + ((i * 13) % 5) * 0.5 + yBoost;
      const material =
        i % 4 === 0
          ? ctx.material("accent")
          : i % 4 === 1
            ? ctx.material("primary")
            : i % 4 === 2
              ? ctx.material("secondary")
              : ctx.material("reward");

      if (i % 7 === 3) {
        return ctx.addCapsule({
          type: BodyType.Dynamic,
          position: [x, y + 0.2, z],
          halfHeight: 0.22,
          radius: 0.17,
          material,
          density: 1.2,
          friction: 0.5,
          restitution: 0.18
        });
      }

      if (i % 5 === 0) {
        return ctx.addSphere({
          type: BodyType.Dynamic,
          position: [x, y, z],
          radius: 0.25,
          material,
          density: 1.4,
          friction: 0.45,
          restitution: 0.3
        });
      }

      return ctx.addBox({
        type: BodyType.Dynamic,
        position: [x, y, z],
        halfExtents: [0.3, 0.24, 0.3],
        material,
        density: 1.1,
        friction: 0.62,
        restitution: 0.08
      });
    };

    for (let i = 0; i < pieceCount; i += 1) {
      pieces.push(spawnPiece(i));
    }

    ctx.addLandmarkSphere([0, 1.25, 0], 0.16, "#f4cf4d");
    ctx.addLandmarkLine([-4.9, 0.05, 0], [4.9, 0.05, 0], "#ec5f5f");

    const pulse = () => {
      ctx.world.explode([0, 0.75, 0], 5, 0.8, numberParam(ctx.params, "pulsePower"));
      lastPulse = performance.now() / 1000;
    };

    return {
      actions: {
        pulse,
        rain: () => {
          for (const piece of pieces) {
            if (!piece.dynamic) {
              continue;
            }
            const p = piece.transform.position;
            ctx.world.setBodyTransform(piece.body, [p[0] * 0.6, 5.5 + Math.random() * 3, p[2] * 0.6]);
            ctx.world.setBodyVelocity(piece.body, [0, 0, 0], [0, 0, 0]);
          }
        },
        reset: () => undefined
      },
      onPointerDown: (point, bodyHandle) => {
        clicks += 1;
        const power = numberParam(ctx.params, "clickPower");
        ctx.world.explode(point, 3.4, 0.9, power);
        if (bodyHandle !== undefined) {
          ctx.world.applyImpulseAtPoint(bodyHandle, [0, ctx.world.getBodyMass(bodyHandle) * 6, 0], point);
        }
      },
      update: (_delta, elapsed) => {
        if (boolParam(ctx.params, "autoPulse") && elapsed - lastPulse > numberParam(ctx.params, "pulseEvery")) {
          pulse();
        }
      },
      metrics: () => ({
        Pieces: pieces.length,
        Clicks: clicks,
        "Pulse power": numberParam(ctx.params, "pulsePower").toFixed(0)
      })
    };
  }
};

export const exampleScenarios: ScenarioDefinition[] = [
  {
    id: "stackfall",
    title: "Stackfall Yard",
    eyebrow: "Impulse stress test",
    deck: "Fire a dense sphere into an alternating block tower and tune the collapse.",
    description:
      "This scenario is adapted from the earlier Stackfall experiment, split into its own example with launcher, tower, and debug controls.",
    accent: "#f2b544",
    category: "fun",
    hint: "Click blocks to blast them loose, or fire the launcher",
    defaults: {
      gravity: -18,
      rows: 9,
      launchSpeed: 32,
      launchLift: 5,
      sideAim: 0,
      blockFriction: 0.72,
      bounce: 0.05,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Launcher",
        controls: [
          { key: "launchSpeed", label: "Launch speed", min: 10, max: 46, step: 0.5, rebuild: false },
          { key: "launchLift", label: "Launch lift", min: 0, max: 16, step: 0.25, rebuild: false },
          { key: "sideAim", label: "Side aim", min: -3.4, max: 3.4, step: 0.1 }
        ]
      },
      {
        title: "Tower material",
        controls: [
          { key: "gravity", label: "Gravity", min: -30, max: -4, step: 0.5 },
          { key: "rows", label: "Rows", min: 4, max: 13, step: 1 },
          { key: "blockFriction", label: "Block friction", min: 0.05, max: 1.2, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0, max: 0.6, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "fire", title: "Fire sphere" },
      { id: "reset", title: "Reset tower" }
    ],
    camera: {
      position: [9.2, 6.2, 8.4],
      target: [0.2, 2.1, 0],
      fov: 42
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const blocks: SimBody[] = [];
      let shots = 0;
      let fallen = 0;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.55, 0],
        halfExtents: [10.5, 0.5, 6.4],
        material: ctx.material("ground"),
        friction: 0.95,
        receiveShadow: true
      });
      ctx.addBox({
        type: BodyType.Static,
        position: [4.2, 1.1, -3.1],
        halfExtents: [0.25, 1.2, 3.8],
        material: ctx.material("wall"),
        friction: 0.6
      });
      ctx.addBox({
        type: BodyType.Static,
        position: [4.2, 1.1, 3.1],
        halfExtents: [0.25, 1.2, 3.8],
        material: ctx.material("wall"),
        friction: 0.6
      });

      const rows = Math.round(numberParam(ctx.params, "rows"));
      for (let row = 0; row < rows; row += 1) {
        const count = row % 2 === 0 ? 5 : 4;
        for (let col = 0; col < count; col += 1) {
          const x = 1.55 + (col - (count - 1) / 2) * 0.82;
          const z = (row % 2 === 0 ? 0 : 0.38) + (col % 2 === 0 ? 0.06 : -0.06);
          const y = 0.32 + row * 0.62;
          blocks.push(
            ctx.addBox({
              type: BodyType.Dynamic,
              position: [x, y, z],
              halfExtents: [0.36, 0.28, 0.36],
              material: row % 3 === 0 ? ctx.material("primary") : row % 3 === 1 ? ctx.material("secondary") : ctx.material("accent"),
              density: 1.15,
              friction: numberParam(ctx.params, "blockFriction"),
              restitution: numberParam(ctx.params, "bounce")
            })
          );
        }
      }

      const projectile = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-7.2, 1.15, numberParam(ctx.params, "sideAim")],
        radius: 0.62,
        material: ctx.material("reward"),
        density: 8,
        friction: 0.28,
        restitution: 0.24,
        bullet: true
      });

      ctx.addLandmarkSphere([-7.2, 1.15, numberParam(ctx.params, "sideAim")], 0.16, "#f7cf4d");
      ctx.addLandmarkLine([1.55, 0.15, 0], [1.55, rows * 0.62, 0], "#2ad8c2");
      ctx.addLandmarkLine([-3.5, 0.08, 0], [5.6, 0.08, 0], "#ff5c5c");

      return {
        actions: {
          fire: () => {
            setBodyPose(ctx.world, projectile, [-7.2, 1.15, numberParam(ctx.params, "sideAim")]);
            ctx.world.setBodyVelocity(
              projectile.body,
              [numberParam(ctx.params, "launchSpeed"), numberParam(ctx.params, "launchLift"), -numberParam(ctx.params, "sideAim") * 0.85],
              [0, 0, 0]
            );
            shots += 1;
          },
          reset: () => undefined
        },
        update: () => {
          fallen = 0;
          for (const block of blocks) {
            const p = block.transform.position;
            const d = Math.hypot(p[0] - block.origin[0], p[1] - block.origin[1], p[2] - block.origin[2]);
            if (d > 0.24 || p[1] < 0.12 || Math.abs(p[0]) > 6.5 || Math.abs(p[2]) > 4.9) {
              fallen += 1;
            }
          }
        },
        metrics: () => ({
          Blocks: blocks.length,
          Fallen: fallen,
          Shots: shots,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(projectile.body))
        })
      };
    }
  },
  {
    id: "wrecking-ball",
    title: "Wrecking Ball",
    eyebrow: "Spherical joint chain",
    deck: "Swing a jointed chain and heavy ball into a brick wall — joints run inside the WASM solver.",
    description:
      "A chain of box links connected by spherical joints hangs from a static anchor with a dense sphere at the end. Swing it into the wall and tune link count, ball mass, and wall size.",
    accent: "#c98bf2",
    category: "fun",
    hint: "Click the ball or wall to shove them, or hit Swing",
    defaults: {
      gravity: -12,
      links: 8,
      ballDensity: 7,
      swingPower: 15,
      wallRows: 6,
      wallCols: 6,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Chain",
        controls: [
          { key: "links", label: "Chain links", min: 4, max: 14, step: 1 },
          { key: "ballDensity", label: "Ball density", min: 2, max: 18, step: 0.5 },
          { key: "swingPower", label: "Swing power", min: 5, max: 30, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Wall",
        controls: [
          { key: "gravity", label: "Gravity", min: -24, max: -4, step: 0.5 },
          { key: "wallRows", label: "Wall rows", min: 3, max: 9, step: 1 },
          { key: "wallCols", label: "Wall columns", min: 3, max: 9, step: 1 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "swing", title: "Swing ball" },
      { id: "reset", title: "Rebuild wall" }
    ],
    camera: {
      position: [10.4, 6.6, 10.4],
      target: [1.2, 3, 0],
      fov: 42
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const links = Math.round(numberParam(ctx.params, "links"));
      const anchorY = 8.2;
      const linkSpacing = 0.5;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.55, 0],
        halfExtents: [9.5, 0.5, 6.5],
        material: ctx.material("ground"),
        friction: 0.85,
        receiveShadow: true
      });

      const anchor = ctx.addBox({
        type: BodyType.Static,
        position: [0, anchorY, 0],
        halfExtents: [0.35, 0.18, 0.35],
        material: ctx.material("wall"),
        castShadow: true
      });

      // Chain of thin links, each pinned to the previous with a spherical joint.
      let previous = anchor;
      let jointY = anchorY - 0.18;
      const chain: SimBody[] = [];
      for (let i = 0; i < links; i += 1) {
        const centerY = jointY - linkSpacing / 2;
        const link = ctx.addBox({
          type: BodyType.Dynamic,
          position: [0, centerY, 0],
          halfExtents: [0.09, linkSpacing / 2 - 0.02, 0.09],
          material: i % 2 === 0 ? ctx.material("primary") : ctx.material("secondary"),
          density: 2.4,
          friction: 0.4
        });
        ctx.world.createSphericalJoint(previous.body, link.body, [0, jointY, 0]);
        chain.push(link);
        previous = link;
        jointY -= linkSpacing;
      }

      const ballRadius = 0.62;
      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [0, jointY - ballRadius, 0],
        radius: ballRadius,
        material: ctx.material("reward"),
        density: numberParam(ctx.params, "ballDensity"),
        friction: 0.4,
        restitution: 0.1,
        bullet: true
      });
      ctx.world.createSphericalJoint(previous.body, ball.body, [0, jointY, 0]);

      const wallRows = Math.round(numberParam(ctx.params, "wallRows"));
      const wallCols = Math.round(numberParam(ctx.params, "wallCols"));
      const brickHalf: Vec3 = [0.22, 0.28, 0.44];
      const wallX = 3.4;
      const bricks: SimBody[] = [];
      for (let row = 0; row < wallRows; row += 1) {
        for (let col = 0; col < wallCols; col += 1) {
          const z = (col - (wallCols - 1) / 2) * (brickHalf[2] * 2 + 0.02) + (row % 2 === 0 ? 0 : brickHalf[2] * 0.9);
          bricks.push(
            ctx.addBox({
              type: BodyType.Dynamic,
              position: [wallX, brickHalf[1] + row * (brickHalf[1] * 2 + 0.015), z],
              halfExtents: brickHalf,
              material: row % 3 === 0 ? ctx.material("accent") : row % 3 === 1 ? ctx.material("primary") : ctx.material("secondary"),
              density: 0.9,
              friction: 0.65,
              restitution: 0.02
            })
          );
        }
      }

      ctx.addLandmarkSphere([0, anchorY, 0], 0.14, "#f4cf4d");
      ctx.addLandmarkLine([0, anchorY, 0], [0, jointY - ballRadius, 0], "#c98bf2");
      ctx.addLandmarkLine([wallX, 0.08, -3.4], [wallX, 0.08, 3.4], "#ff6b70");

      let swings = 0;
      let standing = bricks.length;

      return {
        actions: {
          swing: () => {
            const power = numberParam(ctx.params, "swingPower");
            ctx.world.setBodyVelocity(ball.body, [-power, 1.5, 0], [0, 0, 0]);
            swings += 1;
          },
          reset: () => undefined
        },
        update: () => {
          standing = 0;
          for (const brick of bricks) {
            const p = brick.transform.position;
            const d = Math.hypot(p[0] - brick.origin[0], p[1] - brick.origin[1], p[2] - brick.origin[2]);
            if (d < 0.3) {
              standing += 1;
            }
          }
        },
        metrics: () => ({
          Links: links,
          Bricks: bricks.length,
          Standing: standing,
          Swings: swings,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  },
  {
    id: "bowling-lane",
    title: "Bowling Lane",
    eyebrow: "Capsule pins",
    deck: "Roll a hooked ball into ten capsule pins and read the fall count from body rotations.",
    description:
      "Capsule bodies make convincing pins: they wobble, spin, and topple. Aim the throw, add hook spin, and the scenario counts fallen pins from each pin's up vector.",
    accent: "#f2e14c",
    category: "fun",
    hint: "Click pins to knock them over, or roll the ball",
    defaults: {
      power: 24,
      aim: 0,
      hook: 0,
      pinFriction: 0.42,
      laneFriction: 0.16,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Throw",
        controls: [
          { key: "power", label: "Power", min: 10, max: 42, step: 0.5, rebuild: false },
          { key: "aim", label: "Aim", min: -2, max: 2, step: 0.05, rebuild: false },
          { key: "hook", label: "Hook spin", min: -24, max: 24, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Lane",
        controls: [
          { key: "pinFriction", label: "Pin friction", min: 0.05, max: 1, step: 0.01 },
          { key: "laneFriction", label: "Lane friction", min: 0.02, max: 0.8, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "roll", title: "Roll ball" },
      { id: "reset", title: "Reset pins" }
    ],
    camera: {
      position: [6.4, 5.4, 13.6],
      target: [0, 0.6, -2.4],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const laneFriction = numberParam(ctx.params, "laneFriction");
      const pinFriction = numberParam(ctx.params, "pinFriction");

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.3, 0],
        halfExtents: [2.1, 0.3, 11.5],
        material: ctx.material("ground"),
        friction: laneFriction,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-2.25, 0.28, 0], halfExtents: [0.15, 0.28, 11.5], material: ctx.material("wall"), friction: 0.2 });
      ctx.addBox({ type: BodyType.Static, position: [2.25, 0.28, 0], halfExtents: [0.15, 0.28, 11.5], material: ctx.material("wall"), friction: 0.2 });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.7, -11.6], halfExtents: [2.4, 0.7, 0.2], material: ctx.material("wall"), friction: 0.3 });

      // Ten pins in the standard 1-2-3-4 triangle.
      const pins: SimBody[] = [];
      const pinBaseZ = -7.6;
      const pinSpacing = 0.52;
      for (let row = 0; row < 4; row += 1) {
        for (let i = 0; i <= row; i += 1) {
          const x = (i - row / 2) * pinSpacing;
          const z = pinBaseZ - row * pinSpacing;
          pins.push(
            ctx.addCapsule({
              type: BodyType.Dynamic,
              position: [x, 0.46, z],
              halfHeight: 0.24,
              radius: 0.14,
              material: ctx.material("glass"),
              density: 0.7,
              friction: pinFriction,
              restitution: 0.12
            })
          );
        }
      }

      const ballStart: Vec3 = [0, 0.36, 9.6];
      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: ballStart,
        radius: 0.36,
        material: ctx.material("reward"),
        density: 9,
        friction: 0.16,
        restitution: 0.05,
        rollingResistance: 0.004,
        bullet: true
      });

      ctx.addLandmarkLine([0, 0.05, 9.6], [0, 0.05, pinBaseZ], "#f2e14c");
      ctx.addLandmarkSphere([0, 0.05, pinBaseZ - 0.8], 0.12, "#ff6b70");

      let rolls = 0;
      let down = 0;

      return {
        actions: {
          roll: () => {
            setBodyPose(ctx.world, ball, ballStart);
            ctx.world.setBodyVelocity(
              ball.body,
              [numberParam(ctx.params, "aim"), 0, -numberParam(ctx.params, "power")],
              [0, numberParam(ctx.params, "hook"), 0]
            );
            rolls += 1;
          },
          reset: () => undefined
        },
        update: () => {
          down = 0;
          for (const pin of pins) {
            if (uprightness(pin.transform.rotation) < 0.72 || pin.transform.position[1] < 0.2) {
              down += 1;
            }
          }
        },
        metrics: () => ({
          Pins: pins.length,
          Down: down,
          Rolls: rolls,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  },
  {
    id: "pinball-well",
    title: "Pinball Well",
    eyebrow: "Restitution playground",
    deck: "Launch a fast sphere through static bumpers and tune bounce, spin, and plunger force.",
    description:
      "A compact arcade table that makes restitution, bullet bodies, wall friction, and angular impulses easy to inspect.",
    accent: "#e96368",
    category: "fun",
    hint: "Click the table to nudge the ball with a shockwave",
    defaults: {
      gravity: -9,
      plunger: 28,
      spin: 12,
      bumperScale: 1,
      tableFriction: 0.22,
      bounce: 0.8,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Plunger",
        controls: [
          { key: "plunger", label: "Plunger force", min: 10, max: 44, step: 0.5, rebuild: false },
          { key: "spin", label: "Angular kick", min: -24, max: 24, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Table",
        controls: [
          { key: "gravity", label: "Gravity", min: -18, max: -1, step: 0.25 },
          { key: "bumperScale", label: "Bumper size", min: 0.65, max: 1.55, step: 0.05 },
          { key: "tableFriction", label: "Wall friction", min: 0, max: 0.9, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0.1, max: 1.2, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "launch", title: "Launch ball" },
      { id: "nudge", title: "Nudge table" },
      { id: "reset", title: "Reset ball" }
    ],
    camera: {
      position: [0, 9.6, 10.8],
      target: [0, 0.7, 0],
      fov: 39
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      let launches = 0;
      const bounce = numberParam(ctx.params, "bounce");
      const wallFriction = numberParam(ctx.params, "tableFriction");
      const bumperRadius = 0.58 * numberParam(ctx.params, "bumperScale");

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.45, 0],
        halfExtents: [4.4, 0.35, 6.2],
        material: ctx.material("ground"),
        friction: 0.45,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-4.35, 0.55, 0], halfExtents: [0.22, 1, 6.2], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [4.35, 0.55, 0], halfExtents: [0.22, 1, 6.2], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.55, -6.15], halfExtents: [4.4, 1, 0.22], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.55, 6.15], halfExtents: [4.4, 1, 0.22], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });

      const bumpers: SimBody[] = [];
      const bumperPositions: Vec3[] = [
        [-1.8, 0.35, -2.5],
        [1.4, 0.35, -1.7],
        [-0.25, 0.35, 0.6],
        [2.35, 0.35, 2.1],
        [-2.55, 0.35, 2.7]
      ];
      for (const position of bumperPositions) {
        bumpers.push(
          ctx.addSphere({
            type: BodyType.Static,
            position,
            radius: bumperRadius,
            material: ctx.material("danger"),
            friction: 0.08,
            restitution: bounce
          })
        );
      }

      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-3.15, 0.55, 4.8],
        radius: 0.34,
        material: ctx.material("reward"),
        density: 5.5,
        friction: 0.1,
        restitution: bounce,
        rollingResistance: 0.01,
        bullet: true
      });

      ctx.addLandmarkSphere([-3.15, 0.55, 4.8], 0.14, "#f4cf4d");
      ctx.addLandmarkLine([-3.15, 0.08, 4.8], [-3.15, 0.08, -4.8], "#2ad8c2");
      ctx.addLandmarkLine([-4, 0.12, 0], [4, 0.12, 0], "#ff6b70");

      const launch = () => {
        setBodyPose(ctx.world, ball, [-3.15, 0.55, 4.8]);
        ctx.world.setBodyVelocity(ball.body, [1.9, 0, -numberParam(ctx.params, "plunger")], [0, 0, 0]);
        ctx.world.applyAngularImpulse(ball.body, [numberParam(ctx.params, "spin"), 0, -numberParam(ctx.params, "spin") * 0.35]);
        launches += 1;
      };

      return {
        actions: {
          launch,
          nudge: () => ctx.world.applyImpulse(ball.body, [7.5, 0, -1.5]),
          reset: () => setBodyPose(ctx.world, ball, [-3.15, 0.55, 4.8])
        },
        metrics: () => ({
          Bumpers: bumpers.length,
          Launches: launches,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  },
  {
    id: "blast-lab",
    title: "Blast Lab",
    eyebrow: "Explosion falloff",
    deck: "Tune Box3D's world explosion helper against a mixed crate and sphere pile.",
    description:
      "This example isolates radial impulses, falloff, object mix, and body count so game explosions can be tuned without unrelated systems.",
    accent: "#30b8e8",
    category: "fun",
    hint: "Click anywhere in the pit to detonate at that point",
    defaults: {
      gravity: -15,
      objectCount: 34,
      sphereMix: 0.35,
      blastRadius: 4.1,
      falloff: 0.78,
      impulsePerArea: 92,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Pile",
        controls: [
          { key: "gravity", label: "Gravity", min: -28, max: -2, step: 0.5 },
          { key: "objectCount", label: "Objects", min: 8, max: 72, step: 1 },
          { key: "sphereMix", label: "Sphere mix", min: 0, max: 1, step: 0.05 }
        ]
      },
      {
        title: "Blast",
        controls: [
          { key: "blastRadius", label: "Radius", min: 1, max: 7, step: 0.1, rebuild: false },
          { key: "falloff", label: "Falloff", min: 0.1, max: 1.6, step: 0.02, rebuild: false },
          { key: "impulsePerArea", label: "Impulse", min: 10, max: 180, step: 2, rebuild: false }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "blast", title: "Blast center" },
      { id: "reset", title: "Reset pile" }
    ],
    camera: {
      position: [8.8, 6.8, 8.8],
      target: [0, 1.7, 0],
      fov: 43
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const bodies: SimBody[] = [];
      let blasts = 0;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.45, 0],
        halfExtents: [5.2, 0.4, 5.2],
        material: ctx.material("ground"),
        friction: 0.85,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-5, 1, 0], halfExtents: [0.22, 1.15, 5.2], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [5, 1, 0], halfExtents: [0.22, 1.15, 5.2], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [0, 1, -5], halfExtents: [5.2, 1.15, 0.22], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [0, 1, 5], halfExtents: [5.2, 1.15, 0.22], material: ctx.material("wall"), friction: 0.55 });

      const count = Math.round(numberParam(ctx.params, "objectCount"));
      const sphereMix = numberParam(ctx.params, "sphereMix");
      for (let i = 0; i < count; i += 1) {
        const layer = Math.floor(i / 9);
        const slot = i % 9;
        const x = (slot % 3 - 1) * 0.62 + (layer % 2) * 0.12;
        const z = (Math.floor(slot / 3) - 1) * 0.62 - (layer % 3) * 0.05;
        const y = 0.22 + layer * 0.5;
        const isSphere = (i % 10) / 10 < sphereMix;
        bodies.push(
          isSphere
            ? ctx.addSphere({
                type: BodyType.Dynamic,
                position: [x, y, z],
                radius: 0.23,
                material: i % 2 === 0 ? ctx.material("reward") : ctx.material("accent"),
                density: 1.8,
                friction: 0.36,
                restitution: 0.22
              })
            : ctx.addBox({
                type: BodyType.Dynamic,
                position: [x, y, z],
                halfExtents: [0.25, 0.25, 0.25],
                material: i % 3 === 0 ? ctx.material("primary") : ctx.material("secondary"),
                density: 1.2,
                friction: 0.68,
                restitution: 0.08
              })
        );
      }

      ctx.addLandmarkSphere([0, 0.55, 0], 0.18, "#f4cf4d");
      ctx.addLandmarkLine([-numberParam(ctx.params, "blastRadius"), 0.08, 0], [numberParam(ctx.params, "blastRadius"), 0.08, 0], "#30b8e8");
      ctx.addLandmarkLine([0, 0.08, -numberParam(ctx.params, "blastRadius")], [0, 0.08, numberParam(ctx.params, "blastRadius")], "#30b8e8");

      return {
        actions: {
          blast: () => {
            ctx.world.explode([0, 0.55, 0], numberParam(ctx.params, "blastRadius"), numberParam(ctx.params, "falloff"), numberParam(ctx.params, "impulsePerArea"));
            blasts += 1;
          },
          reset: () => undefined
        },
        onPointerDown: (point) => {
          ctx.world.explode(
            [point[0], Math.max(point[1], 0.4), point[2]],
            numberParam(ctx.params, "blastRadius"),
            numberParam(ctx.params, "falloff"),
            numberParam(ctx.params, "impulsePerArea")
          );
          blasts += 1;
        },
        metrics: () => ({
          Bodies: bodies.length,
          Blasts: blasts,
          Radius: numberParam(ctx.params, "blastRadius").toFixed(1)
        })
      };
    }
  },
  {
    id: "gravity-chamber",
    title: "Gravity Chamber",
    eyebrow: "Vector gravity",
    deck: "Change gravity direction inside a sealed chamber and watch body piles migrate.",
    description:
      "A zero-g style chamber for testing nonstandard gravity vectors, dense piles, rolling resistance, and repeated impulse nudges.",
    accent: "#8fbf49",
    category: "fun",
    defaults: {
      gravityX: 2.5,
      gravityY: -4,
      gravityZ: -5,
      bodyCount: 28,
      kick: 18,
      rollingResistance: 0.04,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Gravity vector",
        controls: [
          { key: "gravityX", label: "X gravity", min: -12, max: 12, step: 0.25 },
          { key: "gravityY", label: "Y gravity", min: -12, max: 12, step: 0.25 },
          { key: "gravityZ", label: "Z gravity", min: -12, max: 12, step: 0.25 }
        ]
      },
      {
        title: "Chamber bodies",
        controls: [
          { key: "bodyCount", label: "Body count", min: 8, max: 56, step: 1 },
          { key: "rollingResistance", label: "Rolling drag", min: 0, max: 0.2, step: 0.005 },
          { key: "kick", label: "Nudge impulse", min: 3, max: 42, step: 0.5, rebuild: false }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "kick", title: "Nudge bodies" },
      { id: "reset", title: "Reset chamber" }
    ],
    camera: {
      position: [7.6, 6.9, 7.6],
      target: [0, 0.7, 0],
      fov: 44
    },
    gravity: (params) => [
      numberParam(params, "gravityX"),
      numberParam(params, "gravityY"),
      numberParam(params, "gravityZ")
    ],
    setup(ctx) {
      const bodies: SimBody[] = [];
      const size = 4.2;

      ctx.addBox({ type: BodyType.Static, position: [0, -size, 0], halfExtents: [size, 0.18, size], material: ctx.material("ground"), friction: 0.55, restitution: 0.12, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [0, size, 0], halfExtents: [size, 0.18, size], material: ctx.material("wall"), friction: 0.55, restitution: 0.12 });
      ctx.addBox({ type: BodyType.Static, position: [-size, 0, 0], halfExtents: [0.18, size, size], material: ctx.material("wall"), friction: 0.55, restitution: 0.12 });
      ctx.addBox({ type: BodyType.Static, position: [size, 0, 0], halfExtents: [0.18, size, size], material: ctx.material("wall"), friction: 0.55, restitution: 0.12 });
      ctx.addBox({ type: BodyType.Static, position: [0, 0, -size], halfExtents: [size, size, 0.18], material: ctx.material("wall"), friction: 0.55, restitution: 0.12 });
      ctx.addBox({ type: BodyType.Static, position: [0, 0, size], halfExtents: [size, size, 0.18], material: ctx.material("wall"), friction: 0.55, restitution: 0.12 });

      const bodyCount = Math.round(numberParam(ctx.params, "bodyCount"));
      for (let i = 0; i < bodyCount; i += 1) {
        const x = ((i * 1.73) % 5) - 2;
        const y = ((i * 0.91) % 4) - 1.2;
        const z = ((i * 2.31) % 5) - 2;
        bodies.push(
          i % 2 === 0
            ? ctx.addSphere({
                type: BodyType.Dynamic,
                position: [x, y, z],
                radius: 0.24,
                material: i % 4 === 0 ? ctx.material("accent") : ctx.material("reward"),
                density: 1.3,
                friction: 0.25,
                restitution: 0.35,
                rollingResistance: numberParam(ctx.params, "rollingResistance")
              })
            : ctx.addBox({
                type: BodyType.Dynamic,
                position: [x, y, z],
                halfExtents: [0.23, 0.23, 0.23],
                material: i % 3 === 0 ? ctx.material("primary") : ctx.material("secondary"),
                density: 1.1,
                friction: 0.5,
                restitution: 0.18
              })
        );
      }

      ctx.addLandmarkLine([0, 0, 0], [numberParam(ctx.params, "gravityX") * 0.22, numberParam(ctx.params, "gravityY") * 0.22, numberParam(ctx.params, "gravityZ") * 0.22], "#8fbf49");
      ctx.addLandmarkSphere([0, 0, 0], 0.12, "#f4cf4d");

      let nudges = 0;
      return {
        actions: {
          kick: () => {
            const impulse = numberParam(ctx.params, "kick");
            for (let i = 0; i < bodies.length; i += 1) {
              const direction = i % 2 === 0 ? 1 : -1;
              ctx.world.applyImpulse(bodies[i].body, [impulse * 0.4 * direction, impulse * 0.2, -impulse * 0.25 * direction]);
            }
            nudges += 1;
          },
          reset: () => undefined
        },
        metrics: () => ({
          Bodies: bodies.length,
          Nudges: nudges,
          "Gravity length": Math.hypot(numberParam(ctx.params, "gravityX"), numberParam(ctx.params, "gravityY"), numberParam(ctx.params, "gravityZ")).toFixed(1)
        })
      };
    }
  },
  {
    id: "pyramid-crush",
    title: "Pyramid Crush",
    eyebrow: "Instanced stacking benchmark",
    deck: "Stack thousands of instanced boxes into a pyramid and knock it down with a cannonball.",
    description:
      "A stacking stress test: every box is a live Box3D body rendered through a single InstancedMesh, and transforms stream out of WASM in one batched call per frame. Watch the Awake counter fall as the solver puts settled islands to sleep.",
    accent: "#ff9950",
    category: "performance",
    hint: "Click the pyramid to blast a crater into it",
    defaults: {
      baseSize: 12,
      boxFriction: 0.62,
      cannonSpeed: 38,
      cannonDensity: 14,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Pyramid",
        controls: [
          { key: "baseSize", label: "Base size", min: 6, max: 20, step: 1 },
          { key: "boxFriction", label: "Box friction", min: 0.1, max: 1.2, step: 0.02 }
        ]
      },
      {
        title: "Cannon",
        controls: [
          { key: "cannonSpeed", label: "Cannon speed", min: 12, max: 70, step: 1, rebuild: false },
          { key: "cannonDensity", label: "Ball density", min: 4, max: 30, step: 1, rebuild: false }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "fire", title: "Fire cannonball" },
      { id: "reset", title: "Rebuild pyramid" }
    ],
    camera: {
      position: [14.5, 9.5, 15.5],
      target: [0, 2.4, 0],
      fov: 44
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const base = Math.round(numberParam(ctx.params, "baseSize"));
      const half = 0.26;
      const spacingXZ = half * 2 + 0.015;
      const spacingY = half * 2 + 0.002;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.55, 0],
        halfExtents: [16, 0.5, 16],
        material: ctx.material("ground"),
        friction: 0.9,
        receiveShadow: true
      });

      // Precompute every slot in the pyramid: layer j has (base - j)^2 boxes.
      const slots: Vec3[] = [];
      for (let layer = 0; layer < base; layer += 1) {
        const n = base - layer;
        for (let ix = 0; ix < n; ix += 1) {
          for (let iz = 0; iz < n; iz += 1) {
            slots.push([
              (ix - (n - 1) / 2) * spacingXZ,
              half + layer * spacingY,
              (iz - (n - 1) / 2) * spacingXZ
            ]);
          }
        }
      }

      ctx.addInstancedBoxes({
        count: slots.length,
        halfExtents: [half, half, half],
        material: ctx.material("secondary"),
        position: (index) => slots[index],
        density: 1,
        friction: numberParam(ctx.params, "boxFriction"),
        restitution: 0.01
      });

      const cannonStart: Vec3 = [0, 1.6, base * spacingXZ * 0.5 + 10];
      const cannonball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: cannonStart,
        radius: 0.7,
        material: ctx.material("reward"),
        density: numberParam(ctx.params, "cannonDensity"),
        friction: 0.3,
        restitution: 0.15,
        bullet: true
      });

      ctx.addLandmarkLine([0, 0.08, cannonStart[2]], [0, 0.08, 0], "#ff9950");

      let shots = 0;

      return {
        actions: {
          fire: () => {
            setBodyPose(ctx.world, cannonball, cannonStart);
            ctx.world.setBodyVelocity(cannonball.body, [0, 2.5, -numberParam(ctx.params, "cannonSpeed")], [0, 0, 0]);
            shots += 1;
          },
          reset: () => undefined
        },
        onPointerDown: (point) => {
          ctx.world.explode(point, 3.2, 0.9, 110);
        },
        metrics: () => ({
          Boxes: slots.length,
          Layers: base,
          Shots: shots
        })
      };
    }
  },
  {
    id: "sphere-storm",
    title: "Sphere Storm",
    eyebrow: "Streaming throughput",
    deck: "Thousands of instanced spheres circulate forever through a drain and teleport recycler.",
    description:
      "A continuous-load benchmark: spheres rain into a walled well, drain through a hole in the floor, and are teleported back to the sky. Nothing ever sleeps, so this measures sustained solver and transform-streaming throughput.",
    accent: "#5cd6ff",
    category: "performance",
    hint: "Click inside the well to blast the stream aside",
    defaults: {
      sphereCount: 1200,
      sphereSize: 0.16,
      bounce: 0.25,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Storm",
        controls: [
          { key: "sphereCount", label: "Spheres", min: 200, max: 3000, step: 50 },
          { key: "sphereSize", label: "Sphere radius", min: 0.1, max: 0.26, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0, max: 0.7, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "burst", title: "Center burst" },
      { id: "reset", title: "Restart storm" }
    ],
    camera: {
      position: [11.5, 8.5, 11.5],
      target: [0, 1.5, 0],
      fov: 44
    },
    gravity: () => [0, -12, 0],
    setup(ctx) {
      const count = Math.round(numberParam(ctx.params, "sphereCount"));
      const radius = numberParam(ctx.params, "sphereSize");
      const bounce = numberParam(ctx.params, "bounce");
      const wellHalf = 3.6;
      const holeHalf = 1.1;

      // Floor slabs leave a square drain hole in the middle of the well.
      const slabThickness = 0.3;
      const rimHalf = (wellHalf - holeHalf) / 2;
      const slabY = -slabThickness;
      ctx.addBox({ type: BodyType.Static, position: [0, slabY, -(holeHalf + rimHalf)], halfExtents: [wellHalf, slabThickness, rimHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [0, slabY, holeHalf + rimHalf], halfExtents: [wellHalf, slabThickness, rimHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [-(holeHalf + rimHalf), slabY, 0], halfExtents: [rimHalf, slabThickness, holeHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [holeHalf + rimHalf, slabY, 0], halfExtents: [rimHalf, slabThickness, holeHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });

      // Walls keep the storm contained while it swirls toward the drain.
      const wallH = 4.4;
      ctx.addBox({ type: BodyType.Static, position: [-wellHalf - 0.18, wallH - 1, 0], halfExtents: [0.18, wallH, wellHalf + 0.36], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [wellHalf + 0.18, wallH - 1, 0], halfExtents: [0.18, wallH, wellHalf + 0.36], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, wallH - 1, -wellHalf - 0.18], halfExtents: [wellHalf, wallH, 0.18], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, wallH - 1, wellHalf + 0.18], halfExtents: [wellHalf, wallH, 0.18], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });

      // A tilted deflector under the drain sprays the falling stream outward.
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -3.4, 0],
        halfExtents: [1.3, 0.12, 1.3],
        material: ctx.material("wall"),
        rotation: [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)],
        friction: 0.1,
        restitution: 0.5
      });

      const spawn = (index: number): Vec3 => [
        ((index * 37) % 100) / 100 * (wellHalf * 1.6) - wellHalf * 0.8,
        6 + ((index * 53) % 400) / 400 * 9,
        ((index * 71) % 100) / 100 * (wellHalf * 1.6) - wellHalf * 0.8
      ];

      const storm = ctx.addInstancedSpheres({
        count,
        radius,
        material: ctx.material("accent"),
        position: spawn,
        density: 1.4,
        friction: 0.12,
        restitution: bounce,
        rollingResistance: 0.005
      });

      ctx.addLandmarkLine([-holeHalf, 0.05, -holeHalf], [holeHalf, 0.05, -holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([holeHalf, 0.05, -holeHalf], [holeHalf, 0.05, holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([holeHalf, 0.05, holeHalf], [-holeHalf, 0.05, holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([-holeHalf, 0.05, holeHalf], [-holeHalf, 0.05, -holeHalf], "#5cd6ff");

      let recycled = 0;
      let cursor = 0;
      const scratch: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

      return {
        actions: {
          burst: () => ctx.world.explode([0, 1, 0], 3.5, 0.8, 60),
          reset: () => undefined
        },
        update: () => {
          // Check a rotating slice of the storm each frame; teleport drained
          // spheres back to the sky so the stream never runs dry.
          const checks = Math.min(count, 200);
          for (let i = 0; i < checks; i += 1) {
            const index = (cursor + i) % count;
            const handle = storm.bodies[index];
            ctx.world.getBodyTransform(handle, scratch);
            if (scratch.position[1] < -7) {
              const p = spawn((index * 7919 + recycled) % 10000);
              ctx.world.setBodyTransform(handle, [p[0], 12 + (recycled % 5), p[2]]);
              ctx.world.setBodyVelocity(handle, [0, 0, 0], [0, 0, 0]);
              recycled += 1;
            }
          }
          cursor = (cursor + checks) % count;
        },
        onPointerDown: (point) => {
          ctx.world.explode(point, 2.8, 0.8, 50);
        },
        metrics: () => ({
          Spheres: count,
          Recycled: recycled
        })
      };
    }
  },
  {
    id: "sample-box-stack",
    title: "Box Stack",
    eyebrow: "Box3D sample · Stacking",
    deck: "The upstream Box Stack sample: forty cubes dropped into a single tall column.",
    description:
      "A direct port of the official Stacking / Box Stack sample: unit cubes with rolling resistance 0.1 spawn in a spaced column and settle into a stable stack, exactly as in the native samples app.",
    accent: "#f2b544",
    category: "samples",
    hint: "Click the stack to blast it apart",
    defaults: {
      count: 40,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Stack",
        controls: [{ key: "count", label: "Cubes", min: 5, max: 40, step: 1 }]
      },
      baseDebugControls
    ],
    actions: [{ id: "reset", title: "Rebuild stack" }],
    camera: {
      position: [24, 22, 34],
      target: [0, 12, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      // Upstream: AddGroundBox(40), cubes a=0.5 at y = 1.5a + 2.5a*i.
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [20, 0.5, 20],
        material: ctx.material("ground"),
        friction: 0.6,
        receiveShadow: true
      });

      const count = Math.round(numberParam(ctx.params, "count"));
      const a = 0.5;
      const cubes: SimBody[] = [];
      for (let i = 0; i < count; i += 1) {
        cubes.push(
          ctx.addBox({
            type: BodyType.Dynamic,
            position: [0, 1.5 * a + 2.5 * a * i, 0],
            halfExtents: [a, a, a],
            material: i % 3 === 0 ? ctx.material("accent") : i % 3 === 1 ? ctx.material("primary") : ctx.material("secondary"),
            density: 1,
            rollingResistance: 0.1
          })
        );
      }

      ctx.addLandmarkLine([0, 0, 0], [0, 1.5 * a + 2.5 * a * count, 0], "#f2b544");

      let standing = count;
      return {
        actions: {
          reset: () => undefined
        },
        update: () => {
          standing = 0;
          for (const cube of cubes) {
            const p = cube.transform.position;
            if (Math.abs(p[0]) < 1.2 && Math.abs(p[2]) < 1.2) {
              standing += 1;
            }
          }
        },
        metrics: () => ({
          Cubes: count,
          "In column": standing
        })
      };
    }
  },
  {
    id: "sample-jenga",
    title: "Jenga Stack",
    eyebrow: "Box3D sample · Stacking",
    deck: "The upstream Jenga Stack: alternating long boxes, two per level, ready to topple.",
    description:
      "A direct port of the official Stacking / Jenga Stack sample: 2.5 x 0.25 x 0.25 boxes laid in alternating orientations, two per level. Pull pieces out with clicks and see how long the tower survives.",
    accent: "#d8705f",
    category: "samples",
    hint: "Click a piece to knock it out of the tower",
    defaults: {
      levels: 20,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Tower",
        controls: [{ key: "levels", label: "Levels", min: 6, max: 32, step: 1 }]
      },
      baseDebugControls
    ],
    actions: [{ id: "reset", title: "Rebuild tower" }],
    camera: {
      position: [14, 12, 14],
      target: [0, 5, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [16, 0.5, 16],
        material: ctx.material("ground"),
        friction: 0.7,
        receiveShadow: true
      });

      const levels = Math.round(numberParam(ctx.params, "levels"));
      const half: Vec3 = [2.5, 0.25, 0.25];
      const pieces: SimBody[] = [];
      const halfPi = Math.PI / 2;

      for (let i = 0; i < levels; i += 1) {
        // Upstream: even levels sit at ±x rotated 90°, odd levels at ±z unrotated.
        const rotated = (i & 1) === 0;
        const alpha = rotated ? halfPi : 0;
        const rotation: Quat = [0, Math.sin(alpha / 2), 0, Math.cos(alpha / 2)];
        const x = rotated ? 1.75 : 0;
        const z = rotated ? 0 : 1.75;
        const y = 0.5 * i + 0.25;
        const material = i % 2 === 0 ? ctx.material("secondary") : ctx.material("primary");

        pieces.push(
          ctx.addBox({
            type: BodyType.Dynamic,
            position: [x, y, z],
            halfExtents: half,
            material,
            rotation,
            density: 1,
            rollingResistance: 0.01
          }),
          ctx.addBox({
            type: BodyType.Dynamic,
            position: [-x, y, -z],
            halfExtents: half,
            material,
            rotation,
            density: 1,
            rollingResistance: 0.01
          })
        );
      }

      let standing = pieces.length;
      return {
        actions: {
          reset: () => undefined
        },
        update: () => {
          standing = 0;
          for (const piece of pieces) {
            const p = piece.transform.position;
            const d = Math.hypot(p[0] - piece.origin[0], p[1] - piece.origin[1], p[2] - piece.origin[2]);
            if (d < 0.4) {
              standing += 1;
            }
          }
        },
        metrics: () => ({
          Pieces: pieces.length,
          Standing: standing
        })
      };
    }
  },
  {
    id: "sample-dominoes",
    title: "Dominoes",
    eyebrow: "Box3D sample · Stacking",
    deck: "The upstream Dominoes sample: concentric spiral rings of dominoes falling in chains.",
    description:
      "A direct port of the official Stacking / Dominoes sample: rings of thin boxes placed every two degrees with a slight inward spiral, toppled by a single impulse per ring. Instanced rendering keeps hundreds of dominoes at one draw call.",
    accent: "#8fbf49",
    category: "samples",
    hint: "Hit Topple, or click a domino to start a chain anywhere",
    defaults: {
      rings: 3,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Rings",
        controls: [{ key: "rings", label: "Ring count", min: 1, max: 8, step: 1 }]
      },
      baseDebugControls
    ],
    actions: [
      { id: "topple", title: "Topple" },
      { id: "reset", title: "Reset dominoes" }
    ],
    camera: {
      position: [0, 22, 30],
      target: [0, 0, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const rings = Math.round(numberParam(ctx.params, "rings"));
      const maxRadius = 7 + 1.1 * rings;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [maxRadius + 4, 0.5, maxRadius + 4],
        material: ctx.material("ground"),
        friction: 0.6,
        receiveShadow: true
      });

      // Upstream: per ring, a domino every 2 degrees with a slight inward
      // spiral so each loop hands the chain to the next ring.
      const positions: Vec3[] = [];
      const rotations: Quat[] = [];
      const firstOfRing: number[] = [];
      const degToRad = Math.PI / 180;
      for (let ring = 0; ring < rings; ring += 1) {
        const radius = 7 + 1.1 * ring;
        firstOfRing.push(positions.length);
        for (let alpha = 0; alpha <= 360; alpha += 2) {
          const angle = alpha * degToRad;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const inward = alpha / 630;
          positions.push([radius * cos - inward * cos, 0.8, radius * sin - inward * sin]);
          const half = -angle / 2;
          rotations.push([0, Math.sin(half), 0, Math.cos(half)]);
        }
      }

      const dominoes = ctx.addInstancedBoxes({
        count: positions.length,
        halfExtents: [0.2, 0.8, 0.05],
        material: ctx.material("accent"),
        position: (index) => positions[index],
        rotation: (index) => rotations[index],
        density: 1,
        friction: 0.55
      });

      let topples = 0;
      const topple = () => {
        for (const start of firstOfRing) {
          const handle = dominoes.bodies[start];
          const p = positions[start];
          // Upstream impulse: (0, 0, 25) applied at the top of the first domino.
          ctx.world.applyImpulseAtPoint(handle, [0, 0, 25], [p[0], p[1] + 0.8, p[2]]);
        }
        topples += 1;
      };

      ctx.addLandmarkLine([7, 0.05, 0], [maxRadius, 0.05, 0], "#8fbf49");

      return {
        actions: {
          topple,
          reset: () => undefined
        },
        metrics: () => ({
          Dominoes: positions.length,
          Rings: rings,
          Topples: topples
        })
      };
    }
  },
  {
    id: "sample-restitution",
    title: "Restitution Array",
    eyebrow: "Box3D sample · Shapes",
    deck: "The upstream Restitution sample: a row of spheres with bounce factors from 0 to 1.",
    description:
      "A direct port of the official Shapes / Restitution sample: identical spheres drop from the same height with restitution stepping evenly from 0 to 1 across the row, making the coefficient's meaning obvious at a glance.",
    accent: "#30b8e8",
    category: "samples",
    defaults: {
      count: 10,
      dropHeight: 20,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Array",
        controls: [
          { key: "count", label: "Spheres", min: 3, max: 20, step: 1 },
          { key: "dropHeight", label: "Drop height", min: 5, max: 40, step: 1 }
        ]
      },
      baseDebugControls
    ],
    actions: [{ id: "reset", title: "Drop again" }],
    camera: {
      position: [0, 12, 30],
      target: [0, 7, 0],
      fov: 44
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const count = Math.round(numberParam(ctx.params, "count"));
      const dropHeight = numberParam(ctx.params, "dropHeight");

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [count + 4, 0.5, 8],
        material: ctx.material("ground"),
        friction: 0.6,
        receiveShadow: true
      });

      // Upstream: restitution += 1/(count-1) per sphere, x spacing 2.
      const spheres: SimBody[] = [];
      const dr = 1 / (count > 1 ? count - 1 : 1);
      let x = -(count - 1);
      let restitution = 0;
      for (let i = 0; i < count; i += 1) {
        spheres.push(
          ctx.addSphere({
            type: BodyType.Dynamic,
            position: [x, dropHeight, 0],
            radius: 0.5,
            material: i === count - 1 ? ctx.material("reward") : ctx.material("accent"),
            density: 1,
            restitution
          })
        );
        restitution += dr;
        x += 2;
      }

      ctx.addLandmarkLine([-(count - 1) - 1, 0.05, 0], [count - 1 + 1, 0.05, 0], "#30b8e8");
      ctx.addLandmarkLine([-(count - 1), dropHeight, 0], [count - 1, dropHeight, 0], "#f4cf4d");

      let maxHeights = new Array(count).fill(0);
      return {
        actions: {
          reset: () => undefined
        },
        update: () => {
          for (let i = 0; i < spheres.length; i += 1) {
            const speed = ctx.world.getBodySpeed(spheres[i].body);
            const y = spheres[i].transform.position[1];
            if (speed < 0.5 && y > maxHeights[i]) {
              maxHeights[i] = y;
            }
          }
        },
        metrics: () => ({
          Spheres: count,
          "Restitution range": "0 → 1"
        })
      };
    }
  },
  {
    id: "sample-bounce-house",
    title: "Bounce House",
    eyebrow: "Box3D sample · Continuous",
    deck: "The upstream Bounce House: a zero-gravity ball ricocheting at high speed forever.",
    description:
      "A direct port of the official Continuous / Bounce House sample: a frictionless, perfectly elastic sphere with zero gravity scale ricochets around a sealed room at up to 120 m/s — a torture test for continuous collision detection.",
    accent: "#e96368",
    category: "samples",
    hint: "Click walls to shove the ball with a shockwave",
    defaults: {
      speed: 60,
      gravityScale: 0,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Ball",
        controls: [
          { key: "speed", label: "Launch speed", min: 20, max: 120, step: 5 },
          { key: "gravityScale", label: "Gravity scale", min: 0, max: 1, step: 0.05 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "launch", title: "Relaunch ball" },
      { id: "reset", title: "Reset room" }
    ],
    camera: {
      position: [17, 14, 17],
      target: [0, 4, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      // Upstream: 20x20 room, walls 10 high and 0.1 thick.
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -1, 0],
        halfExtents: [10, 1, 10],
        material: ctx.material("ground"),
        friction: 0,
        restitution: 1,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [10, 5, 0], halfExtents: [0.1, 5, 10], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [-10, 5, 0], halfExtents: [0.1, 5, 10], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, 5, -10], halfExtents: [10, 5, 0.1], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, 5, 10], halfExtents: [10, 5, 0.1], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });

      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-8, 4, 0],
        radius: 0.5,
        material: ctx.material("danger"),
        density: 1,
        friction: 0,
        restitution: 1,
        rollingResistance: 0,
        bullet: true
      });
      ctx.world.setBodyGravityScale(ball.body, numberParam(ctx.params, "gravityScale"));

      const launch = () => {
        const speed = numberParam(ctx.params, "speed");
        ctx.world.setBodyGravityScale(ball.body, numberParam(ctx.params, "gravityScale"));
        ctx.world.setBodyVelocity(ball.body, [speed, 0, speed], [0, 0, 0]);
      };
      launch();

      return {
        actions: {
          launch,
          reset: () => undefined
        },
        metrics: () => ({
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  },
  {
    id: "sample-distance-chain",
    title: "Distance Joint",
    eyebrow: "Box3D sample · Joints",
    deck: "The upstream Distance Joint sample: a hanging chain of dense spheres on tunable springs.",
    description:
      "A direct port of the official Joints / Distance Joint sample: dense spheres linked by unit-length distance joints hang from a fixed anchor. Turn the spring stiffness down to zero for a rigid rope, or up for a slinky.",
    accent: "#c98bf2",
    category: "samples",
    hint: "Click the chain to swing it",
    defaults: {
      count: 12,
      hertz: 5,
      dampingRatio: 0.5,
      springs: true,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Chain",
        controls: [
          { key: "count", label: "Links", min: 1, max: 30, step: 1 },
          { key: "springs", label: "Springs" },
          { key: "hertz", label: "Spring hertz", min: 0.5, max: 15, step: 0.5 },
          { key: "dampingRatio", label: "Damping", min: 0, max: 2, step: 0.05 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "swing", title: "Swing chain" },
      { id: "reset", title: "Reset chain" }
    ],
    camera: {
      position: [3, 16, 22],
      target: [4, 14, 0],
      fov: 44
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const count = Math.round(numberParam(ctx.params, "count"));
      const useSprings = boolParam(ctx.params, "springs");
      const hertz = numberParam(ctx.params, "hertz");
      const dampingRatio = numberParam(ctx.params, "dampingRatio");
      const length = 1;
      const yOffset = 20;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [12, 0.5, 8],
        material: ctx.material("ground"),
        friction: 0.6,
        receiveShadow: true
      });

      const anchor = ctx.addBox({
        type: BodyType.Static,
        position: [0, yOffset, 0],
        halfExtents: [0.3, 0.3, 0.3],
        material: ctx.material("wall")
      });

      // Upstream: sphere r=0.25 density 20, bodies at x = length * (i+1).
      const links: SimBody[] = [];
      let previous = anchor;
      for (let i = 0; i < count; i += 1) {
        const link = ctx.addSphere({
          type: BodyType.Dynamic,
          position: [length * (i + 1), yOffset, 0],
          radius: 0.25,
          material: i === count - 1 ? ctx.material("reward") : ctx.material("primary"),
          density: 20
        });
        ctx.world.createDistanceJoint(
          previous.body,
          link.body,
          [length * i, yOffset, 0],
          [length * (i + 1), yOffset, 0],
          {
            length,
            hertz: useSprings ? hertz : 0,
            dampingRatio
          }
        );
        links.push(link);
        previous = link;
      }

      ctx.addLandmarkSphere([0, yOffset, 0], 0.15, "#f4cf4d");

      return {
        actions: {
          swing: () => {
            const tip = links[links.length - 1];
            if (tip) {
              ctx.world.applyImpulse(tip.body, [0, 0, 60]);
            }
          },
          reset: () => undefined
        },
        metrics: () => ({
          Links: count,
          Springs: useSprings ? `${hertz.toFixed(1)} Hz` : "rigid",
          "Tip speed": formatSpeed(links.length ? ctx.world.getBodySpeed(links[links.length - 1].body) : 0)
        })
      };
    }
  },
  {
    id: "sample-ragdolls",
    title: "Ragdoll Pile",
    eyebrow: "Box3D sample · Ragdoll",
    deck: "The upstream ragdoll: 14 capsule bones with cone and twist limits, dropped in a pile.",
    description:
      "The official Box3D samples human runs unmodified inside the WASM module — the vendored shared/human.c builds each ragdoll from 14 capsule bones, spherical joints with cone and twist limits, joint friction, and self-collision filtering.",
    accent: "#f2e14c",
    category: "samples",
    hint: "Click a ragdoll to shove it around",
    defaults: {
      count: 3,
      frictionTorque: 5,
      hertz: 1,
      dampingRatio: 0.7,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Ragdolls",
        controls: [
          { key: "count", label: "Count", min: 1, max: 8, step: 1 },
          { key: "frictionTorque", label: "Joint friction", min: 0, max: 20, step: 1 },
          { key: "hertz", label: "Joint hertz", min: 0, max: 20, step: 0.5 },
          { key: "dampingRatio", label: "Damping", min: 0, max: 4, step: 0.1 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "toss", title: "Toss ragdolls" },
      { id: "reset", title: "Respawn pile" }
    ],
    camera: {
      position: [4.2, 2.8, 5.4],
      target: [0, 0.6, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [8, 0.5, 8],
        material: ctx.material("ground"),
        friction: 0.7,
        receiveShadow: true
      });

      const count = Math.round(numberParam(ctx.params, "count"));
      const options = {
        frictionTorque: numberParam(ctx.params, "frictionTorque"),
        hertz: numberParam(ctx.params, "hertz"),
        dampingRatio: numberParam(ctx.params, "dampingRatio")
      };

      const humans: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const angle = i * 2.39996;
        const spread = count > 1 ? 0.9 : 0;
        const { human } = ctx.addHuman(
          [Math.cos(angle) * spread, 1.2 + i * 1.6, Math.sin(angle) * spread],
          options
        );
        humans.push(human);
      }

      return {
        actions: {
          toss: () => {
            for (const human of humans) {
              ctx.world.humanSetVelocity(human, [0, 6, 0]);
              ctx.world.humanApplyRandomImpulse(human, 10);
            }
          },
          reset: () => undefined
        },
        metrics: () => ({
          Ragdolls: count,
          Bones: count * 14
        })
      };
    }
  }
];

export const scenarioCategories: { id: ScenarioCategory; title: string; blurb: string }[] = [
  {
    id: "fun",
    title: "Fun & interactive",
    blurb: "Playable scenes built around one physics behavior each — joints, restitution, explosions, and gravity."
  },
  {
    id: "samples",
    title: "Official Box3D samples",
    blurb: "Direct ports of scenes from the upstream Box3D samples app — same bodies, joints, and parameters, including the original 14-bone ragdoll running unmodified in WASM."
  },
  {
    id: "performance",
    title: "Performance & stress",
    blurb: "Benchmarks that push body counts with instanced rendering and batched WASM transform streaming."
  }
];

export const allScenarios = [heroScenario, ...exampleScenarios];
