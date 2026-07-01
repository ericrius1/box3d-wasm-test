import { BodyType } from "box3d-wasm";
import type { ScenarioDefinition, SimBody } from "./types";
import { baseDebugControls, boolParam, numberParam } from "./helpers";

export const landingLabScenario: ScenarioDefinition = {
  id: "landing-lab",
  title: "box3d-wasm",
  eyebrow: "Box3D in the browser",
  deck: "Rigid bodies, impulses, and browser-native demos with a typed WebAssembly wrapper.",
  description:
    "A compact proving ground for the package: boxes, spheres, and capsules simulated in Box3D, rendered in Three.js, and wired to real pointer input.",
  accent: "#27c7a9",
  category: "fun",
  hint: "Click or tap the pile — every blast is a real Box3D impulse",
  defaults: {
    gravity: -14,
    pieceCount: 36,
    pulseEvery: 5,
    pulsePower: 84,
    clickPower: 66,
    autoPulse: true,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Landing scene",
      controls: [
        { key: "gravity", label: "Gravity", min: -24, max: -3, step: 0.5 },
        { key: "pieceCount", label: "Pieces", min: 12, max: 72, step: 1 },
        { key: "autoPulse", label: "Auto pulse", rebuild: false },
        { key: "pulseEvery", label: "Pulse interval", min: 1.5, max: 9, step: 0.25, rebuild: false },
        { key: "pulsePower", label: "Pulse power", min: 20, max: 160, step: 2, rebuild: false },
        { key: "clickPower", label: "Click power", min: 12, max: 160, step: 2, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "pulse", title: "Pulse center" },
    { id: "rain", title: "Drop shapes" },
    { id: "reset", title: "Reset scene" }
  ],
  camera: {
    position: [9.4, 6.8, 10.2],
    target: [0.4, 1.7, 0],
    fov: 43
  },
  gravity: (params) => [0, numberParam(params, "gravity"), 0],
  setup(ctx) {
    const pieces: SimBody[] = [];
    const pieceCount = Math.round(numberParam(ctx.params, "pieceCount"));
    let lastPulse = 0;
    let clicks = 0;

    ctx.addBox({
      type: BodyType.Static,
      position: [0, -0.35, 0],
      halfExtents: [6.2, 0.3, 4.8],
      material: ctx.material("ground"),
      friction: 0.9,
      receiveShadow: true
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [-5.6, 1.05, 0],
      halfExtents: [0.2, 1.1, 4.8],
      material: ctx.material("wall"),
      friction: 0.7
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [5.6, 1.05, 0],
      halfExtents: [0.2, 1.1, 4.8],
      material: ctx.material("wall"),
      friction: 0.7
    });
    ctx.addBox({
      type: BodyType.Static,
      position: [0, 1.05, -4.55],
      halfExtents: [5.6, 1.1, 0.2],
      material: ctx.material("wall"),
      friction: 0.7
    });

    // Central emissive totem the blasts orbit around.
    for (let level = 0; level < 4; level += 1) {
      pieces.push(
        ctx.addBox({
          type: BodyType.Dynamic,
          position: [0, 0.42 + level * 0.85, 0],
          halfExtents: [0.42 - level * 0.05, 0.42, 0.42 - level * 0.05],
          material: ctx.material("accent"),
          density: 2.2,
          friction: 0.7,
          restitution: 0.05
        })
      );
    }

    const spawnPiece = (i: number, yBoost = 0) => {
      const ring = 1.6 + (i % 4) * 0.85;
      const angle = i * 2.39996; // golden angle keeps the ring evenly seeded
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring * 0.72;
      const y = 0.4 + ((i * 13) % 5) * 0.5 + yBoost;
      const material =
        i % 4 === 0
          ? ctx.material("accent")
          : i % 4 === 1
            ? ctx.material("primary")
            : i % 4 === 2
              ? ctx.material("secondary")
              : ctx.material("reward");

      if (i % 7 === 3) {
        return ctx.addCapsule({
          type: BodyType.Dynamic,
          position: [x, y + 0.2, z],
          halfHeight: 0.22,
          radius: 0.17,
          material,
          density: 1.2,
          friction: 0.5,
          restitution: 0.18
        });
      }

      if (i % 5 === 0) {
        return ctx.addSphere({
          type: BodyType.Dynamic,
          position: [x, y, z],
          radius: 0.25,
          material,
          density: 1.4,
          friction: 0.45,
          restitution: 0.3
        });
      }

      return ctx.addBox({
        type: BodyType.Dynamic,
        position: [x, y, z],
        halfExtents: [0.3, 0.24, 0.3],
        material,
        density: 1.1,
        friction: 0.62,
        restitution: 0.08
      });
    };

    for (let i = 0; i < pieceCount; i += 1) {
      pieces.push(spawnPiece(i));
    }

    ctx.addLandmarkSphere([0, 1.25, 0], 0.16, "#f4cf4d");
    ctx.addLandmarkLine([-4.9, 0.05, 0], [4.9, 0.05, 0], "#ec5f5f");

    const pulse = () => {
      ctx.world.explode([0, 0.75, 0], 5, 0.8, numberParam(ctx.params, "pulsePower"));
      lastPulse = performance.now() / 1000;
    };

    return {
      actions: {
        pulse,
        rain: () => {
          for (const piece of pieces) {
            if (!piece.dynamic) {
              continue;
            }
            const p = piece.transform.position;
            ctx.world.setBodyTransform(piece.body, [p[0] * 0.6, 5.5 + Math.random() * 3, p[2] * 0.6]);
            ctx.world.setBodyVelocity(piece.body, [0, 0, 0], [0, 0, 0]);
          }
        },
        reset: () => undefined
      },
      onPointerDown: (point, bodyHandle) => {
        clicks += 1;
        const power = numberParam(ctx.params, "clickPower");
        ctx.world.explode(point, 3.4, 0.9, power);
        if (bodyHandle !== undefined) {
          ctx.world.applyImpulseAtPoint(bodyHandle, [0, ctx.world.getBodyMass(bodyHandle) * 6, 0], point);
        }
      },
      update: (_delta, elapsed) => {
        if (boolParam(ctx.params, "autoPulse") && elapsed - lastPulse > numberParam(ctx.params, "pulseEvery")) {
          pulse();
        }
      },
      metrics: () => ({
        Pieces: pieces.length,
        Clicks: clicks,
        "Pulse power": numberParam(ctx.params, "pulsePower").toFixed(0)
      })
    };
  }
};

