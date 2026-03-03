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
    impulseDamping: 18,
    axisResponsivenessX: 1,
    axisResponsivenessY: 0.72,
  },
  punch: { damage: 8, range: 100, yRange: 70, hitStun: 16, blockStun: 12, pushOnHit: 28, pushOnBlock: 18 },
  kick: { damage: 12, range: 140, yRange: 80, hitStun: 22, blockStun: 16, pushOnHit: 38, pushOnBlock: 30 },
  chipDamage: 1,
};

const State = {
  Idle: 'Idle', Move: 'Move', Block: 'Block', BlockRecovery: 'Block_Recovery',
  PunchStartup: 'Punch_Startup', PunchActive: 'Punch_Active', PunchRecovery: 'Punch_Recovery',
  KickStartup: 'Kick_Startup', KickActive: 'Kick_Active', KickRecovery: 'Kick_Recovery',
  HitStun: 'Hit_Stun', BlockStun: 'Block_Stun', KO: 'KO',
};

const BONE_LENGTHS = {
  spineLower: 28,
  spineUpper: 26,
  neck: 10,
  head: 18,
  clavicle: 10,
  upperArm: 26,
  forearm: 24,
  hand: 8,
  thigh: 32,
  shin: 30,
  foot: 14,
};

const FIGHTER_RIG = [
  ['hips', null, 0],
  ['spineLower', 'hips', BONE_LENGTHS.spineLower],
  ['spineUpper', 'spineLower', BONE_LENGTHS.spineUpper],
  ['neck', 'spineUpper', BONE_LENGTHS.neck],
  ['head', 'neck', BONE_LENGTHS.head],
  ['shoulderR', 'spineUpper', BONE_LENGTHS.clavicle],
  ['elbowR', 'shoulderR', BONE_LENGTHS.upperArm],
  ['wristR', 'elbowR', BONE_LENGTHS.forearm],
  ['handR', 'wristR', BONE_LENGTHS.hand],
  ['shoulderL', 'spineUpper', BONE_LENGTHS.clavicle],
  ['elbowL', 'shoulderL', BONE_LENGTHS.upperArm],
  ['wristL', 'elbowL', BONE_LENGTHS.forearm],
  ['handL', 'wristL', BONE_LENGTHS.hand],
  ['kneeR', 'hips', BONE_LENGTHS.thigh],
  ['ankleR', 'kneeR', BONE_LENGTHS.shin],
  ['toeR', 'ankleR', BONE_LENGTHS.foot],
  ['kneeL', 'hips', BONE_LENGTHS.thigh],
  ['ankleL', 'kneeL', BONE_LENGTHS.shin],
  ['toeL', 'ankleL', BONE_LENGTHS.foot],
];

const BONE_LINKS = FIGHTER_RIG.filter(([, parent]) => parent);

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
const ctx = canvas.getContext('2d');
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
  const bindHold = (id, field) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', () => world.input[field] = true);
    el.addEventListener('pointerup', () => world.input[field] = false);
    el.addEventListener('pointercancel', () => world.input[field] = false);
    el.addEventListener('pointerleave', () => world.input[field] = false);
  };
  bindHold('block-btn', 'block');
  ['punch', 'kick'].forEach((name) => {
    const el = document.getElementById(`${name}-btn`);
    el.addEventListener('pointerdown', () => world.input[name] = true);
  });

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

    if (p.blockHeld && p.state !== State.Block) setState(p, State.Block);
    if (!p.blockHeld && p.state === State.Block) setState(p, State.BlockRecovery);
  }
}

