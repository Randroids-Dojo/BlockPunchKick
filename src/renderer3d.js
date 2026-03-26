import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

let scene, camera, renderer, clock;
const fighterModels = {};
const mixers = {};
const actions = {};
const currentClips = {};
const meshCache = {};
const headSpinActions = {};
export const koPhase = {};   // 'spin' | 'death' | null per fighter
const shakeOffset = { x: 0, y: 0 };
let shakeDecay = 0;
const cameraLookAt = new THREE.Vector3(0, 1.5, 0);

// Zoom state — default pulled back to show full arena
const isEmbedded = window.self !== window.top;
const DEFAULT_ZOOM = isEmbedded ? 28 : 22;
const MIN_ZOOM = 8;   // closest
const MAX_ZOOM = 40;  // farthest
let cameraRadius = DEFAULT_ZOOM;

// Orbital camera — angle around the ring (0 = front, PI/2 = side)
let cameraOrbitAngle = 0;
let cameraOrbitTarget = 0;

// Dynamic camera — Samurai Shodown-style zoom based on fighter distance
let dynamicZoomTarget = DEFAULT_ZOOM;
let dynamicCameraX = 0;            // horizontal tracking target
const CAMERA_LERP_SPEED = 0.08;    // smooth follow rate (per frame)

const ANIM_MAP = {
  Idle: 'Idle',
  Block: 'ThumbsUp',
  Block_Recovery: 'ThumbsUp',
  Punch_Startup: 'Punch',
  Punch_Active: 'Punch',
  Punch_Recovery: 'Punch',
  Kick_Startup: 'Kick',
  Kick_Active: 'Kick',
  Kick_Recovery: 'Kick',
  Uppercut_Startup: 'Uppercut',
  Uppercut_Active: 'Uppercut',
  Uppercut_Recovery: 'Uppercut',
  Hit_Stun: 'Death',
  Block_Stun: 'ThumbsUp',
  KO: 'Idle',  // base clip during KO; sequenced to Death after HeadSpin
};

const BLEND_TIME = 0.08;

