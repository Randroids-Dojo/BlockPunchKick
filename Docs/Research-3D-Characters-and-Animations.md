# Block Punch Kick — Deep Research: 3D Characters & Fighting Animations

> **Date:** 2026-03-08
> **Context:** BlockPunchKick currently uses Canvas 2D with procedural 18-bone skeletal stick-figures. The GDD targets Three.js/Babylon.js for proper 3D rendering. This document covers the full pipeline for upgrading to real 3D characters with professional fighting animations.

---

## Table of Contents

1. [Character Creation Pipeline](#1-character-creation-pipeline)
2. [Skeletal Rigging for Fighters](#2-skeletal-rigging-for-fighters)
3. [Fighting Game Animation Fundamentals](#3-fighting-game-animation-fundamentals)
4. [Frame Data Architecture](#4-frame-data-architecture)
5. [Animation State Machine Design](#5-animation-state-machine-design)
6. [Three.js Animation System](#6-threejs-animation-system)
7. [The Blender → glTF → Three.js Pipeline](#7-the-blender--gltf--threejs-pipeline)
8. [Mixamo & Animation Resources](#8-mixamo--animation-resources)
9. [Advanced Techniques](#9-advanced-techniques)
10. [Style Approaches](#10-style-approaches-realistic-vs-stylized)
11. [Performance Optimization](#11-performance-optimization)
12. [Free & Open Assets](#12-free--open-assets)
13. [Recommended Implementation Path for BlockPunchKick](#13-recommended-implementation-path-for-blockpunchkick)

---

## 1. Character Creation Pipeline

### Standard Workflow Overview

```
Concept Art → 3D Modeling → UV Unwrap → Texturing → Rigging → Skinning → Animation → Export → Engine
```

### Tools by Stage

| Stage | Professional Tools | Free/Indie Tools |
|-------|-------------------|-----------------|
| **Modeling** | Maya, 3ds Max, ZBrush | Blender (fully capable) |
| **Sculpting** | ZBrush, Mudbox | Blender Sculpt, SculptGL |
| **Texturing** | Substance Painter | Blender Texture Paint, ArmorPaint |
| **Rigging** | Maya, MotionBuilder | Blender (Rigify / Auto-Rig Pro) |
| **Animation** | Maya, MotionBuilder | Blender, Cascadeur |
| **Auto-Rigging** | Mixamo (free, web) | Blender Rigify |
| **Motion Capture** | Vicon, OptiTrack | Rokoko, DeepMotion, CMU MoCap DB |
| **Export** | Any → FBX / glTF | Blender → glTF (built-in) |

### For Web Games: Blender Is the Hub

Blender is the recommended centerpiece for this project because:
- **Free and open source** — no licensing costs
- **Full pipeline in one tool** — modeling, rigging, animation, UV, texturing, export
- **Native glTF/GLB export** — the web-standard 3D format
- **Mixamo integration** — import FBX animations, retarget, re-export as glTF
- **Add-on ecosystem** — Rigify, Auto-Rig Pro, Cascadeur integration
- **Active community** — extensive tutorials for game character workflows

### Model Complexity Guidelines (Web)

| Target | Triangle Count | Bone Count | Texture Size |
|--------|---------------|------------|-------------|
| Mobile web | 5k–15k tris | 20–40 bones | 512×512 |
| Desktop web | 15k–40k tris | 40–65 bones | 1024×1024 |
| High-end web | 40k–80k tris | 65–100 bones | 2048×2048 |
| **BlockPunchKick target** | **10k–25k tris** | **30–50 bones** | **512–1024** |

---

## 2. Skeletal Rigging for Fighters

### Humanoid Bone Structure

A fighting game character rig needs enough bones for expressive combat poses while staying performant. Standard humanoid structure:

```
Root (Center of Gravity / Hips)
├── Spine_Lower
│   ├── Spine_Upper
│   │   ├── Neck
│   │   │   └── Head
│   │   ├── Shoulder_L
│   │   │   ├── UpperArm_L
│   │   │   │   ├── Forearm_L
│   │   │   │   │   ├── Hand_L
│   │   │   │   │   │   ├── Fingers (optional: 3 bones × 5 fingers)
│   │   │   │   │   │   └── Thumb (3 bones)
│   │   │   │   │   └── Wrist_Twist_L (optional)
│   │   │   │   └── Elbow_Twist_L (optional)
│   │   └── Shoulder_R (mirror)
│   └── Spine_Mid (optional, for more torso flex)
├── UpperLeg_L
│   ├── LowerLeg_L
│   │   ├── Foot_L
│   │   │   └── Toe_L
│   │   └── Knee_Twist_L (optional)
│   └── Hip_Twist_L (optional)
└── UpperLeg_R (mirror)
```

### Fighting Game-Specific Rigging Considerations

1. **Extra spine bones** — Fighting characters need torso twist for punches/kicks. Minimum 3 spine bones (lower, mid, upper) for good torso deformation.

2. **IK/FK switching** — Use FK (Forward Kinematics) for flowing attacks and aerial moves. Use IK (Inverse Kinematics) for grounded feet, blocking stances, and wall interactions. Many rigs support seamless IK↔FK blending.

3. **Twist bones** — Add forearm and upper arm twist bones to prevent "candy wrapper" deformation during punches. Critical for selling impact on arm-extended poses.

4. **Root motion bone** — A separate root bone at floor level controls character displacement. Essential for attacks that move the character (lunges, slides).

5. **Hitbox/Hurtbox attachment points** — Designate bone positions where hitbox and hurtbox volumes will be attached (fists, feet, head, torso center). These don't need to be rendered but serve as anchor points.

6. **Constraints** — Set rotation limits on joints to prevent unnatural bending (knees shouldn't bend backward, elbows shouldn't hyper-extend). Critical for hit reactions and ragdoll states.

7. **Symmetry** — Build one side, then mirror. Name bones with `_L` / `_R` suffixes. Blender's "Symmetrize" feature handles this automatically.

### Blender Rigging Tools & Add-ons

| Add-on | Price | Key Features |
|--------|-------|-------------|
| **Rigify** (built-in) | Free | Standard rig generation, building-block approach, widely supported |
| **Auto-Rig Pro** | ~$40 | One-click rigging, Mixamo retargeting, game engine export presets (glTF), twist bones |
| **GameRig** | Free | Built on Rigify, produces clean game-engine rigs, single bone hierarchy, open source |
| **Game Rig Tools** | Free/Paid | Extracts deform rig from control rig in clicks |
| **CloudRig** | Free | Blender Studio's advanced rig generator, FK/IK switching, facial rigs |
| **Cascadeur** | Free tier | AI-assisted animation with physics-aware posing, Blender integration, glTF export |

### Character Generator Tools (Blender)

- **CharMorph 0.4** (free, CC0) — Open-source character generator for Blender. Generates custom rigged 3D characters with hair/clothing.
- **MPFB 2 / MakeHuman Plugin** (free, CC0) — Auto-rigs characters with multiple rig options including Rigify. CC0 license on generated content.
- **Rain Character Rig** (Blender Studio) — Official Blender Studio rig, CC-BY licensed, updated for Blender 4.1+.

### Weight Painting Best Practices

- Start with automatic weights (`Ctrl+P → Armature Deform → With Automatic Weights` in Blender)
- Fine-tune problem areas manually: shoulders, hips, elbows, knees
- Test deformation at extreme poses (full punch extension, high kick, crouching block)
- Ensure no vertices are unweighted or double-weighted
- Use "Normalize All" to keep total weight per vertex at 1.0

---

## 3. Fighting Game Animation Fundamentals

### The Three Phases of Every Attack

Every fighting game attack animation follows the same structure:

```
┌─────────────┬──────────────┬──────────────────┐
│   STARTUP   │    ACTIVE    │     RECOVERY     │
│  (Wind-up)  │   (Can hit)  │  (Cooldown)      │
│  Telegraph  │  Hitbox ON   │  Hitbox OFF      │
│  Can't hit  │  Can damage  │  Vulnerable      │
│  Can cancel?│  Impact feel │  Punishable      │
└─────────────┴──────────────┴──────────────────┘
```

- **Startup**: The anticipation/telegraph. Tells the opponent what's coming. Longer startup = more reactable but usually more powerful.
- **Active**: Hitbox is live. This is when damage can be dealt. Short active windows require precise spacing/timing.
- **Recovery**: The character returns to neutral. They're vulnerable during this phase. Longer recovery = more punishable on whiff/block.

### Animation Principles for Fighting Games

1. **Exaggerated anticipation** — Wind-up poses should be large and readable. The opponent needs visual information to react.

2. **Distinct silhouettes** — Each attack should have a unique silhouette at the active frame. Players identify moves by shape, not detail.

3. **Snap, don't ease** — Unlike cinematic animation, fighting game transitions should be snappy. Ease-in on startup, but the transition to active should be sharp.

4. **Impact frames** — Hold or slow the active pose for 1–2 extra frames to sell impact. This is separate from hit-stop (which freezes both characters).

5. **Return to neutral** — Recovery should blend cleanly back to idle. The character should feel "ready" at the end of recovery.

6. **Consistent timing** — Frame data must be exact. A punch that's "about 5 frames startup" is not acceptable. It must be exactly 5 frames every time.

### Keyframe Animation vs. Motion Capture

| Aspect | Keyframe | Motion Capture |
|--------|----------|---------------|
| **Control** | Total control over every frame | Organic but less precise |
| **Frame data precision** | Exact frame timing | Requires cleanup/retiming |
| **Style** | Can exaggerate freely | Grounded in reality |
| **Cost** | Artist time | Equipment + actor + cleanup |
| **Fighting game use** | Street Fighter, Guilty Gear | Mortal Kombat, Tekken |
| **Recommendation** | Better for stylized/indie | Better for realistic AAA |

**For BlockPunchKick**: Keyframe animation (via Mixamo library + custom tweaks in Blender) is the practical choice. Motion capture data from CMU MoCap Database can supplement if needed.

---

## 4. Frame Data Architecture

### Core Frame Data Concepts

Frame data is the numerical backbone of fighting game balance. At 60 FPS (standard for fighting games):

```
1 frame = 1/60th of a second ≈ 16.67ms
```

BlockPunchKick runs at 120 Hz simulation, so:

```
1 sim frame = 1/120th of a second ≈ 8.33ms
2 sim frames = 1 visual frame at 60 FPS
```

### Current BlockPunchKick Frame Data (at 120 Hz)

| Move | Startup | Active | Recovery | Total | Damage |
|------|---------|--------|----------|-------|--------|
| **Block** | 1 | ∞ (held) | 4 | — | — |
| **Punch** | 5 | 3 | 10 | 18 | 8 |
| **Kick** | 8 | 4 | 14 | 26 | 12 |

### Frame Advantage / Disadvantage

```
Frame Advantage = (Opponent's Recovery) - (Attacker's Recovery after hit/block)
```

- **Positive** (+): Attacker recovers first → can press advantage
- **Negative** (-): Attacker recovers second → may be punished
- **Zero** (0): Both recover simultaneously → neutral

If a move is -2 on block and the fastest attack in the game has 5 frames startup, the move is **safe on block** (opponent can't punish).

### Hit-Stop & Hit-Stun

- **Hit-stop** — Both characters freeze for N frames on hit. Adds impact feel. Typical: 3–7 frames. Currently in BlockPunchKick: 5 (punch), 7 (kick), 3 (blocked).
- **Hit-stun** — Defender is locked in a stagger animation for N frames after hit-stop ends. Determines combo potential.
- **Block-stun** — Defender is locked in block reaction for N frames. Usually shorter than hit-stun.

### Multi-Hit & Complex Frame Data Notation

For future moves with multiple hits:
```
16 startup → 3 active → 14 gap → 3 active → 24 recovery
```

### Hitbox/Hurtbox System

```
┌──────────────────────────────────┐
│  PUSHBOX (always active)         │  ← Prevents characters overlapping
│  ┌────────────────────────────┐  │
│  │  HURTBOX (vulnerable area) │  │  ← Where the character can be hit
│  │  ┌──────────┐              │  │
│  │  │ HITBOX   │              │  │  ← Active only during ACTIVE frames
│  │  │(attack)  │              │  │     Attached to fist/foot bone
│  │  └──────────┘              │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- **Pushbox**: Collision volume preventing overlap. Always active except during KO.
- **Hurtbox**: Region where the character can receive damage. May shrink during certain moves (ducking punch avoids high attacks).
- **Hitbox**: Attack collision volume. Only active during ACTIVE frames. Attached to the striking limb's bone.

---

## 5. Animation State Machine Design

### State Machine for BlockPunchKick

```
                    ┌──────────┐
          ┌────────→│   IDLE   │←────────┐
          │         └────┬─────┘         │
          │              │               │
     [recovery      [input]         [recovery
      complete]         │            complete]
          │         ┌───┴───┐            │
          │    ┌────┤ MOVE  ├────┐       │
          │    │    └───────┘    │       │
          │    │                │       │
      [block] [punch]       [kick]     │
          │    │                │       │
          ▼    ▼                ▼       │
      ┌──────┐ ┌──────────┐ ┌──────────┐│
      │BLOCK │ │PUNCH_    │ │KICK_     ││
      │      │ │STARTUP   │ │STARTUP   ││
      └──┬───┘ └────┬─────┘ └────┬─────┘│
         │          │             │      │
    [release]  [frames]      [frames]   │
         │          │             │      │
         ▼          ▼             ▼      │
    ┌────────┐ ┌──────────┐ ┌──────────┐│
    │BLOCK_  │ │PUNCH_    │ │KICK_     ││
    │RECOVERY│ │ACTIVE    │ │ACTIVE    ││
    └────┬───┘ └────┬─────┘ └────┬─────┘│
         │          │             │      │
         │     [frames]      [frames]   │
         │          │             │      │
         │          ▼             ▼      │
         │     ┌──────────┐ ┌──────────┐│
         │     │PUNCH_    │ │KICK_     ││
         │     │RECOVERY  │ │RECOVERY  ││
         │     └────┬─────┘ └────┬─────┘│
         │          │             │      │
         └──────────┴─────────────┴──────┘

    ── ANY HITTABLE STATE can transition to ──
    ┌───────────┐        ┌────────────┐
    │ HIT_STUN  │        │ BLOCK_STUN │
    └─────┬─────┘        └──────┬─────┘
          │                     │
     [stun ends]          [stun ends]
          │                     │
          ▼                     ▼
       ┌──────┐             ┌──────┐
       │ IDLE │             │ IDLE │
       └──────┘             └──────┘

    ── HEALTH ≤ 0 transitions to ──
    ┌──────┐
    │  KO  │
    └──────┘
```

### State Transition Rules

1. **Idle/Move** → can enter Block, Punch_Startup, Kick_Startup
2. **Block** → held indefinitely; on release → Block_Recovery → Idle
3. **Punch/Kick_Startup** → auto-advances to Active (no cancel in v1)
4. **Punch/Kick_Active** → auto-advances to Recovery
5. **Punch/Kick_Recovery** → auto-advances to Idle (input buffer active in last N frames)
6. **Hit_Stun** → entered when hit during any non-blocking state; returns to Idle after stun duration
7. **Block_Stun** → entered when hit during Block; returns to Block (if still held) or Block_Recovery
8. **KO** → terminal state for the round

### Animation Clip Mapping

Each state maps to one or more animation clips:

| State | Animation Clip(s) | Blend Strategy |
|-------|-------------------|----------------|
| Idle | `idle_breathe` | Loop |
| Move | `walk_forward`, `walk_backward` | Loop, mirror for direction |
| Block | `block_stance` | Loop (hold pose) |
| Block_Recovery | `block_stance` → `idle` | Crossfade (4 frames) |
| Punch_Startup | `punch` (frames 0–5) | Play segment |
| Punch_Active | `punch` (frames 5–8) | Continue |
| Punch_Recovery | `punch` (frames 8–18) | Continue, crossfade to idle |
| Kick_Startup | `kick` (frames 0–8) | Play segment |
| Kick_Active | `kick` (frames 8–12) | Continue |
| Kick_Recovery | `kick` (frames 12–26) | Continue, crossfade to idle |
| Hit_Stun | `hit_reaction_light`, `hit_reaction_heavy` | Play once |
| Block_Stun | `block_impact` | Play once |
| KO | `knockdown` | Play once |

---

## 6. Three.js Animation System

### Core Components

Three.js provides a complete animation system built around these classes:

```
AnimationClip     → Raw animation data (keyframes for bones)
AnimationMixer    → The "playback engine" for one character
AnimationAction   → Controls one clip's playback (play, pause, weight, speed)
```

### Basic Setup Pattern

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Load character with animations
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('fighter.glb');

const model = gltf.scene;
scene.add(model);

// Create animation mixer for this character
const mixer = new THREE.AnimationMixer(model);

// Create actions for each animation clip
const actions = {};
gltf.animations.forEach(clip => {
    actions[clip.name] = mixer.clipAction(clip);
});

// Play idle by default
actions['idle'].play();

// In game loop — update mixer every frame
function animate(deltaTime) {
    mixer.update(deltaTime);
    renderer.render(scene, camera);
}
```

### Crossfading Between States (Fighting Game Pattern)

```javascript
class FighterAnimationController {
    constructor(mixer, actions) {
        this.mixer = mixer;
        this.actions = actions;
        this.currentAction = null;
    }

    play(name, { fadeIn = 0.1, loop = true, clampWhenFinished = false } = {}) {
        const nextAction = this.actions[name];
        if (!nextAction || nextAction === this.currentAction) return;

        nextAction.reset();
        nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
        nextAction.clampWhenFinished = clampWhenFinished;

        if (this.currentAction) {
            // Crossfade from current to next
            nextAction.enabled = true;
            this.currentAction.crossFadeTo(nextAction, fadeIn, true);
        }

        nextAction.play();
        this.currentAction = nextAction;
    }

    // For attack animations: play once then return to idle
    playOnce(name, { fadeIn = 0.05, onComplete } = {}) {
        this.play(name, { fadeIn, loop: false, clampWhenFinished: true });

        // Listen for completion
        const onFinished = (e) => {
            if (e.action === this.actions[name]) {
                this.mixer.removeEventListener('finished', onFinished);
                if (onComplete) onComplete();
            }
        };
        this.mixer.addEventListener('finished', onFinished);
    }
}
```

### Additive Animation Blending

Useful for layering hit reactions on top of other animations:

```javascript
// Load a "hit_flinch" animation as additive
const flinchAction = mixer.clipAction(flinchClip);
flinchAction.blendMode = THREE.AdditiveAnimationBlendMode;
flinchAction.setLoop(THREE.LoopOnce);
flinchAction.clampWhenFinished = false;
flinchAction.weight = 0; // Start silent

// On hit — spike the additive layer
function onHit() {
    flinchAction.reset();
    flinchAction.weight = 1;
    flinchAction.play();
    // Fade out over recovery period
    flinchAction.fadeOut(0.3);
}
```

### Controlling Animation Timing for Frame Data

For fighting games, you need frame-precise control rather than time-based blending:

```javascript
// Convert simulation frames to animation time
const ANIM_FPS = 60; // Animation was authored at 60fps
const SIM_HZ = 120;  // Game simulation at 120Hz

function simFrameToAnimTime(simFrame) {
    return simFrame / SIM_HZ; // Convert to seconds
}

// Manually control animation playback by frame
function setAnimationFrame(action, simFrame) {
    const time = simFrameToAnimTime(simFrame);
    action.time = time;
    action.paused = true; // Manual stepping
    mixer.update(0); // Force pose update without advancing
}

// In the fixed-step game loop
function fixedUpdate(fighter) {
    const stateFrame = fighter.framesInState;

    switch (fighter.state) {
        case 'PUNCH_STARTUP':
            setAnimationFrame(actions['punch'], stateFrame);
            break;
        case 'PUNCH_ACTIVE':
            setAnimationFrame(actions['punch'], FRAMES.PUNCH.startup + stateFrame);
            break;
        case 'PUNCH_RECOVERY':
            setAnimationFrame(actions['punch'],
                FRAMES.PUNCH.startup + FRAMES.PUNCH.active + stateFrame);
            break;
    }
}
```

---

## 7. The Blender → glTF → Three.js Pipeline

### Step-by-Step Workflow

#### Step 1: Model or Acquire a Character

- Model in Blender, or download from Mixamo/Sketchfab/itch.io
- Ensure clean topology around joints (edge loops at elbows, knees, shoulders)
- Target 10k–25k triangles for BlockPunchKick

#### Step 2: Rig the Character

Option A — **Mixamo Auto-Rig** (fastest):
1. Export model as FBX from Blender
2. Upload to mixamo.com → auto-rig in ~2 minutes
3. Download rigged character as FBX (T-pose, no animation)
4. Re-import into Blender

Option B — **Blender Rigify** (more control):
1. Add → Armature → Human (Meta-Rig)
2. Scale and position meta-rig bones to match character
3. Generate rig (creates full IK/FK control rig)
4. Parent mesh to rig with automatic weights
5. Clean up weight painting

Option C — **Auto-Rig Pro** (~$40, best for game export):
1. One-click smart rig fitting
2. Built-in Mixamo retargeting
3. Game-engine export presets with bone renaming

#### Step 3: Animate (or Apply Animations)

**From Mixamo:**
1. Upload rigged character to Mixamo
2. Browse/search for fighting animations (punch, kick, block, idle, hit reaction, knockdown)
3. Download each animation as FBX (without skin — skeleton only)
4. Import each FBX into Blender
5. Rename each animation action descriptively
6. Adjust timing in Dope Sheet/Graph Editor to match frame data

**Custom in Blender:**
1. Use pose mode to create key poses
2. Set keyframes at exact frame numbers matching frame data
3. Use the Graph Editor for precise timing curves

**From Cascadeur:**
1. Import rig, pose key frames
2. AI auto-fills in-between frames with physics awareness
3. Export as FBX, import to Blender

#### Step 4: Organize Animation Clips

In Blender's **NLA (Non-Linear Animation) Editor**:
1. Each animation should be a separate **Action** (e.g., `idle`, `punch`, `kick`, `block`, `hit_light`, `knockdown`)
2. Push each action down to an NLA track
3. Or "stash" unused actions so they're preserved on export

#### Step 5: Export as glTF/GLB

**Critical export rules:**
- **One armature per file** — don't export multiple armatures
- **Don't use bendy bones** — they don't export to any standardized format
- **Materials** — use Principled BSDF only (maps to glTF PBR). Supported maps: Color, Metallic, Roughness, AO, Normal, Emissive
- **Validate exports** with [glTF Viewer](https://gltf-viewer.donmccurdy.com/) before writing any code

1. File → Export → glTF 2.0
2. Settings:
   - Format: **GLB** (single binary file, best for web)
   - Include: Selected Objects (if exporting character only)
   - Transform: +Y Up
   - Mesh: Apply Modifiers, UVs, Normals, Vertex Colors
   - Animation: ✅ enabled, NLA Strips or All Actions
   - Skinning: ✅ enabled
   - Compression: ✅ Draco (for mesh compression)
3. Test in [glTF Viewer](https://gltf-viewer.donmccurdy.com/) or Three.js editor

#### Step 6: Load in Three.js

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const gltf = await gltfLoader.loadAsync('/models/fighter.glb');

// gltf.scene        → THREE.Group (the character model)
// gltf.animations   → AnimationClip[] (all animation clips)
// gltf.scene.getObjectByName('mixamorigHips') → root bone
```

### Alternative Quick Pipeline: mixamo2gltf.com

For rapid prototyping, [mixamo2gltf.com](https://mixamo2gltf.com/) is a free online tool that:
1. Takes multiple Mixamo FBX downloads
2. Combines them into a single GLB file with all animations
3. No Blender needed — direct browser upload
4. Output is ready for Three.js / Babylon.js / Godot

---

## 8. Mixamo & Animation Resources

### Adobe Mixamo (Free)

**URL:** [mixamo.com](https://www.mixamo.com)

Mixamo offers:
- **Auto-rigging** — Upload any humanoid mesh, place 5 markers, get a production rig in ~2 minutes
- **2,500+ motion capture animations** — Searchable library including:
  - Fighting: jab, cross, hook, uppercut, roundhouse kick, side kick, front kick
  - Blocking: standing guard, hit reactions, staggers
  - Movement: idle, walk, run, strafe, dodge
  - Falls: knockdowns, getting up, death
- **Free for personal and commercial use**
- **Export formats:** FBX (with/without skin), COLLADA

**Limitations:**
- Humanoid characters only
- Animations may not perfectly match desired frame data timing — will need retiming in Blender
- No glTF export (must convert via Blender or mixamo2gltf.com)

### Fighting-Relevant Mixamo Animations

Search terms to find relevant animations on Mixamo:
- `punch`, `jab`, `cross`, `hook`, `uppercut`
- `kick`, `roundhouse`, `side kick`, `front kick`
- `block`, `guard`, `parry`
- `hit reaction`, `stagger`, `flinch`
- `knockdown`, `get up`, `death`
- `fighting idle`, `combat idle`
- `dodge`, `evade`, `roll`

### Other Animation Sources

| Source | Description | Format | License |
|--------|-------------|--------|---------|
| **CMU MoCap Database** | 2,500+ motion capture clips (martial arts, general movement) | BVH → FBX/glTF | Free (NSF funded) |
| **RancidMilk (itch.io)** | Massive library of free animations converted from CMU | FBX + glTF | CC0 / Free |
| **Cascadeur** | AI-assisted keyframe animation with physics | FBX → glTF | Free tier available |
| **ActorCore/Reallusion** | Professional motion library | FBX | Paid |
| **Rokoko** | Motion capture suit + software + free mocap library | FBX/BVH | Free library / Paid hardware |
| **DeepMotion** | AI motion capture from video | FBX/BVH/glTF | Free tier |
| **Plask** | AI-powered motion capture from video | FBX/glTF | Free tier |

### Motion Capture Databases with Fighting/Martial Arts

| Source | Content | Format | License |
|--------|---------|--------|---------|
| **Bandai Namco Research** | 3,000+ mocap moves including fighting styles | BVH | CC-BY-NC-ND (personal/research) |
| **Rokoko Free Martial Arts Pack** | 6 full-body martial arts animations with fingers | FBX/BVH | Commercial use OK |
| **MotionCaptureData.com** | 19 karate mocap files | BVH/FBX/C3D | Free, no restrictions |
| **SFU Motion Capture Database** | Academic database with diverse motions | FBX/BVH | Academic |
| **Animium Martial Art BVH** | Chinese kung fu motion capture | BVH/BIP | Free |

**Workflow**: Import BVH/FBX into Blender → retarget to your character rig → bake keyframes → export as glTF.

### AI-Powered Animation Tools

| Tool | How It Works | Output | Cost |
|------|-------------|--------|------|
| **DeepMotion** | AI mocap from video via browser — record yourself doing fighting moves | FBX | $15/mo+ |
| **Rokoko Video** | Free AI mocap from webcam/video, cloud-processed | FBX/BVH | Free |
| **Cascadeur** | Physics-based animation with AI-assisted posing — great for combat | FBX → Blender | Free tier |
| **Move.ai** | Markerless motion capture from phone video | FBX/BVH | Paid |
| **Cartwheel** | Text-to-motion generation | Various | Emerging |

**DIY fighting animations**: Record yourself performing moves with a webcam → process through DeepMotion or Rokoko Video → export FBX → import to Blender → clean up timing → export as glTF.

### Animation Retargeting

When using animations from different sources, retargeting is needed to fit them to your character's rig:

1. **In Blender** — Use the NLA editor + bone constraints to retarget between rigs
2. **Auto-Rig Pro** — Built-in retargeting panel for Mixamo → custom rig
3. **Mixamo itself** — Upload your custom model, Mixamo retargets its library automatically
4. **In Three.js** — The `SkeletonUtils.retargetClip()` utility (from three/examples) can retarget at runtime if bone names match a convention

---

## 9. Advanced Techniques

### 9.1 Procedural Animation

Procedural animation generates motion algorithmically rather than from pre-authored clips. Useful for:

- **Idle breathing/swaying** — Subtle sine-wave oscillation on spine bones
- **Look-at / head tracking** — Character looks toward opponent using IK
- **Foot placement** — IK-driven foot positioning on uneven surfaces
- **Hit reaction direction** — Procedurally tilt torso based on where the hit landed

```javascript
// Example: Procedural look-at using Three.js
const headBone = model.getObjectByName('Head');
const targetPos = opponentModel.position.clone();
targetPos.y += 1.5; // Look at opponent's head height

headBone.lookAt(targetPos);
// Clamp rotation to prevent unnatural neck twist
headBone.rotation.x = THREE.MathUtils.clamp(headBone.rotation.x, -0.3, 0.3);
headBone.rotation.y = THREE.MathUtils.clamp(headBone.rotation.y, -0.5, 0.5);
```

### 9.2 Inverse Kinematics for Hit Reactions

Instead of pre-authored hit reaction animations for every possible hit angle, use IK to procedurally generate reactions:

```javascript
// On hit: Apply impulse to IK target based on attack direction
function applyHitReaction(defender, attackDirection, force) {
    const impactPoint = defender.getHitBone(); // e.g., spine or head
    const recoilTarget = impactPoint.position.clone()
        .add(attackDirection.multiplyScalar(force));

    // Animate IK target toward recoil position, then ease back
    tweenIKTarget(defender.ikTargets.torso, recoilTarget, {
        duration: 0.15, // Quick snap
        easeBack: 0.4   // Slower return to neutral
    });
}
```

### 9.3 Root Motion

Root motion extracts the character's displacement from the animation itself rather than applying it via code:

- **Advantage**: Movement perfectly matches the animation (no foot sliding)
- **Disadvantage**: Less gameplay control over exact positioning
- **Fighting game approach**: Use root motion only for specific moves (dashing attacks, knockback slides). Use code-driven movement for normal walking/positioning.

In Three.js, root motion must be extracted manually:
```javascript
// Extract root bone delta each frame
const rootBone = model.getObjectByName('Hips');
const prevPos = rootBone.position.clone();
mixer.update(delta);
const deltaPos = rootBone.position.clone().sub(prevPos);

// Apply delta to character world position
character.position.add(deltaPos);

// Reset root bone to origin (so it doesn't drift in model space)
rootBone.position.copy(prevPos);
```

### 9.4 Animation Blending & Layering

Three.js supports two blending modes:

1. **Normal blending** — Weighted average of multiple animations. Used for state transitions (idle → walk → run).

2. **Additive blending** — Adds an animation delta on top of the current pose. Used for layering effects:
   - Upper body attack + lower body walk
   - Hit flinch overlaid on any current animation
   - Breathing/idle variation on top of combat stance

```javascript
// Additive blend example: Flinch on top of current animation
const flinchAction = mixer.clipAction(flinchClip);
flinchAction.blendMode = THREE.AdditiveAnimationBlendMode;
```

### 9.5 Ragdoll Physics (KO States)

For dramatic KO finishes, transition from skeletal animation to ragdoll physics:

1. **On KO trigger**: Copy current bone transforms to physics rigid bodies
2. **Apply knockout impulse**: Direction and force based on the final hit
3. **Simulate ragdoll**: Let physics engine handle the fall
4. **Optional**: Blend back from ragdoll to "get up" animation (for multi-round)

Libraries for web ragdoll physics:
- **Cannon-es** — Lightweight physics for Three.js
- **Rapier** — High-performance Rust-based physics with WASM bindings
- **Ammo.js** — Bullet physics compiled to WASM

### 9.7 Inverse Kinematics Libraries for Three.js

| Library | Description | Best For |
|---------|-------------|----------|
| **CCDIKSolver** (Three.js built-in) | Part of Three.js examples/addons, most maintained | Basic IK needs, foot placement |
| **THREE.IK** | FABRIK-based IK, multiple chains + constraints | Procedural hit reactions, complex IK setups |
| **Fullik** | Another IK library, less community adoption | Experimental use |

**Use cases for a fighting game**:
- Runtime IK for foot placement on uneven ground
- Procedural hit reactions (character recoils based on hit direction)
- Look-at / head tracking toward opponent
- Blending between keyframed animations and IK-driven adjustments

### 9.8 3D Hitbox/Hurtbox Implementation

The current 2D range-band hit detection translates to 3D with these approaches:

**Option A — AABB (Axis-Aligned Bounding Boxes)** (recommended for BlockPunchKick):
```javascript
// Attach Box3 to limb bones, recompute each frame from bone world position
const punchHitbox = new THREE.Box3();
const hurtbox = new THREE.Box3();

function updateHitboxes(fighter) {
    // Get fist bone world position
    const fistBone = fighter.model.getObjectByName('Hand_R');
    const fistPos = new THREE.Vector3();
    fistBone.getWorldPosition(fistPos);

    // Set hitbox around fist (only active during ACTIVE frames)
    if (fighter.state === 'PUNCH_ACTIVE') {
        punchHitbox.setFromCenterAndSize(fistPos, new THREE.Vector3(0.3, 0.3, 0.3));
    }

    // Set hurtbox around torso (always active)
    const spineBone = fighter.model.getObjectByName('Spine_Upper');
    const spinePos = new THREE.Vector3();
    spineBone.getWorldPosition(spinePos);
    hurtbox.setFromCenterAndSize(spinePos, new THREE.Vector3(0.6, 1.0, 0.4));

    // Test intersection
    if (punchHitbox.intersectsBox(opponentHurtbox)) {
        // Hit confirmed!
    }
}
```

**Option B — Bounding Spheres** — rotation-invariant, good for fist/foot hitboxes:
```javascript
const fistSphere = new THREE.Sphere(fistWorldPos, 0.15);
const bodyHurtSphere = new THREE.Sphere(torsoWorldPos, 0.5);
if (fistSphere.intersectsSphere(bodyHurtSphere)) { /* hit */ }
```

**Recommendation**: Keep the existing frame-data-driven hit logic, just replace 2D rectangle checks with `Box3.intersectsBox()`. The game logic stays deterministic; only the spatial check changes.

### 9.9 WebGPU for Three.js (Future-Proofing)

As of 2026, WebGPU is supported in all major browsers (~95% coverage). Three.js r171+ supports it with automatic WebGL2 fallback:

```javascript
// Single import change — WebGPU with auto WebGL2 fallback
import * as THREE from 'three/webgpu';
```

| Capability | WebGL2 | WebGPU |
|---|---|---|
| Draw calls | Sequential, single-thread | Multi-threaded command submission |
| Compute shaders | Not available | Full support (particles, physics on GPU) |
| Performance ceiling | Good for simple scenes | 2-10x better for complex scenes |

**For BlockPunchKick**: A 1v1 fighter with simple arena is well within WebGL2's capabilities. However, using the `three/webgpu` import is free future-proofing with zero downside since it falls back automatically.

### 9.10 SkeletonUtils for Character Cloning

Since both fighters share the same rig, use `SkeletonUtils` to efficiently clone skinned meshes:

```javascript
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Clone a skinned mesh (preserves skeleton + materials)
const player2Model = SkeletonUtils.clone(player1Model);

// Retarget animations between skeletons with different proportions
const retargetedClip = SkeletonUtils.retargetClip(
    targetModel, sourceModel, sourceClip, options
);
```

### 9.6 Hit-Stop Implementation

```javascript
// Hit-stop: Freeze both characters for N frames
function triggerHitStop(attacker, defender, frames) {
    attacker.hitStopRemaining = frames;
    defender.hitStopRemaining = frames;
}

function fixedUpdate(fighter) {
    if (fighter.hitStopRemaining > 0) {
        fighter.hitStopRemaining--;
        // Don't update animation or position — frozen
        return;
    }
    // Normal update...
}
```

---

## 10. Style Approaches: Realistic vs. Stylized

### Realistic Style (Tekken, Mortal Kombat)

- **Models**: High poly (50k–200k tris), PBR materials, detailed textures
- **Animation**: Motion capture based, realistic physics
- **Pros**: Impressive visual fidelity, grounded movement
- **Cons**: Expensive assets, harder to read at high speed, heavy on GPU
- **Not recommended for BlockPunchKick** — too heavy for web, mismatches the design philosophy

### Stylized/Anime Style (Guilty Gear, Dragon Ball FighterZ)

- **Models**: Lower poly (10k–40k), hand-painted or cel-shaded
- **Animation**: Hand-animated keyframes with exaggerated poses
- **Key technique**: Arc System Works' approach:
  - 3D models designed to look 2D from the game camera angle
  - ~40k triangles per character, no normal maps
  - **Manually edited vertex normals** for clean cel-shading from any angle
  - Hand-animated frame-by-frame with distinct key poses
  - Strategic frame dropping — not all frames render; some are intentionally skipped for snappier feel
  - No motion capture — everything is keyframed for maximum artistic control
- **Highly relevant to BlockPunchKick** — readable, performant, stylish

### Minimalist/Abstract Style (Nidhogg, Divekick, Stick Fight)

- **Models**: Very low poly or geometric shapes
- **Animation**: Simple but snappy, emphasis on readability over beauty
- **Pros**: Fast to produce, very readable, great web performance
- **Cons**: Less visually impressive
- **Most aligned with BlockPunchKick's current direction** — the stick-figure aesthetic could evolve into stylized low-poly 3D

### Recommended Approach for BlockPunchKick

A **stylized low-poly** approach that evolves the current stick-figure identity:

1. Simple geometric characters (capsules, boxes, or low-poly humanoids)
2. Color-coded joints/limbs (keeping the blue vs. red identity)
3. Cel-shading or flat shading (no PBR complexity)
4. Snappy keyframe animations with held key poses
5. Strong silhouettes for readability
6. 10k–15k triangles per character
7. Toon/outline shader for that "readable 3D" feel the GDD describes

---

## 11. Performance Optimization

### Web-Specific Concerns

| Optimization | Technique | Impact |
|-------------|-----------|--------|
| **Mesh compression** | Draco compression in glTF | 50–90% smaller file size |
| **Texture compression** | KTX2 / Basis Universal | 75% smaller textures, GPU-native decode |
| **Texture atlasing** | Combine character textures into one atlas | Fewer draw calls |
| **Bone count** | Keep under 50 bones per character | Less CPU for skinning |
| **Animation compression** | Reduce keyframe density, quantize values | Smaller files, faster parse |
| **LOD (Level of Detail)** | Lower poly at distance (less relevant for fighters) | GPU savings |
| **Instanced rendering** | Same mesh/material for both fighters | ~50% fewer draw calls |
| **Shader simplicity** | Toon/flat shading instead of PBR | Faster fragment shader |
| **Offscreen culling** | Don't render what's off-camera | GPU savings |

### Animation Performance Tips

1. **Limit active AnimationActions** — Only have 1–2 actions with non-zero weight active at any time
2. **Use `action.stop()`** — Don't just fade weight to 0; actually stop unused actions
3. **Pre-parse animations** — Load and cache all clips at startup, not on demand
4. **Fixed-step animation** — Update mixer at simulation rate, not render rate, to avoid double-updating
5. **Pool objects** — Reuse Vector3, Quaternion instances instead of creating new ones each frame

### Performance Budget for BlockPunchKick

Target: **Stable 60 FPS on mid-range mobile (2022+ device)**

| Resource | Budget |
|----------|--------|
| Total draw calls | < 50 per frame |
| Triangle count (scene) | < 100k total |
| Per-character triangles | 10k–25k |
| Per-character bones | 30–50 |
| Texture memory | < 16MB total |
| GLB file size (per character) | < 2MB |
| Animation clips per character | 10–15 |
| JavaScript bundle | < 500KB gzipped |

---

## 12. Free & Open Assets

### Ready-to-Use Character Models

| Source | What's Available | Format | License |
|--------|-----------------|--------|---------|
| [Mixamo](https://www.mixamo.com) | 15+ default characters with auto-rig | FBX | Free commercial use |
| [Quaternius](https://quaternius.com) | Low-poly animated character packs | FBX/glTF | CC0 |
| [Kenney](https://kenney.nl) | 60k+ game assets including 3D characters | OBJ/FBX/glTF | CC0 |
| [KayKit (itch.io)](https://kaylousberg.itch.io/) | Stylized character packs (adventurers, etc.) | FBX/glTF | CC0 |
| [Sketchfab](https://sketchfab.com) | Huge library, filter by CC license | glTF/FBX/OBJ | Varies (check each) |
| [RancidMilk (itch.io)](https://rancidmilk.itch.io/free-character-animations) | Massive animation library (CMU MoCap based) | FBX/glTF | CC0 |
| [Free3D](https://free3d.com) | Character base meshes | Various | Varies |
| [Ready Player Me](https://readyplayer.me) | Customizable avatars | glTF | Free tier |
| [TurboSquid](https://www.turbosquid.com) | 400+ free fighter models, 600+ free glTF models | Various/glTF | Varies |
| [CGTrader](https://www.cgtrader.com/3d-models/gltf) | 63k+ glTF models, filter by free/rigged/low-poly | glTF | Varies |
| [OpenGameArt](https://opengameart.org) | Community-contributed game assets | Various | CC/GPL |
| [CharMorph](https://github.com/nicktlsn/CharMorph) | Open-source Blender character generator | Blender/glTF | CC0 |
| [MPFB 2 / MakeHuman](https://static.makehumancommunity.org/mpfb.html) | Auto-rigged characters with Rigify support | Blender/FBX | CC0 |

### Recommended Starting Points

1. **Fastest path**: Mixamo default character → Mixamo fighting animations → mixamo2gltf.com → Three.js
2. **Best quality control**: Quaternius character → Mixamo rig + animations → Blender retiming → glTF export
3. **Most unique**: Custom Blender model → Rigify rig → Mixamo animations retargeted → glTF export

---

## 13. Recommended Implementation Path for BlockPunchKick

### Phase 1: Proof of Concept (Keep Current System, Add 3D Renderer)

1. **Add Three.js** as a dependency (via CDN or npm)
2. **Set up a basic scene** with a camera locked to side view (matching current 2D composition)
3. **Load a test character** (Mixamo Y-Bot or similar) with idle animation
4. **Run side-by-side** with existing Canvas 2D renderer for comparison
5. **Goal**: Validate that Three.js can render at 60 FPS on mobile with the game's 120 Hz sim loop

### Phase 2: Animation Integration

1. **Acquire fighting animations** from Mixamo (idle, punch, kick, block, hit reactions, knockdown)
2. **Retime animations in Blender** to match existing frame data (5f startup punch, 8f startup kick, etc.)
3. **Export as single GLB** with all clips
4. **Build AnimationController** class that maps game states → animation clips
5. **Wire into existing state machine** — the game logic stays the same, only the rendering changes
6. **Goal**: 3D character puppeted by existing deterministic combat system

### Phase 3: Full 3D Conversion

1. **Replace Canvas 2D rendering** with Three.js scene
2. **Add hitbox/hurtbox visualization** using wireframe meshes attached to bones
3. **Implement hit-stop** in the 3D animation system (pause mixer updates)
4. **Add camera effects** — slight zoom on hit, subtle shake on impact
5. **Add simple VFX** — hit spark particles, block flash
6. **Maintain the 2D plane constraint** — all gameplay on X/Y, 3D is purely visual

### Phase 4: Polish & Style

1. **Custom character model** — Design a character that fits BlockPunchKick's identity
2. **Toon/cel shader** — Implement outline and flat-color shading for readability
3. **Color differentiation** — Blue player / Red AI with distinct visual treatment
4. **Particle effects** — Impact sparks, block shields, KO effects
5. **Screen effects** — Hit-stop camera freeze, KO slow-motion, round transition effects

### Key Architecture Decision

**Keep the game logic and rendering completely separate.** The 120 Hz simulation loop should produce a `GameState` object each tick. The renderer (whether Canvas 2D or Three.js) reads that state and draws it. This means:

- The 3D upgrade is purely a rendering change
- Frame data, hit detection, state machine all stay in the existing `game.js` logic
- The 3D renderer subscribes to state changes and puppets the character models accordingly
- If 3D performance is poor on a device, could fall back to the 2D renderer

---

## References & Sources

### Tutorials & Guides
- [Three.js Animation System](https://discoverthreejs.com/book/first-steps/animation-system/)
- [Three.js AnimationMixer Docs](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- [Three.js Skeletal Blending Example](https://threejs.org/examples/webgl_animation_skinning_blending.html)
- [Three.js Additive Blending Example](https://threejs.org/examples/webgl_animation_skinning_additive_blending.html)
- [Codrops: Interactive 3D Character with Three.js](https://tympanus.net/codrops/2019/10/14/how-to-create-an-interactive-3d-character-with-three-js/)
- [Don McCurdy: Mixamo → Blender → glTF Pipeline](https://www.donmccurdy.com/2017/11/06/creating-animated-gltf-characters-with-mixamo-and-blender/)
- [FolioForge: Three.js + Blender 2025 Pipeline](https://folioforge.in/2025/10/03/three-js-blender-2025-my-modern-creative-pipeline-for-web-3d-folioforge/)
- [sbcode.net: glTF Animations in Three.js](https://sbcode.net/threejs/gltf-animation/)

### Fighting Game Frame Data
- [SuperCombo Wiki: Frame Data](https://wiki.supercombo.gg/w/Frame_Data)
- [Dustloop Wiki: Using Frame Data](https://www.dustloop.com/w/Using_Frame_Data)
- [CritPoints: Frame Data Patterns for Game Designers](https://critpoints.net/2023/02/20/frame-data-patterns-that-game-designers-should-know/)

### Art Style & Technique
- [GDC Vault: Guilty Gear Xrd Art Style Talk](https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The)
- [Guilty Gear Xrd GDC PDF](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf)
- [Unreal Engine: Guilty Gear Strive Interview](https://www.unrealengine.com/en-US/developer-interviews/how-guilty-gear--strive--hits-an-ultra-combo-with-groundbreaking-visuals-and-gameplay)

### Rigging & Character Creation
- [GarageFarm: Character Rigging in 3D](https://garagefarm.net/blog/character-rigging-in-3d-animation-tools-and-techniques)
- [Homestyler: Mastering 3D Character Rigging](https://www.homestyler.com/article/mastering-d-character-rigging)
- [Skillshare: How to Rig in Blender](https://www.skillshare.com/en/blog/how-to-rig-in-blender-a-step-by-step-tutorial-skillshare-blog/)
- [Rokoko: Guide to 3D Animation Rigs](https://www.rokoko.com/insights/guide-to-3d-animation-rigs)

### Procedural Animation & Ragdoll
- [Alan Zucconi: Introduction to Procedural Animations](https://www.alanzucconi.com/2017/04/17/procedural-animations/)
- [Game Developer: Animation Blending & IK](https://www.gamedeveloper.com/programming/animation-blending-achieving-inverse-kinematics-and-more)
- [Medium: Active Ragdolls in Unity](https://sergioabreu-g.medium.com/how-to-make-active-ragdolls-in-unity-35347dcb952d)
- [Medium: Animation of Active Ragdolls in Games](https://medium.com/@jacasch/animation-of-active-ragdolls-in-games-32ca9d98afc9)

### Tools
- [Mixamo](https://www.mixamo.com) — Free auto-rigging + animation library
- [mixamo2gltf.com](https://mixamo2gltf.com/) — Combine Mixamo FBX → GLB
- [glTF Viewer](https://gltf-viewer.donmccurdy.com/) — Test exported models
- [Cascadeur](https://cascadeur.com/) — AI-assisted animation
- [Blender](https://www.blender.org/) — Open-source 3D creation suite

### Existing Three.js Fighting Games
- [itch.io: Three.js Fighting Games](https://itch.io/games/made-with-threejs/tag-fighting)
- [Three.js Forum: JADY DETH](https://discourse.threejs.org/t/3d-fighting-game-jady-deth/45808)
- [GitHub: Fighting Game Topic (JavaScript)](https://github.com/topics/fighting-game?l=javascript)

### Free Assets
- [Quaternius](https://quaternius.com) — CC0 low-poly game assets
- [Kenney](https://kenney.nl) — CC0 game assets (60k+)
- [RancidMilk Animations](https://rancidmilk.itch.io/free-character-animations) — CC0 mocap library
- [KayKit Character Packs](https://kaylousberg.itch.io/) — CC0 stylized characters
- [awesome-cc0 GitHub](https://github.com/madjin/awesome-cc0) — Curated CC0 asset list
- [TurboSquid](https://www.turbosquid.com) — Free fighter models
- [CGTrader](https://www.cgtrader.com/3d-models/gltf) — glTF model marketplace
- [OpenGameArt](https://opengameart.org) — Community game assets

### Motion Capture & AI Animation
- [Bandai Namco Research MoCap](https://www.cgchannel.com/2022/05/download-3000-free-mocap-moves-from-bandai-namco-research/) — 3k+ free mocap moves
- [Rokoko Free Martial Arts Pack](https://www.rokoko.com/resources/rokoko-mocap-6-free-martial-arts-animations) — Free combat animations
- [MotionCaptureData.com](https://motioncapturedata.com/category/fighting/) — Free karate mocap
- [DeepMotion](https://www.deepmotion.com/) — AI video-to-mocap
- [Mesh2Motion](https://gamefromscratch.com/mesh2motion-open-source-mixamo-alternative/) — Open-source Mixamo alternative

### Blender Add-ons & Character Generators
- [GameRig](https://github.com/Arminando/GameRig) — Open-source game-engine rig generator
- [CharMorph](https://www.cgchannel.com/2025/03/check-out-new-open-source-3d-character-generator-charmorph/) — CC0 character generator
- [MPFB 2](https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2/) — MakeHuman Blender plugin
- [Rigify vs Auto-Rig Pro comparison](https://cgdive.com/rigify-vs-auto-rig-pro-auto-rigging-comparison/)
- [Best Rigging Add-ons 2025](https://www.whizzystudios.com/post/best-rigging-add-ons-for-blender-in-2025-beyond-rigify-and-auto-rig-pro)

### Three.js IK & Procedural Animation
- [THREE.IK](https://github.com/jsantell/THREE.IK) — FABRIK-based IK for Three.js
- [Three.js CCDIKSolver Example](https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_skinning_ik.html) — Built-in IK
- [Blender to Three.js Export Guide](https://github.com/funwithtriangles/blender-to-threejs-export-guide)

### WebGPU & Performance
- [WebGL vs WebGPU Explained](https://threejsroadmap.com/blog/webgl-vs-webgpu-explained)
- [What Changed in Three.js 2026](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [web.dev: WebGPU Browser Support](https://web.dev/blog/webgpu-supported-major-browsers)
- [100 Three.js Performance Tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Codrops: Efficient Three.js Scenes](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)

### Hitboxes & Collision Detection
- [MDN: 3D Collision Detection](https://developer.mozilla.org/en-US/docs/Games/Techniques/3D_collision_detection)
- [MDN: Bounding Volumes with Three.js](https://developer.mozilla.org/en-US/docs/Games/Techniques/3D_collision_detection/Bounding_volume_collision_detection_with_THREE.js)

### Additional Three.js Tutorials
- [Three.js Animation System Manual](https://threejs.org/manual/en/animation-system.html)
- [SkeletonUtils Docs](https://threejs.org/docs/pages/module-SkeletonUtils.html)
- [Bryan Jones: Basic Three.js Game Tutorial](https://bryanjones.us/article/basic-threejs-game-tutorial-part-1-basics)
- [Three.js vs Babylon.js vs PlayCanvas 2026](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)
