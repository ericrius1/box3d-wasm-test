import type { HumanOptions, PhysicsWorld, Quat, Transform, Vec3 } from "box3d-wasm";
import type * as THREE from "three/webgpu";
import { BodyType } from "box3d-wasm";

export type { Quat, Transform, Vec3 } from "box3d-wasm";

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

export type ScenarioCategory = "games" | "fun" | "samples" | "performance";

export type ScenarioVisuals = {
  /** Threshold bloom over the final frame; bright/emissive surfaces glow. */
  bloom?: { strength?: number; radius?: number; threshold?: number };
  lighting?: "studio" | "night";
  background?: string;
  fog?: { color?: string; near?: number; far?: number } | false;
  /** Set false to hide the default floor grid. */
  grid?: boolean;
};

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
  camera: THREE.Camera;
  /** Renderer canvas — pointer lock, scenario-owned input, and overlay mounting. */
  domElement: HTMLElement;
  landmarkGroup: THREE.Group;
  params: ScenarioParams;
  material(role: MaterialRole): THREE.Material;
  colorMaterial(
    color: string,
    options?: { metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }
  ): THREE.Material;
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
  visuals?: ScenarioVisuals;
  /**
   * The scenario drives the camera itself (e.g. pointer-lock FPS). The stage
   * skips OrbitControls and its click-to-explode pointer handling.
   */
  firstPerson?: boolean;
  hint?: string;
  defaults: ScenarioParams;
  controls: ControlFolder[];
  actions: ScenarioAction[];
  camera: ScenarioCamera;
  gravity(params: ScenarioParams): Vec3;
  setup(ctx: ScenarioContext): ScenarioInstance;
};