// Build a procedural front-kick AnimationClip from bone quaternion keyframes.
// The robot kicks with its right leg: chamber (knee up) -> extend -> retract.
// Full-body animation: torso leans back, arms counterbalance, plant leg bends.
// Bone names are sanitized (dots stripped) to match THREE.js PropertyBinding.
// All quaternion values are ABSOLUTE bone-local poses extracted/extrapolated from
// the model's working animations (Idle, WalkJump, Punch, Jump).
function createKickClip(model) {
  // Idle animation first-frame poses (the starting/ending pose for blending)
  const idle = {
    Body:      [0.0000, 0.0000, -0.0000, 1.0000],
    Head:      [-0.0309, -0.0029, -0.0013, 0.9995],
    UpperArmL: [-0.0546, -0.6899, 0.0692, 0.7185],
    LowerArmL: [0.3100, 0.4993, -0.3649, 0.7221],
    UpperArmR: [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR: [0.2578, -0.5525, 0.4427, 0.6575],
    UpperLegR: [0.9795, -0.0257, 0.1373, 0.1449],
    LowerLegR: [0.2772, 0.0000, 0.0000, 0.9608],
    UpperLegL: [0.9855, 0.0176, -0.0843, 0.1461],
    LowerLegL: [0.2772, 0.0000, 0.0000, 0.9608],
    FootR:     [0.0000, 0.6955, 0.7185, 0.0000],
  };

  // Kick target poses — axis-preserving approach.
  // Idle UpperLegR is ~163° around axis (0.99, -0.03, 0.14).
  // Reducing angle raises thigh forward: 120° = chamber, 70° = extend (near horizontal).
  const kick = {
    // --- Kicking leg (right) — same rotation axis as idle, reduced angle ---
    UpperLegR_chamber: [0.8573, -0.0225, 0.1202, 0.5000],  // 120° (thigh ~43° fwd)
    UpperLegR_extend:  [0.5678, -0.0149, 0.0796, 0.8192],  // 70° (thigh ~93° fwd)
    LowerLegR_chamber: [0.6428, 0.0000, 0.0000, 0.7660],   // 80° bend (knee tucked)
    LowerLegR_extend:  [0.0175, 0.0000, 0.0000, 0.9998],   // ~2° (leg straight)
    FootR_chamber:     [0.0000, 0.6955, 0.7185, 0.0000],   // Idle (child of LowerLeg)
    FootR_extend:      [0.0000, 0.6955, 0.7185, 0.0000],   // Idle (child of LowerLeg)

    // --- Body leans slightly forward ---
    Body_chamber:      [0.0000, 0.0000, 0.0000, 1.0000],
    Body_extend:       [-0.0436, 0.0000, 0.0000, 0.9990],  // ~5° forward lean

    // --- Head stays at idle ---
    Head_kick:         [-0.0309, -0.0029, -0.0013, 0.9995],

    // --- Left arm (Punch guard position) ---
    UpperArmL_kick:    [0.2299, -0.7727, -0.0876, 0.5852],
    LowerArmL_kick:    [0.1468, 0.5207, -0.6558, 0.5265],

    // --- Right arm (stays at idle) ---
    UpperArmR_kick:    [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR_kick:    [0.0897, -0.7051, 0.2550, 0.6556],

    // --- Plant leg (left, subtle weight shift) ---
    UpperLegL_plant:   [0.9862, 0.0398, -0.1177, 0.1096],
    LowerLegL_plant:   [0.3244, 0.0000, 0.0000, 0.9459],
  };

  // Compute FootR positions via forward kinematics.
  // FootR is parented to root Bone (IK rig), so we must explicitly position it.
  // Temporarily pose the leg bones, update matrices, and read the foot endpoint.
  const footRIdlePos = [-0.0064, 0.0003, 0.0006]; // default rest position
  let footRChamberPos = footRIdlePos;
  let footRExtendPos = footRIdlePos;

  if (model) {
    const bodyBone = model.getObjectByName('Body');
    const upperLegR = model.getObjectByName('UpperLegR');
    const lowerLegR = model.getObjectByName('LowerLegR');
    const footR = model.getObjectByName('FootR');
    const rootBone = model.getObjectByName('Bone');

    if (upperLegR && lowerLegR && footR && rootBone) {
      // Save current quaternions
      const savedUpper = upperLegR.quaternion.clone();
      const savedLower = lowerLegR.quaternion.clone();
      const savedBody = bodyBone ? bodyBone.quaternion.clone() : null;

      // Helper: compute foot position for a given leg pose
      function computeFootPos(upperQ, lowerQ, bodyQ) {
        if (bodyBone && bodyQ) bodyBone.quaternion.set(...bodyQ);
        upperLegR.quaternion.set(...upperQ);
        lowerLegR.quaternion.set(...lowerQ);
        // Update the full chain from root
        rootBone.updateWorldMatrix(true, true);
        // Get the world position of the end of LowerLegR
        // The shin endpoint is at LowerLegR's position + shin length along local Y
        // We approximate by using the foot's rest offset from LowerLegR world pos
        const lowerWorld = new THREE.Vector3();
        lowerLegR.getWorldPosition(lowerWorld);
        // Shin direction: local +Y transformed by LowerLegR's world rotation
        const shinDir = new THREE.Vector3(0, 1, 0);
        const lowerWorldQuat = new THREE.Quaternion();
        lowerLegR.getWorldQuaternion(lowerWorldQuat);
        shinDir.applyQuaternion(lowerWorldQuat);
        // Shin length: approximate from rest pose (foot rest pos - lowerLeg rest pos in world)
        const footRestWorld = new THREE.Vector3();
        footR.getWorldPosition(footRestWorld);
        const shinLength = footRestWorld.distanceTo(lowerWorld);
        // Foot world position = end of shin
        const footWorld = lowerWorld.clone().add(shinDir.multiplyScalar(shinLength));
        // Convert to FootR parent (rootBone) local space
        const rootInverse = new THREE.Matrix4().copy(rootBone.matrixWorld).invert();
        footWorld.applyMatrix4(rootInverse);
        return [footWorld.x, footWorld.y, footWorld.z];
      }

      // Compute for idle pose (verification)
      const idlePos = computeFootPos(idle.UpperLegR, idle.LowerLegR, idle.Body);

      // Compute for chamber
      footRChamberPos = computeFootPos(
        kick.UpperLegR_chamber, kick.LowerLegR_chamber, kick.Body_chamber
      );

      // Compute for extend
      footRExtendPos = computeFootPos(
        kick.UpperLegR_extend, kick.LowerLegR_extend, kick.Body_extend
      );

      // Restore original quaternions
      upperLegR.quaternion.copy(savedUpper);
      lowerLegR.quaternion.copy(savedLower);
      if (bodyBone && savedBody) bodyBone.quaternion.copy(savedBody);
      rootBone.updateWorldMatrix(true, true);

    }
  }

  // Keyframe times: rest, chamber, extend, hold, retract
  const times = [0, 0.10, 0.18, 0.25, 0.50];

  const tracks = [
    // --- KICKING LEG (right) ---
    new THREE.QuaternionKeyframeTrack('UpperLegR.quaternion', times, [
      ...idle.UpperLegR,
      ...kick.UpperLegR_chamber,
      ...kick.UpperLegR_extend,
      ...kick.UpperLegR_extend,
      ...idle.UpperLegR,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerLegR.quaternion', times, [
      ...idle.LowerLegR,
      ...kick.LowerLegR_chamber,
      ...kick.LowerLegR_extend,
      ...kick.LowerLegR_extend,
      ...idle.LowerLegR,
    ]),
    new THREE.QuaternionKeyframeTrack('FootR.quaternion', times, [
      ...idle.FootR,
      ...kick.FootR_chamber,
      ...kick.FootR_extend,
      ...kick.FootR_extend,
      ...idle.FootR,
    ]),
    // FootR POSITION track — IK rig requires explicit positioning
    new THREE.VectorKeyframeTrack('FootR.position', times, [
      ...footRIdlePos,
      ...footRChamberPos,
      ...footRExtendPos,
      ...footRExtendPos,
      ...footRIdlePos,
    ]),

    // --- BODY (lean back for counterbalance) ---
    new THREE.QuaternionKeyframeTrack('Body.quaternion', times, [
      ...idle.Body,
      ...kick.Body_chamber,
      ...kick.Body_extend,
      ...kick.Body_extend,
      ...idle.Body,
    ]),

    // --- HEAD (compensate for body lean, look forward) ---
    new THREE.QuaternionKeyframeTrack('Head.quaternion', times, [
      ...idle.Head,
      ...kick.Head_kick,
      ...kick.Head_kick,
      ...kick.Head_kick,
      ...idle.Head,
    ]),

    // --- LEFT ARM (guard position) ---
    new THREE.QuaternionKeyframeTrack('UpperArmL.quaternion', times, [
      ...idle.UpperArmL,
      ...kick.UpperArmL_kick,
      ...kick.UpperArmL_kick,
      ...kick.UpperArmL_kick,
      ...idle.UpperArmL,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmL.quaternion', times, [
      ...idle.LowerArmL,
      ...kick.LowerArmL_kick,
      ...kick.LowerArmL_kick,
      ...kick.LowerArmL_kick,
      ...idle.LowerArmL,
    ]),

    // --- RIGHT ARM (counterbalance, swing back) ---
    new THREE.QuaternionKeyframeTrack('UpperArmR.quaternion', times, [
      ...idle.UpperArmR,
      ...kick.UpperArmR_kick,
      ...kick.UpperArmR_kick,
      ...kick.UpperArmR_kick,
      ...idle.UpperArmR,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmR.quaternion', times, [
      ...idle.LowerArmR,
      ...kick.LowerArmR_kick,
      ...kick.LowerArmR_kick,
      ...kick.LowerArmR_kick,
      ...idle.LowerArmR,
    ]),

    // --- PLANT LEG (left, slight bend for stability) ---
    new THREE.QuaternionKeyframeTrack('UpperLegL.quaternion', times, [
      ...idle.UpperLegL,
      ...kick.UpperLegL_plant,
      ...kick.UpperLegL_plant,
      ...kick.UpperLegL_plant,
      ...idle.UpperLegL,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerLegL.quaternion', times, [
      ...idle.LowerLegL,
      ...kick.LowerLegL_plant,
      ...kick.LowerLegL_plant,
      ...kick.LowerLegL_plant,
      ...idle.LowerLegL,
    ]),
  ];

  return new THREE.AnimationClip('Kick', 0.5, tracks);
}

// Build a procedural left-jab AnimationClip (2nd punch in combo chain).
// Mirrors the right-hand punch: left arm extends forward, right arm guards.
// Body twists into the punch for weight transfer.
function createPunchLeftClip() {
  const idle = {
    Body:      [0.0000, 0.0000, -0.0000, 1.0000],
    Head:      [-0.0309, -0.0029, -0.0013, 0.9995],
    UpperArmL: [-0.0546, -0.6899, 0.0692, 0.7185],
    LowerArmL: [0.3100, 0.4993, -0.3649, 0.7221],
    UpperArmR: [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR: [0.2578, -0.5525, 0.4427, 0.6575],
  };

  const punch = {
    // --- Left arm (punching) ---
    // Windup: pull shoulder back slightly, chamber fist
    UpperArmL_windup:  [-0.12, -0.74, 0.10, 0.66],
    LowerArmL_windup:  [0.45, 0.42, -0.38, 0.69],
    // Extend: arm shoots forward, elbow straight
    UpperArmL_extend:  [0.50, -0.50, -0.28, 0.65],
    LowerArmL_extend:  [0.05, 0.10, -0.05, 0.99],

    // --- Right arm (guard, tucked in) ---
    UpperArmR_guard:   [-0.08, 0.78, 0.12, 0.61],
    LowerArmR_guard:   [0.38, -0.48, 0.42, 0.67],

    // --- Body twist into punch ---
    Body_windup:       [0.00, 0.05, 0.00, 1.00],   // slight twist away
    Body_extend:       [0.00, -0.07, 0.00, 1.00],   // twist into punch
  };

  // Keyframes: idle → windup → extend → hold → retract
  const times = [0, 0.05, 0.11, 0.16, 0.35];

  const tracks = [
    // Left arm (punching)
    new THREE.QuaternionKeyframeTrack('UpperArmL.quaternion', times, [
      ...idle.UpperArmL,
      ...punch.UpperArmL_windup,
      ...punch.UpperArmL_extend,
      ...punch.UpperArmL_extend,
      ...idle.UpperArmL,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmL.quaternion', times, [
      ...idle.LowerArmL,
      ...punch.LowerArmL_windup,
      ...punch.LowerArmL_extend,
      ...punch.LowerArmL_extend,
      ...idle.LowerArmL,
    ]),

    // Right arm (guard)
    new THREE.QuaternionKeyframeTrack('UpperArmR.quaternion', times, [
      ...idle.UpperArmR,
      ...punch.UpperArmR_guard,
      ...punch.UpperArmR_guard,
      ...punch.UpperArmR_guard,
      ...idle.UpperArmR,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmR.quaternion', times, [
      ...idle.LowerArmR,
      ...punch.LowerArmR_guard,
      ...punch.LowerArmR_guard,
      ...punch.LowerArmR_guard,
      ...idle.LowerArmR,
    ]),

    // Body twist
    new THREE.QuaternionKeyframeTrack('Body.quaternion', times, [
      ...idle.Body,
      ...punch.Body_windup,
      ...punch.Body_extend,
      ...punch.Body_extend,
      ...idle.Body,
    ]),

    // Head stays neutral
    new THREE.QuaternionKeyframeTrack('Head.quaternion', times, [
      ...idle.Head, ...idle.Head, ...idle.Head, ...idle.Head, ...idle.Head,
    ]),
  ];

  return new THREE.AnimationClip('PunchLeft', 0.35, tracks);
}

// Build a procedural uppercut AnimationClip (3rd punch combo finisher).
// Body dips down for the windup, then rises as the right arm swings upward.
// More dramatic motion with big body commitment.
function createUppercutClip() {
  const idle = {
    Body:      [0.0000, 0.0000, -0.0000, 1.0000],
    Head:      [-0.0309, -0.0029, -0.0013, 0.9995],
    UpperArmL: [-0.0546, -0.6899, 0.0692, 0.7185],
    LowerArmL: [0.3100, 0.4993, -0.3649, 0.7221],
    UpperArmR: [0.0436, 0.8046, 0.0575, 0.5895],
    LowerArmR: [0.2578, -0.5525, 0.4427, 0.6575],
    UpperLegL: [0.9855, 0.0176, -0.0843, 0.1461],
    LowerLegL: [0.2772, 0.0000, 0.0000, 0.9608],
    UpperLegR: [0.9795, -0.0257, 0.1373, 0.1449],
    LowerLegR: [0.2772, 0.0000, 0.0000, 0.9608],
  };

  const uc = {
    // --- Body: dip down then rise up ---
    Body_dip:     [0.10, 0.00, 0.00, 0.995],    // lean forward (deep crouch)
    Body_rise:    [-0.15, 0.00, 0.00, 0.989],    // lean back (explosive rise)

    // --- Right arm (uppercut): drops low then swings forward and UP ---
    // Computed by composing rotations on the idle UpperArmR quaternion:
    //   idle = [0.04, 0.80, 0.06, 0.59] (~108° around Y, arm at side)
    //   Dip = idle * Quat(-40° around local X) → arm pulled back/down
    //   Rise = idle * Quat(+90° around local X) → arm swung forward and up
    UpperArmR_dip:    [-0.16, 0.74, 0.33, 0.57],    // arm pulled back and low
    LowerArmR_dip:    [0.55, -0.40, 0.20, 0.71],    // bent tight, fist at hip
    UpperArmR_rise:   [0.45, 0.61, -0.53, 0.39],    // arm forward and UP (90° raise)
    LowerArmR_rise:   [0.10, -0.35, 0.15, 0.92],    // forearm extended, palm inward

    // --- Left arm (guard position) ---
    UpperArmL_guard:  [0.23, -0.77, -0.09, 0.59],
    LowerArmL_guard:  [0.15, 0.52, -0.66, 0.53],

    // --- Legs: slight crouch on dip ---
    UpperLegL_dip:    [0.9750, 0.0176, -0.0843, 0.2050],
    LowerLegL_dip:    [0.3600, 0.0000, 0.0000, 0.9330],
    UpperLegR_dip:    [0.9690, -0.0257, 0.1373, 0.2050],
    LowerLegR_dip:    [0.3600, 0.0000, 0.0000, 0.9330],
  };

  // Keyframes: idle → dip/windup → rise/extend → hold → retract
  const times = [0, 0.08, 0.16, 0.24, 0.48];

  const tracks = [
    // Body
    new THREE.QuaternionKeyframeTrack('Body.quaternion', times, [
      ...idle.Body,
      ...uc.Body_dip,
      ...uc.Body_rise,
      ...uc.Body_rise,
      ...idle.Body,
    ]),

    // Right arm (uppercut)
    new THREE.QuaternionKeyframeTrack('UpperArmR.quaternion', times, [
      ...idle.UpperArmR,
      ...uc.UpperArmR_dip,
      ...uc.UpperArmR_rise,
      ...uc.UpperArmR_rise,
      ...idle.UpperArmR,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmR.quaternion', times, [
      ...idle.LowerArmR,
      ...uc.LowerArmR_dip,
      ...uc.LowerArmR_rise,
      ...uc.LowerArmR_rise,
      ...idle.LowerArmR,
    ]),

    // Left arm (guard)
    new THREE.QuaternionKeyframeTrack('UpperArmL.quaternion', times, [
      ...idle.UpperArmL,
      ...uc.UpperArmL_guard,
      ...uc.UpperArmL_guard,
      ...uc.UpperArmL_guard,
      ...idle.UpperArmL,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerArmL.quaternion', times, [
      ...idle.LowerArmL,
      ...uc.LowerArmL_guard,
      ...uc.LowerArmL_guard,
      ...uc.LowerArmL_guard,
      ...idle.LowerArmL,
    ]),

    // Head stays neutral
    new THREE.QuaternionKeyframeTrack('Head.quaternion', times, [
      ...idle.Head, ...idle.Head, ...idle.Head, ...idle.Head, ...idle.Head,
    ]),

    // Legs: slight crouch on dip, return to idle on rise
    new THREE.QuaternionKeyframeTrack('UpperLegL.quaternion', times, [
      ...idle.UpperLegL, ...uc.UpperLegL_dip, ...idle.UpperLegL, ...idle.UpperLegL, ...idle.UpperLegL,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerLegL.quaternion', times, [
      ...idle.LowerLegL, ...uc.LowerLegL_dip, ...idle.LowerLegL, ...idle.LowerLegL, ...idle.LowerLegL,
    ]),
    new THREE.QuaternionKeyframeTrack('UpperLegR.quaternion', times, [
      ...idle.UpperLegR, ...uc.UpperLegR_dip, ...idle.UpperLegR, ...idle.UpperLegR, ...idle.UpperLegR,
    ]),
    new THREE.QuaternionKeyframeTrack('LowerLegR.quaternion', times, [
      ...idle.LowerLegR, ...uc.LowerLegR_dip, ...idle.LowerLegR, ...idle.LowerLegR, ...idle.LowerLegR,
    ]),
  ];

  return new THREE.AnimationClip('Uppercut', 0.48, tracks);
}

// Map game world coords to 3D scene coords
// Game arena: x 100-1180, y 430-600
// 3D scene: x roughly -5 to 5, z for depth
function gameToWorld(gx, gy) {
  const cx = (gx - 640) / 108;
  const cz = (gy - 515) / 108;
  return { x: cx, z: cz };
}

export async function initScene(canvas) {
  clock = new THREE.Clock();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);
  scene.fog = new THREE.Fog(0x050510, 20, 40);

  const rect = canvas.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(40, rect.width / rect.height, 0.1, 100);
  camera.position.set(0, 4.5, DEFAULT_ZOOM);
  camera.lookAt(0, 1.5, 0);

  // Camera controls: scroll/pinch to zoom, right-drag/two-finger rotate
  setupCameraControls(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(rect.width, rect.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Lighting — arena-style with dramatic overhead spots
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  // Main overhead ring light
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight1.position.set(0, 12, 3);
  scene.add(dirLight1);

  // Warm accent from one side
  const dirLight2 = new THREE.DirectionalLight(0xffcc88, 0.5);
  dirLight2.position.set(6, 6, 5);
  scene.add(dirLight2);

  // Cool accent from the other side
  const dirLight3 = new THREE.DirectionalLight(0x88aaff, 0.3);
  dirLight3.position.set(-6, 6, -3);
  scene.add(dirLight3);

  // --- Boxing Ring ---
  const RING_W = 12;   // width (x-axis)
  const RING_D = 8;    // depth (z-axis)
  const PLATFORM_H = 0.5;  // platform height
  const POST_H = 1.6;      // corner post height above platform
  const POST_R = 0.08;     // corner post radius
  const ROPE_R = 0.025;    // rope radius
  const ROPE_HEIGHTS = [0.45, 0.85, 1.25]; // rope heights above platform

  const halfW = RING_W / 2;
  const halfD = RING_D / 2;

  // Dark arena floor beneath the ring
  const arenaFloorGeo = new THREE.PlaneGeometry(50, 50);
  const arenaFloorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a14,
    roughness: 0.95,
    metalness: 0.0,
  });
  const arenaFloor = new THREE.Mesh(arenaFloorGeo, arenaFloorMat);
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.y = 0;
  scene.add(arenaFloor);

  // Ring platform (elevated box)
  const platformGeo = new THREE.BoxGeometry(RING_W + 1.0, PLATFORM_H, RING_D + 1.0);
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x111118,
    roughness: 0.7,
    metalness: 0.1,
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.y = PLATFORM_H / 2;
  scene.add(platform);

  // Ring canvas (the fighting surface)
  const canvasGeo = new THREE.BoxGeometry(RING_W, 0.06, RING_D);
  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xe8dcc8,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ringCanvas = new THREE.Mesh(canvasGeo, canvasMat);
  ringCanvas.position.y = PLATFORM_H + 0.03;
  scene.add(ringCanvas);

  // Apron skirt (sides of the platform)
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a3a,
    roughness: 0.6,
    metalness: 0.1,
  });
  // Front and back aprons
  for (const zSign of [-1, 1]) {
    const apronGeo = new THREE.PlaneGeometry(RING_W + 1.0, PLATFORM_H);
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.set(0, PLATFORM_H / 2, zSign * (halfD + 0.5));
    if (zSign === 1) apron.rotation.y = Math.PI;
    scene.add(apron);
  }
  // Left and right aprons
  for (const xSign of [-1, 1]) {
    const apronGeo = new THREE.PlaneGeometry(RING_D + 1.0, PLATFORM_H);
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.set(xSign * (halfW + 0.5), PLATFORM_H / 2, 0);
    apron.rotation.y = xSign * -Math.PI / 2;
    scene.add(apron);
  }

  // Corner posts (turnbuckles)
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.3,
    metalness: 0.8,
  });
  const cornerPositions = [
    [-halfW, halfD],
    [halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
  ];
  for (const [cx, cz] of cornerPositions) {
    const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, POST_H, 8);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(cx, PLATFORM_H + POST_H / 2, cz);
    scene.add(post);

    // Turnbuckle pad on top
    const padGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(cx, PLATFORM_H + POST_H + 0.06, cz);
    scene.add(pad);
  }

  // Ropes
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.5,
    metalness: 0.3,
  });
  // Each side connects two adjacent corners
  const sides = [
    [cornerPositions[0], cornerPositions[1]], // front
    [cornerPositions[1], cornerPositions[2]], // right
    [cornerPositions[2], cornerPositions[3]], // back
    [cornerPositions[3], cornerPositions[0]], // left
  ];
  for (const [a, b] of sides) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    for (const rh of ROPE_HEIGHTS) {
      const ropeGeo = new THREE.CylinderGeometry(ROPE_R, ROPE_R, len, 6);
      ropeGeo.rotateZ(Math.PI / 2);
      ropeGeo.rotateY(-angle + Math.PI / 2);
      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      rope.position.set(
        (a[0] + b[0]) / 2,
        PLATFORM_H + rh,
        (a[1] + b[1]) / 2
      );
      scene.add(rope);
    }
  }

  // Corner pads (colored red/blue for the two neutral corners, red for fighters)
  const cornerPadColors = [0xcc2222, 0x2244cc, 0xcc2222, 0x2244cc];
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = cornerPositions[i];
    const padGeo = new THREE.BoxGeometry(0.35, POST_H * 0.8, 0.35);
    const padMat = new THREE.MeshStandardMaterial({
      color: cornerPadColors[i],
      roughness: 0.7,
      metalness: 0.1,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(cx, PLATFORM_H + POST_H * 0.4, cz);
    scene.add(pad);
  }

  // Load fighters
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('assets/RobotExpressive.glb');

  // Player fighter
  const playerModel = gltf.scene;
  scene.add(playerModel);
  fighterModels.player = playerModel;

  const playerMixer = new THREE.AnimationMixer(playerModel);
  mixers.player = playerMixer;
  actions.player = {};
  currentClips.player = null;

  for (const clip of gltf.animations) {
    const action = playerMixer.clipAction(clip);
    actions.player[clip.name] = action;
  }

  // Register procedural clips for player
  const kickClip = createKickClip(playerModel);
  const playerKickAction = playerMixer.clipAction(kickClip);
  playerKickAction.setLoop(THREE.LoopOnce);
  playerKickAction.clampWhenFinished = true;
  actions.player['Kick'] = playerKickAction;

  const punchLeftClip = createPunchLeftClip();
  const playerPunchLeftAction = playerMixer.clipAction(punchLeftClip);
  playerPunchLeftAction.setLoop(THREE.LoopOnce);
  playerPunchLeftAction.clampWhenFinished = true;
  actions.player['PunchLeft'] = playerPunchLeftAction;

  const uppercutClip = createUppercutClip();
  const playerUppercutAction = playerMixer.clipAction(uppercutClip);
  playerUppercutAction.setLoop(THREE.LoopOnce);
  playerUppercutAction.clampWhenFinished = true;
  actions.player['Uppercut'] = playerUppercutAction;

  // HeadSpin overlay for player
  if (actions.player['HeadSpin']) {
    const hs = actions.player['HeadSpin'];
    hs.blendMode = THREE.AdditiveAnimationBlendMode;
    hs.setEffectiveWeight(0);
    hs.play();
    headSpinActions.player = hs;
  }

  // CPU fighter (clone with skeleton support)
  const cpuModel = skeletonClone(playerModel);
  scene.add(cpuModel);
  fighterModels.cpu = cpuModel;

  // Tint CPU fighter red and cache meshes
  cpuModel.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.color.setHex(0xff6644);
    }
  });

  // Cache mesh references for per-frame operations
  for (const id of ['player', 'cpu']) {
    meshCache[id] = [];
    fighterModels[id].traverse((child) => {
      if (child.isMesh && child.material) meshCache[id].push(child);
    });
  }

  const cpuMixer = new THREE.AnimationMixer(cpuModel);
  mixers.cpu = cpuMixer;
  actions.cpu = {};
  currentClips.cpu = null;

  for (const clip of gltf.animations) {
    const action = cpuMixer.clipAction(clip);
    actions.cpu[clip.name] = action;
  }

  // Register procedural clips for CPU
  const cpuKickAction = cpuMixer.clipAction(kickClip);
  cpuKickAction.setLoop(THREE.LoopOnce);
  cpuKickAction.clampWhenFinished = true;
  actions.cpu['Kick'] = cpuKickAction;

  const cpuPunchLeftAction = cpuMixer.clipAction(punchLeftClip);
  cpuPunchLeftAction.setLoop(THREE.LoopOnce);
  cpuPunchLeftAction.clampWhenFinished = true;
  actions.cpu['PunchLeft'] = cpuPunchLeftAction;

  const cpuUppercutAction = cpuMixer.clipAction(uppercutClip);
  cpuUppercutAction.setLoop(THREE.LoopOnce);
  cpuUppercutAction.clampWhenFinished = true;
  actions.cpu['Uppercut'] = cpuUppercutAction;

  // HeadSpin overlay for CPU
  if (actions.cpu['HeadSpin']) {
    const hs = actions.cpu['HeadSpin'];
    hs.blendMode = THREE.AdditiveAnimationBlendMode;
    hs.setEffectiveWeight(0);
    hs.play();
    headSpinActions.cpu = hs;
  }

  // Start both in idle
  playClip('player', 'Idle');
  playClip('cpu', 'Idle');

  // Flush accumulated clock delta from async load
  clock.getDelta();
}

