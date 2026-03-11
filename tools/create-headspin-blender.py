#!/usr/bin/env python3
"""
tools/create-headspin-blender.py
Proof-of-concept: Add a "HeadSpin" animation via Blender's bpy Python module.
Usage: python3 tools/create-headspin-blender.py
"""
import bpy
import sys
from math import radians

# Clear default scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the GLB
input_path = "assets/RobotExpressive.glb"
print(f"Importing {input_path}...")
bpy.ops.import_scene.gltf(filepath=input_path)

# Find the armature
armature = None
for obj in bpy.data.objects:
    print(f"  Object: '{obj.name}' type={obj.type}")
    if obj.type == 'ARMATURE':
        armature = obj

if not armature:
    print("ERROR: No armature found!")
    sys.exit(1)

print(f"\nArmature: '{armature.name}'")
print(f"Bones: {[b.name for b in armature.pose.bones]}")

# List existing actions (animations)
print(f"\nExisting actions:")
for action in bpy.data.actions:
    # Blender 5.0+ moved fcurves; just print the name
    print(f"  '{action.name}'")

# Enter pose mode
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='POSE')

# Find the Head bone
head_bone = armature.pose.bones.get("Head")
if not head_bone:
    print("ERROR: 'Head' bone not found!")
    print(f"Available bones: {[b.name for b in armature.pose.bones]}")
    sys.exit(1)

print(f"\nFound Head bone: '{head_bone.name}'")

# Create a new action
action = bpy.data.actions.new(name="HeadSpin")
if not armature.animation_data:
    armature.animation_data_create()
armature.animation_data.action = action

# Set rotation mode to euler for easier scripting
head_bone.rotation_mode = 'XYZ'

# Keyframe a 360-degree Y-axis spin over 30 frames (1 second at 30fps)
bpy.context.scene.render.fps = 30
total_frames = 30

for frame in range(total_frames + 1):
    angle = radians(360 * (frame / total_frames))
    head_bone.rotation_euler.y = angle
    head_bone.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)

print(f"Created {total_frames + 1} keyframes for HeadSpin")

# Switch back to object mode
bpy.ops.object.mode_set(mode='OBJECT')

# Push the action to an NLA track so it exports as a named animation
if not armature.animation_data:
    armature.animation_data_create()
track = armature.animation_data.nla_tracks.new()
track.name = "HeadSpin"
strip = track.strips.new("HeadSpin", 0, action)
strip.name = "HeadSpin"

# Clear active action so NLA track is used
armature.animation_data.action = None

# Export as GLB
output_path = "assets/RobotExpressive_test_blender.glb"
print(f"\nExporting to {output_path}...")
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_animations=True,
    export_nla_strips=True,
    export_force_sampling=True,
)

print("Done! Blender bpy export complete.")
