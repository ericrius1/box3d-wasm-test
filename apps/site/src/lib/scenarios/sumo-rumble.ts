import { BodyType } from "box3d-wasm";
import * as THREE from "three/webgpu";
import type { ScenarioDefinition, SimBody, Vec3 } from "./types";
import { baseDebugControls, numberParam } from "./helpers";

const MAX_WAVES = 8;
const FALL_Y = -5;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

export const sumorumbleScenario: ScenarioDefinition = {
  id: "sumo-rumble",
  title: "Sumo Rumble",
  eyebrow: "Arena knockout game",
  deck: "Drive a glowing wrecking orb with WASD and bounce escalating waves of hunter bots off a neon ring.",
  description:
    "A keyboard-controlled sumo brawl: your heavy emissive orb shoves camera-relative forces into the world while waves of self-propelled bots hunt you down. Every knockout is a real ring-out — bodies leave the platform and fall into the void. Crank wave size, growth, and the ragdoll crowd to find the point where a hundred always-awake chasers melt your frame time.",
  accent: "#3affd8",
  category: "games",
  visuals: {
    lighting: "night",
    background: "#05060e",
    fog: { color: "#05060e" },
    grid: false,
    bloom: { strength: 0.9, radius: 0.55, threshold: 0.5 }
  },
  hint: "WASD / arrows to shove, Space to hop — knock every bot off the ring",
  defaults: {
    arenaRadius: 6,
    ragdolls: 4,
    thrust: 26,
    jumpPower: 8,
    waveSize: 6,
    waveGrowth: 4,
    aggression: 10,
    paused: false,
    showLandmarks: false
  },
  controls: [
    {
      title: "Arena (rebuilds)",
      controls: [
        { key: "arenaRadius", label: "Ring radius", min: 4, max: 9, step: 0.25 },
        { key: "ragdolls", label: "Ragdoll crowd", min: 0, max: 10, step: 1 },
        { key: "waveSize", label: "First wave bots", min: 3, max: 40, step: 1 },
        { key: "waveGrowth", label: "Bots per wave", min: 0, max: 20, step: 1 }
      ]
    },
    {
      title: "Live tuning",
      controls: [
        { key: "thrust", label: "Player thrust", min: 10, max: 60, step: 1, rebuild: false },
        { key: "jumpPower", label: "Hop power", min: 4, max: 14, step: 0.5, rebuild: false },
        { key: "aggression", label: "Bot aggression", min: 2, max: 40, step: 1, rebuild: false }
      ]
    },
    baseDebugControls
  ],
  actions: [
    { id: "nextWave", title: "Send next wave now" },
    { id: "panic", title: "Panic the crowd" },
    { id: "reset", title: "Restart match" }
  ],
  camera: {
    position: [0, 12.5, 15],
    target: [0, 0.4, 0],
    fov: 45
  },
  gravity: () => [0, -15, 0],
  setup(ctx) {
    const radius = numberParam(ctx.params, "arenaRadius");
    const ragdollCount = Math.round(numberParam(ctx.params, "ragdolls"));
    const waveSize = Math.round(numberParam(ctx.params, "waveSize"));
    const waveGrowth = Math.round(numberParam(ctx.params, "waveGrowth"));
    const dronePool = Math.min(200, waveSize + waveGrowth * (MAX_WAVES - 1));

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

    const player = ctx.addSphere({
      type: BodyType.Dynamic,
      position: [0, 1.2, 0],
      radius: 0.5,
      material: ctx.colorMaterial("#49f2d1", { emissive: "#2bffd9", emissiveIntensity: 1.7, roughness: 0.25, metalness: 0.2 }),
      density: 6,
      friction: 0.55,
      restitution: 0.25,
      rollingResistance: 0.06
    });
    const playerMass = ctx.world.getBodyMass(player.body);
    const playerLight = new THREE.PointLight(0x3affd8, 34, 11, 2);
    ctx.scene.add(playerLight);

    const droneMaterial = ctx.colorMaterial("#ff4d63", { emissive: "#ff2440", emissiveIntensity: 1.4, roughness: 0.35 });
    type Drone = { body: SimBody; mass: number; active: boolean };
    const drones: Drone[] = [];
    for (let i = 0; i < dronePool; i += 1) {
      const body = ctx.addSphere({
        type: BodyType.Dynamic,
        position: [(i % 20) * 3 - 30, -45, 30 + Math.floor(i / 20) * 3],
        radius: 0.34,
        material: droneMaterial,
        density: 2.2,
        friction: 0.4,
        restitution: 0.4,
        rollingResistance: 0.03
      });
      body.object.visible = false;
      ctx.world.setBodyGravityScale(body.body, 0);
      ctx.world.setBodyAwake(body.body, false);
      drones.push({ body, mass: ctx.world.getBodyMass(body.body), active: false });
    }

    type Crowd = { human: number; bodies: SimBody[]; out: boolean };
    const crowd: Crowd[] = [];
    for (let i = 0; i < ragdollCount; i += 1) {
      const angle = (i / Math.max(1, ragdollCount)) * Math.PI * 2 + 0.35;
      const spot = radius * 0.62;
      const spawned = ctx.addHuman([Math.cos(angle) * spot, 1.15, Math.sin(angle) * spot]);
      crowd.push({ ...spawned, out: false });
    }

    let wave = 0;
    let knockouts = 0;
    let falls = 0;
    let state: "intermission" | "active" | "won" = "intermission";
    let stateTimer = 1.2;
    let activeCount = 0;

    const dronesForWave = (w: number) => Math.min(dronePool, waveSize + (w - 1) * waveGrowth);

    const activateDrone = (drone: Drone, index: number, total: number) => {
      const angle = (index / total) * Math.PI * 2 + wave * 0.7;
      const spot = radius * 0.8;
      drone.body.object.visible = true;
      ctx.world.setBodyGravityScale(drone.body.body, 1);
      ctx.world.setBodyTransform(drone.body.body, [Math.cos(angle) * spot, 3 + (index % 5) * 0.9, Math.sin(angle) * spot]);
      ctx.world.setBodyVelocity(drone.body.body, [0, 0, 0], [0, 0, 0]);
      ctx.world.setBodyAwake(drone.body.body, true);
      drone.active = true;
    };

    const retireDrone = (drone: Drone, index: number) => {
      drone.active = false;
      drone.body.object.visible = false;
      ctx.world.setBodyTransform(drone.body.body, [(index % 20) * 3 - 30, -45, 30 + Math.floor(index / 20) * 3]);
      ctx.world.setBodyVelocity(drone.body.body, [0, 0, 0], [0, 0, 0]);
      ctx.world.setBodyGravityScale(drone.body.body, 0);
      ctx.world.setBodyAwake(drone.body.body, false);
    };

    const startWave = (w: number) => {
      wave = w;
      const total = dronesForWave(w);
      let spawned = 0;
      for (const drone of drones) {
        if (spawned >= total) {
          break;
        }
        if (!drone.active) {
          activateDrone(drone, spawned, total);
          spawned += 1;
        }
      }
      activeCount = spawned;
      state = "active";
    };

    let respawnLock = 0;
    const respawnPlayer = () => {
      ctx.world.setBodyTransform(player.body, [0, 1.4, 0]);
      ctx.world.setBodyVelocity(player.body, [0, 0, 0], [0, 0, 0]);
      ctx.world.setBodyAwake(player.body, true);
      respawnLock = 0.7;
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

    return {
      actions: {
        nextWave: () => {
          if (state === "active" || state === "intermission") {
            for (const [index, drone] of drones.entries()) {
              if (drone.active) {
                retireDrone(drone, index);
              }
            }
            state = "intermission";
            stateTimer = 0.1;
          }
        },
        panic: () => {
          for (const member of crowd) {
            if (!member.out) {
              ctx.world.humanApplyRandomImpulse(member.human, 14);
            }
          }
        },
        reset: () => undefined
      },
      update: (delta) => {
        hopCooldown = Math.max(0, hopCooldown - delta);

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

        respawnLock = Math.max(0, respawnLock - delta);
        if ((inputX !== 0 || inputZ !== 0) && respawnLock === 0) {
          // Soft speed cap: thrust fades to zero as the orb approaches 9 m/s,
          // so shoves stay punchy without turning into an uncontrollable rocket.
          const velocity = ctx.world.getBodyVelocity(player.body);
          const horizontal = Math.hypot(velocity.linear[0], velocity.linear[2]);
          const headroom = Math.max(0, 1 - horizontal / 9);
          const thrust = numberParam(ctx.params, "thrust") * playerMass * headroom;
          const norm = 1 / Math.hypot(inputX, inputZ);
          const fx = (forward.x * inputZ + right.x * inputX) * norm * thrust;
          const fz = (forward.z * inputZ + right.z * inputX) * norm * thrust;
          ctx.world.applyForce(player.body, [fx, 0, fz]);
        }

        const playerPos = player.transform.position;
        if (pressed.has(" ") && hopCooldown === 0 && playerPos[1] < 1.3) {
          const velocity = ctx.world.getBodyVelocity(player.body);
          if (Math.abs(velocity.linear[1]) < 1.2) {
            ctx.world.applyImpulse(player.body, [0, numberParam(ctx.params, "jumpPower") * playerMass, 0]);
            hopCooldown = 0.38;
          }
        }

        playerLight.position.set(playerPos[0], playerPos[1] + 1.1, playerPos[2]);

        if (playerPos[1] < FALL_Y) {
          falls += 1;
          respawnPlayer();
        }

        const aggression = numberParam(ctx.params, "aggression");
        for (const [index, drone] of drones.entries()) {
          if (!drone.active) {
            continue;
          }
          const dronePos = drone.body.transform.position;
          if (dronePos[1] < FALL_Y) {
            retireDrone(drone, index);
            knockouts += 1;
            activeCount -= 1;
            continue;
          }
          const dx = playerPos[0] - dronePos[0];
          const dz = playerPos[2] - dronePos[2];
          const length = Math.hypot(dx, dz);
          if (length > 1e-4) {
            const force = (aggression * drone.mass) / length;
            ctx.world.applyForce(drone.body.body, [dx * force, 0, dz * force]);
          }
        }

        for (const member of crowd) {
          if (member.out) {
            continue;
          }
          const pelvis = member.bodies[0].transform.position;
          if (pelvis[1] < FALL_Y) {
            member.out = true;
            knockouts += 1;
            for (const bone of member.bodies) {
              bone.object.visible = false;
              ctx.world.setBodyGravityScale(bone.body, 0);
              ctx.world.setBodyVelocity(bone.body, [0, 0, 0], [0, 0, 0]);
              ctx.world.setBodyAwake(bone.body, false);
            }
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
        KOs: knockouts,
        Falls: falls,
        Speed: `${ctx.world.getBodySpeed(player.body).toFixed(1)} m/s`
      }),
      dispose: () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      }
    };
  }
};
