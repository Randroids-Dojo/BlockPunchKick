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
  Kick_Startup: 'WalkJump',
  Kick_Active: 'WalkJump',
  Kick_Recovery: 'WalkJump',
  Hit_Stun: 'Idle',
  Block_Stun: 'No',
  KO: 'Death',
};

const BLEND_TIME = 0.08;

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
  playClip(fighterId, clipName);

  // Playback speed adjustments
  const currentAction = actions[fighterId]?.[clipName];
  if (currentAction) {
    if (fighter.state === 'Block') {
      // Hold at the raised-fist guard pose in the ThumbsUp animation
      currentAction.timeScale = 0;
      currentAction.time = 0.5;
    } else if (fighter.state === 'Block_Recovery') {
      currentAction.timeScale = 2.0;
    } else if (fighter.state === 'Kick_Startup') {
      currentAction.timeScale = 2.5;
    } else if (fighter.state === 'Kick_Active') {
      // Freeze at the extended leg pose for a visible kick impact frame
      currentAction.timeScale = 0;
      currentAction.time = 0.4;
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

  // HeadSpin overlay — activate only on KO (2 full rotations)
  const hs = headSpinActions[fighterId];
  if (hs) {
    const wantSpin = fighter.state === 'KO';
    if (wantSpin && hs.getEffectiveWeight() === 0) {
      // Starting a new KO spin — reset and play 2 loops
      hs.reset();
      hs.setLoop(THREE.LoopRepeat, 2);
      hs.clampWhenFinished = true;
      hs.timeScale = 1.0;
      hs.play();
    }
    hs.setEffectiveWeight(wantSpin ? 1 : 0);
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

  // Update animation mixers
  if (mixers.player) mixers.player.update(delta);
  if (mixers.cpu) mixers.cpu.update(delta);

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
