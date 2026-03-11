// tools/create-headspin-gltf-transform.mjs
// Proof-of-concept: Add a "HeadSpin" animation to RobotExpressive.glb using glTF Transform
// Usage: node tools/create-headspin-gltf-transform.mjs

import { NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const doc = await io.read('assets/RobotExpressive.glb');
const root = doc.getRoot();

// Find the Head bone node (node index 12 from our inspection — the skeleton joint "Head")
const nodes = root.listNodes();
const headNode = nodes.find((n, i) => {
    // We need the skeleton joint "Head" (index 12), not the mesh "Head" (index 13)
    // The joint Head has children [Head, Head_end] and parent "Neck"
    const parent = n.listParents().find(p => p.propertyType === 'Node');
    return n.getName() === 'Head' && parent?.getName() === 'Neck';
});

if (!headNode) {
    console.error('Could not find Head bone node');
    process.exit(1);
}
console.log(`Found Head bone: "${headNode.getName()}"`);

// Create keyframe times: 0s -> 0.25s -> 0.5s -> 0.75s -> 1.0s
const times = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);

// Get the Head bone's current rest rotation to use as base
const restRot = headNode.getRotation(); // [x, y, z, w] quaternion
console.log(`Head rest rotation: [${restRot.map(v => v.toFixed(4))}]`);

// Create quaternion keyframes for 360° Y-axis rotation
// We'll rotate relative to the rest pose by composing quaternions
// For a Y-axis spin: q = [0, sin(θ/2), 0, cos(θ/2)]
function quatMultiply(a, b) {
    return [
        a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
        a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
        a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
        a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
    ];
}

function yRotQuat(angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    return [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)];
}

// Build rotation keyframes: rest * spin(0°), rest * spin(90°), ...
const rotations = new Float32Array(5 * 4);
[0, 90, 180, 270, 360].forEach((angle, i) => {
    const spinQ = yRotQuat(angle);
    const combined = quatMultiply(restRot, spinQ);
    rotations.set(combined, i * 4);
});

// Create accessors
const inputAccessor = doc.createAccessor('HeadSpin_times')
    .setType('SCALAR')
    .setArray(times);

const outputAccessor = doc.createAccessor('HeadSpin_rotations')
    .setType('VEC4')
    .setArray(rotations);

// Create sampler and channel
const sampler = doc.createAnimationSampler()
    .setInput(inputAccessor)
    .setOutput(outputAccessor)
    .setInterpolation('LINEAR');

const channel = doc.createAnimationChannel()
    .setTargetNode(headNode)
    .setTargetPath('rotation')
    .setSampler(sampler);

// Create the animation
const anim = doc.createAnimation('HeadSpin')
    .addSampler(sampler)
    .addChannel(channel);

console.log(`Created animation "${anim.getName()}" with 5 keyframes over 1 second`);

// Write back to the original GLB (adding the new animation in-place)
const outPath = process.argv[2] || 'assets/RobotExpressive.glb';
await io.write(outPath, doc);
console.log(`Written to ${outPath}`);

// Verify by re-reading
const verifyDoc = await io.read(outPath);
const verifyAnims = verifyDoc.getRoot().listAnimations();
console.log(`\nVerification — animations in output file:`);
verifyAnims.forEach((a, i) => {
    console.log(`  [${i}] "${a.getName()}" (${a.listChannels().length} channels)`);
});
