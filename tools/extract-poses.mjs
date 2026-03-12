// Extract specific bone poses from Idle and Punch animations
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
  'Shoulder.L', 'Shoulder.R', 'Hips', 'Abdomen', 'Torso',
];

for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (!['Idle', 'Punch', 'WalkJump', 'Jump', 'Running'].includes(name)) continue;

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

    // Print first frame (idle pose), and a few key frames
    const framesToPrint = name === 'Punch'
      ? [0, Math.floor(count * 0.3), Math.floor(count * 0.5), Math.floor(count * 0.7), count - 1]
      : [0, Math.floor(count / 2), count - 1];

    for (const i of framesToPrint) {
      if (i >= count) continue;
      const t = new Float32Array(1);
      input.getElement(i, t);

      const q = new Float32Array(4);
      output.getElement(i, q);

      console.log(`  ${sanitized} t=${t[0].toFixed(3)} (f${i}/${count}): [${q[0].toFixed(4)}, ${q[1].toFixed(4)}, ${q[2].toFixed(4)}, ${q[3].toFixed(4)}]`);
    }
  }
}
