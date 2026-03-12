// Compute kick poses by scaling up the Punch forward-step delta.
// We know Punch t=0.083 moves the right leg forward. Scale that up for a kick.
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
  let w = q.w;
  let flip = false;
  if (w < 0) { q = quat(-q.x, -q.y, -q.z, -q.w); w = -w; flip = true; }
  const angle = 2 * Math.acos(Math.min(1, w));
  if (angle < 0.0001) return quat(0, 0, 0, 1);
  const sinHalf = Math.sin(angle / 2);
  const ax = q.x / sinHalf, ay = q.y / sinHalf, az = q.z / sinHalf;
  const newAngle = angle * power;
  const s = Math.sin(newAngle / 2);
  const c = Math.cos(newAngle / 2);
  return quat(ax * s, ay * s, az * s, c);
}
function fmt(q) { return `[${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)}]`; }

// Game idle (confirmed same as Punch t=0.000)
const idle = {
  UpperLegR: quat(0.9795, -0.0257, 0.1373, 0.1449),
  LowerLegR: quat(0.2772, 0.0000, 0.0000, 0.9608),
};

// Punch t=0.083 — CONFIRMED forward step (visible in screenshots)
const punchFwd = {
  UpperLegR: quat(0.8661, -0.0808, -0.0601, 0.4897),
  LowerLegR: quat(0.7223, 0.0000, 0.0000, 0.6916),
};

// Compute delta: Punch_fwd * conj(idle)
const delta_upper = quatNorm(quatMul(punchFwd.UpperLegR, quatConj(idle.UpperLegR)));
const delta_lower = quatNorm(quatMul(punchFwd.LowerLegR, quatConj(idle.LowerLegR)));

const angle_upper = 2 * Math.acos(Math.min(1, Math.abs(delta_upper.w))) * 180 / Math.PI;
const angle_lower = 2 * Math.acos(Math.min(1, Math.abs(delta_lower.w))) * 180 / Math.PI;
console.log(`UpperLegR delta: ${fmt(delta_upper)}  angle: ${angle_upper.toFixed(1)}°`);
console.log(`LowerLegR delta: ${fmt(delta_lower)}  angle: ${angle_lower.toFixed(1)}°`);

// Scale up for kick: chamber = 2x punch step, extend = 3.5x punch step
for (const scale of [1, 1.5, 2, 2.5, 3, 3.5]) {
  const scaled = quatPow(delta_upper, scale);
  const result = quatNorm(quatMul(scaled, idle.UpperLegR));
  console.log(`UpperLegR at ${scale}x: ${fmt(result)}`);
}

console.log('\n--- Final kick values ---');
// Chamber: 2x punch forward step
const delta_chamber = quatPow(delta_upper, 2);
const UpperLegR_chamber = quatNorm(quatMul(delta_chamber, idle.UpperLegR));
// Extension: 3.5x punch forward step
const delta_extend = quatPow(delta_upper, 3.5);
const UpperLegR_extend = quatNorm(quatMul(delta_extend, idle.UpperLegR));
// Lower leg: bend more for chamber, straight for extend
const delta_lower_chamber = quatPow(delta_lower, 1.5);
const LowerLegR_chamber = quatNorm(quatMul(delta_lower_chamber, idle.LowerLegR));

console.log(`UpperLegR_chamber (2x): ${fmt(UpperLegR_chamber)}`);
console.log(`UpperLegR_extend (3.5x): ${fmt(UpperLegR_extend)}`);
console.log(`LowerLegR_chamber (1.5x): ${fmt(LowerLegR_chamber)}`);

console.log(`\n  const kick = {
    UpperLegR_chamber: ${fmt(UpperLegR_chamber)},
    UpperLegR_extend:  ${fmt(UpperLegR_extend)},
    LowerLegR_chamber: ${fmt(LowerLegR_chamber)},
    LowerLegR_extend:  [0.0035, 0.0000, 0.0000, 1.0000],
    FootR_chamber:     [0.0000, 0.6955, 0.7185, 0.0000],
    FootR_extend:      [0.0000, 0.6955, 0.7185, 0.0000],
    Body_chamber:      [0.0000, 0.0000, 0.0000, 1.0000],
    Body_extend:       [0.0939, -0.0200, -0.0246, 0.9951],
    Head_kick:         [-0.0309, -0.0029, -0.0013, 0.9995],
    UpperArmL_kick:    [0.2299, -0.7727, -0.0876, 0.5852],
    LowerArmL_kick:    [0.1468, 0.5207, -0.6558, 0.5265],
    UpperArmR_kick:    [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR_kick:    [0.0897, -0.7051, 0.2550, 0.6556],
    UpperLegL_plant:   [0.9862, 0.0398, -0.1177, 0.1096],
    LowerLegL_plant:   [0.3244, 0.0000, 0.0000, 0.9459],
  };`);
