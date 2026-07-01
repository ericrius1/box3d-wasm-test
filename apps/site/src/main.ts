import {
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  ExternalLink,
  Github,
  Gauge,
  Package,
  Play,
  Zap,
  createIcons
} from "lucide";
import { PhysicsStage } from "./components/physicsStage";
import {
  exampleScenarios,
  heroScenario,
  scenarioCategories,
  type ScenarioDefinition
} from "./lib/scenarios";
import "./styles.css";

const GITHUB_URL = "https://github.com/ericrius1/box3d-wasm";
const NPM_URL = "https://www.npmjs.com/package/box3d-wasm";
const BOX3D_REPO_URL = "https://github.com/erincatto/box3d";
const BOX3D_SITE_URL = "https://box2d.org/";
const BOX3D_ANNOUNCEMENT_URL = "https://box2d.org/posts/2026/06/announcing-box3d/";
const root = document.querySelector<HTMLDivElement>("#root")!;

let activeStage: PhysicsStage | undefined;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function icon(name: string) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function internalLink(href: string, className: string, label: string) {
  return `<a href="${href}" class="${className}" data-route>${label}</a>`;
}

function externalLink(href: string, className: string, label: string) {
  return `<a href="${href}" class="${className}" target="_blank" rel="noreferrer">${label}</a>`;
}

function headerMarkup() {
  return `
    <header class="site-header">
      ${internalLink("/", "brand-lockup", `<span class="brand-mark">${icon("boxes")}</span><span>box3d-wasm</span>`)}
      <nav class="site-nav" aria-label="Primary navigation">
        ${internalLink("/examples", "", "Examples")}
        ${internalLink("/docs", "", "Docs")}
        ${externalLink(GITHUB_URL, "", `${icon("github")}GitHub`)}
      </nav>
    </header>
  `;
}

function exampleCard(scenario: ScenarioDefinition) {
  return `
    <a href="/examples/${scenario.id}" class="example-card" data-route>
      <span class="example-accent" style="background:${scenario.accent}"></span>
      <span class="eyebrow">${escapeHtml(scenario.eyebrow)}</span>
      <strong>${escapeHtml(scenario.title)}</strong>
      <span>${escapeHtml(scenario.deck)}</span>
      <span class="card-link">Run scenario ${icon("arrow-right")}</span>
    </a>
  `;
}

