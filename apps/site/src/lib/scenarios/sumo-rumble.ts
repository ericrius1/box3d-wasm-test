import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { Quat, ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const MAX_WAVES = 8;
// Ring-out line: just under the deck (deck spans y −1..0). Detecting here
// instead of deep in the void keeps knockouts snappy and avoids the engine
// sleeping a tumbling island mid-fall where a deeper threshold never fires.
const FALL_Y = -0.8;
const GRAVITY = 15;
const BONE_PELVIS = 0;
const BONE_HEAD = 5;
const BOT_POOL_CAP = 16;
const BOT_STAGGER = 1.8;
const PLAYER_STAGGER = 0.9;
const COUNTDOWN = 3;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

type Wrestler = {
  human: number;
  bones: SimBody[];
  /** Spawn pose per bone, relative to the feet-on-ground spawn point. */
  pose: { offset: Vec3; rotation: Quat }[];
  mass: number;
  /** Pelvis rest height above the ground the feet stand on. */
  standY: number;
  /** Head rest height above the pelvis; the marionette spring target. */
  headAbove: number;
  /** Seconds of knocked-out balance left. 0 means upright and driven. */
  stagger: number;
  /** Stagger-immune seconds after a knockdown so the springs can hoist the wrestler back up. */
  recover: number;
};

export const sumorumbleScenario: ScenarioDefinition = {
  id: "sumo-rumble",
  title: "Sumo Rumble",
  eyebrow: "Arena knockout game",
  deck: "Waves of marionette-balanced ragdoll bots charge you across a neon ring — shove them off the edge without getting rung out yourself.",
  description:
    "Every wrestler in the ring is a live 14-bone ragdoll held upright by invisible marionette springs. Shove one hard enough — or tip it past the point of recovery — and its balance cuts out: it crumples, tumbles, and rolls toward the void. Each wave spawns standing at the rim, holds through a 3-2-1 countdown, then charges the glowing teal wrestler: you. Drive with camera-relative WASD, hop with Space, and click to throw a haymaker that sends the nearest bot tumbling; every knockout is a real ring-out, and if the crowd bounces you off the platform instead, the wave restarts. Turn balance strength down to watch the whole cast go from stone-footed to staggering.",
  accent: "#3affd8",
  category: "games",
  visuals: {
    lighting: "night",
    background: "#05060e",
    fog: { color: "#05060e" },
    grid: false,
    bloom: { strength: 0.9, radius: 0.55, threshold: 0.5 }
  },
  hint: "You are the glowing teal wrestler — WASD to move, click to punch, Space to hop. After the 3-2-1, bots charge: ring them out without falling.",
  defaults: {
    arenaRadius: 7.5,
    thrust: 34,
    jumpPower: 8,
    waveSize: 3,
    waveGrowth: 2,
    aggression: 10,
    balance: 1,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Arena (rebuilds)",
      controls: [
        { key: "arenaRadius", label: "Ring radius", min: 4, max: 12, step: 0.25 },
        { key: "waveSize", label: "First wave bots", min: 1, max: 8, step: 1 },
        { key: "waveGrowth", label: "Bots per wave", min: 0, max: 4, step: 1 }
      ]
    },
    {
      title: "Live tuning",
      controls: [
        { key: "thrust", label: "Shove power", min: 10, max: 60, step: 1, rebuild: false },
        { key: "jumpPower", label: "Hop power", min: 4, max: 14, step: 0.5, rebuild: false },
        { key: "aggression", label: "Bot aggression", min: 4, max: 30, step: 1, rebuild: false },
        { key: "balance", label: "Balance strength", min: 0.5, max: 1.6, step: 0.05, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "nextWave", title: "Send next wave now" },
    { id: "panic", title: "Shove the field" },
    { id: "reset", title: "Restart match" }
  ],
  camera: {
    position: [0, 14.5, 17.5],
    target: [0, 0.4, 0],
    fov: 45
  },
  gravity: () => [0, -GRAVITY, 0],
  setup(ctx) {
    const radius = numberParam(ctx.params, "arenaRadius");
    const waveSize = Math.round(numberParam(ctx.params, "waveSize"));
    const waveGrowth = Math.round(numberParam(ctx.params, "waveGrowth"));
    const botPool = Math.min(BOT_POOL_CAP, waveSize + waveGrowth * (MAX_WAVES - 1));

    // Octagon-ish ring: four rotated slabs, tops flush at y = 0.
    const slabHalfZ = radius * Math.tan(Math.PI / 8);
    const deck = ctx.colorMaterial("#2b3354", { roughness: 0.38, metalness: 0.55 });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 4;
      ctx.addBox({
        type: BodyType.Static,
        position: [0, -0.5, 0],
        halfExtents: [radius, 0.5, slabHalfZ],
        material: deck,
        rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
        friction: 0.85,
        receiveShadow: true
      });
    }

    // Neon rim + inner ring: pure visuals, no physics, bloom does the rest.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.01, 0.055, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0x37ffd6 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    ctx.scene.add(rim);
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.42, 0.03, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0xff3f8e })
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.05;
    ctx.scene.add(innerRing);

    const arenaGlowA = new THREE.PointLight(0x2bd9ff, 26, radius * 4, 2);
    arenaGlowA.position.set(-radius * 0.8, 3.4, radius * 0.8);
    const arenaGlowB = new THREE.PointLight(0xff3f8e, 22, radius * 4, 2);
    arenaGlowB.position.set(radius * 0.8, 3.2, -radius * 0.8);
    ctx.scene.add(arenaGlowA, arenaGlowB);

    // Stiffer-than-default joints read as muscle tone instead of jelly.
    const jointOptions = { frictionTorque: 7, hertz: 2, dampingRatio: 0.65 };

    const playerBody = ctx.colorMaterial("#49f2d1", { emissive: "#2bffd9", emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.2 });
    const playerHead = ctx.colorMaterial("#8dfff0", { emissive: "#3affd8", emissiveIntensity: 1.0, roughness: 0.25 });
    const botBody = ctx.colorMaterial("#ff4d63", { emissive: "#ff2440", emissiveIntensity: 0.5, roughness: 0.4 });
    const botHead = ctx.colorMaterial("#ff8093", { emissive: "#ff2440", emissiveIntensity: 1, roughness: 0.35 });

    const spawnWrestler = (position: Vec3, body: THREE.Material, head: THREE.Material): Wrestler => {
      const spawned = ctx.addHuman(position, {
        ...jointOptions,
        material: (bone) => (bone === BONE_HEAD ? head : body)
      });
      const pose = spawned.bodies.map((bone) => ({
        offset: [
          bone.origin[0] - position[0],
          bone.origin[1] - position[1],
          bone.origin[2] - position[2]
        ] as Vec3,
        rotation: [...bone.transform.rotation] as Quat
      }));
      let mass = 0;
      for (const bone of spawned.bodies) {
        mass += ctx.world.getBodyMass(bone.body);
      }
      return {
        human: spawned.human,
        bones: spawned.bodies,
        pose,
        mass,
        standY: pose[BONE_PELVIS].offset[1],
        headAbove: pose[BONE_HEAD].offset[1] - pose[BONE_PELVIS].offset[1],
        stagger: 0,
        recover: 0
      };
    };

    // Rebuilds the exact spawn pose at a new spot; joints keep relative offsets valid.
    const placeWrestler = (wrestler: Wrestler, position: Vec3) => {
      for (let i = 0; i < wrestler.bones.length; i += 1) {
        const bone = wrestler.bones[i];
        const { offset, rotation } = wrestler.pose[i];
        ctx.world.setBodyTransform(
          bone.body,
          [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]],
          rotation
        );
        ctx.world.setBodyVelocity(bone.body, [0, 0, 0], [0, 0, 0]);
      }
    };

    // Note: never force-sleep on retire. Sleep is island-based, so putting a
    // ring-out's bones to sleep also freezes whoever it was still touching —
    // including the player mid-fall. Parked bodies go still and the engine
    // sleeps them naturally once isolated.
    const setWrestlerLive = (wrestler: Wrestler, live: boolean) => {
      for (const bone of wrestler.bones) {
        bone.object.visible = live;
        ctx.world.setBodyGravityScale(bone.body, live ? 1 : 0);
        if (live) {
          ctx.world.setBodyAwake(bone.body, true);
        }
      }
    };

    const player = spawnWrestler([0, 0.02, 0], playerBody, playerHead);
    const playerLight = new THREE.PointLight(0x3affd8, 16, 9, 2);
    ctx.scene.add(playerLight);

    type Bot = { wrestler: Wrestler; active: boolean; shoveCd: number };
    const parkSpot = (index: number): Vec3 => [index * 6 - botPool * 3, -60, 40];
    const bots: Bot[] = [];
    const handleToBot = new Map<number, Bot>();
    for (let i = 0; i < botPool; i += 1) {
      const wrestler = spawnWrestler(parkSpot(i), botBody, botHead);
      const bot: Bot = { wrestler, active: false, shoveCd: 0 };
      setWrestlerLive(wrestler, false);
      bots.push(bot);
      for (const bone of wrestler.bones) {
        handleToBot.set(bone.body, bot);
      }
    }

    let wave = 0;
    let nextWave = 1;
    let knockouts = 0;
    let falls = 0;
    let state: "intermission" | "countdown" | "active" | "won" = "intermission";
    let stateTimer = 1.2;
    let activeCount = 0;

    const botsForWave = (w: number) => Math.min(botPool, waveSize + (w - 1) * waveGrowth);

    const activateBot = (bot: Bot, index: number, total: number) => {
      const angle = (index / total) * Math.PI * 2 + wave * 0.7;
      const spot = radius * 0.78;
      placeWrestler(bot.wrestler, [Math.cos(angle) * spot, 0.04, Math.sin(angle) * spot]);
      setWrestlerLive(bot.wrestler, true);
      bot.wrestler.stagger = 0;
      bot.wrestler.recover = 0;
      bot.active = true;
    };

    const retireBot = (bot: Bot, index: number) => {
      bot.active = false;
      placeWrestler(bot.wrestler, parkSpot(index));
      setWrestlerLive(bot.wrestler, false);
    };

    // Bots spawn standing at the rim and hold through a 3-2-1 countdown
    // before the charge begins; the player may reposition freely meanwhile.
    const startWave = (w: number) => {
      wave = w;
      nextWave = w + 1;
      const total = botsForWave(w);
      let spawned = 0;
      for (const bot of bots) {
        if (spawned >= total) {
          break;
        }
        if (!bot.active) {
          activateBot(bot, spawned, total);
          spawned += 1;
        }
      }
      activeCount = spawned;
      state = "countdown";
      stateTimer = COUNTDOWN;
    };

    // Also acts as the initial grace window while the first frames settle
    // (WASM warm-up can produce a few clamped, catch-up deltas).
    let respawnLock = 1.5;
    const respawnPlayer = () => {
      placeWrestler(player, [0, 0.05, 0]);
      setWrestlerLive(player, true);
      player.stagger = 0;
      player.recover = 0;
      playerAnchor = null;
      respawnLock = 0.9;
    };

    // Keyboard state lives on window so the canvas never needs focus.
    const pressed = new Set<string>();
    const trackedKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "]);
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (trackedKeys.has(key)) {
        pressed.add(key);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let hopCooldown = 0;

    // Marionette balance: a lift spring holds the pelvis at stand height while a
    // head spring pulls the head above it. A hard hit or a bad tip cuts both for
    // a stagger window, so shoves turn into real knockdowns. Returns whether the
    // wrestler is balanced (and therefore allowed to drive) this frame.
    const balanceWrestler = (wrestler: Wrestler, delta: number, allowStagger: boolean) => {
      const pelvis = wrestler.bones[BONE_PELVIS];
      const head = wrestler.bones[BONE_HEAD];
      const p = pelvis.transform.position;
      const h = head.transform.position;
      const pelvisVel = ctx.world.getBodyVelocity(pelvis.body);
      const upright = (h[1] - p[1]) / wrestler.headAbove;
      const horizontal = Math.hypot(pelvisVel.linear[0], pelvisVel.linear[2]);

      if (wrestler.stagger > 0) {
        wrestler.stagger = Math.max(0, wrestler.stagger - delta);
        if (wrestler.stagger === 0) {
          wrestler.recover = 1.4;
        }
        return false;
      }
      // Balance only acts near the deck: no mid-air hovering after a hop or a
      // launch, and no climbing back once a wrestler has dropped off the edge.
      // The lift spring is pure levitation, so it must also cut out when the
      // wrestler is shoved past the rim — otherwise ring-outs never fall.
      const overDeck = Math.hypot(p[0], p[2]) < radius;
      const grounded = overDeck && p[1] < wrestler.standY + 0.45 && p[1] > -1.2;
      if (!grounded) {
        return false;
      }

      const isPlayer = wrestler === player;
      if (wrestler.recover > 0) {
        wrestler.recover = Math.max(0, wrestler.recover - delta);
        if (upright > 0.8) {
          wrestler.recover = 0;
        }
      } else if (allowStagger && (upright < (isPlayer ? 0.4 : 0.5) || horizontal > (isPlayer ? 9 : 5.5))) {
        // Player gets forgiving thresholds; bots tip and launch easier, so a
        // committed shove reliably fells one bot even mid-scrum.
        wrestler.stagger = isPlayer ? PLAYER_STAGGER : BOT_STAGGER;
        return false;
      }

      const recovering = wrestler.recover > 0;
      const balance = numberParam(ctx.params, "balance");
      const lift = wrestler.mass * (GRAVITY + 34 * (wrestler.standY - p[1]) - 7 * pelvisVel.linear[1]) * balance;
      ctx.world.applyForce(pelvis.body, [0, Math.min(Math.max(lift, 0), wrestler.mass * GRAVITY * (recovering ? 3.2 : 2.6)), 0]);

      // Damp the head's velocity RELATIVE to the pelvis: absolute damping drags
      // the head ~0.5 m behind at running speed and reads as a fall.
      const headVel = ctx.world.getBodyVelocity(head.body);
      const gain = 30 * balance;
      const authority = wrestler.mass * 0.3;
      let fx = authority * (gain * (p[0] - h[0]) - 5.5 * (headVel.linear[0] - pelvisVel.linear[0]));
      let fy = authority * (gain * (p[1] + wrestler.headAbove - h[1]) - 5.5 * (headVel.linear[1] - pelvisVel.linear[1]));
      let fz = authority * (gain * (p[2] - h[2]) - 5.5 * (headVel.linear[2] - pelvisVel.linear[2]));
      const magnitude = Math.hypot(fx, fy, fz);
      const cap = wrestler.mass * (recovering ? 62 : 46);
      if (magnitude > cap) {
        const scale = cap / magnitude;
        fx *= scale;
        fy *= scale;
        fz *= scale;
      }
      ctx.world.applyForce(head.body, [fx, fy, fz]);
      return true;
    };

    // Horizontal drive on the pelvis. Deliberately no forward force on the
    // head: leaning the head into the charge just tips the marionette over.
    const driveWrestler = (wrestler: Wrestler, dirX: number, dirZ: number, force: number) => {
      const pelvis = wrestler.bones[BONE_PELVIS];
      ctx.world.applyForce(pelvis.body, [dirX * force, 0, dirZ * force]);
    };

    // Undriven wrestlers brake to a standstill instead of creeping around the
    // ring: the marionette springs alone produce a slow wander.
    const brakeWrestler = (wrestler: Wrestler, strength: number) => {
      const pelvis = wrestler.bones[BONE_PELVIS];
      const velocity = ctx.world.getBodyVelocity(pelvis.body);
      ctx.world.applyForce(pelvis.body, [
        -velocity.linear[0] * wrestler.mass * strength,
        0,
        -velocity.linear[2] * wrestler.mass * strength
      ]);
    };

    // Planted sumo stance: with no input the player holds a spot instead of
    // drifting, and puts up real resistance to being bulldozed. The anchor
    // re-plants once shoved more than 1.2 m so yielding ground stays possible.
    let playerAnchor: [number, number] | null = null;
    const holdStance = () => {
      const pelvis = player.bones[BONE_PELVIS];
      const p = pelvis.transform.position;
      if (!playerAnchor || Math.hypot(playerAnchor[0] - p[0], playerAnchor[1] - p[2]) > 1.2) {
        playerAnchor = [p[0], p[2]];
      }
      const velocity = ctx.world.getBodyVelocity(pelvis.body);
      let fx = player.mass * (18 * (playerAnchor[0] - p[0]) - 8 * velocity.linear[0]);
      let fz = player.mass * (18 * (playerAnchor[1] - p[2]) - 8 * velocity.linear[2]);
      const magnitude = Math.hypot(fx, fz);
      const cap = player.mass * GRAVITY * 2;
      if (magnitude > cap) {
        fx *= cap / magnitude;
        fz *= cap / magnitude;
      }
      ctx.world.applyForce(pelvis.body, [fx, 0, fz]);
    };

    // Big center-screen countdown / FIGHT! banner, mounted over the canvas.
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "pointer-events:none;user-select:none;z-index:5;opacity:0;transition:opacity 0.18s;" +
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;" +
      "font-size:clamp(64px,12vw,132px);color:#3affd8;" +
      "text-shadow:0 0 28px rgba(58,255,216,0.85),0 0 90px rgba(58,255,216,0.4);";
    const bannerHost = ctx.domElement.parentElement;
    if (bannerHost) {
      if (getComputedStyle(bannerHost).position === "static") {
        bannerHost.style.position = "relative";
      }
      bannerHost.appendChild(banner);
    }
    // Click-to-punch: a haymaker toward the clicked point. Big impulse, short
    // cooldown — this is the knockout button; WASD is for positioning.
    let punchCd = 0;
    const punch = (point: Vec3, bodyHandle?: number) => {
      if (punchCd > 0 || player.stagger > 0) {
        return;
      }
      const p = player.bones[BONE_PELVIS].transform.position;
      let dirX = point[0] - p[0];
      let dirZ = point[2] - p[2];
      let dirLen = Math.hypot(dirX, dirZ);
      if (dirLen < 0.6) {
        // Click landed on (or raycast hit) the player's own body — the
        // direction is meaningless noise. Auto-aim at the nearest bot instead.
        let bestX = 0;
        let bestZ = 0;
        let bestLen = Infinity;
        for (const bot of bots) {
          if (!bot.active) {
            continue;
          }
          const bp = bot.wrestler.bones[BONE_PELVIS].transform.position;
          const relX = bp[0] - p[0];
          const relZ = bp[2] - p[2];
          const relLen = Math.hypot(relX, relZ);
          if (relLen > 1e-3 && relLen < bestLen) {
            bestLen = relLen;
            bestX = relX;
            bestZ = relZ;
          }
        }
        if (!Number.isFinite(bestLen)) {
          return;
        }
        dirX = bestX;
        dirZ = bestZ;
        dirLen = bestLen;
      }
      dirX /= dirLen;
      dirZ /= dirLen;
      punchCd = 0.45;
      // Small lunge into the punch so it reads as the player's action.
      ctx.world.applyImpulse(player.bones[BONE_PELVIS].body, [
        dirX * player.mass * 1.1,
        0,
        dirZ * player.mass * 1.1
      ]);
      const clicked = bodyHandle !== undefined ? handleToBot.get(bodyHandle) : undefined;
      for (const bot of bots) {
        if (!bot.active) {
          continue;
        }
        const bp = bot.wrestler.bones[BONE_PELVIS].transform.position;
        const relX = bp[0] - p[0];
        const relZ = bp[2] - p[2];
        const relLen = Math.hypot(relX, relZ);
        const inArc = relLen < 2 && (relX * dirX + relZ * dirZ) / Math.max(relLen, 1e-4) > 0.35;
        if (bot === clicked ? relLen < 2.6 : inArc) {
          ctx.world.applyImpulse(bot.wrestler.bones[BONE_PELVIS].body, [
            dirX * bot.wrestler.mass * 9,
            bot.wrestler.mass * 1.6,
            dirZ * bot.wrestler.mass * 9
          ]);
          bot.wrestler.stagger = Math.max(bot.wrestler.stagger, 2.2);
          bot.wrestler.recover = 0;
        }
      }
    };

    let bannerText = "";
    let fightFlash = 0;
    const setBanner = (text: string, color?: string) => {
      if (text !== bannerText) {
        bannerText = text;
        banner.textContent = text;
        if (color) {
          banner.style.color = color;
        }
      }
      banner.style.opacity = text ? "1" : "0";
    };

    return {
      actions: {
        nextWave: () => {
          if (state === "active" || state === "intermission") {
            for (const [index, bot] of bots.entries()) {
              if (bot.active) {
                retireBot(bot, index);
              }
            }
            state = "intermission";
            stateTimer = 0.1;
          }
        },
        panic: () => {
          for (const bot of bots) {
            if (bot.active) {
              ctx.world.humanApplyRandomImpulse(bot.wrestler.human, 25);
              bot.wrestler.stagger = BOT_STAGGER;
            }
          }
        },
        reset: () => undefined
      },
      onPointerDown: (point, bodyHandle) => {
        punch(point, bodyHandle);
      },
      update: (delta) => {
        hopCooldown = Math.max(0, hopCooldown - delta);
        punchCd = Math.max(0, punchCd - delta);
        respawnLock = Math.max(0, respawnLock - delta);

        const playerBalanced = balanceWrestler(player, delta, respawnLock === 0);
        const pelvis = player.bones[BONE_PELVIS];
        const playerPos = pelvis.transform.position;

        // Camera-relative drive: orbiting the view re-maps WASD naturally.
        ctx.camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) {
          forward.set(0, 0, -1);
        }
        forward.normalize();
        right.crossVectors(forward, up).normalize();

        let inputX = 0;
        let inputZ = 0;
        if (pressed.has("w") || pressed.has("arrowup")) inputZ += 1;
        if (pressed.has("s") || pressed.has("arrowdown")) inputZ -= 1;
        if (pressed.has("d") || pressed.has("arrowright")) inputX += 1;
        if (pressed.has("a") || pressed.has("arrowleft")) inputX -= 1;

        let driveX = 0;
        let driveZ = 0;
        let driving = false;
        if (playerBalanced) {
          if ((inputX !== 0 || inputZ !== 0) && respawnLock === 0) {
            const norm = 1 / Math.hypot(inputX, inputZ);
            driveX = (forward.x * inputZ + right.x * inputX) * norm;
            driveZ = (forward.z * inputZ + right.z * inputX) * norm;
            driving = true;
            // Soft speed cap on velocity ALONG the input direction only: top
            // speed stays ~5.5 m/s, but steering against your momentum keeps
            // full force — otherwise one hard launch is unrecoverable because
            // the brakes cut out exactly when you need them.
            const velocity = ctx.world.getBodyVelocity(pelvis.body);
            const along = velocity.linear[0] * driveX + velocity.linear[2] * driveZ;
            const headroom = Math.min(1.2, Math.max(0, 1 - along / 5.5));
            const thrust = numberParam(ctx.params, "thrust") * player.mass * headroom;
            driveWrestler(player, driveX, driveZ, thrust);
            playerAnchor = null;
          } else {
            holdStance();
          }
        } else {
          playerAnchor = null;
        }

        if (pressed.has(" ") && hopCooldown === 0 && playerBalanced && playerPos[1] < player.standY + 0.35) {
          const velocity = ctx.world.getBodyVelocity(pelvis.body);
          if (Math.abs(velocity.linear[1]) < 1.5) {
            ctx.world.applyImpulse(pelvis.body, [0, numberParam(ctx.params, "jumpPower") * player.mass, 0]);
            hopCooldown = 0.45;
          }
        }

        playerLight.position.set(playerPos[0], playerPos[1] + 1.1, playerPos[2]);

        if (playerPos[1] < FALL_Y) {
          // Ring-out on the player: the wave doesn't stay cleared for free —
          // clear the field, respawn, and replay the same wave.
          falls += 1;
          respawnPlayer();
          if (state === "active" || state === "countdown") {
            for (const [index, bot] of bots.entries()) {
              if (bot.active) {
                retireBot(bot, index);
              }
            }
            activeCount = 0;
            nextWave = Math.max(1, wave);
            state = "intermission";
            stateTimer = 1.2;
          }
        }

        const aggression = numberParam(ctx.params, "aggression");
        const playerDown = player.stagger > 0 || player.recover > 0;
        type Fighter = { bot: Bot; length: number; dx: number; dz: number };
        const fighters: Fighter[] = [];
        for (const [index, bot] of bots.entries()) {
          if (!bot.active) {
            continue;
          }
          const botPelvis = bot.wrestler.bones[BONE_PELVIS];
          const botPos = botPelvis.transform.position;
          if (botPos[1] < FALL_Y) {
            retireBot(bot, index);
            knockouts += 1;
            activeCount -= 1;
            continue;
          }

          // The shove: driving into a bot knocks it down and sends it sliding.
          // This is the player's offense — line one up near the rim and commit.
          bot.shoveCd = Math.max(0, bot.shoveCd - delta);
          if (driving && bot.shoveCd === 0) {
            const relX = botPos[0] - playerPos[0];
            const relZ = botPos[2] - playerPos[2];
            const relLen = Math.hypot(relX, relZ);
            // Reach must exceed the ragdolls' collision envelope (~1.4 m pelvis
            // to pelvis once arms touch) or the collision always wins first.
            if (relLen < 1.65 && (relX * driveX + relZ * driveZ) / Math.max(relLen, 1e-4) > 0.35) {
              // Scale with the Shove power slider (3.8 at the default of 30).
              const punch = numberParam(ctx.params, "thrust") * 0.127;
              ctx.world.applyImpulse(botPelvis.body, [
                driveX * bot.wrestler.mass * punch,
                bot.wrestler.mass * 0.7,
                driveZ * bot.wrestler.mass * punch
              ]);
              bot.wrestler.stagger = Math.max(bot.wrestler.stagger, 1.2);
              bot.wrestler.recover = 0;
              bot.shoveCd = 0.55;
            }
          }

          const balanced = balanceWrestler(bot.wrestler, delta, true);
          if (!balanced) {
            continue;
          }
          if (state !== "active" || playerDown) {
            // Hold for the countdown — and back off while the player is down.
            // Without the mercy window, one knockdown becomes a guaranteed
            // bulldoze off the rim and the game stops being winnable.
            brakeWrestler(bot.wrestler, 5);
            continue;
          }
          const dx = playerPos[0] - botPos[0];
          const dz = playerPos[2] - botPos[2];
          fighters.push({ bot, length: Math.hypot(dx, dz), dx, dz });
        }

        // Attack tickets: only the two nearest bots press the player at once.
        // An unlimited gang-grapple out-muscles the planted stance so hard
        // that any surround is an automatic loss; the rest loiter just outside
        // the scrum waiting for an opening.
        fighters.sort((a, b) => a.length - b.length);
        for (const [rank, fighter] of fighters.entries()) {
          const { bot, length, dx, dz } = fighter;
          if (length < 1.2) {
            if (rank < 2) {
              // In grapple range: bulldoze radially outward, through the
              // player toward the nearest rim — a sumo push-out, not a pile.
              const playerR = Math.hypot(playerPos[0], playerPos[2]);
              let pushX = dx / length;
              let pushZ = dz / length;
              if (playerR > 0.2) {
                pushX = pushX * 0.35 + (playerPos[0] / playerR) * 0.65;
                pushZ = pushZ * 0.35 + (playerPos[2] / playerR) * 0.65;
                const norm = Math.hypot(pushX, pushZ);
                pushX /= norm;
                pushZ /= norm;
              }
              driveWrestler(bot.wrestler, pushX, pushZ, aggression * bot.wrestler.mass * 1.15);
            } else {
              brakeWrestler(bot.wrestler, 3);
            }
          } else if (rank < 2 || length > 2.4) {
            const botPelvis = bot.wrestler.bones[BONE_PELVIS];
            const velocity = ctx.world.getBodyVelocity(botPelvis.body);
            const along = (velocity.linear[0] * dx + velocity.linear[2] * dz) / length;
            const headroom = Math.min(1.2, Math.max(0, 1 - along / 3.6));
            const force = aggression * bot.wrestler.mass * headroom;
            driveWrestler(bot.wrestler, dx / length, dz / length, force);
          } else {
            // Off-ticket and close: hover at the edge of the scrum.
            brakeWrestler(bot.wrestler, 3);
          }
        }

        if ((state === "active" || state === "countdown") && activeCount === 0) {
          state = wave >= MAX_WAVES ? "won" : "intermission";
          stateTimer = 1.4;
        } else if (state === "countdown") {
          stateTimer -= delta;
          if (stateTimer <= 0) {
            state = "active";
            fightFlash = 0.9;
          }
        } else if (state === "intermission") {
          stateTimer -= delta;
          if (stateTimer <= 0) {
            startWave(nextWave);
          }
        }

        fightFlash = Math.max(0, fightFlash - delta);
        if (state === "countdown") {
          setBanner(`${Math.ceil(stateTimer)}`, "#3affd8");
        } else if (state === "active" && fightFlash > 0) {
          setBanner("FIGHT!", "#ff3f8e");
        } else if (state === "won") {
          setBanner("VICTORY 🏆", "#3affd8");
        } else {
          setBanner("");
        }
      },
      metrics: () => ({
        Wave: state === "won" ? `Cleared ${MAX_WAVES}/${MAX_WAVES} 🏆` : `${wave}/${MAX_WAVES}`,
        Round:
          state === "countdown"
            ? `${Math.ceil(stateTimer)}…`
            : state === "active"
              ? "Fight!"
              : state === "won"
                ? "Victory"
                : "Get ready",
        Bots: activeCount,
        "Ring-outs": knockouts,
        Falls: falls,
        You: player.stagger > 0 ? "Down!" : player.recover > 0 ? "Getting up" : "Standing",
        Speed: `${ctx.world.getBodySpeed(player.bones[BONE_PELVIS].body).toFixed(1)} m/s`
      }),
      dispose: () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        banner.remove();
      }
    };
  }
};
