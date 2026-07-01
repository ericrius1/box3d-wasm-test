import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam, setBodyPose } from "./helpers";

export const pyramidcrushScenario: ScenarioDefinition =   {
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
  };
