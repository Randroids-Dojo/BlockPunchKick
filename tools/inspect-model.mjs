// tools/inspect-model.mjs — List all nodes, skins, and animations in the GLB
import { NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const doc = await io.read('assets/RobotExpressive.glb');
const root = doc.getRoot();

console.log('=== NODES (Skeleton Hierarchy) ===');
const nodes = root.listNodes();
nodes.forEach((n, i) => {
    const parent = n.listParents().find(p => p.propertyType === 'Node');
    const children = n.listChildren().map(c => c.getName());
    const t = n.getTranslation();
    const r = n.getRotation();
    console.log(`  [${i}] "${n.getName()}" parent="${parent?.getName() || 'ROOT'}" children=[${children}] translation=[${t.map(v=>v.toFixed(3))}] rotation=[${r.map(v=>v.toFixed(3))}]`);
});

console.log('\n=== SKINS (Skeletons) ===');
const skins = root.listSkins();
skins.forEach((skin, i) => {
    const joints = skin.listJoints().map(j => j.getName());
    console.log(`  Skin[${i}]: "${skin.getName()}" joints=[${joints.join(', ')}]`);
});

console.log('\n=== ANIMATIONS ===');
const animations = root.listAnimations();
animations.forEach((anim, i) => {
    const channels = anim.listChannels();
    console.log(`  Anim[${i}] "${anim.getName()}" (${channels.length} channels):`);
    channels.forEach(ch => {
        const targetNode = ch.getTargetNode();
        const targetPath = ch.getTargetPath();
        const sampler = ch.getSampler();
        const input = sampler?.getInput();
        const kfCount = input?.getCount() || 0;
        console.log(`    -> ${targetNode?.getName()}.${targetPath} (${kfCount} keyframes)`);
    });
});
