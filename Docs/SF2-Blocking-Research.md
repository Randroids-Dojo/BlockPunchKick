# Street Fighter 2 Blocking Mechanics — Deep Research

## The Core Mechanic: Proximity Guard

In SF2, **holding back** and **blocking** use the exact same input. The game decides
between "walk backward" and "block" using a system called **proximity guard**.

### The Algorithm (per frame)

```
IF (player is holding back)
  AND (opponent is in STARTUP or ACTIVE frames of an attack — NOT recovery)
  AND (player is within the "proximity guard range" of that specific attack)
THEN → BLOCK (player stops moving, enters guard stance instantly)
ELSE → WALK BACKWARD (normal movement)
```

### Key Properties

| Property | Detail |
|----------|--------|
| Activation speed | Frame 1 — zero startup to enter block from proximity guard |
| Trigger window | Opponent's startup + active frames ONLY |
| Does NOT trigger | During opponent's recovery frames |
| Range | Per-attack, slightly larger than the attack's actual hit range (~15-20% margin) |
| Actions during guard | Can attack, jump, crouch, switch block height. CANNOT walk back |
| Exit condition | Opponent leaves startup/active, OR player releases back, OR player acts |
| Throws | Do NOT trigger proximity guard (range = 0) |
| Projectiles | DO trigger proximity guard at their own range |

---

## Frame Data Reference (SF2: Hyper Fighting)

### Impact Freeze
- **14 frames** on hit or block, regardless of attack strength
- Both characters frozen; timers still tick
- Special cancel window is extended by impact freeze duration
- This is what gives blocked attacks their "weight"

### Blockstun (SF2 HF)
In Hyper Fighting, blockstun = hitstun + 1 frame:
- Light attacks: **15 frames** blockstun
- Medium attacks: **20 frames** blockstun
- Heavy attacks: **24 frames** blockstun

### Attack Phases
Every attack has three phases:
1. **Startup** — frames before hitbox appears (wind-up animation)
2. **Active** — frames where the hitbox can deal damage
3. **Recovery** — frames after active ends, returning to neutral

Proximity guard triggers during phases 1 and 2 only.

---

## Hitbox Architecture (SF2 Engine)

SF2 uses a pointer-based hitbox system:
- Each animation frame references a hitbox table via pointer
- Four box parameters per hitbox: DX, DY (offset), SX, SY (size)
- Each parameter is a **signed byte** (±128 pixels max)
- Box types: Head, Body, Foot (vulnerability), Atck (offensive), Body1 (pushbox), Weak (rarely used)
- Hit detection: attack hitbox must overlap defender's vulnerability box

### Proximity Guard Box
In later SF games (SFV, SF6) this is a visible "gray/yellow box" in hitbox viewers.
In SF2 it was likely a simpler distance check per move, but the principle is identical:
- Proximity box range ≥ attack hitbox range
- Only X-axis distance matters for triggering proximity guard
- Triggers when proximity box overlaps defender hurtbox on X-axis

---

## Current Implementation Issues

### What we have (`game.js:191-196`):
```javascript
const enemyAttacking = c.state === State.PunchStartup || c.state === State.PunchActive
  || c.state === State.PunchRecovery    // ← BUG: should NOT trigger block
  || c.state === State.KickStartup || c.state === State.KickActive
  || c.state === State.KickRecovery;    // ← BUG: should NOT trigger block
```

### Problems

1. **Recovery frames trigger auto-block** — Player gets stuck in block stance for the
   full duration of the opponent's attack animation, including recovery. In SF2, blocking
   only happens during startup + active. The player should resume walking back during
   the opponent's recovery, creating the subtle "bob" between blocking and walking.

2. **No range check** — Auto-block triggers from any distance. SF2 only triggers proximity
   guard when within the attack's proximity range. A whiffed attack from full screen should
   NOT cause the defender to enter block stance.

3. **Dedicated block button conflicts** — SF2 has no block button. The hold-back system
   IS the blocking system. Having both creates ambiguity.

4. **No proximity guard range config** — Need per-attack proximity ranges slightly larger
   than hit ranges.

5. **Impact freeze too short on block** — Currently 4 frames vs SF2's 14. Blocks feel
   too light.

---

## Recommended Values for Implementation

### Proximity Guard Ranges
```javascript
punch: {
  range: 340,           // actual hit range (existing)
  proximityRange: 390,  // proximity guard trigger range (~15% larger)
}
kick: {
  range: 360,           // actual hit range (existing)
  proximityRange: 415,  // proximity guard trigger range (~15% larger)
}
```

### Threat Window (which states trigger proximity guard)
```javascript
// CORRECT — only startup + active trigger block
const isThreat = (state) => [
  State.PunchStartup, State.PunchActive,
  State.KickStartup, State.KickActive,
].includes(state);

// Recovery states should NOT trigger proximity guard
```

### Tuning Considerations
- **Impact freeze on block**: Consider increasing from 4 → 8-10 frames for more weight
- **Walk-to-block animation blend**: 1-2 frames max for the transition
- **Block-to-walk blend**: Can be slightly slower (2-3 frames) for visual smoothness
- **Attack startup animations**: Should have exaggerated wind-up poses so the player
  can visually read the incoming attack and react by holding back

### The Subtle Visual Effect
When implemented correctly, a player holding back while the opponent throws attacks
at close range will exhibit this behavior:
1. Opponent winds up → player instantly stops walking and raises guard
2. Attack connects on guard → impact freeze + block stun
3. Opponent enters recovery → player briefly resumes walking backward
4. Opponent attacks again → player snaps back to guard
5. This creates a rhythmic "guard-walk-guard-walk" pattern that feels authentic to SF2

---

## Sources

- [Capcom SF Seminar: Defense](https://game.capcom.com/cfn/sfv/column/131405?lang=en)
- [Street Fighter Wiki: Block](https://streetfighter.fandom.com/wiki/Block)
- [Street Fighter Wiki: Blockstun](https://streetfighter.fandom.com/wiki/Blockstun)
- [Street Fighter Wiki: Frame Data](https://streetfighter.fandom.com/wiki/Frame_Data)
- [SuperCombo Wiki: SF2 Hyper Fighting System](https://wiki.supercombo.gg/w/Street_Fighter_2:_Hyper_Fighting/System)
- [Dustloop Wiki: Proximity Guard](https://www.dustloop.com/w/Proximity_Guard)
- [Dustloop Wiki: Proximity Block Option Select](https://www.dustloop.com/w/Proximity_Block_Option_Select)
- [ComboVid: SF2 Hitboxes](https://combovid.com/?p=956)
- [ComboVid: Manipulating Proximity Blocking](https://combovid.com/?p=2620)
- [T. Akiba's SF2 Data](https://zachd.com/nki/ST/data.html)
- [GameFAQs: Proximity Blocking Discussion](https://gamefaqs.gamespot.com/boards/208-fighting-games/73472995)
- [EventHubs: SF2 Auto Block Cancel Glitch](https://www.eventhubs.com/news/2019/nov/22/people-would-lose-their-minds-if-street-fighter-2s-auto-block-cancel-glitch-were-around-any-todays-fighting-games/)
