import { initScene, updateFighter, triggerScreenShake, render3d, koPhase, updateDynamicCamera } from './renderer3d.js';

const TICK_RATE = 120;
const DT = 1 / TICK_RATE;
const FRAMES = {
  blockStartup: 1,
  blockRecovery: 4,
  punchStartup: 7,
  punchActive: 3,
  punchRecovery: 13,
  kickStartup: 10,
  kickActive: 4,
  kickRecovery: 17,
  uppercutStartup: 5,
  uppercutActive: 4,
  uppercutRecovery: 20,
  hitStopPunch: 8,
  hitStopKick: 12,
  hitStopUppercut: 16,
  hitStopBlocked: 6,
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
    pushSeparation: 320,
    wallBounceDamping: 0.18,
    impulseDamping: 10,
    axisResponsivenessX: 1,
    axisResponsivenessY: 0.72,
  },
  punch: { damage: 8, range: 340, proximityRange: 480, yRange: 90, hitStun: 20, blockStun: 9, pushOnHit: 55, pushOnBlock: 55, lungeForce: 1800 },
  kick: { damage: 12, range: 360, proximityRange: 510, yRange: 100, hitStun: 26, blockStun: 12, pushOnHit: 80, pushOnBlock: 70, lungeForce: 1600 },
  uppercut: { damage: 15, range: 350, proximityRange: 480, yRange: 100, hitStun: 36, blockStun: 14, pushOnHit: 120, pushOnBlock: 80, lungeForce: 2400 },
  attackCooldown: 22,
  punchComboWindow: 60,          // frames between punches to keep combo chain alive (~500ms)
  punchExhaustionCooldown: 360,  // frames after uppercut before punching again (~3 seconds)
  chipDamage: 1,
  comboDropFrames: 45, // frames after last hit before combo resets (~375ms)
};

const State = {
  Idle: 'Idle', Move: 'Move', Block: 'Block', BlockRecovery: 'Block_Recovery',
  PunchStartup: 'Punch_Startup', PunchActive: 'Punch_Active', PunchRecovery: 'Punch_Recovery',
  KickStartup: 'Kick_Startup', KickActive: 'Kick_Active', KickRecovery: 'Kick_Recovery',
  UppercutStartup: 'Uppercut_Startup', UppercutActive: 'Uppercut_Active', UppercutRecovery: 'Uppercut_Recovery',
  HitStun: 'Hit_Stun', BlockStun: 'Block_Stun', KO: 'KO',
};

class Fighter {
  constructor(id, color, x) {
    this.id = id; this.color = color; this.x = x; this.y = 560;
    this.facing = 1; this.state = State.Idle; this.stateFrame = 0;
    this.health = CONFIG.healthMax; this.roundWins = 0; this.blockHeld = false;
    this.buffer = [];
    this.attackCooldown = 0;
    this.axisX = 0; this.axisY = 0;
    this.vx = 0; this.vy = 0;
    this.impulseX = 0; this.impulseY = 0;
    // Combo tracking — how many consecutive hits landed on this fighter
    this.comboCount = 0;
    this.comboTimer = 0; // frames since last hit — resets combo when expired
    this.hitFlash = 0;   // frames remaining for hit flash effect
    // Punch combo chain: tracks consecutive punch hits (0→1→2 then uppercut)
    this.punchChain = 0;
    this.punchChainTimer = 0; // frames remaining before chain resets
    this.punchExhaustion = 0; // frames remaining where punching is locked out (post-uppercut)
  }
  actionable() { return [State.Idle, State.Move, State.Block].includes(this.state); }
  inAttack() { return [State.PunchStartup, State.PunchActive, State.PunchRecovery, State.KickStartup, State.KickActive, State.KickRecovery, State.UppercutStartup, State.UppercutActive, State.UppercutRecovery].includes(this.state); }
}

const world = {
  frame: 0, round: 1, timer: CONFIG.roundSeconds,
  player: new Fighter('player', '#2d9bff', 350),
  cpu: new Fighter('cpu', '#ff5353', 930),
  input: { left: false, right: false, up: false, down: false, punch: false, kick: false },
  hitStopFrames: 0, paused: false,
};

