// Compute kick poses by rotating the UpperLegR around its IDLE AXIS with reduced angle.
// The idle thigh is a ~163° rotation around axis (0.99, -0.03, 0.14).
// A front kick reduces this angle so the thigh points more forward (horizontal).

function fmt(x, y, z, w) {
  return `[${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}, ${w.toFixed(4)}]`;
}

// Idle UpperLegR: [0.9795, -0.0257, 0.1373, 0.1449]
const idle = { x: 0.9795, y: -0.0257, z: 0.1373, w: 0.1449 };

// Extract idle rotation axis and angle
const idleAngle = 2 * Math.acos(idle.w); // ~163.4°
const sinHalf = Math.sin(idleAngle / 2);
const axis = {
  x: idle.x / sinHalf,
  y: idle.y / sinHalf,
  z: idle.z / sinHalf,
};
console.log(`Idle angle: ${(idleAngle * 180 / Math.PI).toFixed(1)}°`);
console.log(`Idle axis: (${axis.x.toFixed(4)}, ${axis.y.toFixed(4)}, ${axis.z.toFixed(4)})`);

// Create quaternion from same axis but different angle
function fromAxisAngle(ax, ay, az, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const s = Math.sin(rad / 2);
  const c = Math.cos(rad / 2);
  return { x: ax * s, y: ay * s, z: az * s, w: c };
}

// Test various angles
console.log('\n--- UpperLegR at different angles (same axis as idle) ---');
for (const angle of [163, 140, 120, 100, 80, 60]) {
  const q = fromAxisAngle(axis.x, axis.y, axis.z, angle);
  console.log(`  ${angle}°: ${fmt(q.x, q.y, q.z, q.w)}`);
}

// Chamber: ~120° (thigh raised ~43° from hanging position)
// Extend: ~70° (thigh nearly horizontal, raised ~93° from hanging)
const chamber_angle = 120;
const extend_angle = 70;

const UpperLegR_chamber = fromAxisAngle(axis.x, axis.y, axis.z, chamber_angle);
const UpperLegR_extend = fromAxisAngle(axis.x, axis.y, axis.z, extend_angle);

console.log(`\n--- Final kick leg poses ---`);
console.log(`Chamber (${chamber_angle}°): ${fmt(UpperLegR_chamber.x, UpperLegR_chamber.y, UpperLegR_chamber.z, UpperLegR_chamber.w)}`);
console.log(`Extend  (${extend_angle}°):  ${fmt(UpperLegR_extend.x, UpperLegR_extend.y, UpperLegR_extend.z, UpperLegR_extend.w)}`);

// LowerLegR: only rotates around X (confirmed from animation data)
// Idle: [0.2772, 0, 0, 0.9608] = ~32° bend
// Bent for chamber: ~80° bend
// Straight for extend: ~0°
const lowerChamber = fromAxisAngle(1, 0, 0, 80);
const lowerExtend = fromAxisAngle(1, 0, 0, 2);
console.log(`LowerLegR_chamber (80° bend): ${fmt(lowerChamber.x, lowerChamber.y, lowerChamber.z, lowerChamber.w)}`);
console.log(`LowerLegR_extend  (2° straight): ${fmt(lowerExtend.x, lowerExtend.y, lowerExtend.z, lowerExtend.w)}`);

console.log(`\n=== JS Object ===`);
console.log(`  const kick = {
    UpperLegR_chamber: ${fmt(UpperLegR_chamber.x, UpperLegR_chamber.y, UpperLegR_chamber.z, UpperLegR_chamber.w)},
    UpperLegR_extend:  ${fmt(UpperLegR_extend.x, UpperLegR_extend.y, UpperLegR_extend.z, UpperLegR_extend.w)},
    LowerLegR_chamber: ${fmt(lowerChamber.x, lowerChamber.y, lowerChamber.z, lowerChamber.w)},
    LowerLegR_extend:  ${fmt(lowerExtend.x, lowerExtend.y, lowerExtend.z, lowerExtend.w)},
    FootR_chamber:     [0.0000, 0.6955, 0.7185, 0.0000],
    FootR_extend:      [0.0000, 0.6955, 0.7185, 0.0000],
    Body_chamber:      [0.0000, 0.0000, 0.0000, 1.0000],
    Body_extend:       [-0.0436, 0.0000, 0.0000, 0.9990],
    Head_kick:         [-0.0309, -0.0029, -0.0013, 0.9995],
    UpperArmL_kick:    [0.2299, -0.7727, -0.0876, 0.5852],
    LowerArmL_kick:    [0.1468, 0.5207, -0.6558, 0.5265],
    UpperArmR_kick:    [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR_kick:    [0.0897, -0.7051, 0.2550, 0.6556],
    UpperLegL_plant:   [0.9862, 0.0398, -0.1177, 0.1096],
    LowerLegL_plant:   [0.3244, 0.0000, 0.0000, 0.9459],
  };`);