let aiCooldown = 0;
function simAI() {
  const ai = world.cpu, player = world.player;
  aiCooldown--;
  const dx = player.x - ai.x;
  const dy = player.y - ai.y;
  const distance = Math.abs(dx);
  ai.facing = dx > 0 ? 1 : -1;
  if (!ai.actionable()) return;

  ai.blockHeld = false;
  if ((player.state === State.PunchStartup || player.state === State.KickStartup) && distance < 160 && aiCooldown <= 0) {
    ai.blockHeld = Math.random() < 0.75;
    if (ai.blockHeld) setState(ai, State.Block);
    aiCooldown = 8;
    return;
  }

  if (distance > 140) {
    ai.axisX = Math.sign(dx) * 0.75;
    ai.axisY = Math.sign(dy) * 0.45;
    setState(ai, State.Move);
  } else {
    ai.axisX = 0;
    ai.axisY = 0;
    if (ai.state === State.Move) setState(ai, State.Idle);
    if (aiCooldown <= 0) {
      enqueueAction(ai, Math.random() < 0.55 ? 'punch' : 'kick');
      aiCooldown = 18 + Math.floor(Math.random() * 14);
    }
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
  } else {
    defender.health = Math.max(0, defender.health - move.damage);
    setState(defender, State.HitStun); defender.stunFrames = move.hitStun;
    defender.impulseX += attacker.facing * move.pushOnHit * 22;
    attacker.impulseX -= attacker.facing * move.pushOnHit * 9;
    world.hitStopFrames = isKick ? FRAMES.hitStopKick : FRAMES.hitStopPunch;
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
  const movable = f.actionable() || f.state === State.BlockStun || f.state === State.HitStun;
  const axisX = movable ? f.axisX : 0;
  const axisY = movable ? f.axisY : 0;
  const targetVX = axisX * physics.maxSpeedX * physics.axisResponsivenessX;
  const targetVY = axisY * physics.maxSpeedY * physics.axisResponsivenessY;

  f.vx += (targetVX - f.vx) * Math.min(1, physics.moveAccel * DT / Math.max(1, physics.maxSpeedX));
  f.vy += (targetVY - f.vy) * Math.min(1, physics.moveAccel * DT / Math.max(1, physics.maxSpeedY));

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

function blendAngles(base, overlay) {
  return { ...base, ...overlay };
}

function getRigPose(f) {
  const walkCycle = Math.sin(world.frame * 0.18 + (f.id === 'cpu' ? Math.PI : 0));
  const idleSway = Math.sin(world.frame * 0.05 + (f.id === 'cpu' ? 1.6 : 0.7));
  const moving = f.state === State.Move;
  const hitRecoil = f.state === State.HitStun ? 0.4 : 0;

  let pose = {
    hips: -90,
    spineLower: -86 - hitRecoil * 25,
    spineUpper: -82 - hitRecoil * 30,
    neck: -82,
    head: -82,
    shoulderR: -25,
    elbowR: 18,
    wristR: 4,
    shoulderL: -148,
    elbowL: 18,
    wristL: -4,
    kneeR: 84,
    ankleR: 86,
    toeR: 4,
    kneeL: 98,
    ankleL: 94,
    toeL: -4,
  };

  if (moving) {
    pose = blendAngles(pose, {
      hips: -88,
      spineLower: -84,
      spineUpper: -78,
      shoulderR: -28 + walkCycle * 18,
      shoulderL: -152 - walkCycle * 18,
      elbowR: 24 - walkCycle * 6,
      elbowL: 20 + walkCycle * 6,
      kneeR: 92 + walkCycle * 26,
      kneeL: 92 - walkCycle * 26,
      ankleR: 95 - walkCycle * 18,
      ankleL: 95 + walkCycle * 18,
      toeR: walkCycle * 8,
      toeL: -walkCycle * 8,
    });
  } else {
    pose = blendAngles(pose, {
      spineLower: pose.spineLower + idleSway * 2,
      spineUpper: pose.spineUpper + idleSway * 3,
      shoulderR: pose.shoulderR + idleSway * 4,
      shoulderL: pose.shoulderL - idleSway * 4,
    });
  }

  if (f.state === State.Block) {
    pose = blendAngles(pose, {
      spineLower: -75,
      spineUpper: -68,
      shoulderR: -38,
      elbowR: -20,
      shoulderL: -142,
      elbowL: -14,
      wristR: -20,
      wristL: 18,
      kneeR: 102,
      kneeL: 102,
    });
  }

  if (f.state === State.PunchStartup) {
    pose = blendAngles(pose, {
      spineUpper: -72,
      shoulderR: -8,
      elbowR: 52,
      shoulderL: -160,
      elbowL: 38,
    });
  }

  if (f.state === State.PunchActive) {
    pose = blendAngles(pose, {
      spineLower: -82,
      spineUpper: -56,
      shoulderR: 10,
      elbowR: 8,
      wristR: 0,
      shoulderL: -170,
      elbowL: 42,
      toeR: 10,
    });
  }

  if (f.state === State.KickStartup) {
    pose = blendAngles(pose, {
      spineUpper: -70,
      shoulderR: -36,
      shoulderL: -134,
      kneeR: 70,
      ankleR: 80,
      toeR: 24,
    });
  }

  if (f.state === State.KickActive) {
    pose = blendAngles(pose, {
      hips: -88,
      spineLower: -82,
      spineUpper: -66,
      shoulderR: -40,
      shoulderL: -128,
      kneeR: 14,
      ankleR: 16,
      toeR: -2,
      kneeL: 112,
      ankleL: 98,
    });
  }

  return pose;
}

function projectPoint(point3d, yaw, centerX, centerY) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const worldX = point3d.x * cosY - point3d.z * sinY;
  const worldZ = point3d.x * sinY + point3d.z * cosY;
  const depth = 340 + worldZ;
  const perspective = 340 / Math.max(160, depth);
  return {
    x: centerX + worldX * perspective,
    y: centerY + point3d.y * perspective,
    scale: perspective,
    zSort: worldZ,
  };
}

function buildSkeleton(f) {
  const pose = getRigPose(f);
  const joints = {
    hips: { x: 0, y: 0, z: 0 },
  };

  for (const [name, parent, length] of FIGHTER_RIG) {
    if (!parent) continue;
    const parentPoint = joints[parent];
    const angle = (pose[parent] ?? -90) * Math.PI / 180;
    const depthTilt = (pose[name] ?? pose[parent] ?? -90) * Math.PI / 180;
    const sideways = name.endsWith('R') ? 1 : name.endsWith('L') ? -1 : 0;
    joints[name] = {
      x: parentPoint.x + Math.cos(angle) * length + sideways * 2,
      y: parentPoint.y + Math.sin(angle) * length,
      z: parentPoint.z + Math.cos(depthTilt) * sideways * 8,
    };
  }

  return joints;
}

function drawFighter(f) {
  const base = f.state === State.Block ? '#ffe489' : f.color;
  const recoil = f.state === State.HitStun ? 8 : 0;
  const centerX = f.x - f.facing * recoil;
  const centerY = f.y - 16;
  const yaw = f.facing === 1 ? -0.35 : Math.PI + 0.35;
  const skeleton = buildSkeleton(f);

  const projected = Object.fromEntries(
    Object.entries(skeleton).map(([name, point]) => [name, projectPoint(point, yaw, centerX, centerY)]),
  );

  const orderedLinks = [...BONE_LINKS].sort((a, b) => {
    const [, parentA] = a;
    const [, parentB] = b;
    return projected[parentA].zSort - projected[parentB].zSort;
  });

  ctx.lineCap = 'round';
  for (const [bone, parent] of orderedLinks) {
    const a = projected[parent];
    const b = projected[bone];
    const thickness = Math.max(2, 5.2 * ((a.scale + b.scale) * 0.5));
    ctx.strokeStyle = base;
    ctx.globalAlpha = 0.8 + Math.min(0.2, (a.scale + b.scale) * 0.15);
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const head = projected.head;
  ctx.globalAlpha = 1;
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(head.x, head.y, Math.max(8, 12 * head.scale), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f7fbff';
  ctx.font = '14px monospace';
  ctx.fillText(f.state, centerX - 48, centerY - 126);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#dce9ff55';
  ctx.fillRect(0, 610, canvas.width, 4);
  drawFighter(world.player);
  drawFighter(world.cpu);
}

function step() {
  if (world.paused) return;
  world.frame++;
  [world.player, world.cpu].forEach((f) => f.hitConfirmedThisState = false);

  if (world.hitStopFrames > 0) {
    world.hitStopFrames--;
    updateHud();
    return;
  }

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
