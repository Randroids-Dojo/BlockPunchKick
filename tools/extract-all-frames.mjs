// Extract ALL keyframes from WalkJump, Jump, and Punch animations for kick-relevant bones
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('assets/RobotExpressive.glb');
const root = doc.getRoot();

const targetBones = [
  'Body', 'Head', 'Neck',
  'UpperArm.L', 'LowerArm.L', 'UpperArm.R', 'LowerArm.R',
  'UpperLeg.R', 'LowerLeg.R', 'Foot.R',
  'UpperLeg.L', 'LowerLeg.L', 'Foot.L',
];

for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (!['WalkJump', 'Jump', 'Punch', 'Idle'].includes(name)) continue;

  console.log(`\n=== ${name} ===`);
  for (const channel of anim.listChannels()) {
    const targetNode = channel.getTargetNode();
    const targetPath = channel.getTargetPath();
    const boneName = targetNode?.getName();

    if (!targetBones.includes(boneName)) continue;
    if (targetPath !== 'rotation') continue;

    const sampler = channel.getSampler();
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (!input || !output) continue;

    const count = input.getCount();
    const sanitized = boneName.replace(/\./g, '');

    console.log(`\n  ${sanitized} (${count} frames):`);
    for (let i = 0; i < count; i++) {
      const t = new Float32Array(1);
      input.getElement(i, t);
      const q = new Float32Array(4);
      output.getElement(i, q);
      console.log(`    t=${t[0].toFixed(3)}: [${q[0].toFixed(4)}, ${q[1].toFixed(4)}, ${q[2].toFixed(4)}, ${q[3].toFixed(4)}]`);
    }
  }
}
