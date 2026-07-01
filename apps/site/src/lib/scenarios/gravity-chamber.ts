import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const gravitychamberScenario: ScenarioDefinition =   {
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
  };
