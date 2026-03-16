# Research: Fighting Game & Brawler Mechanics — Best Practices and Reference Values

This document compiles specific numerical values, ratios, and design patterns from well-regarded fighting games and platform brawlers including Street Fighter (II through 6), Guilty Gear (AC+R, Strive), Smash Bros (Melee through Ultimate), Rivals of Aether, Brawlhalla, Streets of Rage 4, BlazBlue, and others.

All frame values assume 60 FPS unless stated otherwise.

---

## 1. Hit Feedback / "Game Feel"

### Hitstop (Hitpause / Hitfreeze / Hitlag)

Hitstop is when the game freezes both characters at the point of collision for several frames. It sells impact, gives the eye time to register the hit, and stabilizes cancel timing.

**Reference values by attack strength:**

| Attack Type | Hitstop (frames) | Notes |
|---|---|---|
| Light attack | 6–9 frames | Street Fighter norm: ~9f for light normals |
| Medium attack | 9–12 frames | SF norm: ~11f for medium normals |
| Heavy attack | 12–16 frames | SF norm: ~13f for hard normals |
| Special move | 10–15 frames | Varies widely by game |
| Super / finisher | 15–25+ frames | Often combined with cinematic zoom |

**Game-specific values:**
- **Street Fighter II**: ~10 frames of hitstop on most normals; first 5 frames of every normal are cancel-window frames, extended by hitstop.
- **Street Fighter IV**: Viper's EX Seismo has a 12-frame hitstop window used for cancel timing.
- **Smash Bros**: Hitlag = `(d/3 + 3)` frames, where d = damage. Both attacker and defender freeze. During hitlag, Smash DI (stick wiggle) allows slight positional adjustment.
- **Rivals of Aether**: `Hitpause = Base_Hitpause + (Hitpause_Scaling × Percent_After_Hit × 0.05) + Extra_Hitpause`
- **BlazBlue**: Notably high hitstop, especially on Fatal Counters — makes frame-perfect combos easier.
- **Samurai Shodown**: Heavy Slashes have dramatic slow-motion hitstop to emphasize massive damage.

**Design guidelines:**
- Both attacker and defender should freeze (asymmetric freeze feels wrong).
- During hitstop, accept cancel inputs — the cancel executes when hitstop ends, keeping combo timing consistent.
- Scale hitstop with attack strength; never make it zero (even 2–3 frames helps readability).
- For a simplified game like Block Punch Kick: **Punch ~6–8f, Kick ~10–14f** would feel appropriate.

### Screen Shake

**Best practices:**
- Use a **trauma-based system**: maintain a trauma value (0.0–1.0) that decays over time; shake intensity = trauma² for a nice falloff curve.
- Use **Perlin noise** (not random) for smooth, organic shake that doesn't jitter.
- Scale shake magnitude with attack power: light hits = 2–4px displacement, heavy hits = 6–12px.
- Use **ease-out curves** for shake decay (sharp start, smooth tail).
- For side-view fighters, **horizontal-only shake** can feel more grounded.
- Always provide accessibility option to reduce/disable shake.

### Knockback Curves

- Apply knockback as an **initial velocity impulse** that decelerates via an ease-out curve (exponential decay or cubic bezier).
- Do NOT use linear deceleration — it feels robotic.
- Use animation curves to control velocity over time: sharp initial impulse, smooth deceleration to zero.
- Layer effects together: hitstop + screen shake + knockback + particles = maximum "juice."

---

## 2. Frame Data Best Practices

### The Three Phases of Every Attack

1. **Startup**: frames before the hitbox appears (fewer = faster = stronger for poking)
2. **Active**: frames the hitbox is out (more = better for anti-airs and meaties)
3. **Recovery**: frames before the character returns to neutral (fewer = safer)

### Reference Values by Attack Type

