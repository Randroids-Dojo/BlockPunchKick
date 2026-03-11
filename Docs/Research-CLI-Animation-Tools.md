# CLI Tools for 3D Animation in a Cloud Dev Environment

## Context

Our game uses a single **GLB model** (`assets/RobotExpressive.glb`) loaded via **Three.js** with `GLTFLoader`. Animations are played back using `THREE.AnimationMixer`. The model already contains embedded animation clips (Idle, Punch, Death, Walking, etc.) that we map to game states.

This document researches how we can **create entirely new animations** (e.g. a 360-degree head spin on death) using only CLI tools in a headless cloud environment — no desktop GUI needed.

---

## Option 1: Blender Headless (Best for Complex Animations)

**What it is:** Blender can run fully headless via `-b` flag, scripted entirely through Python (`bpy` API). This gives us access to the full power of a 3D animation suite without needing a display server.

**Install in cloud env:**
```bash
# Ubuntu/Debian
sudo apt-get install blender

# Or download portable version
wget https://download.blender.org/release/Blender4.0/blender-4.0.2-linux-x64.tar.xz
tar xf blender-4.0.2-linux-x64.tar.xz
```

**Example: Create a head-spin death animation and export to GLB:**
```python
# death_spin.py — run with: blender -b -noaudio -P death_spin.py
import bpy
import sys
from math import radians

# Load our robot model
bpy.ops.import_scene.gltf(filepath="assets/RobotExpressive.glb")

# Find the armature
armature = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        armature = obj
        break

if not armature:
    print("ERROR: No armature found")
    sys.exit(1)

# Enter pose mode
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='POSE')

# Find the head bone (name varies by model)
head_bone = armature.pose.bones.get("Head")  # adjust bone name as needed

if head_bone:
    # Create a new action for our animation
    action = bpy.data.actions.new(name="HeadSpin")
    armature.animation_data_create()
    armature.animation_data.action = action

    # Keyframe a 360-degree Y-axis rotation over 30 frames (1 second at 30fps)
    fps = 30
    total_frames = 30

    for frame in range(total_frames + 1):
        angle = radians(360 * (frame / total_frames))
        head_bone.rotation_euler.y = angle
        head_bone.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# Export as GLB with animations
bpy.ops.export_scene.gltf(
    filepath="assets/RobotExpressive_with_spin.glb",
    export_format='GLB',
    export_animations=True,
    export_force_sampling=True,
)

print("Done! Exported with HeadSpin animation.")
```

**Run it:**
```bash
blender -b -noaudio -P death_spin.py
```

**Pros:**
- Full skeletal animation support — can animate any bone
- Can import our existing GLB, add new animation clips, and re-export
- Professional-grade: IK, constraints, physics baking
- Python scripting is well-documented

**Cons:**
- Large install (~200MB+)
- Steeper learning curve for `bpy` API
- Bone names in the RobotExpressive model need to be discovered first

---

## Option 2: glTF Transform (Best for Modifying Existing Animations)

**What it is:** A JavaScript/Node.js SDK and CLI for reading, editing, and writing glTF/GLB files. Great for post-processing, optimizing, and tweaking animations at the data level.

**Install:**
```bash
npm install --global @gltf-transform/cli
# or use the API
npm install @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
```

**CLI usage:**
```bash
# Inspect existing animations in our model
gltf-transform inspect assets/RobotExpressive.glb

# Optimize/compress animations
gltf-transform resample assets/RobotExpressive.glb output.glb

# Draco compress geometry
gltf-transform draco assets/RobotExpressive.glb output.glb
```

**Programmatic API — create/edit animations in Node.js:**
```javascript
import { Document, NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const doc = await io.read('assets/RobotExpressive.glb');

// List all existing animations
const animations = doc.getRoot().listAnimations();
console.log('Animations:', animations.map(a => a.getName()));

// List all nodes (to find the head bone/node)
const nodes = doc.getRoot().listNodes();
nodes.forEach(n => console.log('Node:', n.getName()));

// Create a new animation programmatically
const anim = doc.createAnimation('HeadSpin');
const headNode = nodes.find(n => n.getName() === 'Head');

if (headNode) {
    const inputAccessor = doc.createAccessor('spin_times')
        .setType('SCALAR')
        .setArray(new Float32Array([0, 0.25, 0.5, 0.75, 1.0]));

    const outputAccessor = doc.createAccessor('spin_rotations')
        .setType('VEC4')
        .setArray(new Float32Array([
            0, 0, 0, 1,           // 0°
            0, 0.707, 0, 0.707,   // 90°
            0, 1, 0, 0,           // 180°
            0, 0.707, 0, -0.707,  // 270°
            0, 0, 0, -1,          // 360°
        ]));

    const sampler = doc.createAnimationSampler()
        .setInput(inputAccessor)
        .setOutput(outputAccessor)
        .setInterpolation('LINEAR');

    const channel = doc.createAnimationChannel()
        .setTargetNode(headNode)
        .setTargetPath('rotation')
        .setSampler(sampler);

    anim.addSampler(sampler).addChannel(channel);
}

await io.write('assets/RobotExpressive.glb', doc);
```

