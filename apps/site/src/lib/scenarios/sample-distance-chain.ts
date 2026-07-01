import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam, boolParam, formatSpeed } from "./helpers";

export const sampledistancechainScenario: ScenarioDefinition =   {
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
  };
