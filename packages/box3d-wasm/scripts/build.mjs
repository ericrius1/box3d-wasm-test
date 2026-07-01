import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor", "box3d");
const srcDir = join(vendor, "src");
const includeDir = join(vendor, "include");
const bridge = join(root, "native", "box3d_bridge.c");
const human = join(root, "native", "human.c");
const dist = join(root, "dist");
const outFile = join(dist, "box3d.mjs");
const typeFile = join(dist, "box3d.d.mts");

mkdirSync(dist, { recursive: true });
rmSync(outFile, { force: true });

const sourceFiles = readdirSync(srcDir)
  .filter((file) => file.endsWith(".c"))
  .sort()
  .map((file) => join(srcDir, file));

const exportedFunctions = [
  "_malloc",
  "_free",
  "_b3w_create_world",
  "_b3w_destroy_world",
  "_b3w_step_world",
  "_b3w_create_box",
  "_b3w_create_sphere",
  "_b3w_destroy_body",
  "_b3w_set_body_transform",
  "_b3w_set_body_velocity",
  "_b3w_apply_impulse",
  "_b3w_apply_angular_impulse",
  "_b3w_explode",
  "_b3w_get_body_transform",
  "_b3w_get_body_transform_component",
  "_b3w_get_body_speed",
  "_b3w_get_world_count",
  "_b3w_create_capsule",
  "_b3w_get_body_transforms",
  "_b3w_get_body_velocity",
  "_b3w_apply_force",
  "_b3w_apply_impulse_at_point",
  "_b3w_set_body_awake",
  "_b3w_body_is_awake",
  "_b3w_get_body_mass",
  "_b3w_create_spherical_joint",
  "_b3w_create_distance_joint",
  "_b3w_destroy_joint",
  "_b3w_set_body_gravity_scale",
  "_b3w_get_body_capsule",
  "_b3w_spawn_human",
  "_b3w_human_bone_count",
  "_b3w_human_set_velocity",
  "_b3w_human_apply_random_impulse",
  "_b3w_set_hit_event_threshold",
  "_b3w_body_enable_hit_events",
  "_b3w_get_hit_events"
];

const exportedRuntimeMethods = ["HEAPF32", "HEAP32"];

const args = [
  bridge,
  human,
  ...sourceFiles,
  "-I",
  includeDir,
  "-I",
  srcDir,
  "-I",
  join(root, "native"),
  "-O3",
  "-std=gnu17",
  "-ffp-contract=off",
  "-msimd128",
  "-msse2",
  "-s",
  "FILESYSTEM=0",
  "-s",
  "MODULARIZE=1",
  "-s",
  "EXPORT_ES6=1",
  "-s",
  "EXPORT_NAME=createBox3DModule",
  "-s",
  "ENVIRONMENT=web,worker",
  "-s",
  "ALLOW_MEMORY_GROWTH=1",
  "-s",
  "SINGLE_FILE=1",
  "-s",
  `EXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
  "-s",
  `EXPORTED_RUNTIME_METHODS=${JSON.stringify(exportedRuntimeMethods)}`,
  "-o",
  outFile
];

const result = spawnSync("emcc", args, {
  cwd: root,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

writeFileSync(
  typeFile,
  [
    "declare const createBox3DModule: () => Promise<unknown>;",
    "export default createBox3DModule;",
    ""
  ].join("\n")
);
