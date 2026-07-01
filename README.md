# box3d-wasm

`box3d-wasm` is a unified npm package and Vercel-ready demo site for Box3D in the browser. It wraps the vendored Box3D C source with a small TypeScript API, ships a checked-in single-file Emscripten module, and includes vanilla TypeScript Three.js examples with Stats.js and scenario-specific Tweakpane controls.

This project is a WebAssembly port of upstream [Box3D](https://github.com/erincatto/box3d), the open-source 3D physics engine by Erin Catto. See the [official site and docs](https://box2d.org/) and the [Announcing Box3D](https://box2d.org/posts/2026/06/announcing-box3d/) post for background on the engine.

## What is included

- `packages/box3d-wasm`: publishable library package, TypeScript wrapper, C bridge, WASM build script, and vendored Box3D source.
- `apps/site`: vanilla TypeScript interactive landing page, examples index, standalone scenario pages, and docs.
- `vercel.json`: Vercel build configuration with SPA rewrites for deep example links.

## Quick start

```bash
npm install
npm run dev
```

The dev server starts the site from `apps/site`. The site imports the local package through the same public API consumers use.

## Build

```bash
npm run build
```

This compiles the TypeScript wrapper and builds the Vite site. It does not require Emscripten because `packages/box3d-wasm/dist/box3d.mjs` is checked in.

To regenerate the WASM module after changing the C bridge or vendored Box3D source:

```bash
npm --workspace box3d-wasm run build:wasm
```

That command requires `emcc`.

## Library usage

```ts
import { BodyType, createBox3D } from "box3d-wasm";

const box3d = await createBox3D();
const world = box3d.createWorld([0, -10, 0]);

const body = world.createSphere({
  type: BodyType.Dynamic,
  position: [0, 4, 0],
  radius: 0.5,
  density: 1,
  restitution: 0.35
});

world.applyImpulse(body, [6, 4, 0]);
world.step(1 / 60, 4);

const transform = world.getBodyTransform(body);
```

The wrapper also exposes:

- `world.createCapsule({ halfHeight, radius, ... })` for capsule bodies.
- `world.createSphericalJoint(bodyA, bodyB, worldAnchor, { hertz, dampingRatio })` and `world.createDistanceJoint(bodyA, bodyB, anchorA, anchorB, { length, hertz, dampingRatio })` for chains, pendulums, and springs.
- `world.applyForce`, `world.applyImpulseAtPoint`, `world.getBodyVelocity`, `world.getBodyMass`, `world.setBodyAwake`, and `world.isBodyAwake`.
- `world.createTransformBatch(handles)` — reads position, rotation, and awake state for any number of bodies in a single WASM call per frame. This is the fast path for rendering; per-body getters cross the JS/WASM boundary once per call, while a batch crosses once per frame.

## Examples

Fun and interactive:

- Stackfall Yard: launcher impulse into a block tower.
- Wrecking Ball: spherical-joint chain with a heavy ball smashing a brick wall.
- Bowling Lane: capsule pins, hook spin, and fall detection from body rotations.
- Pinball Well: restitution and bullet-body behavior.
- Blast Lab: radial explosion tuning.
- Gravity Chamber: nonstandard gravity vectors inside a sealed volume.

Performance and stress:

- Pyramid Crush: up to ~2,900 instanced boxes in a pyramid, one InstancedMesh, batched transform streaming, and a cannonball.
- Sphere Storm: thousands of spheres circulating forever through a drain-and-teleport recycler.

Each example has its own settings schema, Tweakpane folders, actions, and persisted defaults. Every stage is clickable — pointer taps raycast into the scene and fire real impulses. The renderer uses latest Three.js WebGPU/TSL node materials when available and falls back to WebGL. Pressing `.` resets stored settings to the current source defaults.

## Deploy

Push this repo to GitHub, then import it in Vercel. The configured output directory is `apps/site/dist`.
