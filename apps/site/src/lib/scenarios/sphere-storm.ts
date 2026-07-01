import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody, Transform, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

export const spherestormScenario: ScenarioDefinition =   {
    id: "sphere-storm",
    title: "Sphere Storm",
    eyebrow: "Streaming throughput",
    deck: "Thousands of instanced spheres circulate forever through a drain and teleport recycler.",
    description:
      "A continuous-load benchmark: spheres rain into a walled well, drain through a hole in the floor, and are teleported back to the sky. Nothing ever sleeps, so this measures sustained solver and transform-streaming throughput.",
    accent: "#5cd6ff",
    category: "performance",
    hint: "Click inside the well to blast the stream aside",
    defaults: {
      sphereCount: 1200,
      sphereSize: 0.16,
      bounce: 0.25,
      paused: false,
      showLandmarks: false
    },
    controls: [
      {
        title: "Storm",
        controls: [
          { key: "sphereCount", label: "Spheres", min: 200, max: 3000, step: 50 },
          { key: "sphereSize", label: "Sphere radius", min: 0.1, max: 0.26, step: 0.01 },
          { key: "bounce", label: "Restitution", min: 0, max: 0.7, step: 0.01 }
        ]
      },
      baseDebugControls
    ],
    actions: [
      { id: "burst", title: "Center burst" },
      { id: "reset", title: "Restart storm" }
    ],
    camera: {
      position: [11.5, 8.5, 11.5],
      target: [0, 1.5, 0],
      fov: 44
    },
    gravity: () => [0, -12, 0],
    setup(ctx) {
      const count = Math.round(numberParam(ctx.params, "sphereCount"));
      const radius = numberParam(ctx.params, "sphereSize");
      const bounce = numberParam(ctx.params, "bounce");
      const wellHalf = 3.6;
      const holeHalf = 1.1;

      // Floor slabs leave a square drain hole in the middle of the well.
      const slabThickness = 0.3;
      const rimHalf = (wellHalf - holeHalf) / 2;
      const slabY = -slabThickness;
      ctx.addBox({ type: BodyType.Static, position: [0, slabY, -(holeHalf + rimHalf)], halfExtents: [wellHalf, slabThickness, rimHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [0, slabY, holeHalf + rimHalf], halfExtents: [wellHalf, slabThickness, rimHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [-(holeHalf + rimHalf), slabY, 0], halfExtents: [rimHalf, slabThickness, holeHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });
      ctx.addBox({ type: BodyType.Static, position: [holeHalf + rimHalf, slabY, 0], halfExtents: [rimHalf, slabThickness, holeHalf], material: ctx.material("ground"), friction: 0.4, receiveShadow: true });

      // Walls keep the storm contained while it swirls toward the drain.
      const wallH = 4.4;
      ctx.addBox({ type: BodyType.Static, position: [-wellHalf - 0.18, wallH - 1, 0], halfExtents: [0.18, wallH, wellHalf + 0.36], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [wellHalf + 0.18, wallH - 1, 0], halfExtents: [0.18, wallH, wellHalf + 0.36], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, wallH - 1, -wellHalf - 0.18], halfExtents: [wellHalf, wallH, 0.18], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });
      ctx.addBox({ type: BodyType.Static, position: [0, wallH - 1, wellHalf + 0.18], halfExtents: [wellHalf, wallH, 0.18], material: ctx.material("glass"), friction: 0.1, restitution: 0.4, castShadow: false });

      // A tilted deflector under the drain sprays the falling stream outward.
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -3.4, 0],
        halfExtents: [1.3, 0.12, 1.3],
        material: ctx.material("wall"),
        rotation: [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)],
        friction: 0.1,
        restitution: 0.5
      });

      const spawn = (index: number): Vec3 => [
        ((index * 37) % 100) / 100 * (wellHalf * 1.6) - wellHalf * 0.8,
        6 + ((index * 53) % 400) / 400 * 9,
        ((index * 71) % 100) / 100 * (wellHalf * 1.6) - wellHalf * 0.8
      ];

      const storm = ctx.addInstancedSpheres({
        count,
        radius,
        material: ctx.material("accent"),
        position: spawn,
        density: 1.4,
        friction: 0.12,
        restitution: bounce,
        rollingResistance: 0.005
      });

      ctx.addLandmarkLine([-holeHalf, 0.05, -holeHalf], [holeHalf, 0.05, -holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([holeHalf, 0.05, -holeHalf], [holeHalf, 0.05, holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([holeHalf, 0.05, holeHalf], [-holeHalf, 0.05, holeHalf], "#5cd6ff");
      ctx.addLandmarkLine([-holeHalf, 0.05, holeHalf], [-holeHalf, 0.05, -holeHalf], "#5cd6ff");

      let recycled = 0;
      let cursor = 0;
      const scratch: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

      return {
        actions: {
          burst: () => ctx.world.explode([0, 1, 0], 3.5, 0.8, 60),
          reset: () => undefined
        },
        update: () => {
          // Check a rotating slice of the storm each frame; teleport drained
          // spheres back to the sky so the stream never runs dry.
          const checks = Math.min(count, 200);
          for (let i = 0; i < checks; i += 1) {
            const index = (cursor + i) % count;
            const handle = storm.bodies[index];
            ctx.world.getBodyTransform(handle, scratch);
            if (scratch.position[1] < -7) {
              const p = spawn((index * 7919 + recycled) % 10000);
              ctx.world.setBodyTransform(handle, [p[0], 12 + (recycled % 5), p[2]]);
              ctx.world.setBodyVelocity(handle, [0, 0, 0], [0, 0, 0]);
              recycled += 1;
            }
          }
          cursor = (cursor + checks) % count;
        },
        onPointerDown: (point) => {
          ctx.world.explode(point, 2.8, 0.8, 50);
        },
        metrics: () => ({
          Spheres: count,
          Recycled: recycled
        })
      };
    }
  };
