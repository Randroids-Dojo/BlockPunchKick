# Block Punch Kick

A web-native 3D fighting game prototype with a 3-action combat system: **Block**, **Punch**, **Kick**.

Built with Three.js and vanilla JavaScript. No build tools required — serve statically and play.

## Run Locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Game Modes

- **Play** — 1v1 best-of-3 rounds against a CPU opponent
- **Demo** — Interactive animation showcase with pose controls and speed adjustment

## Controls

### Desktop
- Move: `A/D` or `←/→`
- Vertical lane: `W/S` or `↑/↓`
- Punch: `K`
- Kick: `L`
- Camera zoom: scroll wheel
- Camera orbit: right-click drag or `Q/E`

### Mobile
- Floating joystick (left half of screen)
- Punch / Kick buttons (right side)
- Two-finger pinch to zoom, two-finger rotate to orbit

## Architecture

```
index.html              Entry point + UI structure
styles.css              Styling (HUD, controls, demo panel, compass widget)
src/
  game.js               Simulation, state machine, input, AI, demo mode
  renderer3d.js         Three.js scene, camera, animations, pose system
assets/
  RobotExpressive.glb   3D character model with skeletal animations
```

## Key Systems

- **Combat** — 3-hit punch combo with uppercut finisher, hitstop, pushback, SF2-style proximity guard. 120 Hz fixed-step deterministic simulation with input buffering.
- **Camera** — Dynamic zoom tracking fighter distance, orbital rotation, compass widget. See [Camera System](Docs/Camera-System.md).
- **Pose System** — Absolute world-space bone targeting with per-model profiles. See [Pose System](Docs/Pose-System.md).
- **AI** — Spacing, reactive block, attack commitment, tunable difficulty.

## Documentation

| Document | Description |
|----------|-------------|
| [Game Design Document](Docs/GDD.md) | Combat spec, frame data, state machine, milestones |
| [Camera System](Docs/Camera-System.md) | Orbital camera, dynamic zoom, compass widget, controls |
| [Pose System](Docs/Pose-System.md) | Rest-pose bone targeting, model profiles, direction abstraction |
| [SF2 Blocking Research](Docs/SF2-Blocking-Research.md) | Proximity guard mechanics reference |
| [Fighting Game Mechanics](Docs/Research-Fighting-Game-Mechanics.md) | Frame data and design patterns from modern fighters |
| [3D Characters & Animation](Docs/Research-3D-Characters-and-Animations.md) | Skeletal rigging pipeline and Three.js integration |
| [Integration Plan](Docs/integration-plan.md) | 2D-to-3D migration with RobotExpressive model |
| [CLI Animation Tools](Docs/Research-CLI-Animation-Tools.md) | Headless animation authoring (Node.js, Blender) |
| [Implementation Plan](Docs/Research-Implementation-Plan.md) | Deterministic simulation and input buffering strategy |

## Deployment

Auto-deploys to Vercel via GitHub Actions (`.github/workflows/vercel-deploy.yml`).

- Push to `main` → **production** deploy
- Pull request → **preview** deploy

### Required GitHub Secrets
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
