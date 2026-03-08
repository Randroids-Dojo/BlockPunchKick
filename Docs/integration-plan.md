# Integration Plan: RobotExpressive + Three.js

## Goal
Replace the 2D canvas stick-figure renderer with a 3D Three.js renderer using the free RobotExpressive GLB model, while keeping all existing gameplay logic intact.

## Phase 1: Asset & Dependency Setup

1. **Download RobotExpressive.glb** into `assets/` via curl from Three.js GitHub
2. **Add Three.js** via ES module CDN import (`unpkg` or `esm.sh`) — no npm/build step needed since the project uses vanilla `<script type="module">`
3. **Add GLTFLoader** from Three.js addons (same CDN)

## Phase 2: Renderer Architecture

4. **Create `src/renderer3d.js`** — new module that owns the Three.js scene:
   - `initScene(canvas)` — create Scene, Camera (PerspectiveCamera), WebGLRenderer (reuse existing `<canvas id="arena">`)
   - `loadFighter(url)` — load GLB, clone for 2 fighters, set up AnimationMixer per fighter
   - `updateFighter(fighter, worldState)` — map game state → animation clip
   - `render()` — call renderer.render(scene, camera)

5. **Keep `src/game.js` as the game loop & logic owner** — it continues to run physics, AI, input, combat, state machine at 120Hz tick rate. The renderer just visualizes the current state.

## Phase 3: Animation Mapping

6. **Map existing game states to RobotExpressive animation clips:**

   | Game State | Animation Clip | Notes |
   |-----------|---------------|-------|
   | `Idle` | `Idle` | Direct match |
   | `Move` | `Walking` or `Running` | Based on speed |
   | `Block` | `Standing` | Closest defensive pose |
   | `PunchStartup/Active/Recovery` | `Punch` | Play at specific time ranges |
   | `KickStartup/Active/Recovery` | `Jump` | Repurpose as kick (leg-forward motion) |
   | `HitStun` | `Death` (partial) | Play first few frames as recoil |
   | `KO` | `Death` | Full playback |
   | `BlockStun` | `No` | Recoil-like head shake |

7. **Animation crossfading** — use `AnimationAction.crossFadeTo()` with short blend times (0.05-0.1s) to keep transitions snappy for fighting game feel.

## Phase 4: Camera & Scene

8. **Camera setup** — side-view perspective camera positioned to frame both fighters, similar to current 2D view but with depth
9. **Lighting** — simple 3-light setup (ambient + 2 directional) for readable silhouettes
10. **Ground plane** — simple plane mesh to replace the current canvas line
11. **Fighter positioning** — translate game-world X/Y coordinates to 3D scene positions. The existing coordinate system (x: 100-1180, y: 430-600) maps to 3D world coords.

## Phase 5: Cleanup & Polish

12. **Remove old 2D drawing code** — `drawFighter()`, `buildSkeleton()`, `projectPoint()`, `getRigPose()`, bone definitions
13. **Color differentiation** — tint or recolor one robot (e.g., swap material color for CPU fighter)
14. **Hit effects** — flash fighter material on hit, screen shake via camera offset

## File Changes Summary

| File | Change |
|------|--------|
| `assets/RobotExpressive.glb` | New — downloaded model |
| `src/renderer3d.js` | New — Three.js scene, loading, animation mapping |
| `src/game.js` | Modified — import renderer, call render(), remove 2D draw code |
| `index.html` | Modified — add import map for Three.js CDN |
| `styles.css` | Minor tweaks if needed for canvas sizing |

## Key Constraints

- **No build tools** — project uses vanilla ES modules, so Three.js comes from CDN via import map
- **Gameplay logic untouched** — state machine, frame data, physics, AI, input all stay in game.js
- **60fps render / 120Hz tick** — render loop stays decoupled from fixed-timestep game loop
- **Model is 454KB** — lightweight, fast to load even on slower connections

## Risks & Mitigations

- **Animation doesn't have kick** — repurpose Jump animation; if unsatisfactory, can add a procedural kick later
- **Two identical robots** — differentiate via material color swap on clone
- **Canvas reuse** — WebGLRenderer can take over the existing canvas element; verify no conflicts with 2D context
