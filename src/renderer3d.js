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
const DEFAULT_ZOOM = isEmbedded ? 24 : 18;
const MIN_ZOOM = 8;   // closest
const MAX_ZOOM = 30;  // farthest
let cameraZ = DEFAULT_ZOOM;

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
  Hit_Stun: 'Idle',
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
function createKickClip() {
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

  // Kick target poses — extracted from WalkJump, Jump, Punch, and extrapolated.
  // Poses are exaggerated beyond reference animations for a dramatic front kick.
  const kick = {
    // --- Kicking leg (right) ---
    // Chamber: knee raised high, thigh ~70° forward
    UpperLegR_chamber: [0.6200, 0.0500, 0.3800, 0.6800],
    // Extend: thigh nearly horizontal, leg fully snapped out (high front kick)
    UpperLegR_extend:  [0.3800, -0.0200, 0.3200, 0.8680],
    // Knee very bent during chamber
    LowerLegR_chamber: [0.8200, 0.0000, 0.0000, 0.5724],
    // Knee fully straight during extend (snap kick)
    LowerLegR_extend:  [0.0400, 0.0000, 0.0000, 0.9992],
    // Foot flexed for impact
    FootR_chamber:     [0.0000, 0.8145, 0.5802, 0.0000],
    FootR_extend:      [0.0000, 0.9600, 0.2800, 0.0000],

    // --- Body lean (backward counterbalance) ---
    // Slight lean during chamber
    Body_chamber:      [-0.0800, 0.0000, 0.0000, 0.9968],
    // Strong lean at full extension — sells the power of the kick
    Body_extend:       [-0.1800, 0.0300, 0.0000, 0.9832],

    // --- Head compensates to stay looking forward ---
    Head_kick:         [0.0800, -0.0029, -0.0013, 0.9968],

    // --- Left arm (guard position, pulled in tighter) ---
    UpperArmL_kick:    [0.2299, -0.7727, -0.0876, 0.5852],
    LowerArmL_kick:    [0.1468, 0.5207, -0.6558, 0.5265],

    // --- Right arm (counterbalance, swings back and down) ---
    UpperArmR_kick:    [-0.2000, 0.6500, -0.3000, 0.6700],
    LowerArmR_kick:    [0.0330, -0.6908, 0.2646, 0.6721],

    // --- Plant leg (left) bends more for stability/grounding ---
    UpperLegL_plant:   [0.9500, 0.0200, -0.1000, 0.2950],
    LowerLegL_plant:   [0.4000, 0.0000, -0.0000, 0.9165],
  };

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

  const rect = canvas.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(40, rect.width / rect.height, 0.1, 100);
  camera.position.set(0, 4.5, DEFAULT_ZOOM);
  camera.lookAt(0, 1.5, 0);

  // Pinch-to-zoom on canvas
  setupPinchZoom(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(rect.width, rect.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight1.position.set(5, 8, 5);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x8899ff, 0.4);
  dirLight2.position.set(-5, 4, -3);
  scene.add(dirLight2);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(24, 12);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.8,
    metalness: 0.2,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Grid lines on ground for visual reference
  const gridHelper = new THREE.GridHelper(22, 44, 0x333355, 0x222244);
  gridHelper.position.y = 0.005;
  scene.add(gridHelper);

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

  // Register procedural kick clip for player
  const kickClip = createKickClip();
  const playerKickAction = playerMixer.clipAction(kickClip);
  playerKickAction.setLoop(THREE.LoopOnce);
  playerKickAction.clampWhenFinished = true;
  actions.player['Kick'] = playerKickAction;

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

  // Register procedural kick clip for CPU
  const cpuKickAction = cpuMixer.clipAction(kickClip);
  cpuKickAction.setLoop(THREE.LoopOnce);
  cpuKickAction.clampWhenFinished = true;
  actions.cpu['Kick'] = cpuKickAction;

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
  model.position.y = 0;

  // Facing
  model.rotation.y = fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

  // Animation — use Running for fast movement, Walking for slow
  const speed = Math.sqrt(fighter.vx * fighter.vx + fighter.vy * fighter.vy);
  let clipName = ANIM_MAP[fighter.state] || 'Idle';
  if (fighter.state === 'Move') {
    clipName = speed > 180 ? 'Running' : 'Walking';
  }
  // Don't override clip during death/done phase of KO sequence
  if (koPhase[fighterId] !== 'death' && koPhase[fighterId] !== 'done') {
    playClip(fighterId, clipName);
  }

  // Playback speed adjustments
  const currentAction = actions[fighterId]?.[clipName];
  if (currentAction) {
    if (fighter.state === 'Block' || fighter.state === 'Block_Stun') {
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

  // Hit flash effect (uses cached mesh references)
  const meshes = meshCache[fighterId];
  if (meshes) {
    for (const mesh of meshes) {
      mesh.material.emissiveIntensity = 0;
    }
  }
}

function setupPinchZoom(canvas) {
  const pointers = new Map();

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const oldDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const newPts = [...pointers.values()];
      const newDist = Math.hypot(newPts[0].x - newPts[1].x, newPts[0].y - newPts[1].y);
      const scale = oldDist / newDist;
      cameraZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraZ * scale));
    } else {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  });

  const removePointer = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', removePointer);
  canvas.addEventListener('pointercancel', removePointer);

  // Scroll wheel zoom for desktop
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraZ + e.deltaY * 0.01));
  }, { passive: false });
}

export function triggerScreenShake(intensity) {
  shakeDecay = intensity;
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

  const delta = clock.getDelta();

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

  camera.position.x = shakeOffset.x;
  camera.position.y = 4.5 + shakeOffset.y;
  camera.position.z = cameraZ;
  camera.lookAt(cameraLookAt);

  renderer.render(scene, camera);
}
