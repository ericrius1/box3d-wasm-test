export const BodyType = {
  Static: 0,
  Kinematic: 1,
  Dynamic: 2
} as const;

export type BodyTypeValue = (typeof BodyType)[keyof typeof BodyType];
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export type Transform = {
  position: [number, number, number];
  rotation: [number, number, number, number];
};

export type BodyVelocity = {
  linear: [number, number, number];
  angular: [number, number, number];
};

export type Box3DEmscriptenModule = {
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
  _malloc(byteLength: number): number;
  _free(ptr: number): void;
  _b3w_create_world(gx: number, gy: number, gz: number): number;
  _b3w_destroy_world(worldHandle: number): void;
  _b3w_step_world(worldHandle: number, timeStep: number, subStepCount: number): void;
  _b3w_create_box(
    worldHandle: number,
    bodyType: number,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    density: number,
    friction: number,
    restitution: number,
    rollingResistance: number,
    isBullet: number
  ): number;
  _b3w_create_sphere(
    worldHandle: number,
    bodyType: number,
    x: number,
    y: number,
    z: number,
    radius: number,
    density: number,
    friction: number,
    restitution: number,
    rollingResistance: number,
    isBullet: number
  ): number;
  _b3w_create_capsule(
    worldHandle: number,
    bodyType: number,
    x: number,
    y: number,
    z: number,
    halfHeight: number,
    radius: number,
    density: number,
    friction: number,
    restitution: number,
    rollingResistance: number,
    isBullet: number
  ): number;
  _b3w_destroy_body(bodyHandle: number): void;
  _b3w_set_body_transform(
    bodyHandle: number,
    x: number,
    y: number,
    z: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number
  ): void;
  _b3w_set_body_velocity(
    bodyHandle: number,
    vx: number,
    vy: number,
    vz: number,
    wx: number,
    wy: number,
    wz: number
  ): void;
  _b3w_apply_impulse(bodyHandle: number, ix: number, iy: number, iz: number): void;
  _b3w_apply_angular_impulse(bodyHandle: number, ix: number, iy: number, iz: number): void;
  _b3w_apply_impulse_at_point(
    bodyHandle: number,
    ix: number,
    iy: number,
    iz: number,
    px: number,
    py: number,
    pz: number
  ): void;
  _b3w_apply_force(bodyHandle: number, fx: number, fy: number, fz: number): void;
  _b3w_explode(
    worldHandle: number,
    x: number,
    y: number,
    z: number,
    radius: number,
    falloff: number,
    impulsePerArea: number
  ): void;
  _b3w_get_body_transform(bodyHandle: number, outPtr: number): void;
  _b3w_get_body_transforms(handlesPtr: number, count: number, outPtr: number): void;
  _b3w_get_body_transform_component(bodyHandle: number, component: number): number;
  _b3w_get_body_velocity(bodyHandle: number, outPtr: number): void;
  _b3w_get_body_speed(bodyHandle: number): number;
  _b3w_get_body_mass(bodyHandle: number): number;
  _b3w_set_body_awake(bodyHandle: number, awake: number): void;
  _b3w_body_is_awake(bodyHandle: number): number;
  _b3w_create_spherical_joint(
    worldHandle: number,
    bodyHandleA: number,
    bodyHandleB: number,
    ax: number,
    ay: number,
    az: number,
    hertz: number,
    dampingRatio: number
  ): number;
  _b3w_create_distance_joint(
    worldHandle: number,
    bodyHandleA: number,
    bodyHandleB: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    length: number,
    hertz: number,
    dampingRatio: number
  ): number;
  _b3w_destroy_joint(jointHandle: number): void;
  _b3w_set_body_gravity_scale(bodyHandle: number, scale: number): void;
  _b3w_get_body_capsule(bodyHandle: number, outPtr: number): number;
  _b3w_spawn_human(
    worldHandle: number,
    x: number,
    y: number,
    z: number,
    frictionTorque: number,
    hertz: number,
    dampingRatio: number,
    outBodyHandlesPtr: number
  ): number;
  _b3w_human_bone_count(): number;
  _b3w_human_set_velocity(humanHandle: number, vx: number, vy: number, vz: number): void;
  _b3w_human_apply_random_impulse(humanHandle: number, magnitude: number): void;
  _b3w_get_world_count(): number;
};