| Attack Type | Startup | Active | Recovery | On Block | On Hit |
|---|---|---|---|---|---|
| **Light / Jab** | 3–5f | 2–3f | 8–12f | -2 to +1 | +3 to +6 |
| **Medium** | 6–9f | 2–4f | 12–18f | -4 to -1 | +2 to +5 |
| **Heavy** | 10–18f | 3–6f | 16–25f | -8 to -4 | +1 to +4 |
| **Special (DP)** | 3–6f (invincible) | 3–5f | 20–40f | -15 to -25 | varies |
| **Sweep / Low** | 7–12f | 2–4f | 18–25f | -10 to -6 | knockdown |

### Key Design Rules

- **Fastest attack in the game** is typically **3 frames** startup. This sets the safety threshold: anything -2 or better on block is "safe."
- **Frame traps**: Being +2 on block means opponents must respect your pressure even if they can't be combo'd.
- **Whiff punish window**: heavy attacks should have enough recovery that missing is punishable (20+ frames recovery on whiff).
- **Startup notation caveat**: In many games, "5f startup" means 4 frames of startup animation and the hitbox appears on frame 5. Be consistent with your notation.
- **Late active frame bonus**: If a move has 3 active frames and is -7 on block on the first active frame, it's -6 on the second and -5 on the third. This rewards meaty timing.

### For Block Punch Kick

With only Punch and Kick:
- **Punch**: 4–5f startup, 2–3f active, 10–12f recovery (fast, safe, low damage)
- **Kick**: 8–12f startup, 3–5f active, 16–20f recovery (slow, committal, high damage)

---

## 3. Combo Systems

### Hitstun Duration

Hitstun is the time the defender is locked in a hit reaction and cannot act. Stronger attacks inflict more hitstun.

**Typical values:**
- Light attacks: 12–16 frames of hitstun
- Medium attacks: 16–22 frames of hitstun
- Heavy attacks: 20–28 frames of hitstun

The combo equation: if `attacker_recovery < defender_hitstun`, the attacker can land another hit = true combo.

### Rivals of Aether Hitstun Formula

```
Hitstun = HitstunMult × ((BKB × (KB_Adjust × 2.4 + 1.6)) + (KBS × Percent × KB_Adjust × 0.312))
```

Hitstun scales with the defender's damage percentage, making combos longer at higher percents but also making moves kill earlier.

### Hitstun Decay (Infinite Prevention)

Multiple games use different approaches to prevent infinite combos:

| System | Game(s) | How It Works |
|---|---|---|
| **Hitstun decay** | Guilty Gear, BlazBlue | Hitstun reduces as combo continues; tied to guard meter or internal timer |
| **Gravity scaling** | Guilty Gear (+R, Strive), Tekken | Gravity increases during juggles; opponent falls faster |
| **Juggle point limit** | Street Fighter V, 3rd Strike | Moves consume juggle points; at 0, opponent is unhittable (SFV: 6 hits max) |
| **Hit counter limit** | Streets of Rage 4 | Enemies auto-fall after 8 hits in a combo |
| **Wall bounce limit** | Streets of Rage 4 | Max 3 wall bounces per combo |
| **Damage scaling** | Nearly all fighters | Each successive hit deals reduced damage (e.g., 100% → 90% → 80% → ...) |
| **Same-move proration** | BlazBlue, Under Night, Strive | Reusing the same move in a combo applies extra damage/hitstun reduction |
| **Pushback scaling** | Guilty Gear +R | Pushback increases over combo duration, making links harder |
| **Stale moves** | Smash Bros Ultimate | Last 9 connected moves tracked in a queue; repeated moves deal less damage/knockback |

### Damage Scaling

Standard approach: each hit applies a decreasing multiplier.

**Common scaling curves:**
- Hit 1: 100%
- Hit 2: 96%
- Hit 3: 92%
- Hit 4: 88%
- Hit 5: 84%
- ...continuing at ~4% reduction per hit, with a floor of ~30–40%

