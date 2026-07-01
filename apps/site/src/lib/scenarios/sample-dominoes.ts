import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Quat, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const sampledominoesScenario: ScenarioDefinition =   {
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
  };
