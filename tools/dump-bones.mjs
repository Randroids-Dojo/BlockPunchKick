// Dump bone names and animation track info from RobotExpressive.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('assets/RobotExpressive.glb');

// List all nodes (bones)
console.log('=== ALL NODES (BONES) ===');
const root = doc.getRoot();
for (const node of root.listNodes()) {
  const name = node.getName();
  const sanitized = name.replace(/\./g, '');
  const rot = node.getRotation();
  if (name) {
    console.log(`  ${name} -> sanitized: ${sanitized}, rotation: [${rot.map(v => v.toFixed(4)).join(', ')}]`);
  }
}

// List all animations and their channels
console.log('\n=== ANIMATIONS ===');
for (const anim of root.listAnimations()) {
  console.log(`\nAnimation: "${anim.getName()}"`);
  for (const channel of anim.listChannels()) {
    const targetNode = channel.getTargetNode();
    const targetPath = channel.getTargetPath();
    const sampler = channel.getSampler();
    const input = sampler.getInput();
    const output = sampler.getOutput();
    const times = input ? input.getCount() : 0;
    console.log(`  ${targetNode?.getName()}.${targetPath} (${times} keyframes)`);
  }
}

// Extract specific bone poses from animations we care about
console.log('\n=== KEY POSES FROM ANIMATIONS ===');
for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (!['Idle', 'Punch', 'WalkJump'].includes(name)) continue;

  console.log(`\nAnimation: "${name}"`);
  for (const channel of anim.listChannels()) {
    const targetNode = channel.getTargetNode();
    const targetPath = channel.getTargetPath();
    if (targetPath !== 'rotation') continue;

    const boneName = targetNode?.getName();
    // Only show relevant bones for kick animation
    const relevant = ['Spine', 'Spine1', 'Spine2', 'Hips',
      'UpperArm.L', 'LowerArm.L', 'UpperArm.R', 'LowerArm.R',
      'Hand.L', 'Hand.R',
      'UpperLeg.R', 'LowerLeg.R', 'Foot.R',
      'UpperLeg.L', 'LowerLeg.L', 'Foot.L',
      'Head', 'Neck'];
    if (!relevant.includes(boneName)) continue;

    const sampler = channel.getSampler();
    const input = sampler.getInput();
    const output = sampler.getOutput();

    if (!input || !output) continue;

    const count = input.getCount();
    // Print first, middle, and last keyframe
    const indices = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor(3 * count / 4), count - 1];
    for (const i of indices) {
      if (i >= count) continue;
      const t = input.getElement(i, []);
      const q = [];
      for (let j = 0; j < 4; j++) {
        q.push(output.getElement(i * 4 + j, []));
      }
      // Actually output accessor stores quaternions per keyframe
    }

    // Print all keyframes for small animations
    if (count <= 30) {
      for (let i = 0; i < count; i++) {
        const t = [];
        input.getElement(i, t);
        const q = [0, 0, 0, 0];
        // output is interleaved - 4 components per keyframe
        for (let j = 0; j < 4; j++) {
          const val = [];
          output.getElement(i * 4 + j, val);
          q[j] = val[0] !== undefined ? val[0] : val;
        }
        console.log(`  ${boneName} t=${Array.isArray(t) ? t[0]?.toFixed(3) : t}: [${q.map(v => typeof v === 'number' ? v.toFixed(4) : v).join(', ')}]`);
      }
    } else {
      // Just print first and a few samples
      for (const idx of [0, Math.floor(count/4), Math.floor(count/2), Math.floor(3*count/4), count-1]) {
        const t = [];
        input.getElement(idx, t);
        console.log(`  ${boneName} t=${Array.isArray(t) ? t[0]?.toFixed(3) : t} (frame ${idx}/${count})`);
      }
    }
  }
}