A non-linear curve (e.g., `damage × max(0.35, 1.0 - 0.04 × (combo_count - 1))`) prevents combos from being completely worthless at high counts while still punishing long sequences.

### Streets of Rage 4 Combo Scoring

SoR4 uses **exponential combo scoring**: one 100-hit combo scores far more than four 25-hit combos. The combo counter tracks damage dealt, not just hit count.

---

## 4. Blocking and Defense

### Block Stun vs Hit Stun

| Property | Hit Stun | Block Stun |
|---|---|---|
| Duration | Longer (12–28f) | Shorter (8–20f) |
| Frame advantage | Attacker usually plus | Attacker usually minus or neutral |
| Purpose | Enables combos | Enables pressure but not free combos |

**Key rule**: Blockstun should always be shorter than hitstun for the same attack. The difference between them creates the gap between "true combo on hit" and "continued pressure on block."

**Typical blockstun values:**
- Light attack: 8–12f blockstun (attacker -2 to +1)
- Medium attack: 12–16f blockstun (attacker -4 to -1)
- Heavy attack: 16–22f blockstun (attacker -8 to -4)

### Chip Damage

Chip damage = damage dealt through a successful block.

| Game | Chip Damage Rule |
|---|---|
| **Street Fighter (classic)** | Only specials/supers deal chip; typically 10–25% of normal damage |
| **Street Fighter V** | Normals deal provisional (recoverable) chip; only Critical Arts can KO via chip |
| **BlazBlue** | Specials/supers deal 5% of their damage as chip |
| **2XKO** | Specials/supers deal 20% of their damage as chip |
| **Guilty Gear** | Specials deal chip; Faultless Defense (costs meter) negates chip but adds blockstun |

### Guard Break / Guard Crush

Common implementations:
- **Guard meter**: fills as the defender blocks; when full, guard breaks and defender is stunned for 30–60 frames (wide open for a full combo).
- **Drive Impact (SF6)**: A specific heavy armored attack that, if it pushes the defender into a wall with empty gauge, causes a wall-splat stun.
- **Block limit**: After blocking X hits, the guard breaks. Resets to zero over time when not blocking.

### Advanced Defense Mechanics

- **Instant Block / Just Guard**: Blocking on the exact frame of impact reduces blockstun and pushback (Guilty Gear, BlazBlue). Rewards precise timing.
- **Pushblock**: Spending meter to push the attacker away during blockstun, creating space (Marvel vs Capcom).
- **Faultless Defense (Guilty Gear)**: Costs meter, increases pushback, negates chip, but adds extra blockstun.
- **Parry (Rivals of Aether)**: A timed defensive action; successfully parrying puts the attacker into "pratfall" (helpless state). Very high reward for precise timing.

### For Block Punch Kick

With Block as a core mechanic:
- Blocking Punch: 8–10f blockstun, attacker ~0 on block (pressure continues)
- Blocking Kick: 14–18f blockstun, attacker -4 to -6 on block (defender can punish with Punch)
- Consider chip damage on Kick only (5–10% of normal damage)
- Consider a guard meter that fills when blocking; guard break after sustained pressure

---

## 5. Knockback

### Smash Bros Knockback Formula

```
Knockback = (((Percent × 0.1 + Percent × Damage × 0.05) × (200 / (Weight + 100)) × 1.4) + 18) × KBG × 0.01 + BKB
```

Where:
- **BKB** = Base Knockback (fixed minimum regardless of percent)
- **KBG** = Knockback Growth (how much knockback scales with damage)
- **Weight** = Character weight (higher = less knockback)

### Rivals of Aether Knockback Formula

```
KB = BKB + (KBS × Percent_After_Hit × KB_Adjust × 0.12)
```

Simpler than Smash but same principle: knockback scales linearly with defender's accumulated damage.

### Knockback Scaling Approaches