**Pros:**
- Lightweight, fast, Node.js-native (fits our web stack)
- Can read our existing GLB, inspect all bones/nodes, add animation clips
- Excellent for batch processing and optimization
- No heavy dependencies

**Cons:**
- Lower-level API — you work with raw keyframe data (quaternions, accessors)
- No visual preview; need to understand glTF animation structure
- Better for simple procedural animations than complex character animation

---

## Option 3: gltf-js-utils (Simplest Keyframe API)

**What it is:** A lightweight JS library specifically for creating glTF models and animations programmatically with a simple, intuitive API.

**Install:**
```bash
npm install gltf-js-utils
```

**Example:**
```javascript
import { Animation, InterpolationMode, Transformation } from 'gltf-js-utils';

const spinAnimation = new Animation({
    node: headNode,
    transformation: Transformation.ROTATION,
    keyframes: [
        { time: 0.0, value: [0, 0, 0, 1], interpType: InterpolationMode.LINEAR },
        { time: 0.5, value: [0, 1, 0, 0], interpType: InterpolationMode.LINEAR },
        { time: 1.0, value: [0, 0, 0, -1], interpType: InterpolationMode.LINEAR },
    ]
});
```

**Pros:** Simplest API of all the JS options
**Cons:** Less maintained, more limited feature set

---

## Option 4: gltfgen (Rust CLI — Mesh Sequence to Animation)

**What it is:** A Rust CLI tool that generates glTF animations from a sequence of mesh files (VTK, OBJ).

**Install:**
```bash
cargo install gltfgen
```

**Usage:**
```bash
gltfgen ./meshes/frame_*.obj -o animation.glb --fps 30
```

**Pros:** Fast, single binary
**Cons:** Only works with mesh sequences (not skeletal animation); would need to export per-frame meshes from somewhere first

---

## Recommendation for Our Project

### For Quick Procedural Animations (head spin, bounce, shake):
**Use glTF Transform** (`@gltf-transform/core`). It's JavaScript, fits our web stack, and can directly read/write our existing `RobotExpressive.glb`. Write a Node.js script that:
1. Reads the GLB
2. Finds the target bone node
3. Adds keyframe data as a new animation clip
4. Writes the modified GLB back

### For Complex Character Animations (entirely new poses, multi-bone choreography):
**Use Blender headless**. Write a Python script, run it with `blender -b -noaudio -P script.py`. This gives full access to armature manipulation, IK, and all of Blender's animation tools.

### Suggested Workflow
```
1. Inspect model:     gltf-transform inspect assets/RobotExpressive.glb
2. Discover bones:    Node.js script to list all nodes/joints
3. Author animation:  Blender Python script OR glTF Transform script
4. Export:            Overwrite or create new GLB
5. Test in game:      Update ANIM_MAP in renderer3d.js to reference new clip
```

### Integration with Our Codebase
Once a new animation clip is added to the GLB, using it is straightforward — just add it to `ANIM_MAP` in `src/renderer3d.js`:

```javascript
const ANIM_MAP = {
    // ... existing mappings ...
    KO: 'HeadSpin',  // swap 'Death' for our new custom animation
};
```

The `AnimationMixer` will automatically pick up any named clips embedded in the GLB.

---

## Sources

- [glTF Transform](https://gltf-transform.dev/) — JS/TS SDK and CLI for glTF
- [gltf-js-utils](https://github.com/wnayes/glTF-js-utils) — Simple JS glTF creation library
- [gltfgen](https://github.com/elrnv/gltfgen) — Rust CLI for mesh-sequence animations
- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) — FBX to glTF converter
- [Blender CLI Rendering](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html)
- [Blender Headless Guide](https://caretdashcaret.com/2015/05/19/how-to-run-blender-headless-from-the-command-line-without-the-gui/)
- [Blender glTF Export Docs](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [Blender Python Armature Tutorial](https://www.ojambo.com/generate-bone-armatures-with-blender-python-api-for-website)
- [Generating glTF Programmatically](https://www.donmccurdy.com/2023/08/01/generating-gltf/)
- [Khronos glTF Animation Tutorial](https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_006_SimpleAnimation.html)
- [Blender Scripting for Animation Pipelines (2026)](https://blog.cg-wire.com/blender-scripting-animation/)
