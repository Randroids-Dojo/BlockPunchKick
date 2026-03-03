# Block Punch Kick — Game Design Document (GDD)

## 1) High Concept
**Block Punch Kick** is a highly readable, side-view 3D fighting prototype focused on **three actions only**:
- **Block** (hold)
- **Punch** (tap)
- **Kick** (tap)

It is a **1v1 single-player** game where the player fights an AI opponent. The combat goal is to feel **simple in inputs, precise in timing, and smooth in transitions**.

---

## 2) Vision & Design Pillars
1. **Minimal Input, Maximum Depth**  
   Only three combat actions, but rich outcomes from spacing, timing, and reactions.

2. **Precision First**  
   Frame-accurate windows, deterministic simulation, stable collision volumes, and strict state rules.

3. **Readable 3D Side Fighter**  
   3D skeletal stick-figure characters, constrained to a side-fighting plane like Street Fighter.

4. **Physical Feedback Matters**  
   Every successful hit visibly and mechanically reacts: recoil, stagger, block pushback, and hit-stop.

5. **Web-Native Responsiveness**  
   Consistent behavior on desktop and mobile web, with automatic Vercel deployments and update-refresh UX.

---

## 3) Target Platforms
- **Desktop web**: Chrome, Edge, Safari, Firefox (latest 2 versions)
- **Mobile web**: iOS Safari, Chrome Android
- **Performance targets**:
  - 60 FPS target on mid-range mobile
  - Deterministic gameplay step at fixed simulation tick (recommended: 120 Hz simulation, rendered at device refresh)

---

## 4) Core Gameplay Loop
1. Round starts in neutral.
2. Player and AI move, attack, and defend.
3. Health decreases on successful hits.
4. Round ends on KO or timeout.
5. Match format: **Best of 3 rounds**.
6. First to 2 rounds wins the match.

---

## 5) Characters & Visual Style
- Both fighters use the **same 3D skeleton rig**, styled like exposed animation rigs/stick figures.
- Distinction by joint color:
  - **Player:** blue joints
  - **AI:** red joints
- Camera: orthographic-like side composition (or low-FOV perspective locked to side angle).
- Movement constrained to **2D plane** (X/Y), no gameplay movement on Z.

---

## 6) Controls

### Mobile UI
- **Three arcade-style buttons**:
  - Block (hold-capable)
  - Punch (tap)
  - Kick (tap)
- **Floating D-pad**:
  - Appears where player first touches movement area.
  - Supports left/right (X axis) and up/down lane/stance adjustment on Y if enabled.
  - No Z movement.

### Desktop Input
- Movement: `A/D` or `Left/Right Arrow`
- Optional Y-axis movement: `W/S` or `Up/Down Arrow`
- Actions:
  - Block: `J` / `Shift` (hold)
  - Punch: `K`
  - Kick: `L`
- Inputs should be remappable in settings (stretch goal if prototype scope is strict).

---

## 7) Combat System Specification

## 7.1 Global Combat Parameters (Initial Tuning)
- Max health each round: **100**
- Round timer: **60 seconds**
- Facing: fighters auto-face each other
- Pushboxes always active in actionable states
- Hit-stop on impact:
  - Light punch hit: 5 frames
  - Kick hit: 7 frames
  - Blocked hit: 3 frames

## 7.2 Moveset (v1)

### Block
- Input: hold block button/key
- Startup: 1 frame
- Active: while held
- Recovery: 4 frames after release
- Effects:
  - Reduces incoming damage heavily (e.g., 80–90%)
  - Applies block-stun on defender
  - Applies pushback to both fighters

### Punch
- Input: tap punch
- Startup: 5 frames
- Active: 3 frames
- Recovery: 10 frames
- Damage: 8
- On hit: light hit-stun + short recoil
- On block: small pushback, attacker slightly minus

### Kick
- Input: tap kick
- Startup: 8 frames
- Active: 4 frames
- Recovery: 14 frames
- Damage: 12
- On hit: medium hit-stun + larger recoil
- On block: stronger pushback, attacker more minus

> Frame data above is starting-point balancing data, expected to be tuned by playtest telemetry.

## 7.3 State Machine
Primary states:
- `Idle`
- `Move`
- `Block`
- `Punch_Startup`
- `Punch_Active`
- `Punch_Recovery`
- `Kick_Startup`
- `Kick_Active`
- `Kick_Recovery`
- `Hit_Stun`
- `Block_Stun`
- `KO`

Rules:
- Punch/Kick cannot be canceled into each other in v1.
- Block can be entered from `Idle`/`Move`; optional: allow from attack recovery in future versions.
- Getting hit interrupts non-invulnerable startup/active/recovery and transitions to `Hit_Stun`.
- Input buffering window: 3–5 frames to preserve responsiveness.
- Optional “priority” when simultaneous hits occur:
  - Prefer trade resolution if hitboxes overlap same frame.

---

## 8) Precision & Smoothness Requirements (Critical)

To achieve the requested “super precise and smooth” feeling:

1. **Fixed-step gameplay simulation**  
   Run gameplay in a deterministic fixed tick (e.g., 120Hz), independent from render delta.

2. **Input timestamping + buffering**  
   Queue inputs with frame timestamps; consume them at legal transition points.

3. **Animation-driven windows + authored curves**  
   Define startup/active/recovery by timeline markers, not ad hoc timing code.

4. **Separate pushbox/hurtbox/hitbox**  
   - Pushbox: body space & collision separation
   - Hurtbox: hittable regions
   - Hitbox: attack region active only in active frames

5. **Hit-stop + hit-stun discipline**  
   Brief global pause on impact improves readability and perceived weight.

6. **Root-motion policy**  
   Use controlled root motion only where intentional; avoid drift that breaks spacing.

