// Compute kick poses by extracting rotation deltas from WalkJump animation
// and applying them to the game's idle pose. This ensures correct rotation direction.
function quat(x, y, z, w) { return { x, y, z, w }; }
function quatConj(q) { return quat(-q.x, -q.y, -q.z, q.w); }
function quatMul(a, b) {
  return quat(
    a.x*b.w + a.w*b.x + a.y*b.z - a.z*b.y,
    a.y*b.w + a.w*b.y + a.z*b.x - a.x*b.z,
    a.z*b.w + a.w*b.z + a.x*b.y - a.y*b.x,
    a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z
  );
}
function quatNorm(q) {
  const l = Math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
  return quat(q.x/l, q.y/l, q.z/l, q.w/l);
}
function quatPow(q, power) {
  // Scale the rotation angle by 'power'
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle < 0.0001) return quat(0, 0, 0, 1);
  const sinHalf = Math.sin(angle / 2);
  const ax = q.x / sinHalf, ay = q.y / sinHalf, az = q.z / sinHalf;
  const newAngle = angle * power;
  const s = Math.sin(newAngle / 2);
  const c = Math.cos(newAngle / 2);
  return quat(ax * s, ay * s, az * s, c);
}
function fmt(q) { return `[${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)}]`; }

// ========== Reference poses ==========
// Game idle (from Idle animation t=0.000)
const gameIdle = {
  UpperLegR: quat(0.9795, -0.0257, 0.1373, 0.1449),
  LowerLegR: quat(0.2772, 0.0000, 0.0000, 0.9608),
  UpperLegL: quat(0.9855, 0.0176, -0.0843, 0.1461),
  LowerLegL: quat(0.2772, 0.0000, 0.0000, 0.9608),
  FootR:     quat(0.0000, 0.6955, 0.7185, 0.0000),
  Body:      quat(0.0000, 0.0000, 0.0000, 1.0000),
  Head:      quat(-0.0309, -0.0029, -0.0013, 0.9995),
  UpperArmL: quat(-0.0546, -0.6899, 0.0692, 0.7185),
  LowerArmL: quat(0.3100, 0.4993, -0.3649, 0.7221),
  UpperArmR: quat(0.0436, 0.8046, 0.0575, 0.5895),
  LowerArmR: quat(0.0897, -0.7051, 0.2550, 0.6556),
};

// WalkJump reference poses
const wjIdle = {
  UpperLegR: quat(0.9178, -0.0587, 0.1276, 0.3715),
  LowerLegR: quat(0.6171, 0.0000, 0.0000, 0.7869),
  UpperLegL: quat(0.9233, 0.0382, -0.0780, 0.3740),
  LowerLegL: quat(0.6171, 0.0000, 0.0000, 0.7869),
  FootR:     quat(0.0000, 0.6955, 0.7185, 0.0000),
  Body:      quat(0.0000, 0.0000, 0.0000, 1.0000),
};
const wjChamber = { // WalkJump t=0.125
  UpperLegR: quat(0.7776, -0.0658, 0.1176, 0.6142),
  LowerLegR: quat(0.7983, 0.0000, 0.0000, 0.6022),
  FootR:     quat(0.0000, 0.6955, 0.7185, 0.0000),
};

// ========== Compute deltas from WalkJump ==========
// delta = target * inverse(source) — this gives us the rotation that transforms source into target
// Then we apply: game_target = delta * game_idle

console.log('=== Computing rotation deltas from WalkJump ===\n');

// UpperLegR: WalkJump idle → WalkJump chamber (leg swings forward)
const delta_upperLegR = quatNorm(quatMul(wjChamber.UpperLegR, quatConj(wjIdle.UpperLegR)));
console.log(`UpperLegR delta (fwd swing):  ${fmt(delta_upperLegR)}`);
const angle_upperLegR = 2 * Math.acos(Math.abs(delta_upperLegR.w)) * 180 / Math.PI;
console.log(`  → rotation angle: ${angle_upperLegR.toFixed(1)}°`);

