import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const sampleragdollsScenario: ScenarioDefinition =   {
    id: "sample-ragdolls",
    title: "Ragdoll Pile",
    eyebrow: "Box3D sample · Ragdoll",
    deck: "The upstream ragdoll: 14 capsule bones with cone and twist limits, dropped in a pile.",
    description:
      "The official Box3D samples human runs unmodified inside the WASM module — the vendored shared/human.c builds each ragdoll from 14 capsule bones, spherical joints with cone and twist limits, joint friction, and self-collision filtering.",
    accent: "#f2e14c",
    category: "samples",
    hint: "Click a ragdoll to shove it around",
    defaults: {
      count: 3,
      frictionTorque: 5,
      hertz: 1,
      dampingRatio: 0.7,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Ragdolls",
        controls: [
          { key: "count", label: "Count", min: 1, max: 8, step: 1 },
          { key: "frictionTorque", label: "Joint friction", min: 0, max: 20, step: 1 },
          { key: "hertz", label: "Joint hertz", min: 0, max: 20, step: 0.5 },
          { key: "dampingRatio", label: "Damping", min: 0, max: 4, step: 0.1 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "toss", title: "Toss ragdolls" },
      { id: "reset", title: "Respawn pile" }
    ],
    camera: {
      position: [4.2, 2.8, 5.4],
      target: [0, 0.6, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [8, 0.5, 8],
        material: ctx.material("ground"),
        friction: 0.7,
        receiveShadow: true
      });

      const count = Math.round(numberParam(ctx.params, "count"));
      const options = {
        frictionTorque: numberParam(ctx.params, "frictionTorque"),
        hertz: numberParam(ctx.params, "hertz"),
        dampingRatio: numberParam(ctx.params, "dampingRatio")
      };

      const humans: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const angle = i * 2.39996;
        const spread = count > 1 ? 0.9 : 0;
        const { human } = ctx.addHuman(
          [Math.cos(angle) * spread, 1.2 + i * 1.6, Math.sin(angle) * spread],
          options
        );
        humans.push(human);
      }

      return {
        actions: {
          toss: () => {
            for (const human of humans) {
              ctx.world.humanSetVelocity(human, [0, 6, 0]);
              ctx.world.humanApplyRandomImpulse(human, 10);
            }
          },
          reset: () => undefined
        },
        metrics: () => ({
          Ragdolls: count,
          Bones: count * 14
        })
      };
    }
  };