| Approach | Used By | How It Works |
|---|---|---|
| **Percent-based** | Smash, Rivals | KB increases with defender's damage %; used for ring-out KO systems |
| **Fixed knockback** | Street Fighter, Guilty Gear | Set knockback per move; doesn't scale with health. Used for HP-based KO systems |
| **Combo-count scaled** | Some brawlers | KB reduces within a combo to enable juggles, increases outside combos |

### Directional Influence (DI)

DI lets the defender influence their launch trajectory by holding a direction.

- **Maximum angle change**: ~18 degrees from the default launch angle.
- **Optimal DI direction**: perpendicular to the knockback angle for maximum deviation.
- **Survival DI**: Hold toward stage center to reduce effective KO distance.
- **Combo DI**: Hold away from attacker to escape follow-ups at low percent.
- **Smash DI (SDI)**: Wiggle stick during hitlag to slightly shift position; multiplied by 1.15x after 5 consecutive hits. Essential for escaping multi-hit moves.
- **Drift DI (Rivals)**: After exiting hitstun, the defender can hold a different direction from their DI to drift, separating survival trajectory from escape trajectory.

### Balloon Knockback (Smash Ultimate)

Characters fly away very quickly at first, then decelerate sharply. Implemented to increase perceived game speed and reduce wait times between stocks. Functionally: apply a high initial velocity with aggressive deceleration curve.

### For Block Punch Kick

Since this is an HP-based fighter (not ring-out), use **fixed knockback per move**:
- Punch: small pushback (20–40px), keeps attacker in range for follow-ups
- Kick: large pushback (60–120px), creates space, resets to neutral
- Knockback on block (pushback): ~50–70% of hit knockback distance

---

## 6. Input Buffering

### What It Is

The game stores button presses for a short window so actions execute on the first valid frame, rather than requiring frame-perfect timing.

### Reference Values

| Game / Context | Buffer Window | Notes |
|---|---|---|
| **Smash Bros Brawl / Smash 4** | 10 frames (~167ms) | Very generous; any action can be buffered |
| **Smash Bros Ultimate** | 9 frames (~150ms) | Slightly reduced from Smash 4 |
| **Smash Bros Melee** | 0 frames | No buffer; execution-heavy by design |
| **Brawlhalla** | 3 frames (~50ms) | Tight buffer; skill-intensive |
| **Street Fighter (typical)** | 3–5 frames | Tight; rewards precision |
| **Streets of Rage 4** | ~6 frames (~100ms) | Moderate; accessible feel |
| **Celeste (platformer)** | 5 frames (~83ms) | Jump buffer; pairs with coyote time |
| **General recommendation** | 4–8 frames (67–133ms) | Sweet spot for most action games |

### Why It Matters

Without buffering, players must press buttons on the exact frame an action becomes available (1/60th of a second window). Human reaction time + input lag makes this unreasonable for most players.

### Design Tradeoffs

- **Too short (0–2f)**: Feels unresponsive; only hardcore players can execute consistently.
- **Too long (10+f)**: Actions come out when you didn't intend them; "the game is doing things I didn't want."
- **Sweet spot (4–8f)**: Inputs feel instant without being sloppy.

### Implementation

```
// On button press:
buffer_timer = BUFFER_FRAMES  // e.g., 6

// Every frame:
if (buffer_timer > 0) {
    buffer_timer--
    if (can_perform_action) {
        perform_action()
        buffer_timer = 0
    }
}
```

### For Block Punch Kick

Recommended: **5–6 frame buffer window** (~83–100ms). Accessible but still rewards timing. Apply to attack inputs during blockstun recovery and during other attack recovery.

---

## 7. Coyote Time and Jump Buffering

### Coyote Time (Edge Grace Period)

Allows the player to jump for a few frames after walking off a ledge. Named after Wile E. Coyote running off cliffs.

