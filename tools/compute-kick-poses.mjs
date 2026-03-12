// Compute kick quaternion poses by rotating bones from their idle positions.
// Uses Three.js Quaternion math to ensure valid, natural-looking poses.
import { Document, NodeIO } from '@gltf-transform/core';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(__dirname, '..', 'assets', 'RobotExpressive.glb');

// Minimal quaternion math (matching Three.js conventions)
function quat(x, y, z, w) { return { x, y, z, w }; }
function quatFromAxisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  const c = Math.cos(angle / 2);
  return quat(ax * s, ay * s, az * s, c);
}
function quatMultiply(a, b) {
  return quat(
    a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  );
}
function quatNormalize(q) {
  const len = Math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
  return quat(q.x/len, q.y/len, q.z/len, q.w/len);
}
function quatSlerp(a, b, t) {
  let dot = a.x*b.x + a.y*b.y + a.z*b.z + a.w*b.w;
  if (dot < 0) { b = quat(-b.x, -b.y, -b.z, -b.w); dot = -dot; }
  if (dot > 0.9995) {
    return quatNormalize(quat(
      a.x + t*(b.x-a.x), a.y + t*(b.y-a.y),
      a.z + t*(b.z-a.z), a.w + t*(b.w-a.w)
    ));
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1-t)*theta) / sinTheta;
  const wb = Math.sin(t*theta) / sinTheta;
  return quat(wa*a.x+wb*b.x, wa*a.y+wb*b.y, wa*a.z+wb*b.z, wa*a.w+wb*b.w);
}
function fmt(q) { return `[${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)}]`; }

// Idle poses (from Idle animation t=0.000)
const idle = {
  Body:      quat(0.0000, 0.0000, 0.0000, 1.0000),
  Head:      quat(-0.0309, -0.0029, -0.0013, 0.9995),
  UpperArmL: quat(-0.0546, -0.6899, 0.0692, 0.7185),
  LowerArmL: quat(0.3100, 0.4993, -0.3649, 0.7221),
  UpperArmR: quat(0.0436, 0.8046, 0.0575, 0.5895),
  LowerArmR: quat(0.0897, -0.7051, 0.2550, 0.6556),
  UpperLegR: quat(0.9795, -0.0257, 0.1373, 0.1449),
  LowerLegR: quat(0.2772, 0.0000, 0.0000, 0.9608),
  UpperLegL: quat(0.9855, 0.0176, -0.0843, 0.1461),
  LowerLegL: quat(0.2772, 0.0000, 0.0000, 0.9608),
  FootR:     quat(0.0000, 0.6955, 0.7185, 0.0000),
};

// Strategy: Apply local-space rotations to idle poses.
// For UpperLegR: rotate around local X axis (forward) to lift the thigh.
// For LowerLegR: rotate around local X axis to straighten/bend the knee.
// Use pre-multiply: newPose = deltaRotation * idlePose

console.log('=== Computing Kick Poses ===\n');

// --- KICKING LEG (Right) ---
// UpperLegR: rotate forward (around X in local space) for chamber and extend
// Chamber: ~55° forward from idle
const upperLegR_chamber_delta = quatFromAxisAngle(1, 0, 0, -55 * Math.PI / 180);
const UpperLegR_chamber = quatNormalize(quatMultiply(upperLegR_chamber_delta, idle.UpperLegR));
console.log(`UpperLegR_chamber (55° fwd): ${fmt(UpperLegR_chamber)}`);

// Extend: ~80° forward from idle
const upperLegR_extend_delta = quatFromAxisAngle(1, 0, 0, -80 * Math.PI / 180);
const UpperLegR_extend = quatNormalize(quatMultiply(upperLegR_extend_delta, idle.UpperLegR));
console.log(`UpperLegR_extend  (80° fwd): ${fmt(UpperLegR_extend)}`);

// LowerLegR: straighten for extend, bend more for chamber
// Chamber: bend knee more (~45° from idle)
const lowerLegR_chamber_delta = quatFromAxisAngle(1, 0, 0, 50 * Math.PI / 180);
const LowerLegR_chamber = quatNormalize(quatMultiply(lowerLegR_chamber_delta, idle.LowerLegR));
console.log(`LowerLegR_chamber (50° bend): ${fmt(LowerLegR_chamber)}`);

