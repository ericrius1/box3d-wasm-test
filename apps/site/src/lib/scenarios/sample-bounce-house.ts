import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam, formatSpeed } from "./helpers";

export const samplebouncehouseScenario: ScenarioDefinition =   {
    id: "sample-bounce-house",
    title: "Bounce House",
    eyebrow: "Box3D sample · Continuous",
    deck: "The upstream Bounce House: a zero-gravity ball ricocheting at high speed forever.",
    description:
      "A direct port of the official Continuous / Bounce House sample: a frictionless, perfectly elastic sphere with zero gravity scale ricochets around a sealed room at up to 120 m/s — a torture test for continuous collision detection.",
    accent: "#e96368",
    category: "samples",
    hint: "Click walls to shove the ball with a shockwave",
    defaults: {
      speed: 60,
      gravityScale: 0,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Ball",
        controls: [
          { key: "speed", label: "Launch speed", min: 20, max: 120, step: 5 },
          { key: "gravityScale", label: "Gravity scale", min: 0, max: 1, step: 0.05 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "launch", title: "Relaunch ball" },
      { id: "reset", title: "Reset room" }
    ],
    camera: {
      position: [17, 14, 17],
      target: [0, 4, 0],
      fov: 42
    },
    gravity: () => [0, -10, 0],
    setup(ctx) {
      // Upstream: 20x20 room, walls 10 high and 0.1 thick.
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -1, 0],
        halfExtents: [10, 1, 10],
        material: ctx.material("ground"),
        friction: 0,
        restitution: 1,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [10, 5, 0], halfExtents: [0.1, 5, 10], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [-10, 5, 0], halfExtents: [0.1, 5, 10], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, 5, -10], halfExtents: [10, 5, 0.1], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, 5, 10], halfExtents: [10, 5, 0.1], material: ctx.material("glass"), friction: 0, restitution: 1, castShadow: false });

      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-8, 4, 0],
        radius: 0.5,
        material: ctx.material("danger"),
        density: 1,
        friction: 0,
        restitution: 1,
        rollingResistance: 0,
        bullet: true
      });
      ctx.world.setBodyGravityScale(ball.body, numberParam(ctx.params, "gravityScale"));

      const launch = () => {
        const speed = numberParam(ctx.params, "speed");
        ctx.world.setBodyGravityScale(ball.body, numberParam(ctx.params, "gravityScale"));
        ctx.world.setBodyVelocity(ball.body, [speed, 0, speed], [0, 0, 0]);
      };
      launch();

      return {
        actions: {
          launch,
          reset: () => undefined
        },
        metrics: () => ({
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  };