**Common values:**
| Game / Source | Coyote Time |
|---|---|
| **Celeste** | 5 frames (~83ms) |
| **Common platformer default** | 4–6 frames (67–100ms) |
| **GameMaker typical** | 5 frames |
| **Unity typical** | 0.1 seconds (~6 frames) |

### Jump Buffering

Stores a jump input pressed slightly before landing so it executes on the first grounded frame.

**Common values:**
| Mechanic | Typical Range |
|---|---|
| Jump buffer | 3–6 frames (~50–100ms) |
| Coyote time | 3–6 frames (~50–100ms) |

### Implementation Order

Process coyote time BEFORE jump buffer in the update loop to ensure both systems interact correctly.

### For Block Punch Kick

If the game includes platforming elements or any vertical movement:
- Coyote time: **5 frames**
- Jump buffer: **5 frames**
- These values match Celeste's proven feel.

---

## 8. Attack Canceling

### The Standard Cancel Hierarchy

```
Normal (Light) → Normal (Medium) → Normal (Heavy) → Special → Super
```

This is called the "gatling chain" in Guilty Gear or "target combo" / "chain cancel" system.

### Cancel Types

| Cancel Type | From → To | Typical Rules |
|---|---|---|
| **Chain cancel** | Light → Medium → Heavy | Light attacks chain into themselves or heavier normals |
| **Special cancel** | Normal → Special | Most normals can cancel into specials on hit/block |
| **Super cancel** | Special → Super | Costs meter; usually any special can cancel into super |
| **Roman cancel** | Any → Neutral | Costs meter; universal animation cancel (Guilty Gear) |
| **Kara cancel** | Startup → Different move | Cancel during the first 1–3 startup frames to transfer properties like range |

### Street Fighter's Foundational Rules

1. Not every normal can be canceled — only designated ones.
2. Cancels can only be performed the moment the move connects (during hitstop).
3. Input the special move command during hitstop; it executes when hitstop ends.
4. Normal → Special only (not Special → Normal).
5. Any special can be performed from a cancellable normal.

### SF6 Super Cancel Hierarchy

- Level 1 Super: cancels from normals and unique attacks
- Level 2 Super: cancels from OD (EX) specials only
- Level 3 Super: cancels from meterless specials only

### King of Fighters Command Normal Rule

If a normal is canceled into a command normal, the command normal loses its special properties but becomes itself cancellable into specials. This creates interesting routing decisions.

### Brawlhalla: Gravity Cancel

Performing a spot dodge in the air and attacking within 18 frames executes a grounded attack in midair. Directional dodge → attack must be input within 3 frames and match the dodge direction.

### For Block Punch Kick

With only Punch, Kick, and Block:
- **Punch → Kick**: Allow canceling Punch into Kick on hit (not on block) to create a basic 2-hit combo.
- **Punch → Punch**: Allow jab chaining (2–3 hits max) with each successive jab having more recovery.
- **Kick → nothing**: Kick is the combo ender; cannot be canceled. High commitment.
- This creates: Punch → Punch → Kick as the basic max combo route.

---

## 9. Invincibility Frames (I-Frames)

### On Dodge / Roll

| Game | Dodge Type | I-Frames | Total Duration | Notes |
|---|---|---|---|---|
| **Smash Ultimate** | Spot dodge | Frames 3–17 (fresh) | ~26f total | Intangibility starts frame 3; stales with repeated use |
| **Smash Ultimate** | Roll | Frames 4–14 (varies) | ~30–35f total | Character-dependent; stales significantly |
| **Smash Ultimate** | Neutral air dodge | Frames 3–? | ~49–50f total | Only one per airtime; 10f landing lag |
| **Smash Ultimate** | Directional air dodge | Frames 3–? | ~75f+ total | Less i-frames than neutral; 11–19f landing lag |
| **Brawlhalla** | Dodge (any direction) | 22 frames of invulnerability | Cooldown: 75f (grounded) | Dexterity stat affects when you can attack after dodge |
| **Elden Ring** | Medium roll | ~13 i-frames | ~24f total | i-frame count depends on equip load |
| **Street Fighter** | Backdash | 6–10 i-frames (varies) | ~24f total | Only some games; often only upper-body invincible |