const canvas = document.getElementById('arena');
let rendererReady = false;
initScene(canvas).then(() => { rendererReady = true; });
const ui = {
  p1Health: document.getElementById('p1-health'), p2Health: document.getElementById('p2-health'),
  p1Rounds: document.getElementById('p1-rounds'), p2Rounds: document.getElementById('p2-rounds'),
  timer: document.getElementById('timer'), roundText: document.getElementById('round-text'), announcement: document.getElementById('announcement'),
  comboP1: document.getElementById('combo-p1'), comboP2: document.getElementById('combo-p2'),
};

const keyMap = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  k: 'punch', l: 'kick',
};
window.addEventListener('keydown', (e) => setInput(e.key, true));
window.addEventListener('keyup', (e) => setInput(e.key, false));
function setInput(key, val) {
  const mapped = keyMap[key] ?? keyMap[key.toLowerCase()];
  if (!mapped) return;
  if (mapped === 'punch' || mapped === 'kick') {
    // Only register on key down, ignore repeats/holds
    if (val) world.input[mapped] = true;
  } else world.input[mapped] = val;
}

function setupMobileControls() {
  // Single-tap attack buttons — suppress long-press context menu/vibration
  const bindAttack = (id, field) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      world.input[field] = true;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  };
  bindAttack('punch-btn', 'punch');
  bindAttack('kick-btn', 'kick');

  // Floating joystick — left half of screen
  const zone = document.getElementById('stick-zone');
  const stick = document.getElementById('stick');
  const knob = stick.querySelector('.stick-knob');
  let origin = null;
  const DEAD = 18;   // dead-zone radius in px
  const MAX = 55;    // max knob travel radius

  const resetMove = () => { world.input.left = world.input.right = world.input.up = world.input.down = false; };

  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    origin = { x: e.clientX, y: e.clientY };
    stick.classList.remove('hidden');
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
    knob.style.transform = 'translate(-50%,-50%)';
    zone.setPointerCapture(e.pointerId);
  });

  zone.addEventListener('pointermove', (e) => {
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    resetMove();
    if (dx < -DEAD) world.input.left = true;
    if (dx > DEAD) world.input.right = true;
    if (dy < -DEAD) world.input.up = true;
    if (dy > DEAD) world.input.down = true;

    // Move knob visual, clamped to max radius
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, MAX);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamp;
    const ky = Math.sin(angle) * clamp;
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  });

  const release = () => {
    origin = null;
    resetMove();
    stick.classList.add('hidden');
    knob.style.transform = 'translate(-50%,-50%)';
  };
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);
}
setupMobileControls();

// ---------------------------------------------------------------------------
// SBB Chat Control Mode
// ---------------------------------------------------------------------------

const sbb = {
  enabled: false,
  // Separate input state for Player 2 when in chat-control mode
  input2: { left: false, right: false, up: false, down: false, punch: false, kick: false },
};

/** Mirror of simInputForPlayer() but drives world.cpu from sbb.input2. */
function simInputForPlayer2() {
  const p = world.cpu, c = world.player;
  p.attackCooldown = Math.max(0, p.attackCooldown - 1);

  // Always face toward opponent
  const dx = c.x - p.x;
  p.facing = dx > 0 ? 1 : -1;

  // Single-press attacks (consumed this frame)
  if (sbb.input2.punch) enqueueAction(p, 'punch');
  if (sbb.input2.kick)  enqueueAction(p, 'kick');
  sbb.input2.punch = false;
  sbb.input2.kick  = false;

  // SF2-style proximity guard: holding back while opponent threatens = block
  p.blockHeld = false;
  const holdingBack = (p.facing === 1  && sbb.input2.left  && !sbb.input2.right) ||
                      (p.facing === -1 && sbb.input2.right && !sbb.input2.left);
  const proximityGuard = holdingBack && isProximityThreat(c, p);
  if (proximityGuard) p.blockHeld = true;

  if (p.actionable()) {
    p.axisX = (sbb.input2.right ? 1 : 0) - (sbb.input2.left ? 1 : 0);
    p.axisY = (sbb.input2.down  ? 1 : 0) - (sbb.input2.up   ? 1 : 0);
    if (proximityGuard) p.axisX = 0;

    if (p.axisX || p.axisY) {
      if (p.state !== State.Block) setState(p, State.Move);
    } else if (p.state === State.Move) setState(p, State.Idle);

    if (p.blockHeld && p.state !== State.Block) {
      setState(p, State.Block);
      p.buffer.length = 0;
    }
    if (!p.blockHeld && p.state === State.Block) setState(p, State.BlockRecovery);
  }
}

