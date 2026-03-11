import { initScene, updateFighter, triggerScreenShake, render3d } from './renderer3d.js';

const TICK_RATE = 120;
const DT = 1 / TICK_RATE;
const FRAMES = {
  blockStartup: 1,
  blockRecovery: 4,
  punchStartup: 5,
  punchActive: 3,
  punchRecovery: 10,
  kickStartup: 8,
  kickActive: 4,
  kickRecovery: 14,
  hitStopPunch: 5,
  hitStopKick: 7,
  hitStopBlocked: 3,
};

const CONFIG = {
  arena: { minX: 100, maxX: 1180, minY: 430, maxY: 600 },
  healthMax: 100,
  roundSeconds: 60,
  roundWinsNeeded: 2,
  physics: {
    moveAccel: 2500,
    airBrake: 20,
    maxSpeedX: 280,
    maxSpeedY: 210,
    pushSeparation: 58,
    wallBounceDamping: 0.18,
    impulseDamping: 10,
    axisResponsivenessX: 1,
    axisResponsivenessY: 0.72,
  },
  punch: { damage: 14, range: 130, yRange: 70, hitStun: 20, blockStun: 12, pushOnHit: 40, pushOnBlock: 22 },
  kick: { damage: 20, range: 155, yRange: 80, hitStun: 26, blockStun: 16, pushOnHit: 60, pushOnBlock: 36 },
  chipDamage: 1,
};

const State = {
  Idle: 'Idle', Move: 'Move', Block: 'Block', BlockRecovery: 'Block_Recovery',
  PunchStartup: 'Punch_Startup', PunchActive: 'Punch_Active', PunchRecovery: 'Punch_Recovery',
  KickStartup: 'Kick_Startup', KickActive: 'Kick_Active', KickRecovery: 'Kick_Recovery',
  HitStun: 'Hit_Stun', BlockStun: 'Block_Stun', KO: 'KO',
};

class Fighter {
  constructor(id, color, x) {
    this.id = id; this.color = color; this.x = x; this.y = 560;
    this.facing = 1; this.state = State.Idle; this.stateFrame = 0;
    this.health = CONFIG.healthMax; this.roundWins = 0; this.blockHeld = false;
    this.buffer = [];
    this.axisX = 0; this.axisY = 0;
    this.vx = 0; this.vy = 0;
    this.impulseX = 0; this.impulseY = 0;
  }
  actionable() { return [State.Idle, State.Move, State.Block].includes(this.state); }
  inAttack() { return [State.PunchStartup, State.PunchActive, State.PunchRecovery, State.KickStartup, State.KickActive, State.KickRecovery].includes(this.state); }
}

const world = {
  frame: 0, round: 1, timer: CONFIG.roundSeconds,
  player: new Fighter('player', '#2d9bff', 350),
  cpu: new Fighter('cpu', '#ff5353', 930),
  input: { left: false, right: false, up: false, down: false, block: false, punch: false, kick: false },
  hitStopFrames: 0, paused: false,
};

const canvas = document.getElementById('arena');
let rendererReady = false;
initScene(canvas).then(() => { rendererReady = true; });
const ui = {
  p1Health: document.getElementById('p1-health'), p2Health: document.getElementById('p2-health'),
  p1Rounds: document.getElementById('p1-rounds'), p2Rounds: document.getElementById('p2-rounds'),
  timer: document.getElementById('timer'), roundText: document.getElementById('round-text'), announcement: document.getElementById('announcement'),
};

const keyMap = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  Shift: 'block', j: 'block', k: 'punch', l: 'kick',
};
window.addEventListener('keydown', (e) => setInput(e.key, true));
window.addEventListener('keyup', (e) => setInput(e.key, false));
function setInput(key, val) {
  const mapped = keyMap[key] ?? keyMap[key.toLowerCase()];
  if (!mapped) return;
  if (mapped === 'punch' || mapped === 'kick') {
    if (val) world.input[mapped] = true;
  } else world.input[mapped] = val;
}

