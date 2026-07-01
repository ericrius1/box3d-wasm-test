import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam, formatSpeed } from "./helpers";

export const wreckingballScenario: ScenarioDefinition =   {
    id: "wrecking-ball",
    title: "Wrecking Ball",
    eyebrow: "Spherical joint chain",
    deck: "Swing a jointed chain and heavy ball into a brick wall — joints run inside the WASM solver.",
    description:
      "A chain of box links connected by spherical joints hangs from a static anchor with a dense sphere at the end. Swing it into the wall and tune link count, ball mass, and wall size.",
    accent: "#c98bf2",
    category: "fun",
    hint: "Click the ball or wall to shove them, or hit Swing",
    defaults: {
      gravity: -12,
      links: 8,
      ballDensity: 7,
      swingPower: 15,
      wallRows: 6,
      wallCols: 6,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Chain",
        controls: [
          { key: "links", label: "Chain links", min: 4, max: 14, step: 1 },
          { key: "ballDensity", label: "Ball density", min: 2, max: 18, step: 0.5 },
          { key: "swingPower", label: "Swing power", min: 5, max: 30, step: 0.5, rebuild: false }
        ]
      },
      {
        title: "Wall",
        controls: [
          { key: "gravity", label: "Gravity", min: -24, max: -4, step: 0.5 },
          { key: "wallRows", label: "Wall rows", min: 3, max: 9, step: 1 },
          { key: "wallCols", label: "Wall columns", min: 3, max: 9, step: 1 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "swing", title: "Swing ball" },
      { id: "reset", title: "Rebuild wall" }
    ],
    camera: {
      position: [10.4, 6.6, 10.4],
      target: [1.2, 3, 0],
      fov: 42
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const links = Math.round(numberParam(ctx.params, "links"));
      const anchorY = 8.2;
      const linkSpacing = 0.5;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.55, 0],
        halfExtents: [9.5, 0.5, 6.5],
        material: ctx.material("ground"),
        friction: 0.85,
        receiveShadow: true
      });

      const anchor = ctx.addBox({
        type: BodyType.Static,
        position: [0, anchorY, 0],
        halfExtents: [0.35, 0.18, 0.35],
        material: ctx.material("wall"),
        castShadow: true
      });

      // Chain of thin links, each pinned to the previous with a spherical joint.
      let previous = anchor;
      let jointY = anchorY - 0.18;
      const chain: SimBody[] = [];
      for (let i = 0; i < links; i += 1) {
        const centerY = jointY - linkSpacing / 2;
        const link = ctx.addBox({
          type: BodyType.Dynamic,
          position: [0, centerY, 0],
          halfExtents: [0.09, linkSpacing / 2 - 0.02, 0.09],
          material: i % 2 === 0 ? ctx.material("primary") : ctx.material("secondary"),
          density: 2.4,
          friction: 0.4
        });
        ctx.world.createSphericalJoint(previous.body, link.body, [0, jointY, 0]);
        chain.push(link);
        previous = link;
        jointY -= linkSpacing;
      }

      const ballRadius = 0.62;
      const ball = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [0, jointY - ballRadius, 0],
        radius: ballRadius,
        material: ctx.material("reward"),
        density: numberParam(ctx.params, "ballDensity"),
        friction: 0.4,
        restitution: 0.1,
        bullet: true
      });
      ctx.world.createSphericalJoint(previous.body, ball.body, [0, jointY, 0]);

      const wallRows = Math.round(numberParam(ctx.params, "wallRows"));
      const wallCols = Math.round(numberParam(ctx.params, "wallCols"));
      const brickHalf: Vec3 = [0.22, 0.28, 0.44];
      const wallX = 3.4;
      const bricks: SimBody[] = [];
      for (let row = 0; row < wallRows; row += 1) {
        for (let col = 0; col < wallCols; col += 1) {
          const z = (col - (wallCols - 1) / 2) * (brickHalf[2] * 2 + 0.02) + (row % 2 === 0 ? 0 : brickHalf[2] * 0.9);
          bricks.push(
            ctx.addBox({
              type: BodyType.Dynamic,
              position: [wallX, brickHalf[1] + row * (brickHalf[1] * 2 + 0.015), z],
              halfExtents: brickHalf,
              material: row % 3 === 0 ? ctx.material("accent") : row % 3 === 1 ? ctx.material("primary") : ctx.material("secondary"),
              density: 0.9,
              friction: 0.65,
              restitution: 0.02
            })
          );
        }
      }

      ctx.addLandmarkSphere([0, anchorY, 0], 0.14, "#f4cf4d");
      ctx.addLandmarkLine([0, anchorY, 0], [0, jointY - ballRadius, 0], "#c98bf2");
      ctx.addLandmarkLine([wallX, 0.08, -3.4], [wallX, 0.08, 3.4], "#ff6b70");

      let swings = 0;
      let standing = bricks.length;

      return {
        actions: {
          swing: () => {
            const power = numberParam(ctx.params, "swingPower");
            ctx.world.setBodyVelocity(ball.body, [-power, 1.5, 0], [0, 0, 0]);
            swings += 1;
          },
          reset: () => undefined
        },
        update: () => {
          standing = 0;
          for (const brick of bricks) {
            const p = brick.transform.position;
            const d = Math.hypot(p[0] - brick.origin[0], p[1] - brick.origin[1], p[2] - brick.origin[2]);
            if (d < 0.3) {
              standing += 1;
            }
          }
        },
        metrics: () => ({
          Links: links,
          Bricks: bricks.length,
          Standing: standing,
          Swings: swings,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(ball.body))
        })
      };
    }
  };