function applyMovementInput(input, fighter, durationMs) {
  input.left = true;
  setTimeout(() => { input.left = false; }, durationMs);
}

window.addEventListener('message', (e) => {
  if (!e.data || e.data.source !== 'sbb') return;
  const msg = e.data;

  if (msg.type === 'init') {
    sbb.enabled = true;
    const ann = document.getElementById('announcement');
    if (ann) {
      ann.textContent = '🎮 CHAT MODE';
      ann.style.display = 'block';
      setTimeout(() => { ann.style.display = 'none'; }, 2500);
    }
    return;
  }

  if (!sbb.enabled || msg.type !== 'bpk') return;

  const isP2 = msg.player === 2;
  const input   = isP2 ? sbb.input2  : world.input;
  const fighter = isP2 ? world.cpu   : world.player;
  const MOVE_MS = 130;  // ~16 frames at 120fps

  switch (msg.action) {
    case 'punch':
    case 'kick':
      input[msg.action] = true; // consumed next tick
      break;
    case 'block': {
      // Hold "back" for 250ms — proximity guard will activate block if opponent is threatening
      const backKey = fighter.facing === 1 ? 'left' : 'right';
      input[backKey] = true;
      setTimeout(() => { input[backKey] = false; }, 250);
      break;
    }
    case 'left':
      input.left = true;
      setTimeout(() => { input.left = false; }, MOVE_MS);
      break;
    case 'right':
      input.right = true;
      setTimeout(() => { input.right = false; }, MOVE_MS);
      break;
    case 'jump':
      input.up = true;
      setTimeout(() => { input.up = false; }, 100);
      break;
  }
});

function enqueueAction(fighter, action) {
  if (fighter.buffer.length > 2) return;
  if (fighter.attackCooldown > 0) return;
  // Post-uppercut exhaustion: can't punch, but can still kick
  if (action === 'punch' && fighter.punchExhaustion > 0) return;
  fighter.buffer.push({ action, expires: world.frame + 10 });
}

function consumeBufferedAction(fighter) {
  fighter.buffer = fighter.buffer.filter((item) => item.expires >= world.frame);
  if (fighter.buffer.length === 0) return;
  // Don't consume attack actions while actively blocking
  if (fighter.blockHeld || fighter.state === State.Block) return;

  // Normal consumption when actionable (idle/move/block)
  if (fighter.actionable()) {
    const next = fighter.buffer.shift();
    if (next.action === 'punch') {
      // 3rd punch in chain auto-upgrades to uppercut
      if (fighter.punchChain >= 2) {
        setState(fighter, State.UppercutStartup);
      } else {
        setState(fighter, State.PunchStartup);
      }
    }
    if (next.action === 'kick') {
      fighter.punchChain = 0; fighter.punchChainTimer = 0; // kick breaks punch chain
      setState(fighter, State.KickStartup);
    }
    fighter.attackCooldown = CONFIG.attackCooldown;
    return;
  }

  // Attack cancel: on hit confirm, allow canceling into the next attack in the chain
  // Punch→Punch (chain), Punch→Kick, Kick→Punch gatling combos
  if (fighter.hitConfirmedThisState) {
    const isPunchState = fighter.state === State.PunchActive || fighter.state === State.PunchRecovery;
    const isKickState = fighter.state === State.KickActive || fighter.state === State.KickRecovery;
    const canCancel = isPunchState || isKickState;
    if (canCancel) {
      const next = fighter.buffer[0];
      // Allow punch→punch chain (including final uppercut), punch→kick, kick→punch
      const isPunchChain = isPunchState && next.action === 'punch';
      const wantsDifferent = isPunchState ? next.action === 'kick' : next.action === 'punch';
      if (isPunchChain || wantsDifferent) {
        fighter.buffer.shift();
        if (next.action === 'punch') {
          if (fighter.punchChain >= 2) {
            setState(fighter, State.UppercutStartup);
          } else {
            setState(fighter, State.PunchStartup);
          }
        }
        if (next.action === 'kick') {
          fighter.punchChain = 0; fighter.punchChainTimer = 0;
          setState(fighter, State.KickStartup);
        }
        fighter.attackCooldown = CONFIG.attackCooldown;
      }
    }
  }
}

function setState(f, next) {
  f.state = next; f.stateFrame = 0;
  f.hitConfirmedThisState = false;
}