export type BoxOptions = {
  type: BodyTypeValue;
  position: Vec3;
  halfExtents: Vec3;
  density?: number;
  friction?: number;
  restitution?: number;
  rollingResistance?: number;
  bullet?: boolean;
};

export type SphereOptions = {
  type: BodyTypeValue;
  position: Vec3;
  radius: number;
  density?: number;
  friction?: number;
  restitution?: number;
  rollingResistance?: number;
  bullet?: boolean;
};

export type CapsuleOptions = {
  type: BodyTypeValue;
  position: Vec3;
  /** Half the distance between the two hemisphere centers (along local Y). */
  halfHeight: number;
  radius: number;
  density?: number;
  friction?: number;
  restitution?: number;
  rollingResistance?: number;
  bullet?: boolean;
};

export type JointSpringOptions = {
  /** Spring stiffness in Hz. Omit or pass 0 for a rigid joint. */
  hertz?: number;
  dampingRatio?: number;
};

export type DistanceJointOptions = JointSpringOptions & {
  /** Rest length. Omit or pass 0 to use the current anchor separation. */
  length?: number;
};

export type CapsuleShape = {
  /** Local center of the first hemisphere. */
  center1: [number, number, number];
  /** Local center of the second hemisphere. */
  center2: [number, number, number];
  radius: number;
};

export type HumanRagdoll = {
  /** Handle for human-level operations (velocity, random impulse). */
  human: number;
  /** One body handle per bone, in upstream bone order (pelvis first). */
  bones: number[];
};

export type HumanOptions = {
  /** Joint motor friction torque. Upstream default 5. */
  frictionTorque?: number;
  /** Joint spring stiffness in Hz. Upstream default 1. */
  hertz?: number;
  /** Joint spring damping ratio. Upstream default 0.7. */
  dampingRatio?: number;
};

/** Floats per body in a TransformBatch read: px py pz qx qy qz qw awake. */
export const TRANSFORM_STRIDE = 8;

/**
 * Reads transforms for a fixed set of bodies in one WASM call per frame.
 * Dramatically cheaper than per-body getters once body counts grow.
 */
export class TransformBatch {
  readonly count: number;

  #module: Box3DEmscriptenModule;
  #handlesPtr: number;
  #outPtr: number;
  #disposed = false;

  constructor(module: Box3DEmscriptenModule, handles: ArrayLike<number>) {
    this.#module = module;
    this.count = handles.length;
    this.#handlesPtr = module._malloc(Math.max(4, this.count * 4));
    this.#outPtr = module._malloc(Math.max(4, this.count * TRANSFORM_STRIDE * 4));
    module.HEAP32.set(Array.from(handles), this.#handlesPtr >> 2);
  }

  /**
   * Fills the batch buffer and returns a view over it.
   * The view is only valid until the next WASM allocation; copy if you need to keep it.
   */
  read(): Float32Array {
    if (this.#disposed) {
      throw new Error("TransformBatch has been disposed");
    }

    this.#module._b3w_get_body_transforms(this.#handlesPtr, this.count, this.#outPtr);
    const base = this.#outPtr >> 2;
    return this.#module.HEAPF32.subarray(base, base + this.count * TRANSFORM_STRIDE);
  }

  dispose() {
    if (this.#disposed) {
      return;
    }

    this.#module._free(this.#handlesPtr);
    this.#module._free(this.#outPtr);
    this.#disposed = true;
  }
}

export class Box3D {
  readonly module: Box3DEmscriptenModule;

