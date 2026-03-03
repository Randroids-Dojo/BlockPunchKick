# BlockPunchKick

A web prototype implementation of the **Block Punch Kick** game design: fixed-step side-fighter combat with only three core actions (Block, Punch, Kick), AI opponent behavior, and best-of-3 round rules.

## Run locally
Because the project uses ES modules in-browser, run from a local web server:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Controls
### Desktop
- Move: `A/D` or `←/→`
- Vertical lane movement: `W/S` or `↑/↓`
- Block (hold): `J` or `Shift`
- Punch: `K`
- Kick: `L`

### Mobile
- Floating d-pad in left control zone (touch to place)
- Block, Punch, Kick buttons on the right

## Implemented systems
- 120 Hz fixed-step deterministic simulation loop
- Explicit combat state machine with frame data
- Input buffering for Punch/Kick
- Hit-stop, hit-stun, block-stun, chip damage, and pushback
- AI with spacing, reactive block, and attack commitment
- Match presentation: health bars, timer, round messaging, best-of-3 tracking

## Docs
- Game design spec: `Docs/GDD.md`
- Research + implementation mapping: `Docs/Research-Implementation-Plan.md`

## Auto Deploy to Vercel
This repository is configured to auto-deploy with GitHub Actions via `.github/workflows/vercel-deploy.yml`.

### Trigger behavior
- Push to `main` → deploys to **production** on Vercel.
- Pull request targeting `main` → deploys a **preview** build on Vercel.

### Required GitHub repository secrets
Add the following secrets in **Settings → Secrets and variables → Actions**:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
