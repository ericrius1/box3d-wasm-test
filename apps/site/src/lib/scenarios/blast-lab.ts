import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const blastlabScenario: ScenarioDefinition =   {
    id: "blast-lab",
    title: "Blast Lab",
    eyebrow: "Explosion falloff",
    deck: "Tune Box3D's world explosion helper against a mixed crate and sphere pile.",
    description:
      "This example isolates radial impulses, falloff, object mix, and body count so game explosions can be tuned without unrelated systems.",
    accent: "#30b8e8",
    category: "fun",
    hint: "Click anywhere in the pit to detonate at that point",
    defaults: {
      gravity: -15,
      objectCount: 34,
      sphereMix: 0.35,
      blastRadius: 4.1,
      falloff: 0.78,
      impulsePerArea: 92,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Pile",
        controls: [
          { key: "gravity", label: "Gravity", min: -28, max: -2, step: 0.5 },
          { key: "objectCount", label: "Objects", min: 8, max: 72, step: 1 },
          { key: "sphereMix", label: "Sphere mix", min: 0, max: 1, step: 0.05 }
        ]
      },
      {
        title: "Blast",
        controls: [
          { key: "blastRadius", label: "Radius", min: 1, max: 7, step: 0.1, rebuild: false },
          { key: "falloff", label: "Falloff", min: 0.1, max: 1.6, step: 0.02, rebuild: false },
          { key: "impulsePerArea", label: "Impulse", min: 10, max: 180, step: 2, rebuild: false }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "blast", title: "Blast center" },
      { id: "reset", title: "Reset pile" }
    ],
    camera: {
      position: [8.8, 6.8, 8.8],
      target: [0, 1.7, 0],
      fov: 43
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const bodies: SimBody[] = [];
      let blasts = 0;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.45, 0],
        halfExtents: [5.2, 0.4, 5.2],
        material: ctx.material("ground"),
        friction: 0.85,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-5, 1, 0], halfExtents: [0.22, 1.15, 5.2], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [5, 1, 0], halfExtents: [0.22, 1.15, 5.2], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [0, 1, -5], halfExtents: [5.2, 1.15, 0.22], material: ctx.material("wall"), friction: 0.55 });
      ctx.addBox({ type: BodyType.Static, position: [0, 1, 5], halfExtents: [5.2, 1.15, 0.22], material: ctx.material("wall"), friction: 0.55 });

      const count = Math.round(numberParam(ctx.params, "objectCount"));
      const sphereMix = numberParam(ctx.params, "sphereMix");
      for (let i = 0; i < count; i += 1) {
        const layer = Math.floor(i / 9);
        const slot = i % 9;
        const x = (slot % 3 - 1) * 0.62 + (layer % 2) * 0.12;
        const z = (Math.floor(slot / 3) - 1) * 0.62 - (layer % 3) * 0.05;
        const y = 0.22 + layer * 0.5;
        const isSphere = (i % 10) / 10 < sphereMix;
        bodies.push(
          isSphere
            ? ctx.addSphere({
                type: BodyType.Dynamic,
                position: [x, y, z],
                radius: 0.23,
                material: i % 2 === 0 ? ctx.material("reward") : ctx.material("accent"),
                density: 1.8,
                friction: 0.36,
                restitution: 0.22
              })
            : ctx.addBox({
                type: BodyType.Dynamic,
                position: [x, y, z],
                halfExtents: [0.25, 0.25, 0.25],
                material: i % 3 === 0 ? ctx.material("primary") : ctx.material("secondary"),
                density: 1.2,
                friction: 0.68,
                restitution: 0.08
              })
        );
      }

      ctx.addLandmarkSphere([0, 0.55, 0], 0.18, "#f4cf4d");
      ctx.addLandmarkLine([-numberParam(ctx.params, "blastRadius"), 0.08, 0], [numberParam(ctx.params, "blastRadius"), 0.08, 0], "#30b8e8");
      ctx.addLandmarkLine([0, 0.08, -numberParam(ctx.params, "blastRadius")], [0, 0.08, numberParam(ctx.params, "blastRadius")], "#30b8e8");

      return {
        actions: {
          blast: () => {
            ctx.world.explode([0, 0.55, 0], numberParam(ctx.params, "blastRadius"), numberParam(ctx.params, "falloff"), numberParam(ctx.params, "impulsePerArea"));
            blasts += 1;
          },
          reset: () => undefined
        },
        onPointerDown: (point) => {
          ctx.world.explode(
            [point[0], Math.max(point[1], 0.4), point[2]],
            numberParam(ctx.params, "blastRadius"),
            numberParam(ctx.params, "falloff"),
            numberParam(ctx.params, "impulsePerArea")
          );
          blasts += 1;
        },
        metrics: () => ({
          Bodies: bodies.length,
          Blasts: blasts,
          Radius: numberParam(ctx.params, "blastRadius").toFixed(1)
        })
      };
    }
  };
