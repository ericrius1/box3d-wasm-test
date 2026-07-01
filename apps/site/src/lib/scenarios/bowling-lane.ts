import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam, setBodyPose, formatSpeed, uprightness } from "./helpers";

export const bowlinglaneScenario: ScenarioDefinition =   {
    id: "bowling-lane",
    title: "Bowling Lane",
    eyebrow: "Capsule pins",
    deck: "Roll a hooked ball into ten capsule pins and read the fall count from body rotations.",
    description:
      "Capsule bodies make convincing pins: they wobble, spin, and topple. Aim the throw, add hook spin, and the scenario counts fallen pins from each pin's up vector.",
    accent: "#f2e14c",
    category: "fun",
    hint: "Click pins to knock them over, or roll the ball",
    defaults: {
      power: 24,
      aim: 0,
      hook: 0,
      pinFriction: 0.42,
      laneFriction: 0.16,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Throw",
        controls: [
          { key: "power", label: "Power", min: 10, max: 42, step: 0.5, rebuild: false },
          { key: "aim", label: "Aim", min: -2, max: 2, step: 0.05, rebuild: false },
          { key: "hook", label: "Hook spin", min: -24, max: 24, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Lane",
        controls: [
          { key: "pinFriction", label: "Pin friction", min: 0.05, max: 1, step: 0.01 },
          { key: "laneFriction", label: "Lane friction", min: 0.02, max: 0.8, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "roll", title: "Roll ball" },
      { id: "reset", title: "Reset pins" }
    ],
    camera: {
      position: [6.4, 5.4, 13.6],
      target: [0, 0.6, -2.4],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      const laneFriction = numberParam(ctx.params, "laneFriction");
      const pinFriction = numberParam(ctx.params, "pinFriction");

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.3, 0],
        halfExtents: [2.1, 0.3, 11.5],
        material: ctx.material("ground"),
        friction: laneFriction,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-2.25, 0.28, 0], halfExtents: [0.15, 0.28, 11.5], material: ctx.material("wall"), friction: 0.2 });
      ctx.addBox({ type: BodyType.Static, position: [2.25, 0.28, 0], halfExtents: [0.15, 0.28, 11.5], material: ctx.material("wall"), friction: 0.2 });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.7, -11.6], halfExtents: [2.4, 0.7, 0.2], material: ctx.material("wall"), friction: 0.3 });

      // Ten pins in the standard 1-2-3-4 triangle.
      const pins: SimBody[] = [];
      const pinBaseZ = -7.6;
      const pinSpacing = 0.52;
      for (let row = 0; row < 4; row += 1) {
        for (let i = 0; i <= row; i += 1) {
          const x = (i - row / 2) * pinSpacing;
          const z = pinBaseZ - row * pinSpacing;
          pins.push(
            ctx.addCapsule({
              type: BodyType.Dynamic,
              position: [x, 0.46, z],
              halfHeight: 0.24,
              radius: 0.14,
              material: ctx.material("glass"),
              density: 0.7,
              friction: pinFriction,
              restitution: 0.12
            })
          );
        }
      }

      const ballStart: Vec3 = [0, 0.36, 9.6];
      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: ballStart,
        radius: 0.36,
        material: ctx.material("reward"),
        density: 9,
        friction: 0.16,
        restitution: 0.05,
        rollingResistance: 0.004,
        bullet: true
      });

      ctx.addLandmarkLine([0, 0.05, 9.6], [0, 0.05, pinBaseZ], "#f2e14c");
      ctx.addLandmarkSphere([0, 0.05, pinBaseZ - 0.8], 0.12, "#ff6b70");

      let rolls = 0;
      let down = 0;

      return {
        actions: {
          roll: () => {
            setBodyPose(ctx.world, ball, ballStart);
            ctx.world.setBodyVelocity(
              ball.body,
              [numberParam(ctx.params, "aim"), 0, -numberParam(ctx.params, "power")],
              [0, numberParam(ctx.params, "hook"), 0]
            );
            rolls += 1;
          },
          reset: () => undefined
        },
        update: () => {
          down = 0;
          for (const pin of pins) {
            if (uprightness(pin.transform.rotation) < 0.72 || pin.transform.position[1] < 0.2) {
              down += 1;
            }
          }
        },
        metrics: () => ({
          Pins: pins.length,
          Down: down,
          Rolls: rolls,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  };