function playClip(fighterId, clipName) {
  const clips = actions[fighterId];
  if (!clips || !clips[clipName]) return;

  const current = currentClips[fighterId];
  const next = clips[clipName];

  if (current === clipName) return;

  if (current && clips[current]) {
    clips[current].crossFadeTo(next, BLEND_TIME, false);
  }

  next.reset();
  next.play();
  currentClips[fighterId] = clipName;
}

export function updateFighter(fighterId, fighter) {
  const model = fighterModels[fighterId];
  if (!model) return;

  // Position
  const pos = gameToWorld(fighter.x, fighter.y);
  model.position.x = pos.x;
  model.position.z = pos.z;
  model.position.y = 0.53;  // stand on ring platform

  // Facing
  model.rotation.y = fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

  // Hitstun vibration — small rapid position jitter for visceral impact feel
  if (fighter.state === 'Hit_Stun' && fighter.hitFlash > 0) {
    model.position.x += (Math.random() - 0.5) * 0.08;
    model.position.z += (Math.random() - 0.5) * 0.04;
  }

  // Animation — use Running for fast movement, Walking for slow
  const speed = Math.sqrt(fighter.vx * fighter.vx + fighter.vy * fighter.vy);
  let clipName = ANIM_MAP[fighter.state] || 'Idle';
  if (fighter.state === 'Move') {
    clipName = speed > 180 ? 'Running' : 'Walking';
  }
  // 2nd punch in combo chain uses the left-arm jab animation
  if (fighter.state.startsWith('Punch_') && fighter.punchChain >= 1) {
    clipName = 'PunchLeft';
  }
  // Don't override clip during death/done phase of KO sequence
  if (koPhase[fighterId] !== 'death' && koPhase[fighterId] !== 'done') {
    playClip(fighterId, clipName);
  }

  // Playback speed adjustments
  const currentAction = actions[fighterId]?.[clipName];
  if (currentAction) {
    if (fighter.state === 'Hit_Stun') {
      // Freeze at early recoil frame of Death animation for a stagger pose
      currentAction.timeScale = 0;
      currentAction.time = 0.15;
    } else if (fighter.state === 'Block' || fighter.state === 'Block_Stun') {
      // Hold at the raised-fist guard pose in the ThumbsUp animation
      currentAction.timeScale = 0;
      currentAction.time = 0.5;
    } else if (fighter.state === 'Block_Recovery') {
      currentAction.timeScale = 2.0;
    } else if (fighter.state === 'Kick_Startup') {
      // Play through chamber into extension (clip 0→~0.17 in 0.083s real)
      currentAction.timeScale = 2.0;
    } else if (fighter.state === 'Kick_Active') {
      // Slow crawl through the extension hold (dynamic, not frozen)
      currentAction.timeScale = 0.3;
    } else if (fighter.state === 'Kick_Recovery') {
      // Fast retract back to idle
      currentAction.timeScale = 2.5;
    } else if (fighter.state === 'Uppercut_Startup') {
      // Fast dip into the windup crouch
      currentAction.timeScale = 2.2;
    } else if (fighter.state === 'Uppercut_Active') {
      // Slow through the rising extension for impact feel
      currentAction.timeScale = 0.35;
    } else if (fighter.state === 'Uppercut_Recovery') {
      // Return from uppercut pose
      currentAction.timeScale = 1.5;
    } else if (fighter.state.includes('Startup')) {
      currentAction.timeScale = 1.5;
    } else if (fighter.state.includes('Recovery')) {
      currentAction.timeScale = 0.5;
    } else if (fighter.state === 'Move') {
      currentAction.timeScale = Math.max(0.5, speed / 200);
    } else {
      currentAction.timeScale = 1.0;
    }
  }

  // Sequenced KO: HeadSpin (2 rotations) → Death (once, clamp on last frame)
  const hs = headSpinActions[fighterId];
  if (hs) {
    const isKO = fighter.state === 'KO';
    if (isKO && !koPhase[fighterId]) {
      // Start spin phase
      koPhase[fighterId] = 'spin';
      hs.reset();
      hs.setLoop(THREE.LoopRepeat, 2);
      hs.clampWhenFinished = true;
      hs.timeScale = 1.0;
      hs.setEffectiveWeight(1);
      hs.play();

      // When spin finishes, transition to death animation
      const onSpinDone = (e) => {
        if (e.action !== hs) return;  // ignore other actions finishing
        mixers[fighterId].removeEventListener('finished', onSpinDone);
        hs.setEffectiveWeight(0);
        koPhase[fighterId] = 'death';
        // Play Death clip once, clamped
        const deathAction = actions[fighterId]?.['Death'];
        if (deathAction) {
          deathAction.reset();
          deathAction.setLoop(THREE.LoopOnce);
          deathAction.clampWhenFinished = true;
          deathAction.timeScale = 1.0;
          deathAction.play();
          currentClips[fighterId] = 'Death';
          // Signal 'done' when Death animation finishes
          const onDeathDone = (e2) => {
            if (e2.action !== deathAction) return;
            mixers[fighterId].removeEventListener('finished', onDeathDone);
            koPhase[fighterId] = 'done';
          };
          mixers[fighterId].addEventListener('finished', onDeathDone);
        }
      };
      mixers[fighterId].addEventListener('finished', onSpinDone);
    } else if (!isKO) {
      // Reset KO phase when not in KO state
      koPhase[fighterId] = null;
      hs.setEffectiveWeight(0);
    }
  }

  // Hit flash effect — bright white flash on hit, decays over hitFlash frames
  const meshes = meshCache[fighterId];
  if (meshes) {
    const flashIntensity = fighter.hitFlash > 0 ? fighter.hitFlash * 0.4 : 0;
    for (const mesh of meshes) {
      mesh.material.emissiveIntensity = flashIntensity;
      if (flashIntensity > 0) {
        mesh.material.emissive = mesh.material.emissive || new THREE.Color();
        mesh.material.emissive.setHex(0xffffff);
      } else {
        // Clear emissive so the white doesn't stay stuck (e.g. after KO)
        mesh.material.emissiveIntensity = 0;
      }
    }
  }
}

