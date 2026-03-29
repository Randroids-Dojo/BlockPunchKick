# Pose System

The pose system in `src/renderer3d.js` provides a clean abstraction for placing character limbs in arbitrary directions. It is used by demo mode to showcase arm positions and palm rotations.

## Architecture Overview

```
POSE_DEFS (semantic)     ARM_WORLD_DIRS (resolved)     boneToward() (math)
  'tpose' = [out, out]  →  out = Vector3(-1,0,0)     →  bone local quaternion
  'arms-up' = [up, up]  →  up = Vector3(-1.43,1,0)   →  that achieves target
```

Three layers:
1. **Pose definitions** — human-readable direction names (`'out'`, `'forward'`, `'up'`)
2. **World direction vectors** — where each bone should point, merged from base + model profile
3. **Bone targeting** — computes the exact bone-local quaternion to achieve the world direction

## Core Function: `boneToward(boneName, worldDir)`

Computes the bone-local quaternion that makes the bone's Y-axis (length axis) point in a desired world direction.

**Method:**
1. Get the bone's current world quaternion (captured at rest before animation)
2. Find rotation that takes the current Y-axis to the target direction (`setFromUnitVectors`)
3. Apply correction to get new world quaternion
4. Convert to local space: `localQ = parentWorldQ⁻¹ * newWorldQ`

This produces absolute orientations — the result is the same regardless of what the bone's rest pose looks like.

## Rest Pose Capture

`captureRestPose(model)` runs during `initScene()` after model load, before any animation plays. It stores:
- Bone local quaternions (`REST_BONES[name]`)
- Bone world quaternions (`REST_BONES[name + '_worldQ']`)
- Parent world quaternions (`REST_BONES[name + '_parentWorldQ']`)

For the RobotExpressive model, the rest pose is the idle stance with arms hanging down (not a T-pose). The `boneToward()` function handles this correctly because it works with absolute world targets, not relative deltas from rest.

## Direction Definitions

Base directions are model-agnostic unit vectors:

| Direction | Right Arm | Left Arm |
|-----------|-----------|----------|
| out | (-1, 0, 0) | (1, 0, 0) |
| down | (0, -1, 0) | (0, -1, 0) |
| forward | (0, 0, 1) | (0, 0, 1) |
| back | (0, 0, -1) | (0, 0, -1) |
| up | (0, 1, 0) | (0, 1, 0) |
| in | (1, 0, 0) | (-1, 0, 0) |

## Model Profiles

Different models have different proportions. The `MODEL_PROFILES` map allows per-model overrides for any direction vector.

```javascript
const MODEL_PROFILES = {
  'RobotExpressive': {
    armDirOverrides: {
      right: { up: [-1.43, 1, 0] },  // 55° splay to clear large head
      left:  { up: [ 1.43, 1, 0] },
    },
  },
};
```

`buildArmWorldDirs(profileName)` merges base directions with profile overrides, normalizing all vectors. To support a new model, add a profile entry with only the directions that differ.

## Forearm Behavior

The `FOREARM_MODE` map controls how the forearm (LowerArm) behaves per upper-arm direction:

- **`'rest'`** — Keep the rest elbow angle (natural for horizontal/down poses like T-pose, idle)
- **`'straight'`** — Identity quaternion, extending straight along the upper arm (used for up/forward/back to prevent the forearm from angling inward and clipping the body)

## Palm Rotations

Forearm twist around the arm's length axis, applied as Euler deltas on the rest forearm quaternion via `restDelta()`. Available rotations: none, up, down, out, in.

## Pose Definitions

Each pose maps to a pair of direction names `[rightDir, leftDir]`:

| Pose | Right Arm | Left Arm |
|------|-----------|----------|
| T-Pose | out | out |
| Arms Up | up | up |
| Arms Fwd | forward | forward |
| Arms Back | back | back |
| R Fwd / L Back | forward | back |
| L Fwd / R Back | back | forward |

## Clip Registration

`registerPoseClips(mixer)` pre-generates AnimationClips for every pose × palm rotation combination (6 poses × 5 rotations = 30 clips). Each clip sets all bones: body/legs use idle animation values for a natural stance, arms use the computed pose quaternions.

Transitions between poses use `crossFadeTo()` with 0.15s blend time.

## Adding a New Pose

1. Add a direction to `BASE_ARM_DIRS` if needed (both sides)
2. Add it to `FOREARM_MODE` (rest or straight)
3. Add a `POSE_DEFS` entry with the direction pair
4. Add a button in `index.html` inside the demo panel
5. If it clips on a specific model, add an override in `MODEL_PROFILES`
