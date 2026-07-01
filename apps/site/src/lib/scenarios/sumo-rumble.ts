import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { Quat, ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const MAX_WAVES = 8;
const FALL_Y = -5;
const GRAVITY = 15;
const BONE_PELVIS = 0;
const BONE_HEAD = 5;
const BOT_POOL_CAP = 16;
const BOT_STAGGER = 1.6;
const PLAYER_STAGGER = 0.9;

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
  deck: "Waves of marionette-balanced ragdoll bots charge you across a neon ring — shove them off the edge and stay standing.",
  description:
    "Every wrestler in the ring is a live 14-bone ragdoll held upright by invisible marionette springs. Shove one hard enough — or tip it past the point of recovery — and its balance cuts out: it crumples, tumbles, and rolls toward the void. You drive the glowing teal wrestler with camera-relative WASD shoves and a hop; crimson bots charge straight at you in growing waves, and every knockout is a real ring-out. Turn balance strength down to watch the whole cast go from stone-footed to staggering.",
  accent: "#3affd8",
  category: "games",
  visuals: {
    lighting: "night",
    background: "#05060e",
    fog: { color: "#05060e" },
    grid: false,
    bloom: { strength: 0.9, radius: 0.55, threshold: 0.5 }
  },
  hint: "You are the glowing teal wrestler — WASD / arrows to shove, Space to hop. Knock every crimson bot off the ring.",
  defaults: {
    arenaRadius: 6,
    thrust: 30,
    jumpPower: 8,
    waveSize: 3,
    waveGrowth: 2,
    aggression: 12,
    balance: 1,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Arena (rebuilds)",
      controls: [
        { key: "arenaRadius", label: "Ring radius", min: 4, max: 9, step: 0.25 },
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
    position: [0, 12.5, 15],
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

    const setWrestlerLive = (wrestler: Wrestler, live: boolean) => {
      for (const bone of wrestler.bones) {
        bone.object.visible = live;
        ctx.world.setBodyGravityScale(bone.body, live ? 1 : 0);
        ctx.world.setBodyAwake(bone.body, live);
      }
    };

    const player = spawnWrestler([0, 0.02, 0], playerBody, playerHead);
    const playerLight = new THREE.PointLight(0x3affd8, 16, 9, 2);
    ctx.scene.add(playerLight);

    type Bot = { wrestler: Wrestler; active: boolean };
    const parkSpot = (index: number): Vec3 => [index * 6 - botPool * 3, -60, 40];
    const bots: Bot[] = [];
    for (let i = 0; i < botPool; i += 1) {
      const wrestler = spawnWrestler(parkSpot(i), botBody, botHead);
      const bot: Bot = { wrestler, active: false };
      setWrestlerLive(wrestler, false);
      bots.push(bot);
    }

    let wave = 0;
    let knockouts = 0;
    let falls = 0;
    let state: "intermission" | "active" | "won" = "intermission";
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

    const startWave = (w: number) => {
      wave = w;
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
      state = "active";
    };

    // Also acts as the initial grace window while the first frames settle
    // (WASM warm-up can produce a few clamped, catch-up deltas).
    let respawnLock = 1.5;
    const respawnPlayer = () => {
      placeWrestler(player, [0, 0.05, 0]);
      setWrestlerLive(player, true);
      player.stagger = 0;
      player.recover = 0;
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
      const grounded = p[1] < wrestler.standY + 0.45 && p[1] > -1.2;
      if (!grounded) {
        return false;
      }

      const isPlayer = wrestler === player;
      if (wrestler.recover > 0) {
        wrestler.recover = Math.max(0, wrestler.recover - delta);
        if (upright > 0.8) {
          wrestler.recover = 0;
        }
      } else if (allowStagger && (upright < 0.45 || horizontal > (isPlayer ? 7 : 5.5))) {
        // Player gets a forgiving speed threshold; bots knock down easier.
        wrestler.stagger = isPlayer ? PLAYER_STAGGER : BOT_STAGGER;
        return false;
      }

      const recovering = wrestler.recover > 0;
      const balance = numberParam(ctx.params, "balance");
      const lift = wrestler.mass * (GRAVITY + 34 * (wrestler.standY - p[1]) - 7 * pelvisVel.linear[1]) * balance;
      ctx.world.applyForce(pelvis.body, [0, Math.min(Math.max(lift, 0), wrestler.mass * GRAVITY * (recovering ? 3.2 : 2.6)), 0]);

      const headVel = ctx.world.getBodyVelocity(head.body);
      const gain = 30 * balance;
      const authority = wrestler.mass * 0.3;
      let fx = authority * (gain * (p[0] - h[0]) - 5.5 * headVel.linear[0]);
      let fy = authority * (gain * (p[1] + wrestler.headAbove - h[1]) - 5.5 * headVel.linear[1]);
      let fz = authority * (gain * (p[2] - h[2]) - 5.5 * headVel.linear[2]);
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

    // Horizontal drive on the pelvis plus a touch on the head so wrestlers lean
    // into their charge instead of gliding.
    const driveWrestler = (wrestler: Wrestler, dirX: number, dirZ: number, force: number) => {
      const pelvis = wrestler.bones[BONE_PELVIS];
      ctx.world.applyForce(pelvis.body, [dirX * force, 0, dirZ * force]);
      ctx.world.applyForce(wrestler.bones[BONE_HEAD].body, [dirX * force * 0.12, 0, dirZ * force * 0.12]);
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
      update: (delta) => {
        hopCooldown = Math.max(0, hopCooldown - delta);
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

        if ((inputX !== 0 || inputZ !== 0) && playerBalanced && respawnLock === 0) {
          // Soft speed cap: thrust fades out near 4.5 m/s so shoves stay punchy
          // without the marionette tripping over its own dragged feet.
          const velocity = ctx.world.getBodyVelocity(pelvis.body);
          const horizontal = Math.hypot(velocity.linear[0], velocity.linear[2]);
          const headroom = Math.max(0, 1 - horizontal / 4.5);
          const thrust = numberParam(ctx.params, "thrust") * player.mass * headroom;
          const norm = 1 / Math.hypot(inputX, inputZ);
          const dirX = (forward.x * inputZ + right.x * inputX) * norm;
          const dirZ = (forward.z * inputZ + right.z * inputX) * norm;
          driveWrestler(player, dirX, dirZ, thrust);
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
          falls += 1;
          respawnPlayer();
        }

        const aggression = numberParam(ctx.params, "aggression");
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
          const balanced = balanceWrestler(bot.wrestler, delta, true);
          if (!balanced) {
            continue;
          }
          const dx = playerPos[0] - botPos[0];
          const dz = playerPos[2] - botPos[2];
          const length = Math.hypot(dx, dz);
          if (length > 0.85) {
            const velocity = ctx.world.getBodyVelocity(botPelvis.body);
            const along = (velocity.linear[0] * dx + velocity.linear[2] * dz) / length;
            const headroom = Math.max(0, 1 - along / 3.6);
            const force = aggression * bot.wrestler.mass * headroom;
            driveWrestler(bot.wrestler, dx / length, dz / length, force);
          }
        }

        if (state === "active" && activeCount === 0) {
          state = wave >= MAX_WAVES ? "won" : "intermission";
          stateTimer = 1.4;
        } else if (state === "intermission") {
          stateTimer -= delta;
          if (stateTimer <= 0) {
            startWave(wave + 1);
          }
        }
      },
      metrics: () => ({
        Wave: state === "won" ? `Cleared ${MAX_WAVES}/${MAX_WAVES} 🏆` : `${wave}/${MAX_WAVES}`,
        Bots: activeCount,
        "Ring-outs": knockouts,
        Falls: falls,
        You: player.stagger > 0 ? "Down!" : player.recover > 0 ? "Getting up" : "Standing",
        Speed: `${ctx.world.getBodySpeed(player.bones[BONE_PELVIS].body).toFixed(1)} m/s`
      }),
      dispose: () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      }
    };
  }
};
