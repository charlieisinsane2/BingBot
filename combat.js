import Vec3 from "vec3";
import { GoalNear } from "mineflayer-pathfinder";
import { randomInt } from "./utils.js";

export function setupCombat(bot, metadata = {}) {
  // configuration
  const SCAN_RADIUS = 10;
  const ATTACK_DISTANCE = 3.0;
  const ATTACK_TOLERANCE = 0.15;
  const EDGE_DISTANCE = metadata.edgeDistance || 2.2;

  let target = null;
  let comboCount = 0;
  let lastHitTime = 0;
  let fighting = false;

  // CPS states
  let cps = 20;
  let wtapActive = false;

  // small helper: find nearest player within SCAN_RADIUS, excluding ourself
  function findNearestPlayer() {
    const ents = Object.values(bot.entities).filter(e => e.type === "player" && e.username && e.username !== bot.username);
    if (ents.length === 0) return null;
    ents.sort((a,b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    return ents[0];
  }

  // edge detection: simple check for block beneath offsets
  function isNearEdge() {
    const pos = bot.entity.position;
    const checks = [
      new Vec3(0, 0, 0),
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ];
    for (const c of checks) {
      const check = pos.plus(c);
      const b = bot.blockAt(check.offset(0, -1, 0));
      if (!b) return true;
    }
    return false;
  }

  // clear movement controls
  function clearMoves() {
    ["forward","back","left","right","sprint","jump"].forEach(k => bot.setControlState(k, false));
  }

  // random strafing logic: pick left or right for a short time while moving forward
  function randomStrafeCycle() {
    clearMoves();
    bot.setControlState("sprint", true);
    bot.setControlState("forward", true);
    const dir = Math.random() < 0.5 ? "left" : "right";
    bot.setControlState(dir, true);
    // keep it ephemeral to avoid deterministic pattern
    setTimeout(() => bot.setControlState(dir, false), 250 + randomInt(0, 200));
  }

  // look at player's head
  async function lookAtHead(ent) {
    try {
      await bot.lookAt(ent.position.offset(0, 1.62, 0));
    } catch(e){}
  }

  // attack if distance ~3.0
  function tryAttack(ent) {
    const dist = bot.entity.position.distanceTo(ent.position);
    if (Math.abs(dist - ATTACK_DISTANCE) <= ATTACK_TOLERANCE) {
      try {
        bot.attack(ent);
      } catch(e){}
      lastHitTime = Date.now();
      comboCount++;
      // combo handling: on reaching 5 hits trigger w-tap cycle
      if (comboCount > 0 && comboCount % 5 === 0) {
        triggerWTapBurst();
      }
    }
  }

  // W-tap burst reduces cps and does a short release of forward (W) then resume.
  function triggerWTapBurst() {
    if (wtapActive) return;
    wtapActive = true;
    const prevCps = cps;
    cps = 11; // reduce CPS during burst
    // release forward (simulate quick strafe-back)
    bot.setControlState("forward", false);
    setTimeout(() => {
      bot.setControlState("forward", true);
    }, 120 + randomInt(0, 60)); // short pause
    // after burst, restore cps & reset combo gradually
    setTimeout(() => {
      cps = prevCps;
      wtapActive = false;
      comboCount = 0;
    }, 1100 + randomInt(0, 500));
  }

  // jump reset when this bot gets hit
  bot.on("entityHurt", (entity) => {
    if (entity === bot.entity) {
      // brief immediate jump to reset knockback
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), 200);
      // also reset combo — being hit interrupts your combo
      comboCount = 0;
    }
    // track hits we deal to others: if we damaged a target entity, increment combo (handled in tryAttack)
  });

  // Attack loop that dispatches attack clicks at current CPS
  let attackInterval = null;
  function startAttackLoop() {
    if (attackInterval) clearInterval(attackInterval);
    attackInterval = setInterval(() => {
      if (!target) return;
      tryAttack(target);
    }, 1000 / Math.max(1, cps));
  }
  startAttackLoop();

  // Behavior loop: scan for players and steer behavior
  const behaviorTick = setInterval(async () => {
    if (!bot.entity) return;
    // if currently have a target entity object, verify it's still valid
    if (!target || !bot.entities[target.id]) {
      const found = findNearestPlayer();
      if (!found) {
        target = null;
        // idle behavior: walk/go to spawn
        const s = metadata.arenaSpawn || { x: 0, y: bot.entity.position.y, z: 0 };
        bot.pathfinder.setGoal(new GoalNear(s.x, s.y, s.z, 1));
        return;
      } else {
        target = found;
        fighting = true;
      }
    }

    // If target found, face and strafe
    if (target) {
      await lookAtHead(target);

      // Edge safety: if near edge, back off
      if (isNearEdge()) {
        // back up
        clearMoves();
        bot.setControlState("back", true);
        setTimeout(() => bot.setControlState("back", false), 400 + randomInt(0,200));
        return;
      }

      // Strafing randomness
      if (Math.random() < 0.22) randomStrafeCycle();

      // Move toward target roughly
      bot.setControlState("sprint", true);
      // use pathfinder to approach near target
      try {
        bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, ATTACK_DISTANCE - 0.4));
      } catch(e) {}

      // attack logic will be handled by attack loop at CPS
    }
  }, 200); // 5 ticks/sec

  // stop function exposure
  function stop() {
    try { clearInterval(behaviorTick); } catch(e){}
    try { clearInterval(attackInterval); } catch(e){}
  }

  // return control API
  return {
    start: () => { /* already started */ },
    stop,
    getState: () => ({ target: target?.username || null, combo: comboCount, cps, mode: metadata.mode })
  };
}
