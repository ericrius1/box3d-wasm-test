import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { Quat, ScenarioDefinition, SimBody, Transform, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const BLOCK_HALF: Vec3 = [0.42, 0.24, 0.2];
const FLOOR_STEP = BLOCK_HALF[1] * 2;
const CANNON_RING_RADIUS = 11.2;
const BALL_POOL = 14;

function yawQuat(angle: number): Quat {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

type CastlePlan = {
  positions: Vec3[];
  rotations: Quat[];
  torchAngles: number[];
  outerRadius: number;
};

/**
 * Every block shares BLOCK_HALF so the whole castle renders as one instanced
 * mesh. Walls are brick-bonded rings, towers and the keep are cross-laid
 * two-block columns, and the top wall row keeps every other block as a
 * battlement.
 */
function planCastle(radius: number, floors: number, towers: number, rings: number): CastlePlan {
  const positions: Vec3[] = [];
  const rotations: Quat[] = [];
  const torchAngles: number[] = [];

  const addBlock = (position: Vec3, rotation: Quat) => {
    positions.push(position);
    rotations.push(rotation);
  };

  const addColumn = (center: Vec3, height: number, baseAngle: number) => {
    for (let f = 0; f < height; f += 1) {
      const y = BLOCK_HALF[1] + f * FLOOR_STEP;
      const across = f % 2 === 0;
      for (const side of [-0.21, 0.21]) {
        const local: Vec3 = across ? [0, 0, side] : [side, 0, 0];
        const cos = Math.cos(baseAngle);
        const sin = Math.sin(baseAngle);
        addBlock(
          [center[0] + local[0] * cos - local[2] * sin, y, center[2] + local[0] * sin + local[2] * cos],
          yawQuat(baseAngle + (across ? 0 : Math.PI / 2))
        );
      }
    }
  };

  for (let ring = 0; ring < rings; ring += 1) {
    const ringRadius = radius - ring * 2.1;
    if (ringRadius < 2.4) {
      break;
    }

    const ringFloors = floors + ring;
    const towerCount = ring === 0 ? towers : Math.max(3, towers - 2 * ring);
    const towerStep = (Math.PI * 2) / towerCount;
    const towerPhase = ring * 0.45;
    const segments = Math.max(10, Math.round((Math.PI * 2 * ringRadius) / (BLOCK_HALF[0] * 2 + 0.06)));
    const step = (Math.PI * 2) / segments;
    // Skip wall bricks that would spawn inside a tower footprint.
    const towerHalfArc = 0.62 / ringRadius;

    for (let f = 0; f <= ringFloors; f += 1) {
      const battlementRow = f === ringFloors;
      const y = BLOCK_HALF[1] + f * FLOOR_STEP;
      const offset = (f % 2) * step * 0.5;
      for (let s = 0; s < segments; s += 1) {
        if (battlementRow && s % 2 === 1) {
          continue;
        }
        const angle = s * step + offset;
        let insideTower = false;
        for (let t = 0; t < towerCount; t += 1) {
          const towerAngle = t * towerStep + towerPhase;
          const wrapped = Math.atan2(Math.sin(angle - towerAngle), Math.cos(angle - towerAngle));
          if (Math.abs(wrapped) < towerHalfArc) {
            insideTower = true;
            break;
          }
        }
        if (insideTower) {
          continue;
        }
        addBlock([Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius], yawQuat(-angle + Math.PI / 2));
      }
    }

    for (let t = 0; t < towerCount; t += 1) {
      const angle = t * towerStep + towerPhase;
      addColumn([Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius], ringFloors + 3, angle);
      if (ring === 0) {
        torchAngles.push(angle);
      }
    }
  }

  addColumn([0, 0, 0], floors + 6, 0.4);

  return { positions, rotations, torchAngles, outerRadius: radius };
}

export const castlesiegeScenario: ScenarioDefinition = {
  id: "castle-siege",
  title: "Castle Siege",
  eyebrow: "Destruction game",
  deck: "Shell a torch-lit brick citadel with glowing cannonballs and chase a 100% demolition score.",
  description:
    "A night-time artillery range: the castle is thousands of individually simulated bricks rendered as one instanced mesh, the cannon fires bullet-enabled spheres, and bloom picks out torches, tracer glow, and molten shot. Scale walls, rings, and towers to see how many sleeping bricks the solver tolerates before your frame budget dies.",
  accent: "#ffab4d",
  category: "games",
  visuals: {
    lighting: "night",
    background: "#070a12",
    fog: { color: "#070a12" },
    grid: false,
    bloom: { strength: 0.75, radius: 0.5, threshold: 0.55 }
  },
  hint: "Click anywhere — the next cannon on the ring fires at that point",
  defaults: {
    wallRadius: 5.6,
    wallFloors: 6,
    towers: 5,
    rings: 1,
    cannons: 3,
    power: 30,
    ballSize: 0.34,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Castle (rebuilds)",
      controls: [
        { key: "wallRadius", label: "Wall radius", min: 3.6, max: 8, step: 0.2 },
        { key: "wallFloors", label: "Wall floors", min: 3, max: 14, step: 1 },
        { key: "towers", label: "Towers", min: 3, max: 8, step: 1 },
        { key: "rings", label: "Wall rings", min: 1, max: 3, step: 1 }
      ]
    },
    {
      title: "Cannon",
      controls: [
        { key: "cannons", label: "Cannons on ring", min: 1, max: 5, step: 1 },
        { key: "power", label: "Muzzle power", min: 16, max: 48, step: 0.5, rebuild: false },
        { key: "ballSize", label: "Ball radius", min: 0.24, max: 0.5, step: 0.01 }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "volley", title: "Fire volley ×5" },
    { id: "mortar", title: "Mortar strike" },
    { id: "reset", title: "Rebuild castle" }
  ],
  camera: {
    position: [10.8, 7.6, 16.2],
    target: [0, 2.4, 0],
    fov: 42
  },
  gravity: () => [0, -12, 0],
  setup(ctx) {
    const radius = numberParam(ctx.params, "wallRadius");
    const floors = Math.round(numberParam(ctx.params, "wallFloors"));
    const towers = Math.round(numberParam(ctx.params, "towers"));
    const rings = Math.round(numberParam(ctx.params, "rings"));
    const ballRadius = numberParam(ctx.params, "ballSize");

    ctx.addBox({
      type: BodyType.Static,
      position: [0, -0.45, 0],
      halfExtents: [16, 0.45, 16],
      material: ctx.colorMaterial("#20242f", { roughness: 0.92, metalness: 0.04 }),
      friction: 0.75,
      receiveShadow: true
    });

    const plan = planCastle(radius, floors, towers, rings);
    const stone = ctx.colorMaterial("#8b93a6", { roughness: 0.78, metalness: 0.08 });
    const castle = ctx.addInstancedBoxes({
      count: plan.positions.length,
      halfExtents: BLOCK_HALF,
      material: stone,
      position: (index) => plan.positions[index],
      rotation: (index) => plan.rotations[index],
      density: 1.6,
      friction: 0.72,
      restitution: 0.02
    });

    // Torches: static pole bodies plus scenario-owned flame meshes and lights.
    const torchLights: THREE.PointLight[] = [];
    for (const angle of plan.torchAngles.slice(0, 6)) {
      const distance = plan.outerRadius + 1.5;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      ctx.addBox({
        type: BodyType.Static,
        position: [x, 1.1, z],
        halfExtents: [0.07, 1.1, 0.07],
        material: ctx.colorMaterial("#3d3428", { roughness: 0.9 }),
        castShadow: false
      });
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347 })
      );
      flame.position.set(x, 2.36, z);
      ctx.scene.add(flame);
      const light = new THREE.PointLight(0xff9a3c, 14, 9, 2);
      light.position.set(x, 2.5, z);
      ctx.scene.add(light);
      torchLights.push(light);
    }

    // Cannons on a ring around the castle: static base bodies plus aimable
    // barrel meshes. Shots rotate round-robin through the ring.
    const cannonCount = Math.min(5, Math.max(1, Math.round(numberParam(ctx.params, "cannons"))));
    const baseMaterial = ctx.colorMaterial("#2f3542", { roughness: 0.6, metalness: 0.35 });
    const barrelGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2.1, 18);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x454e61, roughness: 0.38, metalness: 0.75 });
    const initialAim = new THREE.Vector3(0, 2, 0);
    const aimMatrix = new THREE.Matrix4();

    type Cannon = { pivot: THREE.Group; targetQuat: THREE.Quaternion };
    const cannons: Cannon[] = [];
    for (let i = 0; i < cannonCount; i += 1) {
      const angle = Math.PI / 2 + (i * Math.PI * 2) / cannonCount;
      const baseX = Math.cos(angle) * CANNON_RING_RADIUS;
      const baseZ = Math.sin(angle) * CANNON_RING_RADIUS;
      ctx.addBox({
        type: BodyType.Static,
        position: [baseX, 0.62, baseZ],
        halfExtents: [0.85, 0.62, 0.85],
        material: baseMaterial
      });
      const pivot = new THREE.Group();
      const barrelMesh = new THREE.Mesh(barrelGeometry, barrelMaterial);
      barrelMesh.rotation.x = Math.PI / 2;
      barrelMesh.position.z = -1.05;
      barrelMesh.castShadow = true;
      pivot.add(barrelMesh);
      pivot.position.set(baseX, 1.57, baseZ);
      aimMatrix.lookAt(pivot.position, initialAim, THREE.Object3D.DEFAULT_UP);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(aimMatrix);
      pivot.quaternion.copy(targetQuat);
      ctx.scene.add(pivot);
      cannons.push({ pivot, targetQuat });
    }

    const molten = ctx.colorMaterial("#ffb25e", {
      emissive: "#ff7a18",
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.1
    });
    const balls: SimBody[] = [];
    for (let i = 0; i < BALL_POOL; i += 1) {
      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [i * 4 - 26, -40, 30],
        radius: ballRadius,
        material: molten,
        density: 9,
        friction: 0.4,
        restitution: 0.12,
        bullet: true
      });
      ball.object.visible = false;
      ctx.world.setBodyGravityScale(ball.body, 0);
      ctx.world.setBodyAwake(ball.body, false);
      balls.push(ball);
    }

    const tracer = new THREE.PointLight(0xff8c3a, 0, 20, 2);
    ctx.scene.add(tracer);

    let shots = 0;
    let nextBall = 0;
    let nextCannon = 0;
    let tracerBall: SimBody | undefined;
    let tracerAge = 0;
    const aimTarget = new THREE.Vector3(0, 2, 0);
    const muzzle = new THREE.Vector3();

    const fire = (target: Vec3) => {
      const power = numberParam(ctx.params, "power");
      const ball = balls[nextBall];
      nextBall = (nextBall + 1) % balls.length;
      const cannon = cannons[nextCannon % cannons.length];
      nextCannon += 1;

      aimTarget.set(target[0], Math.max(target[1], 0.4), target[2]);
      const base = cannon.pivot.position;
      const flat = aimTarget.clone().sub(base);
      const distance = flat.length();
      // Straight shot plus an upward bias that grows with range: playable
      // ballistics without solving the full projectile equation.
      const velocity = flat.clone().normalize().multiplyScalar(power);
      velocity.y += distance * 0.16 * (power / 30);

      aimMatrix.lookAt(base, aimTarget, THREE.Object3D.DEFAULT_UP);
      cannon.targetQuat.setFromRotationMatrix(aimMatrix);

      muzzle.copy(base).add(flat.normalize().multiplyScalar(1.4));
      ball.object.visible = true;
      ctx.world.setBodyGravityScale(ball.body, 1);
      ctx.world.setBodyTransform(ball.body, [muzzle.x, muzzle.y, muzzle.z]);
      ctx.world.setBodyVelocity(ball.body, [velocity.x, velocity.y, velocity.z], [12, 0, 0]);
      ctx.world.setBodyAwake(ball.body, true);

      tracerBall = ball;
      tracerAge = 0;
      shots += 1;
    };

    // Toppled = fell off its course or left its spot; scanned in slices.
    const toppled = new Uint8Array(plan.positions.length);
    let toppledCount = 0;
    let scanCursor = 0;
    const scratch: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

    return {
      actions: {
        volley: () => {
          for (let i = 0; i < 5; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const spread = radius * (0.4 + Math.random() * 0.7);
            window.setTimeout(
              () => fire([Math.cos(angle) * spread, 1 + Math.random() * floors * FLOOR_STEP, Math.sin(angle) * spread]),
              i * 130
            );
          }
        },
        mortar: () => {
          ctx.world.explode([0, floors * FLOOR_STEP * 0.5, 0], radius * 0.9, 1, 70);
        },
        reset: () => undefined
      },
      onPointerDown: (point) => {
        fire(point);
      },
      update: (delta, elapsed) => {
        for (let i = 0; i < torchLights.length; i += 1) {
          torchLights[i].intensity = 14 * (0.82 + 0.3 * Math.sin(elapsed * 13 + i * 7.1) + 0.12 * Math.sin(elapsed * 29 + i * 3.7));
        }

        for (const cannon of cannons) {
          cannon.pivot.quaternion.slerp(cannon.targetQuat, Math.min(1, delta * 9));
        }

        if (tracerBall) {
          tracerAge += delta;
          const [x, y, z] = tracerBall.transform.position;
          tracer.position.set(x, y, z);
          tracer.intensity = Math.max(0, 46 * (1 - tracerAge / 2.6));
          if (tracerAge > 2.6 || y < -2) {
            tracer.intensity = 0;
            tracerBall = undefined;
          }
        }

        const checks = Math.min(plan.positions.length, 250);
        for (let i = 0; i < checks; i += 1) {
          const index = (scanCursor + i) % plan.positions.length;
          if (toppled[index]) {
            continue;
          }
          ctx.world.getBodyTransform(castle.bodies[index], scratch);
          const home = plan.positions[index];
          const dx = scratch.position[0] - home[0];
          const dz = scratch.position[2] - home[2];
          if (scratch.position[1] < home[1] - 1.1 || dx * dx + dz * dz > 2) {
            toppled[index] = 1;
            toppledCount += 1;
          }
        }
        scanCursor = (scanCursor + checks) % plan.positions.length;
      },
      metrics: () => ({
        Bricks: plan.positions.length,
        Cannons: cannons.length,
        Toppled: `${toppledCount} (${Math.round((toppledCount / plan.positions.length) * 100)}%)`,
        Shots: shots
      })
    };
  }
};
