import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Quat, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const samplejengaScenario: ScenarioDefinition =   {
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
  };