function setupCameraControls(canvas) {
  const pointers = new Map();
  let prevTwoFingerAngle = null;
  let prevTwoFingerDist = null;

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);

    if (pointers.size === 2) {
      // Two-finger: pinch to zoom + angle to rotate
      const pts = [...pointers.values()];
      const oldDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const oldAngle = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      const newPts = [...pointers.values()];
      const newDist = Math.hypot(newPts[0].x - newPts[1].x, newPts[0].y - newPts[1].y);
      const newAngle = Math.atan2(newPts[0].y - newPts[1].y, newPts[0].x - newPts[1].x);

      // Zoom from pinch distance change
      if (prevTwoFingerDist !== null) {
        const scale = prevTwoFingerDist / newDist;
        cameraRadius = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraRadius * scale));
      }
      prevTwoFingerDist = newDist;

      // Rotate from two-finger angle change
      if (prevTwoFingerAngle !== null) {
        let deltaAngle = newAngle - prevTwoFingerAngle;
        // Normalize to [-PI, PI]
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
        cameraOrbitTarget += deltaAngle * 1.5;
      }
      prevTwoFingerAngle = newAngle;

    } else if (pointers.size === 1 && prev.button === 2) {
      // Right-click drag: rotate orbit (desktop)
      const dx = e.clientX - prev.x;
      cameraOrbitTarget += dx * 0.008;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    } else {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    }
  });

  const removePointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      prevTwoFingerAngle = null;
      prevTwoFingerDist = null;
    }
  };
  canvas.addEventListener('pointerup', removePointer);
  canvas.addEventListener('pointercancel', removePointer);

  // Prevent context menu on right-click
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Scroll wheel zoom for desktop
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraRadius = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraRadius + e.deltaY * 0.02));
  }, { passive: false });
}

