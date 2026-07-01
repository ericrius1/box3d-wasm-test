import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const samplerestitutionScenario: ScenarioDefinition =   {
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
  };