// SF2-style proximity guard: returns true if attacker is a threat that should trigger block.
// Only startup + active frames count as threatening (NOT recovery).
// Defender must be within the attack's proximity range (slightly larger than hit range).
function isProximityThreat(attacker, defender) {
  const isPunch = attacker.state === State.PunchStartup || attacker.state === State.PunchActive;
  const isKick = attacker.state === State.KickStartup || attacker.state === State.KickActive;
  const isUppercut = attacker.state === State.UppercutStartup || attacker.state === State.UppercutActive;
  if (!isPunch && !isKick && !isUppercut) return false;

  const move = isUppercut ? CONFIG.uppercut : isPunch ? CONFIG.punch : CONFIG.kick;
  // Use projected position: account for lunge momentum closing distance during startup
  const projectedAx = attacker.x + (attacker.impulseX + attacker.vx) * DT * 3;
  const dx = (defender.x - projectedAx) * attacker.facing;
  const dy = Math.abs(defender.y - attacker.y);
  // Proximity range check: only trigger guard when close enough for this specific attack
  return dx > 0 && dx <= move.proximityRange && dy <= move.yRange;
}

function simInputForPlayer() {
  const p = world.player, c = world.cpu;
  p.blockHeld = false;
  p.attackCooldown = Math.max(0, p.attackCooldown - 1);

  // Single-press attacks
  if (world.input.punch) enqueueAction(p, 'punch');
  if (world.input.kick) enqueueAction(p, 'kick');
  world.input.punch = false; world.input.kick = false;

  // SF2-style proximity guard: holding back while enemy is threatening triggers block.
  // "Threatening" = startup or active frames AND within proximity range of the attack.
  // During recovery frames or outside range, holding back walks backward normally.
  const holdingBack = (p.facing === 1 && world.input.left && !world.input.right) ||
                      (p.facing === -1 && world.input.right && !world.input.left);
  const proximityGuard = holdingBack && isProximityThreat(c, p);
  if (proximityGuard) p.blockHeld = true;

  if (p.actionable()) {
    p.axisX = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
    p.axisY = (world.input.down ? 1 : 0) - (world.input.up ? 1 : 0);

    // Suppress backward movement during proximity guard so player holds ground
    if (proximityGuard) p.axisX = 0;

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

// AI personality shifts over the fight to stay unpredictable
let aiAggression = 0.5; // 0 = defensive, 1 = aggressive
let aiPersonalityTimer = 0;

function simAI() {
  const ai = world.cpu, player = world.player;
  aiCooldown--;
  aiMoveTimer--;
  aiIdleTimer--;
  ai.attackCooldown = Math.max(0, ai.attackCooldown - 1);
  const dx = player.x - ai.x;
  const dy = player.y - ai.y;
  const distance = Math.abs(dx);
  ai.facing = dx > 0 ? 1 : -1;

  if (!ai.actionable()) return;

  // Shift personality periodically — keeps the AI feeling unpredictable
  aiPersonalityTimer--;
  if (aiPersonalityTimer <= 0) {
    aiAggression = 0.2 + Math.random() * 0.7; // range 0.2–0.9
    aiPersonalityTimer = 120 + Math.floor(Math.random() * 180); // shift every 1–2.5s
  }

  // Health-aware aggression: get more aggressive when ahead, more defensive when behind
  const healthRatio = ai.health / Math.max(1, player.health);
  const effectiveAggro = Math.min(1, aiAggression + (healthRatio > 1.3 ? 0.15 : healthRatio < 0.7 ? -0.2 : 0));

  // Reaction to player attacks — mix of block, counter-attack, and getting hit
  // Uses the same proximity guard threat detection as the player
  ai.blockHeld = false;
  const playerThreatening = isProximityThreat(player, ai);
  if (playerThreatening && aiCooldown <= 0) {
    const roll = Math.random();
    if (roll < 0.35 * (1 - effectiveAggro)) {
      // Block
      ai.blockHeld = true;
      setState(ai, State.Block);
      aiCooldown = 8 + Math.floor(Math.random() * 12);
    } else if (roll < 0.35 * (1 - effectiveAggro) + 0.4 * effectiveAggro) {
      // Counter-attack — trade hits instead of blocking
      enqueueAction(ai, Math.random() < 0.5 ? 'punch' : 'kick');
      aiCooldown = 15 + Math.floor(Math.random() * 20);
    } else {
      // Do nothing — sometimes the AI just gets hit
      aiCooldown = 5;
    }
    return;
  }

  // Pick a new movement plan when the current one expires
  if (aiMoveTimer <= 0 && aiIdleTimer <= 0) {
    const roll = Math.random();
    if (distance > 500) {
      aiMoveDir = roll < (0.5 + effectiveAggro * 0.4) ? 1 : 0;
      aiMoveTimer = 30 + Math.floor(Math.random() * 40);
    } else if (distance < 340) {
      // Close: aggressive AI holds ground or advances, defensive AI retreats
      if (roll < effectiveAggro * 0.4) aiMoveDir = 0;
      else if (roll < 0.4 + effectiveAggro * 0.3) aiMoveDir = -1;
      else aiMoveDir = 0;
      aiMoveTimer = 20 + Math.floor(Math.random() * 35);
    } else {
      // Mid range
      if (roll < 0.2 + effectiveAggro * 0.3) aiMoveDir = 1;
      else if (roll < 0.5) aiMoveDir = -1;
      else aiMoveDir = 0;
      aiMoveTimer = 25 + Math.floor(Math.random() * 45);
    }
    aiIdleTimer = 10 + Math.floor(Math.random() * 20);
  }

  // Execute movement plan
  if (aiMoveTimer > 0 && aiMoveDir !== 0) {
    ai.axisX = Math.sign(dx) * aiMoveDir * (0.4 + effectiveAggro * 0.4);
    ai.axisY = Math.sign(dy) * 0.25;
    setState(ai, State.Move);
  } else {
    ai.axisX = 0;
    ai.axisY = 0;
    if (ai.state === State.Move) setState(ai, State.Idle);
  }

  // Attack decision — aggression drives frequency and timing
  if (distance < 420 && aiCooldown <= 0) {
    if (Math.random() < 0.3 + effectiveAggro * 0.35) {
      enqueueAction(ai, Math.random() < 0.55 ? 'punch' : 'kick');
    }
    aiCooldown = Math.floor(25 + (1 - effectiveAggro) * 50 + Math.random() * 30);
  }
}

function processStates(f) {
  f.stateFrame++;
  switch (f.state) {
    case State.BlockRecovery:
      if (f.stateFrame >= FRAMES.blockRecovery) setState(f, State.Idle);
      break;
    case State.PunchStartup:
      if (f.stateFrame === 1) f.impulseX += f.facing * CONFIG.punch.lungeForce;
      if (f.stateFrame >= FRAMES.punchStartup) setState(f, State.PunchActive);
      break;
    case State.PunchActive:
      if (f.stateFrame >= FRAMES.punchActive) setState(f, State.PunchRecovery);
      break;
    case State.PunchRecovery:
      if (f.stateFrame >= FRAMES.punchRecovery) setState(f, State.Idle);
      break;
    case State.KickStartup:
      if (f.stateFrame === 1) f.impulseX += f.facing * CONFIG.kick.lungeForce;
      if (f.stateFrame >= FRAMES.kickStartup) setState(f, State.KickActive);
      break;
    case State.KickActive:
      if (f.stateFrame >= FRAMES.kickActive) setState(f, State.KickRecovery);
      break;
    case State.KickRecovery:
      if (f.stateFrame >= FRAMES.kickRecovery) setState(f, State.Idle);
      break;
    case State.UppercutStartup:
      if (f.stateFrame === 1) f.impulseX += f.facing * CONFIG.uppercut.lungeForce;
      if (f.stateFrame >= FRAMES.uppercutStartup) setState(f, State.UppercutActive);
      break;
    case State.UppercutActive:
      if (f.stateFrame >= FRAMES.uppercutActive) setState(f, State.UppercutRecovery);
      break;
    case State.UppercutRecovery:
      if (f.stateFrame >= FRAMES.uppercutRecovery) setState(f, State.Idle);
      break;
    case State.HitStun:
    case State.BlockStun:
      if (f.stateFrame >= f.stunFrames) setState(f, State.Idle);
      break;
  }
  consumeBufferedAction(f);
}

function tryHit(attacker, defender, move, moveType) {
  if (attacker.hitConfirmedThisState) return;
  const dx = (defender.x - attacker.x) * attacker.facing;
  const dy = Math.abs(defender.y - attacker.y);
  if (dx <= 0 || dx > move.range || dy > move.yRange) return;

  const blocked = defender.state === State.Block || defender.state === State.BlockStun;
  if (blocked) {
    defender.health = Math.max(0, defender.health - CONFIG.chipDamage);
    setState(defender, State.BlockStun); defender.stunFrames = move.blockStun;
    attacker.impulseX -= attacker.facing * move.pushOnBlock * 28;
    defender.impulseX += attacker.facing * move.pushOnBlock * 18;
    world.hitStopFrames = FRAMES.hitStopBlocked;
    triggerScreenShake(moveType === 'uppercut' ? 10 : 4);
    // Blocking breaks the attacker's punch chain
    attacker.punchChain = 0; attacker.punchChainTimer = 0;
    // Blocking resets the attacker's combo
    defender.comboCount = 0;
    defender.comboTimer = 0;
    defender.hitFlash = 4;
  } else {
    // Combo scaling: hitstun decays ~12% per hit, knockback grows ~8% per hit
    defender.comboCount++;
    defender.comboTimer = CONFIG.comboDropFrames;
    const comboN = defender.comboCount;
    const stunScale = Math.max(0.5, 1 - (comboN - 1) * 0.12);   // floor at 50%
    const kbScale = Math.min(1.5, 1 + (comboN - 1) * 0.08);     // cap at 150%

    defender.health = Math.max(0, defender.health - move.damage);
    setState(defender, State.HitStun);
    defender.stunFrames = Math.round(move.hitStun * stunScale);
    defender.impulseX += attacker.facing * move.pushOnHit * 22 * kbScale;
    attacker.impulseX -= attacker.facing * move.pushOnHit * 9;

    const hitStopMap = { punch: FRAMES.hitStopPunch, kick: FRAMES.hitStopKick, uppercut: FRAMES.hitStopUppercut };
    const shakeMap = { punch: 12, kick: 18, uppercut: 24 };
    world.hitStopFrames = hitStopMap[moveType];
    triggerScreenShake(shakeMap[moveType]);
    defender.hitFlash = moveType === 'uppercut' ? 8 : 6;

    // Punch chain tracking: consecutive punch hits build toward uppercut
    if (moveType === 'punch') {
      attacker.punchChain++;
      attacker.punchChainTimer = CONFIG.punchComboWindow;
    } else if (moveType === 'uppercut') {
      // Uppercut finisher — exhaustion locks out punching, kicks still allowed
      attacker.punchChain = 0;
      attacker.punchChainTimer = 0;
      attacker.punchExhaustion = CONFIG.punchExhaustionCooldown;
    } else {
      // Kick resets punch chain
      attacker.punchChain = 0; attacker.punchChainTimer = 0;
    }
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

  if (p.state === State.PunchActive) tryHit(p, c, CONFIG.punch, 'punch');
  if (p.state === State.KickActive) tryHit(p, c, CONFIG.kick, 'kick');
  if (p.state === State.UppercutActive) tryHit(p, c, CONFIG.uppercut, 'uppercut');
  if (c.state === State.PunchActive) tryHit(c, p, CONFIG.punch, 'punch');
  if (c.state === State.KickActive) tryHit(c, p, CONFIG.kick, 'kick');
  if (c.state === State.UppercutActive) tryHit(c, p, CONFIG.uppercut, 'uppercut');

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

  // Non-linear impulse decay: fast initial falloff, long tail for satisfying knockback arc
  const decay = Math.pow(Math.max(0, 1 - physics.impulseDamping * DT), 1.4);
  f.impulseX *= decay;
  f.impulseY *= decay;

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
  // Freeze both fighters — KO'd fighters play death animation, winner idles
  [p, c].forEach(f => { setState(f, f.health <= 0 ? State.KO : State.Idle); f.vx = 0; f.vy = 0; f.impulseX = 0; f.impulseY = 0; f.buffer.length = 0; f.attackCooldown = 0; f.hitFlash = 0; });
  roundLockFrames = 180;
}

function koAnimationDone() {
  // Check that all KO'd fighters have finished their full animation sequence
  const fighters = [world.player, world.cpu];
  for (const f of fighters) {
    if (f.state === State.KO && koPhase[f.id] !== 'done') return false;
  }
  return true;
}

function resetRoundIfNeeded() {
  if (roundLockFrames <= 0) return;
  roundLockFrames--;
  // Don't transition until KO animation is fully done (and at least 60 frames for announcement)
  if (roundLockFrames > 0 || !koAnimationDone()) {
    // Keep waiting — re-increment so lock stays active
    if (roundLockFrames <= 0) roundLockFrames = 1;
    return;
  }

  const p = world.player, c = world.cpu;
  if (p.roundWins >= CONFIG.roundWinsNeeded || c.roundWins >= CONFIG.roundWinsNeeded) {
    ui.announcement.textContent = `${p.roundWins > c.roundWins ? 'Player' : 'CPU'} Wins Match!  Tap to play again`;
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
    f.attackCooldown = 0;
    f.comboCount = 0; f.comboTimer = 0; f.hitFlash = 0; f.punchChain = 0; f.punchChainTimer = 0; f.punchExhaustion = 0;
    setState(f, State.Idle);
  });
  ui.announcement.textContent = '';
}

function resetMatch() {
  world.round = 1;
  world.timer = CONFIG.roundSeconds;
  world.frame = 0;
  world.hitStopFrames = 0;
  world.paused = false;
  roundLockFrames = 0;
  aiCooldown = 0; aiMoveTimer = 0; aiMoveDir = 0; aiIdleTimer = 60;
  aiAggression = 0.5; aiPersonalityTimer = 0;
  [world.player, world.cpu].forEach((f, i) => {
    f.health = CONFIG.healthMax;
    f.roundWins = 0;
    f.x = i === 0 ? 350 : 930;
    f.y = 560;
    f.vx = 0; f.vy = 0;
    f.impulseX = 0; f.impulseY = 0;
    f.buffer.length = 0;
    f.attackCooldown = 0;
    f.comboCount = 0; f.comboTimer = 0; f.hitFlash = 0; f.punchChain = 0; f.punchChainTimer = 0; f.punchExhaustion = 0;
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

  // Combo counters — show on the ATTACKER's side when they land combos
  // (comboCount is on the defender, so cpu.comboCount = hits landed BY player)
  updateComboDisplay(ui.comboP1, world.cpu.comboCount, world.cpu.comboTimer);
  updateComboDisplay(ui.comboP2, world.player.comboCount, world.player.comboTimer);
}

function updateComboDisplay(el, comboCount, comboTimer) {
  const side = el.id === 'combo-p1' ? 'left' : 'right';
  if (comboCount >= 2) {
    el.textContent = `${comboCount} HIT`;
    el.className = `combo-counter ${side} active`;
  } else if (el.classList.contains('active')) {
    el.className = `combo-counter ${side} fading`;
  } else if (el.classList.contains('fading') && comboTimer <= 0) {
    el.className = `combo-counter ${side}`;
  }
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
  updateDynamicCamera(world.player, world.cpu);
  updateFighter('player', world.player);
  updateFighter('cpu', world.cpu);
  render3d();
}

function step() {
  if (world.paused) {
    // Any attack/block input restarts the match
    if (world.input.punch || world.input.kick) {
      world.input.punch = false; world.input.kick = false;
      resetMatch();
    }
    return;
  }
  world.frame++;

  // During round-end lock, freeze all simulation — just wait for KO animation
  if (roundLockFrames > 0) {
    resetRoundIfNeeded();
    updateHud();
    return;
  }

  if (world.hitStopFrames > 0) {
    world.hitStopFrames--;
    updateHud();
    return;
  }

  // Decay combo timers, punch chain timers, and hit flash
  [world.player, world.cpu].forEach((f) => {
    if (f.comboTimer > 0) {
      f.comboTimer--;
      if (f.comboTimer <= 0) f.comboCount = 0;
    }
    if (f.punchChainTimer > 0) {
      f.punchChainTimer--;
      if (f.punchChainTimer <= 0) f.punchChain = 0;
    }
    if (f.punchExhaustion > 0) f.punchExhaustion--;
    // Getting hit resets your punch chain
    if (f.state === State.HitStun && f.stateFrame === 1) {
      f.punchChain = 0; f.punchChainTimer = 0;
    }
    if (f.hitFlash > 0) f.hitFlash--;
  });

  simInputForPlayer();
  if (sbb.enabled) simInputForPlayer2(); else simAI();
  integrateFighterPhysics(world.player);
  integrateFighterPhysics(world.cpu);
  processStates(world.player);
  processStates(world.cpu);
  resolveCombat();
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