### Dodge Staling (Smash Ultimate)

Spamming dodges makes them worse:
- Each dodge use adds one staleness level (max 5).
- Staled dodges: less intangibility, slower animation, less distance (directional air dodge).
- Recovery: 1 level per ~2 seconds of not dodging.
- Dodges stay fresh if used no more than once per second.

### On Knockdown Recovery (Wake-up)

- **Street Fighter**: Characters have a few frames of invincibility on wake-up (typically 4–6 frames). Some games give invincible reversal options (DP on wake-up).
- **Streets of Rage 4**: Tech on landing grants brief invincibility and faster recovery; negates fall damage.
- **General fighters**: Knocked-down characters are invincible while on the ground and for 2–4 frames while standing up. This prevents inescapable knockdown loops.

### On-Hit Invincibility (Mercy I-Frames)

In brawlers / beat-em-ups (as opposed to 1v1 fighters), characters often get brief invincibility after being hit to prevent stun-lock from multiple enemies:
- Typical: 15–30 frames of i-frames after hitstun ends.
- The character flashes/blinks during this period.
- Does NOT apply in 1v1 fighters (where being hit in a combo is intended).

### For Block Punch Kick

If adding a dodge/evade mechanic:
- **Dodge i-frames**: 6–10 frames (out of ~20–24 total dodge animation)
- **Startup vulnerability**: 2–3 frames before i-frames begin (prevents dodge-on-reaction being too strong)
- **Recovery vulnerability**: 8–12 frames after i-frames end (punishable if read)
- **Knockdown wake-up**: 3–4 frames of invincibility while standing up

---

## Summary: Quick Reference for Block Punch Kick

| Parameter | Recommended Value | Rationale |
|---|---|---|
| **Hitstop (Punch)** | 6–8 frames | Light, snappy feel |
| **Hitstop (Kick)** | 10–14 frames | Heavy, impactful feel |
| **Screen shake (Punch)** | 2–3px, 4f duration | Subtle feedback |
| **Screen shake (Kick)** | 5–8px, 8f duration | Emphatic feedback |
| **Punch startup** | 4–5 frames | Fast poke |
| **Punch active** | 2–3 frames | Quick window |
| **Punch recovery** | 10–12 frames | Safe-ish |
| **Kick startup** | 8–12 frames | Committal, reactable |
| **Kick active** | 3–5 frames | Generous window |
| **Kick recovery** | 16–20 frames | Punishable on whiff |
| **Punch hitstun** | 14–16 frames | Enables Punch→Punch or Punch→Kick |
| **Kick hitstun** | 20–24 frames | Combo ender; no follow-up needed |
| **Punch blockstun** | 8–10 frames | Attacker ~0 (pressure continues) |
| **Kick blockstun** | 14–18 frames | Attacker -4 to -6 (punishable) |
| **Input buffer** | 5–6 frames | Accessible without feeling sloppy |
| **Punch knockback** | 20–40px | Stay in range |
| **Kick knockback** | 60–120px | Reset to neutral |
| **Block pushback** | 50–70% of hit KB | Defender pushed back but less than on hit |
| **Damage scaling** | -4% per combo hit, floor 35% | Prevents degenerate damage |
| **Dodge i-frames** | 6–10f (if implemented) | Rewarding but punishable |
| **Wake-up i-frames** | 3–4 frames | Prevents inescapable loops |
| **Guard break threshold** | After 6–8 blocked hits | Rewards sustained offense |

---

## Sources

