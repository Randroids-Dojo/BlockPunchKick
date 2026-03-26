import { initScene, updateFighter, triggerScreenShake, render3d, koPhase, updateDynamicCamera, setFighterVisible, setGlobalTimeScale, applyDemoPose, clearDemoPose } from './renderer3d.js';

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
  punchBtn: document.getElementById('punch-btn'), kickBtn: document.getElementById('kick-btn'),
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
  // Post-uppercut exhaustion: can't punch, but can still kick
  if (action === 'punch' && fighter.punchExhaustion > 0) return;
  // Allow buffering during attacks (for gatling cancels), but respect cooldown otherwise
  if (fighter.attackCooldown > 0 && !fighter.inAttack()) return;
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
  // Preserve hit confirm across Active→Recovery so gatling cancel window extends into recovery
  const keepConfirm =
    (f.state === State.PunchActive && next === State.PunchRecovery) ||
    (f.state === State.KickActive && next === State.KickRecovery) ||
    (f.state === State.UppercutActive && next === State.UppercutRecovery);
  const hadConfirm = f.hitConfirmedThisState;
  f.state = next; f.stateFrame = 0;
  f.hitConfirmedThisState = keepConfirm ? hadConfirm : false;
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
    ui.announcement.textContent = `${p.roundWins > c.roundWins ? 'Player' : 'CPU'} Wins Match!`;
    world.paused = true;
    // Return to title screen after a delay
    setTimeout(showTitleScreen, 2500);
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

  // Gray out buttons when attacks are temporarily locked out
  const p = world.player;
  const busy = p.inAttack() || p.state === State.HitStun || p.state === State.BlockStun;
  ui.punchBtn.classList.toggle('disabled', busy || p.punchExhaustion > 0);
  ui.kickBtn.classList.toggle('disabled', busy);
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
  if (gameMode === 'demo') {
    // In demo mode, spread fighters apart to get a medium zoom that shows the full robot
    const solo = { ...world.player };
    const fakeCpu = { ...solo, x: solo.x + 400 }; // offset triggers medium zoom
    updateDynamicCamera(solo, fakeCpu);
  } else {
    updateDynamicCamera(world.player, world.cpu);
  }
  updateFighter('player', world.player);
  updateFighter('cpu', world.cpu);
  render3d();
}