  constructor(module: Box3DEmscriptenModule) {
    this.module = module;
  }

  createWorld(gravity: Vec3 = [0, -10, 0]) {
    const handle = this.module._b3w_create_world(gravity[0], gravity[1], gravity[2]);
    if (handle === 0) {
      throw new Error("Box3D failed to create a world");
    }

    return new PhysicsWorld(this.module, handle);
  }

  getWorldCount() {
    return this.module._b3w_get_world_count();
  }
}

export class PhysicsWorld {
  readonly handle: number;
  readonly fixedTimeStep = 1 / 60;
  readonly substeps = 4;

  #module: Box3DEmscriptenModule;
  #disposed = false;
  #scratchPtr = 0;

  constructor(module: Box3DEmscriptenModule, handle: number) {
    this.#module = module;
    this.handle = handle;
  }

  createBox(options: BoxOptions) {
    this.#assertLive();
    const density = options.density ?? (options.type === BodyType.Dynamic ? 1 : 0);
    const friction = options.friction ?? 0.55;
    const restitution = options.restitution ?? 0.05;
    const p = options.position;
    const h = options.halfExtents;
    const handle = this.#module._b3w_create_box(
      this.handle,
      options.type,
      p[0],
      p[1],
      p[2],
      h[0],
      h[1],
      h[2],
      density,
      friction,
      restitution,
      options.rollingResistance ?? 0,
      options.bullet ? 1 : 0
    );

    if (handle === 0) {
      throw new Error("Box3D failed to create a box body");
    }

    return handle;
  }

  createSphere(options: SphereOptions) {
    this.#assertLive();
    const density = options.density ?? (options.type === BodyType.Dynamic ? 1 : 0);
    const friction = options.friction ?? 0.35;
    const restitution = options.restitution ?? 0.25;
    const rollingResistance = options.rollingResistance ?? 0.02;
    const p = options.position;
    const handle = this.#module._b3w_create_sphere(
      this.handle,
      options.type,
      p[0],
      p[1],
      p[2],
      options.radius,
      density,
      friction,
      restitution,
      rollingResistance,
      options.bullet ? 1 : 0
    );

    if (handle === 0) {
      throw new Error("Box3D failed to create a sphere body");
    }

