import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam, setBodyPose, formatSpeed } from "./helpers";

export const pinballwellScenario: ScenarioDefinition =   {
    id: "pinball-well",
    title: "Pinball Well",
    eyebrow: "Restitution playground",
    deck: "Launch a fast sphere through static bumpers and tune bounce, spin, and plunger force.",
    description:
      "A compact arcade table that makes restitution, bullet bodies, wall friction, and angular impulses easy to inspect.",
    accent: "#e96368",
    category: "fun",
    hint: "Click the table to nudge the ball with a shockwave",
    defaults: {
      gravity: -9,
      plunger: 28,
      spin: 12,
      bumperScale: 1,
      tableFriction: 0.22,
      bounce: 0.8,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Plunger",
        controls: [
          { key: "plunger", label: "Plunger force", min: 10, max: 44, step: 0.5, rebuild: false },
          { key: "spin", label: "Angular kick", min: -24, max: 24, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Table",
        controls: [
          { key: "gravity", label: "Gravity", min: -18, max: -1, step: 0.25 },
          { key: "bumperScale", label: "Bumper size", min: 0.65, max: 1.55, step: 0.05 },
          { key: "tableFriction", label: "Wall friction", min: 0, max: 0.9, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0.1, max: 1.2, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "launch", title: "Launch ball" },
      { id: "nudge", title: "Nudge table" },
      { id: "reset", title: "Reset ball" }
    ],
    camera: {
      position: [0, 9.6, 10.8],
      target: [0, 0.7, 0],
      fov: 39
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      let launches = 0;
      const bounce = numberParam(ctx.params, "bounce");
      const wallFriction = numberParam(ctx.params, "tableFriction");
      const bumperRadius = 0.58 * numberParam(ctx.params, "bumperScale");

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.45, 0],
        halfExtents: [4.4, 0.35, 6.2],
        material: ctx.material("ground"),
        friction: 0.45,
        receiveShadow: true
      });
      ctx.addBox({ type: BodyType.Static, position: [-4.35, 0.55, 0], halfExtents: [0.22, 1, 6.2], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [4.35, 0.55, 0], halfExtents: [0.22, 1, 6.2], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.55, -6.15], halfExtents: [4.4, 1, 0.22], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });
      ctx.addBox({ type: BodyType.Static, position: [0, 0.55, 6.15], halfExtents: [4.4, 1, 0.22], material: ctx.material("wall"), friction: wallFriction, restitution: bounce });

      const bumpers: SimBody[] = [];
      const bumperPositions: Vec3[] = [
        [-1.8, 0.35, -2.5],
        [1.4, 0.35, -1.7],
        [-0.25, 0.35, 0.6],
        [2.35, 0.35, 2.1],
        [-2.55, 0.35, 2.7]
      ];
      for (const position of bumperPositions) {
        bumpers.push(
          ctx.addSphere({
            type: BodyType.Static,
            position,
            radius: bumperRadius,
            material: ctx.material("danger"),
            friction: 0.08,
            restitution: bounce
          })
        );
      }

      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-3.15, 0.55, 4.8],
        radius: 0.34,
        material: ctx.material("reward"),
        density: 5.5,
        friction: 0.1,
        restitution: bounce,
        rollingResistance: 0.01,
        bullet: true
      });

      ctx.addLandmarkSphere([-3.15, 0.55, 4.8], 0.14, "#f4cf4d");
      ctx.addLandmarkLine([-3.15, 0.08, 4.8], [-3.15, 0.08, -4.8], "#2ad8c2");
      ctx.addLandmarkLine([-4, 0.12, 0], [4, 0.12, 0], "#ff6b70");

      const launch = () => {
        setBodyPose(ctx.world, ball, [-3.15, 0.55, 4.8]);
        ctx.world.setBodyVelocity(ball.body, [1.9, 0, -numberParam(ctx.params, "plunger")], [0, 0, 0]);
        ctx.world.applyAngularImpulse(ball.body, [numberParam(ctx.params, "spin"), 0, -numberParam(ctx.params, "spin") * 0.35]);
        launches += 1;
      };

      return {
        actions: {
          launch,
          nudge: () => ctx.world.applyImpulse(ball.body, [7.5, 0, -1.5]),
          reset: () => setBodyPose(ctx.world, ball, [-3.15, 0.55, 4.8])
        },
        metrics: () => ({
          Bumpers: bumpers.length,
          Launches: launches,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  };