function setupMobileControls() {
  // Hold-to-repeat for all action buttons (block, punch, kick)
  const bindHold = (id, field) => {
    const el = document.getElementById(id);
    let repeatInterval = null;
    const start = (e) => {
      e.preventDefault();
      world.input[field] = true;
      if (field !== 'block' && !repeatInterval) {
        repeatInterval = setInterval(() => { world.input[field] = true; }, 120);
      }
    };
    const stop = () => {
      world.input[field] = false;
      if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  };
  bindHold('block-btn', 'block');
  bindHold('punch-btn', 'punch');
  bindHold('kick-btn', 'kick');

  const zone = document.getElementById('dpad-zone');
  const pad = document.getElementById('dpad');
  let origin = null;
  const resetMove = () => { world.input.left = world.input.right = world.input.up = world.input.down = false; };
  zone.addEventListener('pointerdown', (e) => {
    origin = { x: e.offsetX, y: e.offsetY };
    pad.classList.remove('hidden');
    pad.style.left = `${origin.x}px`; pad.style.top = `${origin.y}px`;
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', (e) => {
    if (!origin) return;
    const dx = e.offsetX - origin.x, dy = e.offsetY - origin.y;
    resetMove();
    if (dx < -15) world.input.left = true; if (dx > 15) world.input.right = true;
    if (dy < -15) world.input.up = true; if (dy > 15) world.input.down = true;
  });
  zone.addEventListener('pointerup', () => { origin = null; resetMove(); pad.classList.add('hidden'); });
  zone.addEventListener('pointercancel', () => { origin = null; resetMove(); pad.classList.add('hidden'); });
}
setupMobileControls();

function enqueueAction(fighter, action) {
  if (fighter.buffer.length > 2) return;
  fighter.buffer.push({ action, expires: world.frame + 5 });
}

function consumeBufferedAction(fighter) {
  fighter.buffer = fighter.buffer.filter((item) => item.expires >= world.frame);
  if (!fighter.actionable() || fighter.buffer.length === 0) return;
  // Don't consume attack actions while actively blocking
  if (fighter.blockHeld || fighter.state === State.Block) return;
  const next = fighter.buffer.shift().action;
  if (next === 'punch') setState(fighter, State.PunchStartup);
  if (next === 'kick') setState(fighter, State.KickStartup);
}

function setState(f, next) { f.state = next; f.stateFrame = 0; }

function simInputForPlayer() {
  const p = world.player;
  p.blockHeld = world.input.block;
  if (world.input.punch) enqueueAction(p, 'punch');
  if (world.input.kick) enqueueAction(p, 'kick');
  world.input.punch = false; world.input.kick = false;

  if (p.actionable()) {
    p.axisX = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
    p.axisY = (world.input.down ? 1 : 0) - (world.input.up ? 1 : 0);
    if (p.axisX || p.axisY) {
      if (p.state !== State.Block) setState(p, State.Move);
    } else if (p.state === State.Move) setState(p, State.Idle);

    if (p.blockHeld && p.state !== State.Block) {
      setState(p, State.Block);
      p.buffer.length = 0; // Clear stale attack inputs when entering block
    }
    if (!p.blockHeld && p.state === State.Block) setState(p, State.BlockRecovery);
  }
}

let aiCooldown = 0;
// AI movement plan: the AI commits to a movement direction for a set duration
let aiMoveTimer = 0;    // frames left in current movement plan
let aiMoveDir = 0;      // -1 = retreat, 0 = idle, 1 = approach
let aiIdleTimer = 60;   // frames to idle before next decision

function simAI() {
  const ai = world.cpu, player = world.player;
  aiCooldown--;
  aiMoveTimer--;
  aiIdleTimer--;
  const dx = player.x - ai.x;
  const dy = player.y - ai.y;
  const distance = Math.abs(dx);
  ai.facing = dx > 0 ? 1 : -1;
  if (!ai.actionable()) return;

  // Reactive block when player telegraphs an attack
  ai.blockHeld = false;
  if ((player.state === State.PunchStartup || player.state === State.KickStartup) && distance < 160 && aiCooldown <= 0) {
    ai.blockHeld = Math.random() < 0.7;
    if (ai.blockHeld) setState(ai, State.Block);
    aiCooldown = 10;
    return;
  }

  // Pick a new movement plan when the current one expires
  if (aiMoveTimer <= 0 && aiIdleTimer <= 0) {
    const roll = Math.random();
    if (distance > 250) {
      // Far away — usually approach, sometimes wait
      aiMoveDir = roll < 0.7 ? 1 : 0;
      aiMoveTimer = 40 + Math.floor(Math.random() * 50);
    } else if (distance < 100) {
      // Too close — back off or idle
      aiMoveDir = roll < 0.6 ? -1 : 0;
      aiMoveTimer = 30 + Math.floor(Math.random() * 40);
    } else {
      // Mid range — mix of approach, retreat, and idle
      if (roll < 0.3) aiMoveDir = 1;       // approach
      else if (roll < 0.55) aiMoveDir = -1; // retreat
      else aiMoveDir = 0;                   // stand ground
      aiMoveTimer = 25 + Math.floor(Math.random() * 45);
    }
    // Idle pause between movement plans
    aiIdleTimer = 15 + Math.floor(Math.random() * 25);
  }

  // Execute movement plan
  if (aiMoveTimer > 0 && aiMoveDir !== 0) {
    ai.axisX = Math.sign(dx) * aiMoveDir * 0.6;
    ai.axisY = Math.sign(dy) * 0.25;
    setState(ai, State.Move);
  } else {
    ai.axisX = 0;
    ai.axisY = 0;
    if (ai.state === State.Move) setState(ai, State.Idle);
  }

  // Attack decision — only when in range, idle, and cooldown expired
  if (distance > 80 && distance < 160 && aiCooldown <= 0 && aiMoveDir >= 0) {
    if (Math.random() < 0.5) {
      enqueueAction(ai, Math.random() < 0.55 ? 'punch' : 'kick');
    }
    aiCooldown = 40 + Math.floor(Math.random() * 40);
  }
}

function processStates(f) {
  f.stateFrame++;
  switch (f.state) {
    case State.BlockRecovery:
      if (f.stateFrame >= FRAMES.blockRecovery) setState(f, State.Idle);
      break;
    case State.PunchStartup:
      if (f.stateFrame >= FRAMES.punchStartup) setState(f, State.PunchActive);
      break;
    case State.PunchActive:
      if (f.stateFrame >= FRAMES.punchActive) setState(f, State.PunchRecovery);
      break;
    case State.PunchRecovery:
      if (f.stateFrame >= FRAMES.punchRecovery) setState(f, State.Idle);
      break;
    case State.KickStartup:
      if (f.stateFrame >= FRAMES.kickStartup) setState(f, State.KickActive);
      break;
    case State.KickActive:
      if (f.stateFrame >= FRAMES.kickActive) setState(f, State.KickRecovery);
      break;
    case State.KickRecovery:
      if (f.stateFrame >= FRAMES.kickRecovery) setState(f, State.Idle);
      break;
    case State.HitStun:
    case State.BlockStun:
      if (f.stateFrame >= f.stunFrames) setState(f, State.Idle);
      break;
  }
  consumeBufferedAction(f);
}

function tryHit(attacker, defender, move, isKick) {
  if (attacker.hitConfirmedThisState) return;
  const dx = (defender.x - attacker.x) * attacker.facing;
  const dy = Math.abs(defender.y - attacker.y);
  if (dx <= 0 || dx > move.range || dy > move.yRange) return;

  const blocked = defender.state === State.Block;
  if (blocked) {
    defender.health = Math.max(0, defender.health - CONFIG.chipDamage);
    setState(defender, State.BlockStun); defender.stunFrames = move.blockStun;
    attacker.impulseX -= attacker.facing * move.pushOnBlock * 22;
    defender.impulseX += attacker.facing * move.pushOnBlock * 14;
    world.hitStopFrames = FRAMES.hitStopBlocked;
    triggerScreenShake(4);
  } else {
    defender.health = Math.max(0, defender.health - move.damage);
    setState(defender, State.HitStun); defender.stunFrames = move.hitStun;
    defender.impulseX += attacker.facing * move.pushOnHit * 22;
    attacker.impulseX -= attacker.facing * move.pushOnHit * 9;
    world.hitStopFrames = isKick ? FRAMES.hitStopKick : FRAMES.hitStopPunch;
    triggerScreenShake(isKick ? 12 : 8);
  }

  attacker.hitConfirmedThisState = true;
  clampArena(attacker); clampArena(defender);
}

function clampArena(f) {
  f.x = Math.max(CONFIG.arena.minX, Math.min(CONFIG.arena.maxX, f.x));
  f.y = Math.max(CONFIG.arena.minY, Math.min(CONFIG.arena.maxY, f.y));
}

function resolveCombat() {
  const p = world.player, c = world.cpu;
  p.facing = c.x > p.x ? 1 : -1;
  c.facing = p.x > c.x ? 1 : -1;

  if (p.state === State.PunchActive) tryHit(p, c, CONFIG.punch, false);
  if (p.state === State.KickActive) tryHit(p, c, CONFIG.kick, true);
  if (c.state === State.PunchActive) tryHit(c, p, CONFIG.punch, false);
  if (c.state === State.KickActive) tryHit(c, p, CONFIG.kick, true);

  if (Math.abs(p.x - c.x) < CONFIG.physics.pushSeparation) {
    const overlap = CONFIG.physics.pushSeparation - Math.abs(p.x - c.x);
    const dir = p.x < c.x ? -1 : 1;
    p.x += dir * overlap * 0.5;
    c.x -= dir * overlap * 0.5;
    p.vx += dir * overlap * 32;
    c.vx -= dir * overlap * 32;
    clampArena(p); clampArena(c);
  }

  if (p.health <= 0 || c.health <= 0 || world.timer <= 0) endRound();
}

function integrateFighterPhysics(f) {
  const physics = CONFIG.physics;
  // HitStun: no player control, only impulse moves the fighter
  const inStun = f.state === State.HitStun || f.state === State.BlockStun;
  const movable = f.actionable() && !inStun;
  const axisX = movable ? f.axisX : 0;
  const axisY = movable ? f.axisY : 0;
  const targetVX = axisX * physics.maxSpeedX * physics.axisResponsivenessX;
  const targetVY = axisY * physics.maxSpeedY * physics.axisResponsivenessY;

  if (inStun) {
    // Kill deliberate velocity so impulse/knockback isn't fought
    f.vx *= Math.max(0, 1 - physics.airBrake * 2 * DT);
    f.vy *= Math.max(0, 1 - physics.airBrake * 2 * DT);
  } else {
    f.vx += (targetVX - f.vx) * Math.min(1, physics.moveAccel * DT / Math.max(1, physics.maxSpeedX));
    f.vy += (targetVY - f.vy) * Math.min(1, physics.moveAccel * DT / Math.max(1, physics.maxSpeedY));
  }

  if (!axisX) f.vx *= Math.max(0, 1 - physics.airBrake * DT);
  if (!axisY) f.vy *= Math.max(0, 1 - physics.airBrake * DT);

  f.impulseX *= Math.max(0, 1 - physics.impulseDamping * DT);
  f.impulseY *= Math.max(0, 1 - physics.impulseDamping * DT);

  f.x += (f.vx + f.impulseX) * DT;
  f.y += (f.vy + f.impulseY) * DT;

  const preClampX = f.x;
  const preClampY = f.y;
  clampArena(f);

  if (preClampX !== f.x) {
    f.vx *= -physics.wallBounceDamping;
    f.impulseX *= -physics.wallBounceDamping;
  }
  if (preClampY !== f.y) {
    f.vy *= -physics.wallBounceDamping;
    f.impulseY *= -physics.wallBounceDamping;
  }
}

let roundLockFrames = 0;
function endRound() {
  if (roundLockFrames > 0) return;
  const p = world.player, c = world.cpu;
  const winner = p.health === c.health ? null : p.health > c.health ? p : c;
  if (winner) winner.roundWins++;
  ui.announcement.textContent = winner ? `${winner.id === 'player' ? 'Player' : 'CPU'} Wins Round` : 'Round Draw';
  roundLockFrames = 180;
}

function resetRoundIfNeeded() {
  if (roundLockFrames <= 0) return;
  roundLockFrames--;
  if (roundLockFrames !== 0) return;

  const p = world.player, c = world.cpu;
  if (p.roundWins >= CONFIG.roundWinsNeeded || c.roundWins >= CONFIG.roundWinsNeeded) {
    ui.announcement.textContent = `${p.roundWins > c.roundWins ? 'Player' : 'CPU'} Wins Match`;
    world.paused = true;
    return;
  }

  world.round++;
  world.timer = CONFIG.roundSeconds;
  [p, c].forEach((f, i) => {
    f.health = CONFIG.healthMax;
    f.x = i === 0 ? 350 : 930;
    f.y = 560;
    f.buffer.length = 0;
    setState(f, State.Idle);
  });
  ui.announcement.textContent = '';
}

function updateHud() {
  ui.p1Health.style.width = `${(world.player.health / CONFIG.healthMax) * 100}%`;
  ui.p2Health.style.width = `${(world.cpu.health / CONFIG.healthMax) * 100}%`;
  ui.timer.textContent = `${Math.max(0, Math.ceil(world.timer))}`;
  ui.roundText.textContent = world.round >= 3 ? 'Final Round' : `Round ${world.round}`;
  drawRoundDots(ui.p1Rounds, world.player.roundWins, 'player');
  drawRoundDots(ui.p2Rounds, world.cpu.roundWins, 'cpu');
}

function drawRoundDots(node, wins, type) {
  if (node.childElementCount === CONFIG.roundWinsNeeded) {
    [...node.children].forEach((dot, idx) => dot.className = `round-dot ${idx < wins ? `won ${type}` : ''}`);
    return;
  }
  node.innerHTML = '';
  for (let i = 0; i < CONFIG.roundWinsNeeded; i++) {
    const dot = document.createElement('div');
    dot.className = `round-dot ${i < wins ? `won ${type}` : ''}`;
    node.append(dot);
  }
}

function render() {
  if (!rendererReady) return;
  updateFighter('player', world.player);
  updateFighter('cpu', world.cpu);
  render3d();
}

function step() {
  if (world.paused) return;
  world.frame++;
  if (world.hitStopFrames > 0) {
    world.hitStopFrames--;
    updateHud();
    return;
  }

  [world.player, world.cpu].forEach((f) => f.hitConfirmedThisState = false);

  simInputForPlayer();
  simAI();
  integrateFighterPhysics(world.player);
  integrateFighterPhysics(world.cpu);
  processStates(world.player);
  processStates(world.cpu);
  resolveCombat();
  resetRoundIfNeeded();
  world.timer -= DT;
  updateHud();
}

let lastTime = 0, accumulator = 0;
function gameLoop(ts) {
  if (!lastTime) lastTime = ts;
  accumulator += Math.min(0.06, (ts - lastTime) / 1000);
  lastTime = ts;
  while (accumulator >= DT) {
    step();
    accumulator -= DT;
  }
  render();
  requestAnimationFrame(gameLoop);
}
updateHud();
requestAnimationFrame(gameLoop);
