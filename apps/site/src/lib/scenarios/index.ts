import type { ScenarioCategory } from "./types";
import { landingLabScenario } from "./landing-lab";
import { castlesiegeScenario } from "./castle-siege";
import { sumorumbleScenario } from "./sumo-rumble";
import { stackfallScenario } from "./stackfall";
import { wreckingballScenario } from "./wrecking-ball";
import { bowlinglaneScenario } from "./bowling-lane";
import { pinballwellScenario } from "./pinball-well";
import { blastlabScenario } from "./blast-lab";
import { gravitychamberScenario } from "./gravity-chamber";
import { pyramidcrushScenario } from "./pyramid-crush";
import { spherestormScenario } from "./sphere-storm";
import { sampleboxstackScenario } from "./sample-box-stack";
import { samplejengaScenario } from "./sample-jenga";
import { sampledominoesScenario } from "./sample-dominoes";
import { samplerestitutionScenario } from "./sample-restitution";
import { samplebouncehouseScenario } from "./sample-bounce-house";
import { sampledistancechainScenario } from "./sample-distance-chain";
import { sampleragdollsScenario } from "./sample-ragdolls";

export * from "./types";
export * from "./helpers";

export const heroScenario = castlesiegeScenario;

export const exampleScenarios = [
  castlesiegeScenario,
  sumorumbleScenario,
  landingLabScenario,
  stackfallScenario,
  wreckingballScenario,
  bowlinglaneScenario,
  pinballwellScenario,
  blastlabScenario,
  gravitychamberScenario,
  pyramidcrushScenario,
  spherestormScenario,
  sampleboxstackScenario,
  samplejengaScenario,
  sampledominoesScenario,
  samplerestitutionScenario,
  samplebouncehouseScenario,
  sampledistancechainScenario,
  sampleragdollsScenario
];

export const scenarioCategories: { id: ScenarioCategory; title: string; blurb: string }[] = [
  {
    id: "samples",
    title: "Official Box3D samples",
    blurb: "Direct ports of scenes from the upstream Box3D samples app — same bodies, joints, and parameters, including the original 14-bone ragdoll running unmodified in WASM."
  },
  {
    id: "fun",
    title: "More examples",
    blurb: "Playable scenes built around one physics behavior each — joints, restitution, explosions, and gravity."
  },
    {
    id: "games",
    title: "Games",
    blurb:
      "Full playable games with bloom, night lighting, and scoring — every projectile, bot, and brick is a real simulated body, and the tuning panels double as performance stress dials."
  },
  {
    id: "performance",
    title: "Performance & stress",
    blurb: "Benchmarks that push body counts with instanced rendering and batched WASM transform streaming."
  }
];

export const allScenarios = [...new Set([heroScenario, ...exampleScenarios])];


export const GITHUB_REPO = "https://github.com/ericrius1/box3d-wasm-test";
export const GITHUB_BRANCH = "main";

export function scenarioSourceUrl(scenario: { id: string }): string {
  return `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/apps/site/src/lib/scenarios/${scenario.id}.ts`;
}