// Extend: straighten knee almost fully
const LowerLegR_extend = quat(0.0035, 0.0000, 0.0000, 1.0000); // From Punch t=0.208 (fully straight)
console.log(`LowerLegR_extend  (straight): ${fmt(LowerLegR_extend)}`);

// FootR: keep from WalkJump - these looked fine
const FootR_chamber = quat(0.0000, 0.8145, 0.5802, 0.0000); // WalkJump t=0.250
const FootR_extend = quat(0.0000, 0.9310, 0.3651, 0.0000);  // WalkJump t=0.417
console.log(`FootR_chamber: ${fmt(FootR_chamber)}`);
console.log(`FootR_extend:  ${fmt(FootR_extend)}`);

// --- BODY ---
// Slight backward lean during extension (~5°)
const Body_chamber = idle.Body; // No change during chamber
const Body_extend_delta = quatFromAxisAngle(1, 0, 0, -5 * Math.PI / 180);
const Body_extend = quatNormalize(quatMultiply(Body_extend_delta, idle.Body));
console.log(`\nBody_chamber: ${fmt(Body_chamber)}`);
console.log(`Body_extend (5° back): ${fmt(Body_extend)}`);

// --- HEAD ---
// Stays at idle (body lean is minimal, no compensation needed)
console.log(`Head_kick: ${fmt(idle.Head)}`);

// --- LEFT ARM (guard position from Punch) ---
const UpperArmL_kick = quat(0.2299, -0.7727, -0.0876, 0.5852); // Punch t=0.250
const LowerArmL_kick = quat(0.1468, 0.5207, -0.6558, 0.5265); // Punch t=0.250
console.log(`\nUpperArmL_kick (punch guard): ${fmt(UpperArmL_kick)}`);
console.log(`LowerArmL_kick (punch guard): ${fmt(LowerArmL_kick)}`);

// --- RIGHT ARM (keep near idle, slight pull back) ---
// Use idle position - simplest and most natural for the non-punching arm
const UpperArmR_kick = idle.UpperArmR;
const LowerArmR_kick = quat(0.0897, -0.7051, 0.2550, 0.6556); // Punch t=0.000 (idle)
console.log(`UpperArmR_kick (idle): ${fmt(UpperArmR_kick)}`);
console.log(`LowerArmR_kick (idle): ${fmt(LowerArmR_kick)}`);

// --- PLANT LEG (Left, slight bend for stability) ---
// Use Punch t=0.250 which has subtle weight shift
const UpperLegL_plant = quat(0.9862, 0.0398, -0.1177, 0.1096); // Punch t=0.250
const LowerLegL_plant = quat(0.3244, 0.0000, 0.0000, 0.9459); // Punch t=0.250
console.log(`\nUpperLegL_plant (punch stance): ${fmt(UpperLegL_plant)}`);
console.log(`LowerLegL_plant (punch stance): ${fmt(LowerLegL_plant)}`);

console.log('\n=== JS Object for renderer3d.js ===\n');
console.log(`  const kick = {
    UpperLegR_chamber: ${fmt(UpperLegR_chamber)},
    UpperLegR_extend:  ${fmt(UpperLegR_extend)},
    LowerLegR_chamber: ${fmt(LowerLegR_chamber)},
    LowerLegR_extend:  ${fmt(LowerLegR_extend)},
    FootR_chamber:     ${fmt(FootR_chamber)},
    FootR_extend:      ${fmt(FootR_extend)},
    Body_chamber:      ${fmt(Body_chamber)},
    Body_extend:       ${fmt(Body_extend)},
    Head_kick:         ${fmt(idle.Head)},
    UpperArmL_kick:    ${fmt(UpperArmL_kick)},
    LowerArmL_kick:    ${fmt(LowerArmL_kick)},
    UpperArmR_kick:    ${fmt(UpperArmR_kick)},
    LowerArmR_kick:    ${fmt(LowerArmR_kick)},
    UpperLegL_plant:   ${fmt(UpperLegL_plant)},
    LowerLegL_plant:   ${fmt(LowerLegL_plant)},
  };`);