export function setFighterVisible(fighterId, visible) {
  const model = fighterModels[fighterId];
  if (model) model.visible = visible;
}

let globalTimeScale = 1.0;
export function setGlobalTimeScale(scale) { globalTimeScale = scale; }

export function triggerScreenShake(intensity) {
  shakeDecay = intensity;
}

// Update dynamic camera zoom target based on fighter positions (game coords)
export function updateDynamicCamera(player, cpu) {
  const pWorld = gameToWorld(player.x, player.y);
  const cWorld = gameToWorld(cpu.x, cpu.y);
  const dx = Math.abs(pWorld.x - cWorld.x);

  // Map fighter distance to zoom: close → zoom in, far → zoom out
  // dx ranges roughly 0 (touching) to ~10 (full arena width)
  const CLOSE_DIST = 0.8;   // fighters very close
  const FAR_DIST = 6.0;     // fighters far apart
  const ZOOM_CLOSE = isEmbedded ? 18 : 14;   // dramatic close-up
  const ZOOM_FAR = isEmbedded ? 32 : 26;     // wide shot when far

  const t = Math.max(0, Math.min(1, (dx - CLOSE_DIST) / (FAR_DIST - CLOSE_DIST)));
  dynamicZoomTarget = ZOOM_CLOSE + t * (ZOOM_FAR - ZOOM_CLOSE);

  // Track midpoint between fighters horizontally
  dynamicCameraX = (pWorld.x + cWorld.x) / 2;
}