    return handle;
  }

  createCapsule(options: CapsuleOptions) {
    this.#assertLive();
    const density = options.density ?? (options.type === BodyType.Dynamic ? 1 : 0);
    const friction = options.friction ?? 0.45;
    const restitution = options.restitution ?? 0.1;
    const rollingResistance = options.rollingResistance ?? 0.02;
    const p = options.position;
    const handle = this.#module._b3w_create_capsule(
      this.handle,
      options.type,
      p[0],
      p[1],
      p[2],
      options.halfHeight,
      options.radius,
      density,
      friction,
      restitution,
      rollingResistance,
      options.bullet ? 1 : 0
    );

    if (handle === 0) {
      throw new Error("Box3D failed to create a capsule body");
    }

    return handle;
  }

  step(timeStep = this.fixedTimeStep, substeps = this.substeps) {
    this.#assertLive();
    this.#module._b3w_step_world(this.handle, timeStep, substeps);
  }

  destroyBody(bodyHandle: number) {
    this.#module._b3w_destroy_body(bodyHandle);
  }

  setBodyTransform(bodyHandle: number, position: Vec3, rotation: Quat = [0, 0, 0, 1]) {
    this.#module._b3w_set_body_transform(
      bodyHandle,
      position[0],
      position[1],
      position[2],
      rotation[0],
      rotation[1],
      rotation[2],
      rotation[3]
    );
  }

  setBodyVelocity(bodyHandle: number, linear: Vec3, angular: Vec3 = [0, 0, 0]) {
    this.#module._b3w_set_body_velocity(
      bodyHandle,
      linear[0],
      linear[1],
      linear[2],
      angular[0],
      angular[1],
      angular[2]
    );
  }

  applyImpulse(bodyHandle: number, impulse: Vec3) {
    this.#module._b3w_apply_impulse(bodyHandle, impulse[0], impulse[1], impulse[2]);
  }

  applyImpulseAtPoint(bodyHandle: number, impulse: Vec3, worldPoint: Vec3) {
    this.#module._b3w_apply_impulse_at_point(
      bodyHandle,
      impulse[0],
      impulse[1],
      impulse[2],
      worldPoint[0],
      worldPoint[1],
      worldPoint[2]
    );
  }

  applyAngularImpulse(bodyHandle: number, impulse: Vec3) {
    this.#module._b3w_apply_angular_impulse(bodyHandle, impulse[0], impulse[1], impulse[2]);
  }

  applyForce(bodyHandle: number, force: Vec3) {
    this.#module._b3w_apply_force(bodyHandle, force[0], force[1], force[2]);
  }

  explode(position: Vec3, radius: number, falloff: number, impulsePerArea: number) {
    this.#module._b3w_explode(this.handle, position[0], position[1], position[2], radius, falloff, impulsePerArea);
  }

  getBodySpeed(bodyHandle: number) {
    return this.#module._b3w_get_body_speed(bodyHandle);
  }

  getBodyMass(bodyHandle: number) {
    return this.#module._b3w_get_body_mass(bodyHandle);
  }

  setBodyAwake(bodyHandle: number, awake: boolean) {
    this.#module._b3w_set_body_awake(bodyHandle, awake ? 1 : 0);
  }

  /** 0 disables gravity for the body, 1 is normal. */
  setBodyGravityScale(bodyHandle: number, scale: number) {
    this.#module._b3w_set_body_gravity_scale(bodyHandle, scale);
  }

  /** Local capsule shape of the body, or undefined when it has none. */
  getBodyCapsule(bodyHandle: number): CapsuleShape | undefined {
    const ptr = this.#scratch();
    if (this.#module._b3w_get_body_capsule(bodyHandle, ptr) === 0) {
      return undefined;
    }

    const base = ptr >> 2;
    const heap = this.#module.HEAPF32;
    return {
      center1: [heap[base], heap[base + 1], heap[base + 2]],
      center2: [heap[base + 3], heap[base + 4], heap[base + 5]],
      radius: heap[base + 6]
    };
  }

  /** Spawns the official Box3D samples ragdoll (14 capsule bones + joints). */
  spawnHuman(position: Vec3, options: HumanOptions = {}): HumanRagdoll {
    this.#assertLive();
    const boneCount = this.#module._b3w_human_bone_count();
    const bonesPtr = this.#module._malloc(boneCount * 4);
    try {
      const human = this.#module._b3w_spawn_human(
        this.handle,
        position[0],
        position[1],
        position[2],
        options.frictionTorque ?? 5,
        options.hertz ?? 1,
        options.dampingRatio ?? 0.7,
        bonesPtr
      );

      if (human === 0) {
        throw new Error("Box3D failed to spawn a human ragdoll");
      }

      const base = bonesPtr >> 2;
      const bones = Array.from(this.#module.HEAP32.subarray(base, base + boneCount));
      return { human, bones };
    } finally {
      this.#module._free(bonesPtr);
    }
  }

  humanSetVelocity(humanHandle: number, velocity: Vec3) {
    this.#module._b3w_human_set_velocity(humanHandle, velocity[0], velocity[1], velocity[2]);
  }

  humanApplyRandomImpulse(humanHandle: number, magnitude: number) {
    this.#module._b3w_human_apply_random_impulse(humanHandle, magnitude);
  }

  isBodyAwake(bodyHandle: number) {
    return this.#module._b3w_body_is_awake(bodyHandle) !== 0;
  }

  getBodyTransform(bodyHandle: number, target?: Transform): Transform {
    const result =
      target ??
      ({
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1]
      } satisfies Transform);

    const ptr = this.#scratch();
    this.#module._b3w_get_body_transform(bodyHandle, ptr);
    const base = ptr >> 2;
    const heap = this.#module.HEAPF32;
    result.position[0] = heap[base];
    result.position[1] = heap[base + 1];
    result.position[2] = heap[base + 2];
    result.rotation[0] = heap[base + 3];
    result.rotation[1] = heap[base + 4];
    result.rotation[2] = heap[base + 5];
    result.rotation[3] = heap[base + 6];
    return result;
  }

  getBodyVelocity(bodyHandle: number, target?: BodyVelocity): BodyVelocity {
    const result =
      target ??
      ({
        linear: [0, 0, 0],
        angular: [0, 0, 0]
      } satisfies BodyVelocity);

    const ptr = this.#scratch();
    this.#module._b3w_get_body_velocity(bodyHandle, ptr);
    const base = ptr >> 2;
    const heap = this.#module.HEAPF32;
    result.linear[0] = heap[base];
    result.linear[1] = heap[base + 1];
    result.linear[2] = heap[base + 2];
    result.angular[0] = heap[base + 3];
    result.angular[1] = heap[base + 4];
    result.angular[2] = heap[base + 5];
    return result;
  }

  /** Batched transform reader for a fixed set of bodies. Dispose when done. */
  createTransformBatch(handles: ArrayLike<number>) {
    this.#assertLive();
    return new TransformBatch(this.#module, handles);
  }

  createSphericalJoint(bodyHandleA: number, bodyHandleB: number, worldAnchor: Vec3, options: JointSpringOptions = {}) {
    this.#assertLive();
    const handle = this.#module._b3w_create_spherical_joint(
      this.handle,
      bodyHandleA,
      bodyHandleB,
      worldAnchor[0],
      worldAnchor[1],
      worldAnchor[2],
      options.hertz ?? 0,
      options.dampingRatio ?? 0
    );

    if (handle === 0) {
      throw new Error("Box3D failed to create a spherical joint");
    }

    return handle;
  }

  createDistanceJoint(
    bodyHandleA: number,
    bodyHandleB: number,
    worldAnchorA: Vec3,
    worldAnchorB: Vec3,
    options: DistanceJointOptions = {}
  ) {
    this.#assertLive();
    const handle = this.#module._b3w_create_distance_joint(
      this.handle,
      bodyHandleA,
      bodyHandleB,
      worldAnchorA[0],
      worldAnchorA[1],
      worldAnchorA[2],
      worldAnchorB[0],
      worldAnchorB[1],
      worldAnchorB[2],
      options.length ?? 0,
      options.hertz ?? 0,
      options.dampingRatio ?? 0
    );

    if (handle === 0) {
      throw new Error("Box3D failed to create a distance joint");
    }

    return handle;
  }

  destroyJoint(jointHandle: number) {
    this.#module._b3w_destroy_joint(jointHandle);
  }

  dispose() {
    if (this.#disposed) {
      return;
    }

    if (this.#scratchPtr !== 0) {
      this.#module._free(this.#scratchPtr);
      this.#scratchPtr = 0;
    }

    this.#module._b3w_destroy_world(this.handle);
    this.#disposed = true;
  }

  #scratch() {
    if (this.#scratchPtr === 0) {
      this.#scratchPtr = this.#module._malloc(TRANSFORM_STRIDE * 4);
    }

    return this.#scratchPtr;
  }

  #assertLive() {
    if (this.#disposed) {
      throw new Error("PhysicsWorld has been disposed");
    }
  }
}

let modulePromise: Promise<Box3D> | undefined;

export function createBox3D() {
  modulePromise ??= import("../dist/box3d.mjs").then(({ default: createBox3DModule }) =>
    createBox3DModule().then((module) => new Box3D(module as Box3DEmscriptenModule))
  );
  return modulePromise;
}