function categorizedExampleGrids(wide: boolean) {
  return scenarioCategories
    .map((category) => {
      const scenarios = exampleScenarios.filter((scenario) => scenario.category === category.id);
      if (scenarios.length === 0) {
        return "";
      }

      return `
        <div class="category-block">
          <div class="category-heading">
            <h3>${escapeHtml(category.title)}</h3>
            <p>${escapeHtml(category.blurb)}</p>
          </div>
          <div class="example-grid${wide ? " example-grid--wide" : ""}">
            ${scenarios.map(exampleCard).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function homeMarkup() {
  return `
    ${headerMarkup()}
    <section class="hero-section">
      <div class="hero-stage" id="hero-stage-host"></div>
      <div class="hero-copy">
        <p class="eyebrow">Box3D C17 physics compiled to WebAssembly</p>
        <h1>box3d-wasm</h1>
        <p class="hero-deck">A unified TypeScript package and demo site for fast rigid-body experiments in browser games, tools, and prototypes.</p>
        <p class="upstream-credit">WebAssembly port of ${externalLink(BOX3D_REPO_URL, "text-link", "Box3D")}, the open-source 3D physics engine by Erin Catto. See the ${externalLink(BOX3D_SITE_URL, "text-link", "official site")} and ${externalLink(BOX3D_ANNOUNCEMENT_URL, "text-link", "announcement post")}.</p>
        <div class="hero-actions">
          ${internalLink("/examples", "button button--primary", `${icon("play")}Open examples`)}
          ${internalLink("/docs", "button", `${icon("book-open")}Read docs`)}
          ${externalLink(GITHUB_URL, "button button--ghost", `${icon("github")}GitHub`)}
        </div>
      </div>
    </section>
    <section class="feature-strip" aria-label="Project summary">
      <div>${icon("package")}<span>Publishable npm package</span></div>
      <div>${icon("gauge")}<span>WebGPU/TSL with WebGL fallback</span></div>
      <div>${icon("braces")}<span>Typed world, body, and impulse APIs</span></div>
    </section>
    <section class="content-section">
      <div class="section-heading">
        <p class="eyebrow">Separated scenarios</p>
        <h2>Examples built around real tuning jobs</h2>
        <p>Each page isolates one physics question and ships with scenario-specific controls, actions, persisted settings, and debug landmarks. Fun scenes show off joints, capsules, and explosions; performance scenes stream thousands of instanced bodies.</p>
      </div>
      ${categorizedExampleGrids(false)}
    </section>
  `;
}

function examplesIndexMarkup() {
  return `
    ${headerMarkup()}
    <main class="page-shell">
      <div class="page-heading">
        <p class="eyebrow">Examples</p>
        <h1>Scenario pages</h1>
        <p>Original Box3D WASM demos modeled after the split-example style: one page, one physics behavior, one control surface. Every stage is clickable — pointer taps fire real impulses into the simulation.</p>
      </div>
      ${categorizedExampleGrids(true)}
    </main>
  `;
}

function codeSnippet(scenario: ScenarioDefinition) {
  const gravity = scenario.gravity(scenario.defaults);
  return `import { BodyType, createBox3D } from "box3d-wasm";

const box3d = await createBox3D();
const world = box3d.createWorld([${gravity.map((value) => Number(value).toFixed(1)).join(", ")}]);

const floor = world.createBox({
  type: BodyType.Static,
  position: [0, -0.5, 0],
  halfExtents: [5, 0.5, 5],
  friction: 0.8
});

const ball = world.createSphere({
  type: BodyType.Dynamic,
  position: [0, 4, 0],
  radius: 0.5,
  density: 1,
  restitution: 0.35
});

world.applyImpulse(ball, [8, 3, 0]);
world.step(1 / 60, 4);`;
}

function examplePageMarkup(scenario: ScenarioDefinition) {
  return `
    ${headerMarkup()}
    <main class="example-page">
      <section class="example-hero">
        <div class="example-stage-wrap" id="example-stage-host"></div>
        <aside class="example-info">
          <p class="eyebrow">${escapeHtml(scenario.eyebrow)}</p>
          <h1>${escapeHtml(scenario.title)}</h1>
          <p>${escapeHtml(scenario.description)}</p>
          <div class="info-actions">
            ${internalLink("/examples", "button", `${icon("arrow-right")}All examples`)}
            ${externalLink(GITHUB_URL, "button button--ghost", `${icon("github")}Source`)}
          </div>
          <pre class="code-sample"><code>${escapeHtml(codeSnippet(scenario))}</code></pre>
        </aside>
      </section>
    </main>
  `;
}

function docsMarkup() {
  return `
    ${headerMarkup()}
    <main class="page-shell docs-layout">
      <div class="page-heading">
        <p class="eyebrow">Docs</p>
        <h1>Use the package</h1>
        <p><code>box3d-wasm</code> wraps the vendored Box3D C engine with a small browser-first TypeScript API. The site uses latest Three.js WebGPU/TSL materials where available and falls back to WebGL.</p>
      </div>
      <section class="docs-grid">
        <article>
          <h2>Install</h2>
          <pre class="code-sample"><code>npm install box3d-wasm</code></pre>
          <p>The monorepo uses npm workspaces. The site imports the local package through the same public API exposed to consumers.</p>
        </article>
        <article>
          <h2>Create a world</h2>
          <pre class="code-sample"><code>${escapeHtml(`import { BodyType, createBox3D } from "box3d-wasm";

const box3d = await createBox3D();
const world = box3d.createWorld([0, -10, 0]);

const body = world.createBox({
  type: BodyType.Dynamic,
  position: [0, 4, 0],
  halfExtents: [0.5, 0.5, 0.5]
});

world.step(1 / 60, 4);
const transform = world.getBodyTransform(body);`)}</code></pre>
        </article>
        <article>
          <h2>Joints and capsules</h2>
          <pre class="code-sample"><code>${escapeHtml(`const pin = world.createCapsule({
  type: BodyType.Dynamic,
  position: [0, 0.5, 0],
  halfHeight: 0.24,
  radius: 0.14
});

// Ball-and-socket chain link at a world anchor
world.createSphericalJoint(bodyA, bodyB, [0, 4, 0]);

// Springy rope with rest length
world.createDistanceJoint(bodyA, bodyB,
  [0, 4, 0], [0, 2, 0],
  { length: 2, hertz: 4, dampingRatio: 0.5 });`)}</code></pre>
        </article>
        <article>
          <h2>Batched transforms</h2>
          <pre class="code-sample"><code>${escapeHtml(`// One WASM call per frame for any number of bodies
const batch = world.createTransformBatch(handles);

// Each body: px py pz qx qy qz qw awake (stride 8)
const data = batch.read();

batch.dispose();`)}</code></pre>
          <p>The demo stages stream every dynamic body through a single batch each frame — roughly 5x faster than per-body getters at 500 bodies, and the gap grows with body count.</p>
        </article>
        <article>
          <h2>Rebuild WASM</h2>
          <pre class="code-sample"><code>npm --workspace box3d-wasm run build:wasm</code></pre>
          <p>This command requires <code>emcc</code>. Normal <code>npm run build</code> compiles TypeScript and builds the Vite site from the checked-in generated module.</p>
        </article>
        <article>
          <h2>Repository shape</h2>
          <ul class="docs-list">
            <li><strong>packages/box3d-wasm</strong><span>Library wrapper, Emscripten output, C bridge, and vendored Box3D source.</span></li>
            <li><strong>apps/site</strong><span>Vanilla TypeScript landing page, docs, split examples, Three.js renderer, Tweakpane, and Stats.js.</span></li>
          </ul>
        </article>
      </section>
      <div class="docs-actions">
        ${externalLink(GITHUB_URL, "button button--primary", `${icon("github")}Open GitHub ${icon("external-link")}`)}
        ${externalLink(NPM_URL, "button", `${icon("package")}npm package ${icon("external-link")}`)}
      </div>
    </main>
  `;
}

function notFoundMarkup() {
  return `
    ${headerMarkup()}
    <main class="page-shell">
      <div class="page-heading">
        <p class="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The route does not exist in this site.</p>
      </div>
      ${internalLink("/", "button button--primary", `${icon("arrow-right")}Home`)}
    </main>
  `;
}

function renderRoute() {
  activeStage?.destroy();
  activeStage = undefined;

  const pathname = window.location.pathname;
  const exampleMatch = pathname.match(/^\/examples\/([^/]+)$/);
  let scenarioToMount: ScenarioDefinition | undefined;
  let mountSelector = "";

  if (pathname === "/") {
    root.innerHTML = homeMarkup();
    scenarioToMount = heroScenario;
    mountSelector = "#hero-stage-host";
  } else if (pathname === "/examples") {
    root.innerHTML = examplesIndexMarkup();
  } else if (pathname === "/docs") {
    root.innerHTML = docsMarkup();
  } else if (exampleMatch) {
    const scenario = exampleScenarios.find((entry) => entry.id === exampleMatch[1]);
    if (scenario) {
      root.innerHTML = examplePageMarkup(scenario);
      scenarioToMount = scenario;
      mountSelector = "#example-stage-host";
    } else {
      root.innerHTML = notFoundMarkup();
    }
  } else {
    root.innerHTML = notFoundMarkup();
  }

  createIcons({
    icons: {
      ArrowRight,
      BookOpen,
      Boxes,
      Braces,
      ExternalLink,
      Github,
      Gauge,
      Package,
      Play,
      Zap
    }
  });

  if (scenarioToMount) {
    const mount = document.querySelector<HTMLElement>(mountSelector);
    if (mount) {
      activeStage = new PhysicsStage(mount, scenarioToMount, scenarioToMount === heroScenario ? "hero" : "example");
    }
  }
}

document.addEventListener("click", (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-route]");
  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  if (link.pathname !== window.location.pathname) {
    window.history.pushState({}, "", link.pathname);
  }
  window.scrollTo({ top: 0 });
  renderRoute();
});

window.addEventListener("popstate", renderRoute);
renderRoute();

