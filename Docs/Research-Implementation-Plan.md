# Block Punch Kick — Systematic Research & Implementation Plan

## Research Method
This prototype applies a structured research synthesis approach:
1. Extract measurable combat requirements from the GDD (frame data, states, hit reaction, fixed-step simulation).
2. Cross-map those requirements to proven fighting/action combat principles (determinism, startup/active/recovery discipline, readability-first telegraphing).
3. Implement a minimum shippable vertical slice with instrumentation-friendly architecture (single config block, explicit state machine, fixed simulation tick).
4. Validate behavior with manual deterministic checks at 120 Hz.

## Key Research Findings Applied
- **Deterministic feel comes from fixed-step simulation**, not render framerate.
- **Input responsiveness and fairness** improve with small buffered windows.
- **Readability requires discrete state ownership** (no hidden blended logic for game rules).
- **Impact quality is multiplicative**: hit-stop + hit-stun + pushback + reaction pose.
- **AI feels fair when constrained to player rules** and softened by reaction delay/randomization.

## Implemented Decisions
- 120 Hz fixed simulation loop with render decoupling.
- Explicit state machine aligned to GDD state naming.
- Frame-data driven punch/kick/block timings.
- Simple hitbox checks with axis distance bands and lane sensitivity.
- Distinct handling for hit vs block (chip, block-stun, pushback, reduced hit-stop).
- Best-of-3 round flow with timer and KO/timeout resolution.
- Desktop keyboard + mobile touch controls (floating d-pad + action buttons).
- Utility-like AI baseline: approach range, reactive block, punish attempts.

## GDD Coverage Snapshot
- ✅ Fixed-step deterministic combat core
- ✅ Block/Punch/Kick with startup-active-recovery timing
- ✅ Hit reactions + hit-stop + pushback
- ✅ Basic competent AI
- ✅ HUD with health, timer, round wins, round flow messaging
- ✅ Best-of-3 match logic
- ✅ Mobile + desktop controls
- ⚠️ True 3D skeletal animation is approximated with readable stick rendering in this prototype iteration

## Next Iteration Recommendations
1. Replace procedural stick rendering with Three.js rig + animation events.
2. Replace range-band hit test with authored hurtbox/hitbox volumes.
3. Add deterministic replay logs for frame-accurate regression testing.
4. Add in-game debug overlay for input buffer and active frames.
5. Add service-worker update notifier and force-refresh UX for deployment parity.