- [Hitstop / Hitpause — CritPoints](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/)
- [Impact Freeze — Sonic Hurricane](https://sonichurricane.com/?p=1043)
- [Hitlag — SmashWiki](https://www.ssbwiki.com/Hitlag)
- [Thinking About Hitstop — Sakurai / Source Gaming](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/)
- [Hitstop — Infil's Fighting Game Glossary](https://glossary.infil.net/?t=Hitstop)
- [Frame Data — SuperCombo Wiki](https://wiki.supercombo.gg/w/Frame_Data)
- [Using Frame Data — Dustloop Wiki](https://www.dustloop.com/w/Using_Frame_Data)
- [Capcom SF Seminar: Basics of Attacking](https://game.capcom.com/cfn/sfv/column/131432?lang=en)
- [Capcom SF Seminar: Cancels](https://game.capcom.com/cfn/sfv/column/132455?lang=en)
- [Infinite Prevention and Combo Mechanics — Dustloop](https://www.dustloop.com/w/User:Slimegirl-scientist/Infinite_Prevention_and_Combo_Mechanics)
- [Designing Defensively: Guilty Gear — Sirlin.net](https://www.sirlin.net/articles/designing-defensively-guilty-gear)
- [I Wanna Make a Fighting Game, Part 7 — Andrea Jens](https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-7-56f32f706a46)
- [Stunning Detail: Hitstun in Depth — CritPoints](https://critpoints.net/2016/08/14/stunning-detail/)
- [GGST Mechanics Overview — Dustloop](https://www.dustloop.com/w/GGST/Mechanics)
- [2XKO Mechanics — 2XKO Wiki](https://wiki.play2xko.com/en-us/Mechanics)
- [Knockback — SmashWiki](https://www.ssbwiki.com/Knockback)
- [Directional Influence — SmashWiki](https://www.ssbwiki.com/DI)
- [Rivals of Aether System — Mizuumi Wiki](https://wiki.gbl.gg/w/Rivals_of_Aether/System)
- [Rivals of Aether KB Formula](https://rivalsofaether.com/get_kb_formula/)
- [SSBU Damage & Knockback — Dragdown](https://dragdown.wiki/wiki/SSBU/Damage_&_Knockback)
- [Buffer — SmashWiki](https://www.ssbwiki.com/Buffer)
- [Buffer Window — Infil's Glossary](https://glossary.infil.net/?t=Buffer+Window)
- [Input Buffering — Wayline](https://www.wayline.io/blog/art-of-input-buffering)
- [Jump Input Buffering — kpulv](https://kpulv.com/106/Jump_Input_Buffering)
- [Coyote Time — Ketra Games](https://www.ketra-games.com/2021/08/coyote-time-and-jump-buffering.html)
- [How I-Frames Augment Dodge Rolls — CritPoints](https://critpoints.net/2017/07/25/how-iframes-augment-dodge-rolls/)
- [Spot Dodge — SmashWiki](https://www.ssbwiki.com/Spot_dodge)
- [Dodge Staling — SmashWiki](https://www.ssbwiki.com/Dodge_staling)
- [Brawlhalla Combat Mechanics — Brawlhalla Wiki](https://brawlhalla-archive.fandom.com/wiki/Combat_mechanics)
- [Brawlhalla Movement — Brawlhalla Wiki](https://brawlhalla.fandom.com/wiki/Movement)
- [Streets of Rage 4 Combo System — Steam Community](https://steamcommunity.com/app/985890/discussions/0/2269195350124928866/)
- [Cancel — Street Fighter Wiki](https://streetfighter.fandom.com/wiki/Cancel)
- [Rivals of Aether Frame Data — Dragdown](https://dragdown.wiki/wiki/RoA2/Frame_Data)
- [7 Combat Systems Every Designer Should Study — Game Developer](https://www.gamedeveloper.com/design/7-combat-systems-that-every-game-designer-should-study)
- [Screen Shake Analysis — DaveTech](http://www.davetech.co.uk/gamedevscreenshake)
