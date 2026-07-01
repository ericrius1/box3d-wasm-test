import type { PhysicsWorld, Vec3 } from "box3d-wasm";
import type { ControlFolder, ScenarioParams, SimBody } from "./types";

export function numberParam(params: ScenarioParams, key: string) {
  return Number(params[key] ?? 0);
}

export function boolParam(params: ScenarioParams, key: string) {
  return Boolean(params[key]);
}

export function setBodyPose(world: PhysicsWorld, body: SimBody, position: Vec3) {
  world.setBodyTransform(body.body, position, [0, 0, 0, 1]);
  body.object.position.set(position[0], position[1], position[2]);
}

export function formatSpeed(value: number) {
  return `${value.toFixed(1)} m/s`;
}

/** Y component of the body's up axis after rotation; < ~0.75 means it tipped over. */
export function uprightness(rotation: readonly [number, number, number, number]) {
  const [x, , z] = rotation;
  return 1 - 2 * (x * x + z * z);
}

export const baseDebugControls: ControlFolder = {
  title: "Debug / overlays",
  controls: [
    { key: "paused", label: "Paused", rebuild: false },
    { key: "showLandmarks", label: "Landmarks", rebuild: false }
  ]
};