function step() {
  if (gameMode === 'demo') {
    stepDemo();
    integrateFighterPhysics(world.player);
    processStates(world.player);
    return;
  }
  if (world.paused) {
    if (gameMode === 'title') return; // title screen handles its own input
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
  const rawDelta = Math.min(0.06, (ts - lastTime) / 1000);
  const timeScale = gameMode === 'demo' ? DEMO_SPEEDS[demoSpeedIndex].scale : 1.0;
  accumulator += rawDelta * timeScale;
  lastTime = ts;
  while (accumulator >= DT) {
    step();
    accumulator -= DT;
  }
  render();
  requestAnimationFrame(gameLoop);
}
// ─── Title Screen & Demo Mode ───────────────────────────────────

let gameMode = 'title'; // 'title' | 'play' | 'demo'

const titleScreen = document.getElementById('title-screen');
const playBtn = document.getElementById('play-btn');
const demoBtn = document.getElementById('demo-btn');

// Hide HUD and controls on title screen
function setGameUIVisible(visible) {
  const display = visible ? '' : 'none';
  document.querySelector('.hud').style.display = visible ? 'grid' : 'none';
  document.querySelector('.action-buttons-fixed').style.display = visible ? 'flex' : 'none';
  document.querySelector('.stick-zone').style.display = display;
  ui.comboP1.style.display = display;
  ui.comboP2.style.display = display;
}

function showTitleScreen() {
  gameMode = 'title';
  world.paused = true;
  titleScreen.classList.remove('hidden');
  demoPanel.style.display = 'none';
  setGlobalTimeScale(1.0);
  demoSpeedIndex = 0;
  currentDemoPose = null;
  currentDemoRot = 'none';
  clearDemoPose();
  setGameUIVisible(false);
  // Show both fighters idling at default positions for the background
  setFighterVisible('player', true);
  setFighterVisible('cpu', true);
  resetMatch();
}

function startPlay() {
  gameMode = 'play';
  titleScreen.classList.add('hidden');
  demoPanel.style.display = 'none';
  setGameUIVisible(true);
  setFighterVisible('player', true);
  setFighterVisible('cpu', true);
  resetMatch();
}

// ─── Demo Mode ──────────────────────────────────────────────────

const DEMO_MOVE_DEFS = {
  'idle':      { caption: 'Idle',              state: State.Idle },
  'walk-fwd':  { caption: 'Walk Forward',      state: State.Move,            axisX: 1 },
  'walk-back': { caption: 'Walk Backward',     state: State.Move,            axisX: -1 },
  'punch-r':   { caption: 'Punch (Right)',     state: State.PunchStartup,    chain: 0 },
  'punch-l':   { caption: 'Punch (Left Jab)',  state: State.PunchStartup,    chain: 1 },
  'uppercut':  { caption: 'Uppercut',          state: State.UppercutStartup, chain: 2 },
  'kick':      { caption: 'Kick',              state: State.KickStartup },
  'block':     { caption: 'Block',             state: State.Block },
  'hitstun':   { caption: 'Hit Stun',          state: State.HitStun,         stun: 30 },
};

const DEMO_SPEEDS = [
  { label: '1x',    scale: 1.0 },
  { label: '0.5x',  scale: 0.5 },
  { label: '0.25x', scale: 0.25 },
];

let demoCurrentMove = null;      // key into DEMO_MOVE_DEFS
let demoSpeedIndex = 0;

const demoPanel = document.getElementById('demo-panel');
const demoCaptionEl = document.getElementById('demo-caption');
const demoSpeedBtn = document.getElementById('demo-speed-btn');
const demoMoveBtns = demoPanel.querySelectorAll('.demo-move-btn');

function resetDemoFighter() {
  const p = world.player;
  p.axisX = 0; p.axisY = 0;
  p.blockHeld = false;
  p.punchChain = 0; p.punchChainTimer = 0; p.punchExhaustion = 0;
  p.attackCooldown = 0;
  p.hitFlash = 0;
  p.x = 640; p.y = 560;
  p.vx = 0; p.vy = 0;
  p.impulseX = 0; p.impulseY = 0;
  p.facing = 1;
  setState(p, State.Idle);
}

function triggerDemoMove(moveKey) {
  const def = DEMO_MOVE_DEFS[moveKey];
  if (!def) return;

  // Clear any active pose
  currentDemoPose = null;
  clearDemoPose();
  demoPoseBtns.forEach(btn => btn.classList.remove('active'));

  // Reset fighter to clean state before starting new move
  resetDemoFighter();
  demoCurrentMove = moveKey;
  demoCaptionEl.textContent = def.caption;

  // Highlight active button
  demoMoveBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.move === moveKey));

  const p = world.player;
  if (def.state === State.Move) {
    setState(p, State.Move);
    p.axisX = def.axisX || 0;
  } else if (def.state === State.Block) {
    p.blockHeld = true;
    setState(p, State.Block);
  } else if (def.state === State.HitStun) {
    setState(p, State.HitStun);
    p.stunFrames = def.stun || 30;
    p.hitFlash = 6;
  } else if (def.state === State.PunchStartup) {
    p.punchChain = def.chain || 0;
    p.punchChainTimer = 999;
    setState(p, State.PunchStartup);
  } else if (def.state === State.UppercutStartup) {
    p.punchChain = 2;
    p.punchChainTimer = 999;
    setState(p, State.UppercutStartup);
  } else if (def.state === State.KickStartup) {
    setState(p, State.KickStartup);
  } else {
    setState(p, State.Idle);
  }
}

function startDemo() {
  gameMode = 'demo';
  titleScreen.classList.add('hidden');
  setGameUIVisible(false);
  demoPanel.style.display = '';
  setFighterVisible('player', true);
  setFighterVisible('cpu', false);

  const p = world.player;
  p.health = CONFIG.healthMax;
  p.roundWins = 0;
  resetDemoFighter();

  const c = world.cpu;
  c.x = -500; c.y = 560;
  setState(c, State.Idle);

  world.paused = false;
  demoCurrentMove = 'idle';
  setGlobalTimeScale(DEMO_SPEEDS[demoSpeedIndex].scale);
  demoCaptionEl.textContent = 'Idle';
  demoMoveBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.move === 'idle'));
}

function stepDemo() {
  const p = world.player;
  const def = demoCurrentMove ? DEMO_MOVE_DEFS[demoCurrentMove] : null;

  // Keep continuous moves active
  if (def && def.state === State.Move) {
    p.axisX = def.axisX || 0;
    if (p.state === State.Idle) setState(p, State.Move);
  }
  if (def && def.state === State.Block) {
    p.blockHeld = true;
    if (p.state !== State.Block && p.state !== State.BlockRecovery) {
      setState(p, State.Block);
    }
  }

  // When a one-shot move finishes, return to idle and clear highlight
  if (def && def.state !== State.Idle && def.state !== State.Move && def.state !== State.Block) {
    if (p.state === State.Idle) {
      demoCurrentMove = 'idle';
      demoCaptionEl.textContent = 'Idle';
      demoMoveBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.move === 'idle'));
    }
  }
}

// Wire up demo move buttons
demoMoveBtns.forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    triggerDemoMove(btn.dataset.move);
  });
});

// Wire up speed toggle
demoSpeedBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  demoSpeedIndex = (demoSpeedIndex + 1) % DEMO_SPEEDS.length;
  demoSpeedBtn.textContent = DEMO_SPEEDS[demoSpeedIndex].label;
  setGlobalTimeScale(DEMO_SPEEDS[demoSpeedIndex].scale);
});

