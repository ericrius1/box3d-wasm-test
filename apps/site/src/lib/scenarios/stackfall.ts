import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, numberParam, setBodyPose, formatSpeed } from "./helpers";

export const stackfallScenario: ScenarioDefinition =   {
    id: "stackfall",
    title: "Stackfall Yard",
    eyebrow: "Impulse stress test",
    deck: "Fire a dense sphere into an alternating block tower and tune the collapse.",
    description:
      "This scenario is adapted from the earlier Stackfall experiment, split into its own example with launcher, tower, and debug controls.",
    accent: "#f2b544",
    category: "fun",
    hint: "Click blocks to blast them loose, or fire the launcher",
    defaults: {
      gravity: -18,
      rows: 9,
      launchSpeed: 32,
      launchLift: 5,
      sideAim: 0,
      blockFriction: 0.72,
      bounce: 0.05,
      paused: false,
      showLandmarks: true
    },
    controls: [
      {
        title: "Launcher",
        controls: [
          { key: "launchSpeed", label: "Launch speed", min: 10, max: 46, step: 0.5, rebuild: false },
          { key: "launchLift", label: "Launch lift", min: 0, max: 16, step: 0.25, rebuild: false },
          { key: "sideAim", label: "Side aim", min: -3.4, max: 3.4, step: 0.1 }
        ]
      },
      {
        title: "Tower material",
        controls: [
          { key: "gravity", label: "Gravity", min: -30, max: -4, step: 0.5 },
          { key: "rows", label: "Rows", min: 4, max: 13, step: 1 },
          { key: "blockFriction", label: "Block friction", min: 0.05, max: 1.2, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0, max: 0.6, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "fire", title: "Fire sphere" },
      { id: "reset", title: "Reset tower" }
    ],
    camera: {
      position: [9.2, 6.2, 8.4],
      target: [0.2, 2.1, 0],
      fov: 42
    },
    gravity: (params) => [0, numberParam(params, "gravity"), 0],
    setup(ctx) {
      const blocks: SimBody[] = [];
      let shots = 0;
      let fallen = 0;

      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.55, 0],
        halfExtents: [10.5, 0.5, 6.4],
        material: ctx.material("ground"),
        friction: 0.95,
        receiveShadow: true
      });
      ctx.addBox({
        type: BodyType.Static,
        position: [4.2, 1.1, -3.1],
        halfExtents: [0.25, 1.2, 3.8],
        material: ctx.material("wall"),
        friction: 0.6
      });
      ctx.addBox({
        type: BodyType.Static,
        position: [4.2, 1.1, 3.1],
        halfExtents: [0.25, 1.2, 3.8],
        material: ctx.material("wall"),
        friction: 0.6
      });

      const rows = Math.round(numberParam(ctx.params, "rows"));
      for (let row = 0; row < rows; row += 1) {
        const count = row % 2 === 0 ? 5 : 4;
        for (let col = 0; col < count; col += 1) {
          const x = 1.55 + (col - (count - 1) / 2) * 0.82;
          const z = (row % 2 === 0 ? 0 : 0.38) + (col % 2 === 0 ? 0.06 : -0.06);
          const y = 0.32 + row * 0.62;
          blocks.push(
            ctx.addBox({
              type: BodyType.Dynamic,
              position: [x, y, z],
              halfExtents: [0.36, 0.28, 0.36],
              material: row % 3 === 0 ? ctx.material("primary") : row % 3 === 1 ? ctx.material("secondary") : ctx.material("accent"),
              density: 1.15,
              friction: numberParam(ctx.params, "blockFriction"),
              restitution: numberParam(ctx.params, "bounce")
            })
          );
        }
      }

      const projectile = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [-7.2, 1.15, numberParam(ctx.params, "sideAim")],
        radius: 0.62,
        material: ctx.material("reward"),
        density: 8,
        friction: 0.28,
        restitution: 0.24,
        bullet: true
      });

      ctx.addLandmarkSphere([-7.2, 1.15, numberParam(ctx.params, "sideAim")], 0.16, "#f7cf4d");
      ctx.addLandmarkLine([1.55, 0.15, 0], [1.55, rows * 0.62, 0], "#2ad8c2");
      ctx.addLandmarkLine([-3.5, 0.08, 0], [5.6, 0.08, 0], "#ff5c5c");

      return {
        actions: {
          fire: () => {
            setBodyPose(ctx.world, projectile, [-7.2, 1.15, numberParam(ctx.params, "sideAim")]);
            ctx.world.setBodyVelocity(
              projectile.body,
              [numberParam(ctx.params, "launchSpeed"), numberParam(ctx.params, "launchLift"), -numberParam(ctx.params, "sideAim") * 0.85],
              [0, 0, 0]
            );
            shots += 1;
          },
          reset: () => undefined
        },
        update: () => {
          fallen = 0;
          for (const block of blocks) {
            const p = block.transform.position;
            const d = Math.hypot(p[0] - block.origin[0], p[1] - block.origin[1], p[2] - block.origin[2]);
            if (d > 0.24 || p[1] < 0.12 || Math.abs(p[0]) > 6.5 || Math.abs(p[2]) > 4.9) {
              fallen += 1;
            }
          }
        },
        metrics: () => ({
          Blocks: blocks.length,
          Fallen: fallen,
          Shots: shots,
          "Ball speed": formatSpeed(ctx.world.getBodySpeed(projectile.body))
        })
      };
    }
  };