7. **Animation blending constraints**  
   Blend trees should preserve pose integrity during transition to/from block/hit states.

8. **Latency-aware input path on web**  
   Avoid heavy main-thread work; keep input handling and simulation budget stable.

---

## 9) Hit Reaction System (Non-Negotiable Feature)
Characters must **physically react** to contact.

On successful hit:
- Play directional hit reaction pose (front torso snap, shoulder recoil, pelvis displacement)
- Apply minor backward impulse (screen-space recoil)
- Enter defined hit-stun duration
- Trigger impact VFX/SFX and hit-stop

On block:
- Distinct block reaction pose
- Reduced recoil
- Block-stun duration and chip damage (optional)

Reaction authoring notes:
- Maintain center-of-mass plausibility
- Keep feet believable during short stagger
- Ensure no clipping through floor or opponent pushbox

---

## 10) AI Opponent Design (Basic but Competent)
Goal: beginner-friendly AI with believable tactical behavior.

### AI layers
1. **Perception**: distance band, opponent current state, threat windows
2. **Decision**: utility-based action scoring each decision interval
3. **Execution**: action commitment respecting same state machine rules as player

### Baseline AI behaviors
- Holds optimal range for punch/kick mix
- Uses block reactively when player startup is detected
- Punishes obvious recovery windows
- Includes slight reaction delay/randomization to avoid robotic perfection

### Difficulty knobs
- Reaction delay (ms)
- Block probability
- Punish confidence threshold
- Spacing discipline strength

---

## 11) Lessons Applied from Classic High-Quality Action Combat (Research Synthesis)
While this project is much smaller than titles like **Ninja Gaiden Black**, it should borrow key combat intelligence principles commonly associated with top-tier action games:

1. **Commitment and consequence**  
   Attacks have meaningful recovery; defense and spacing matter.

2. **High animation readability**  
   Clear telegraphs and consistent reaction states support fair skill expression.

3. **Fast but honest combat loop**  
   Tight response with strict frame logic prevents mushy or random outcomes.

4. **Enemy behavior that tests fundamentals**  
   Even simple AI should challenge timing discipline, not rely on unfair stats.

5. **Impact feel stack**  
   Hit-stop + sound + camera impulse + reaction pose combine for satisfying contact.

### External references to study during implementation
- GDC talks on combat readability, hit-stop, and game feel
- Fighting game postmortems discussing frame data, rollback/determinism, and input buffers
- Character action game analyses on enemy pressure pacing and punish windows

(Use these references as implementation guidance; replicate principles, not exact mechanics.)

---

## 12) HUD & Match Presentation
- Top HUD:
  - Left: Player 1 health bar (blue)
  - Right: Player 2 health bar (red)
  - Center: round timer + round win indicators (best-of-3)
- Round flow text:
  - “Round 1”, “Round 2”, “Final Round”
  - “KO”
  - “Player Wins” / “CPU Wins”

---

## 13) Web Architecture & Deployment

### Runtime architecture
- Rendering: WebGL via Three.js / Babylon.js (either acceptable)
- Animation: skeletal rig with animation state machine
- Simulation: fixed-step combat loop
- Input layer:
  - Unified pointer + keyboard adapter
  - Mobile touch abstraction for floating d-pad + action buttons

### Vercel deployment behavior
- Auto deploy from main branch
- Service worker (or update checker) to detect new release
- In-app notification: “New version available”
- **Force Refresh** button to reload assets immediately (matching requested behavior from prior project pattern)

---

## 14) Technical Acceptance Criteria
1. Combat state transitions are deterministic under fixed seed.
2. Punch/kick active frames align with authored animation markers ±1 frame max.
3. Block hold works continuously until release without dropped state.
4. Hit reactions always trigger on confirmed hit.
5. Best-of-3 round logic resolves correctly.
6. Mobile controls fully playable one-handed landscape.
7. Desktop keybind defaults operational with arrows + WASD alternatives.
8. Update notification and force-refresh flow validated after deployment.

---

## 15) Milestones

### Milestone 1 — Combat Core Prototype
- One arena, two rigs, side camera lock
- Movement, block, punch, kick
- Hit detection, health, KO

### Milestone 2 — Precision Pass
- Fixed-step simulation
- Input buffer/timestamping
- Frame data tuning tools + debug overlays

### Milestone 3 — Feel & Reactions
- Hit-stop, recoil, reaction anim polish
- SFX/VFX pass
- Camera impact tuning

### Milestone 4 — Web Productization
- Mobile control polish (floating d-pad)
- HUD + rounds (best of 3)
- Vercel deploy + update notification + force refresh

---

## 16) Out of Scope (v1)
- Multiplayer online netcode
- Character roster beyond mirrored rig colors
- Combo system beyond single-action strikes
- Advanced stance trees, grabs, or projectiles

---

## 17) Risks & Mitigations
- **Risk:** Web performance on low-end mobile  
  **Mitigation:** low-poly rig visuals, minimal post-processing, fixed perf budgets.

- **Risk:** Inputs feel delayed on touch  
  **Mitigation:** early pointer capture, buffered inputs, lightweight UI layers.

- **Risk:** Combat feels floaty  
  **Mitigation:** strict frame data, hit-stop, clearer recoil and block pushback.

---

## 18) Build Notes for Engineering Kickoff
- Start with deterministic headless combat sim tests before visual polish.
- Add debug overlays for:
  - Current state
  - Frame count in state
  - Active hitboxes/hurtboxes
  - Input queue
- Expose tunables in a single combat config file for rapid iteration.

---

## 19) One-Sentence Product Definition
A web-native, side-view 3D stick-skeleton fighter where **Block, Punch, and Kick** create a precise, smooth, high-readability duel against a smart-but-fair AI in best-of-three rounds.