export function resizeRenderer() {
  if (!renderer || !camera) return;
  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width * window.devicePixelRatio;
  const h = rect.height * window.devicePixelRatio;
  if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h)) {
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
}

export function render3d() {
  if (!renderer) return;
  resizeRenderer();

  const delta = clock.getDelta() * globalTimeScale;

  // Update animation mixers (skip when KO animation is fully done — freeze on last frame)
  if (mixers.player && koPhase.player !== 'done') mixers.player.update(delta);
  if (mixers.cpu && koPhase.cpu !== 'done') mixers.cpu.update(delta);

  // Screen shake
  if (shakeDecay > 0) {
    shakeOffset.x = (Math.random() - 0.5) * shakeDecay * 0.05;
    shakeOffset.y = (Math.random() - 0.5) * shakeDecay * 0.03;
    shakeDecay *= 0.85;
    if (shakeDecay < 0.5) shakeDecay = 0;
  } else {
    shakeOffset.x = 0;
    shakeOffset.y = 0;
  }

  // Smoothly lerp zoom and orbit angle toward targets
  cameraRadius += (dynamicZoomTarget - cameraRadius) * CAMERA_LERP_SPEED;
  cameraRadius = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraRadius));
  cameraOrbitAngle += (cameraOrbitTarget - cameraOrbitAngle) * 0.12;

  // Drop camera height when zoomed in for a more dramatic angle
  const zoomNorm = (cameraRadius - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM); // 0 = closest, 1 = farthest
  const cameraY = 3.0 + zoomNorm * 2.0; // 3.0 close-up → 5.0 pulled back
  const lookY = 1.2 + zoomNorm * 0.5;   // look target follows slightly

  // Orbital position: camera orbits around the look target
  camera.position.x = dynamicCameraX + Math.sin(cameraOrbitAngle) * cameraRadius + shakeOffset.x;
  camera.position.y = cameraY + shakeOffset.y;
  camera.position.z = Math.cos(cameraOrbitAngle) * cameraRadius;
  cameraLookAt.x = dynamicCameraX;
  cameraLookAt.y = lookY;
  camera.lookAt(cameraLookAt);

  renderer.render(scene, camera);
}