// Apply 1x delta for chamber, 2.2x for extension (bigger kick)
const UpperLegR_chamber = quatNorm(quatMul(delta_upperLegR, gameIdle.UpperLegR));
const delta_upperLegR_ext = quatPow(delta_upperLegR, 2.5);
const UpperLegR_extend = quatNorm(quatMul(delta_upperLegR_ext, gameIdle.UpperLegR));
console.log(`UpperLegR_chamber (1.0x): ${fmt(UpperLegR_chamber)}`);
console.log(`UpperLegR_extend  (2.5x): ${fmt(UpperLegR_extend)}`);

// LowerLegR: bend more for chamber (use WalkJump chamber), straighten for extend
const delta_lowerLegR = quatNorm(quatMul(wjChamber.LowerLegR, quatConj(wjIdle.LowerLegR)));
console.log(`\nLowerLegR delta (bend):       ${fmt(delta_lowerLegR)}`);
const LowerLegR_chamber = quatNorm(quatMul(delta_lowerLegR, gameIdle.LowerLegR));
const LowerLegR_extend = quat(0.0035, 0.0000, 0.0000, 1.0000); // Fully straight (from Punch)
console.log(`LowerLegR_chamber: ${fmt(LowerLegR_chamber)}`);
console.log(`LowerLegR_extend:  ${fmt(LowerLegR_extend)}`);

// FootR
const FootR_chamber = quat(0.0000, 0.8145, 0.5802, 0.0000);
const FootR_extend = quat(0.0000, 0.9310, 0.3651, 0.0000);
console.log(`\nFootR_chamber: ${fmt(FootR_chamber)}`);
console.log(`FootR_extend:  ${fmt(FootR_extend)}`);

// Body: slight backward lean at extension
const Body_chamber = gameIdle.Body;
// Use WalkJump t=0.333 body: [-0.0147, -0.0380, 0.0621, 0.9972]
// But that has Y/Z twist. Just use a simple backward lean.
const Body_extend = quat(-0.0436, 0.0000, 0.0000, 0.9990);
console.log(`\nBody_chamber: ${fmt(Body_chamber)}`);
console.log(`Body_extend:  ${fmt(Body_extend)}`);

// Head: stays at idle
console.log(`Head_kick:    ${fmt(gameIdle.Head)}`);

// Arms: Punch guard for left, idle for right
const UpperArmL_kick = quat(0.2299, -0.7727, -0.0876, 0.5852);
const LowerArmL_kick = quat(0.1468, 0.5207, -0.6558, 0.5265);
console.log(`\nUpperArmL_kick (punch guard): ${fmt(UpperArmL_kick)}`);
console.log(`LowerArmL_kick (punch guard): ${fmt(LowerArmL_kick)}`);
console.log(`UpperArmR_kick (idle): ${fmt(gameIdle.UpperArmR)}`);
console.log(`LowerArmR_kick (idle): ${fmt(gameIdle.LowerArmR)}`);

// Plant leg: stay near idle (Punch t=0.250 for subtle weight shift)
const UpperLegL_plant = quat(0.9862, 0.0398, -0.1177, 0.1096);
const LowerLegL_plant = quat(0.3244, 0.0000, 0.0000, 0.9459);
console.log(`\nUpperLegL_plant: ${fmt(UpperLegL_plant)}`);
console.log(`LowerLegL_plant: ${fmt(LowerLegL_plant)}`);

console.log('\n=== JS Object ===\n');
console.log(`  const kick = {
    UpperLegR_chamber: ${fmt(UpperLegR_chamber)},
    UpperLegR_extend:  ${fmt(UpperLegR_extend)},
    LowerLegR_chamber: ${fmt(LowerLegR_chamber)},
    LowerLegR_extend:  ${fmt(LowerLegR_extend)},
    FootR_chamber:     ${fmt(FootR_chamber)},
    FootR_extend:      ${fmt(FootR_extend)},
    Body_chamber:      ${fmt(Body_chamber)},
    Body_extend:       ${fmt(Body_extend)},
    Head_kick:         ${fmt(gameIdle.Head)},
    UpperArmL_kick:    ${fmt(UpperArmL_kick)},
    LowerArmL_kick:    ${fmt(LowerArmL_kick)},
    UpperArmR_kick:    ${fmt(gameIdle.UpperArmR)},
    LowerArmR_kick:    ${fmt(gameIdle.LowerArmR)},
    UpperLegL_plant:   ${fmt(UpperLegL_plant)},
    LowerLegL_plant:   ${fmt(LowerLegL_plant)},
  };`);