// ─── Demo Poses ─────────────────────────────────────────────────
// Quaternion helper: multiply q1 * q2
function qmul(a, b) {
  return [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
  ];
}
// Quaternion from axis-angle (axis must be unit, angle in radians)
function qaxis(ax, ay, az, angle) {
  const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
  return [ax * s, ay * s, az * s, c];
}

const ID = [0, 0, 0, 1]; // identity
const H = Math.SQRT1_2;  // 0.7071...

// All poses defined directly from T-pose (identity).
// Proven: Y rotation = frontal plane. +Y = down (idle direction), -Y = up.
// For left arm: mirrored, so -Y = down, +Y = up.
// Forward/back: X rotation (sagittal plane). Right: +X = fwd, -X = back.
// Left arm mirrored: -X = fwd, +X = back.
const DEMO_POSES = {
  'tpose':      { UpperArmR: ID, LowerArmR: ID, UpperArmL: ID, LowerArmL: ID },
  'arms-up':    { UpperArmR: [0,0,-H,H], LowerArmR: ID, UpperArmL: [0,0,H,H],  LowerArmL: ID },
  'arms-fwd':   { UpperArmR: [-H,0,0,H], LowerArmR: ID, UpperArmL: [-H,0,0,H], LowerArmL: ID },
  'arms-back':  { UpperArmR: [H,0,0,H],  LowerArmR: ID, UpperArmL: [H,0,0,H],  LowerArmL: ID },
  'rfwd-lback': { UpperArmR: [-H,0,0,H], LowerArmR: ID, UpperArmL: [H,0,0,H],  LowerArmL: ID },
  'lfwd-rback': { UpperArmR: [H,0,0,H],  LowerArmR: ID, UpperArmL: [-H,0,0,H], LowerArmL: ID },
};

// Palm rotation twists on LowerArm bones.
// Twist axis for forearm in T-pose is along its length.
// Try Y-axis rotation; if wrong axis, will swap to X or Z.
const DEMO_ROTATIONS = {
  'none':       { LowerArmR: ID, LowerArmL: ID },
  'palms-up':   { LowerArmR: [0,H,0,H],   LowerArmL: [0,-H,0,H]  },
  'palms-down': { LowerArmR: [0,-H,0,H],  LowerArmL: [0,H,0,H]   },
  'palms-out':  { LowerArmR: [0,1,0,0],   LowerArmL: [0,-1,0,0]  },
  'palms-in':   { LowerArmR: ID, LowerArmL: ID },
};

let currentDemoPose = null;
let currentDemoRot = 'none';

const demoPoseBtns = demoPanel.querySelectorAll('.demo-pose-btn');
const demoRotBtns = demoPanel.querySelectorAll('.demo-rot-btn');

function applyCurrentPose() {
  if (!currentDemoPose) { clearDemoPose(); return; }
  const pose = DEMO_POSES[currentDemoPose];
  const rot = DEMO_ROTATIONS[currentDemoRot] || DEMO_ROTATIONS['none'];
  if (!pose) return;

  // Merge pose + rotation: compose forearm twist on top of pose's lower arm
  const merged = { ...pose };
  if (rot.LowerArmR) merged.LowerArmR = qmul(pose.LowerArmR || ID, rot.LowerArmR);
  if (rot.LowerArmL) merged.LowerArmL = qmul(pose.LowerArmL || ID, rot.LowerArmL);
  applyDemoPose(merged);
}

function selectDemoPose(poseKey) {
  // Clear any active move
  demoCurrentMove = null;
  demoCaptionEl.textContent = '';
  demoMoveBtns.forEach(btn => btn.classList.remove('active'));
  resetDemoFighter();

  if (currentDemoPose === poseKey) {
    // Toggle off
    currentDemoPose = null;
    clearDemoPose();
  } else {
    currentDemoPose = poseKey;
    applyCurrentPose();
  }
  demoPoseBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.pose === currentDemoPose));
  const label = currentDemoPose ? demoPoseBtns[0]?.parentElement.querySelector(`[data-pose="${currentDemoPose}"]`)?.textContent : '';
  demoCaptionEl.textContent = label || '';
}

function selectDemoRotation(rotKey) {
  currentDemoRot = rotKey;
  demoRotBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.rot === rotKey));
  if (currentDemoPose) applyCurrentPose();
}

// Wire up pose buttons
demoPoseBtns.forEach(btn => {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); selectDemoPose(btn.dataset.pose); });
});
demoRotBtns.forEach(btn => {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); selectDemoRotation(btn.dataset.rot); });
});

// ─── Button Handlers ────────────────────────────────────────────

playBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startPlay(); });
demoBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startDemo(); });
document.getElementById('demo-quit-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); showTitleScreen(); });
// Also handle keyboard on title screen
window.addEventListener('keydown', (e) => {
  if (gameMode === 'title') {
    if (e.key === 'Enter' || e.key === ' ') startPlay();
    if (e.key === 'd' || e.key === 'D') startDemo();
  }
  if (gameMode === 'demo') {
    if (e.key === 'Escape') showTitleScreen();
  }
});

// Start on title screen
world.paused = true;
setGameUIVisible(false);
requestAnimationFrame(gameLoop);
