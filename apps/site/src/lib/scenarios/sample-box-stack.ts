import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const sampleboxstackScenario: ScenarioDefinition =   {
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
  };
