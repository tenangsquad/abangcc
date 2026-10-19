# Test results — ALPHA_12

Run on 2026-10-18 on Windows 11, Node 25.6, Chrome (headless, software WebGL via SwiftShader). Nothing here was run on a physical phone, a real GPU, or with a human playing.

| Suite | Command | Result |
|---|---|---|
| Game logic | `node --test tests/state.test.mjs` | **53 / 53 pass** |
| In the browser | `node --test tests/browser.test.mjs` | **24 / 24 pass** (real mouse + touch events, real WebGL) — includes the PC action menu and the customer pop-up |
| Sound effects | one-off script (not committed) | 19 effects + the typing ambience play with no errors; no console errors during 6 s of live play with a blackout and a spill |
| Balance | `node tests/sim.mjs 10 10` | see below |

## Acceptance scenarios (Requirements.md, Phase 18)

| # | Scenario | Result | Where |
|---|---|---|---|
| 1 | Opens without JavaScript errors | ✅ pass | browser: A1 |
| 2 | Day 1 = RM35, exactly 3 PCs | ✅ pass | logic A2 · browser A2/A3 |
| 3 | Intro cards: Sebelum / Seterusnya / Langkau | ✅ pass | browser A2/A3 |
| 4 | Customers enter showing requested duration | ✅ pass | browser A4/A5 |
| 5 | Patience bars decrease | ✅ pass | logic + browser A4/A5 |
| 6 | Manual assignment | ✅ pass | browser A6/A7/A21 |
| 7 | Customer walks to the right chair and sits | ✅ pass | browser A7 (smooth steps, ends at the chair) |
| 8 | Correct duration = normal revenue (RM1/2/3) | ✅ pass | logic A8 |
| 9 | Wrong duration = penalty (never beats the right answer) | ✅ pass | logic A9 — all 6 wrong combinations |
| 10 | Restart refunds exactly 25% | ✅ pass | logic A10 |
| 11 | Refunds reduce cash and net sales; no double refund | ✅ pass | logic A10/A11 (incl. auto-restart race, double click) |
| 12 | Confrontation can be a false accusation | ✅ pass | logic A12 · browser |
| 13 | False accusation hits rep, professionalism, revenue — once | ✅ pass | logic A12/A13 (soft −2/−3 · harsh −7/−9) |
| 14 | Officer enters, inspects PCs, leaves | ✅ pass | logic A14 |
| 15 | Peak hours raise pressure | ✅ pass | logic A15 |
| 16 | Events activate under the right conditions | ✅ pass | logic A16 + browser (all 8 clickable in the room) |
| 17 | Failed day → retry the same day | ✅ pass | logic + browser A17 |
| 18 | Day 2 offers two randomised, purchasable perks | ✅ pass | logic A18 · browser A18/A19 |
| 19 | Perks change gameplay and visible equipment | ✅ pass | logic A19 · browser (new desk appears) |
| 20 | Save/load after refresh | ✅ pass | logic A20 · browser A20 |
| 21 | One click/tap reliably works | ✅ pass | browser — 8 trials, 0 misfires |
| 22 | Mobile UI usable | ✅ pass (emulated iPhone 16, portrait + landscape) | browser A22/A22b |
| 23 | 3D scene renders, not an image | ✅ pass | browser A1/A23 (pixel sampling) |
| 24 | Desktop fits with no scrolling | ✅ pass at 1366×768, 1440×900, 1920×1080 | browser A24 |

## Problems the tests found (and that are now fixed)

* Two walkers meeting head-on at a corner deadlocked each other (separation steering). Fixed: only the lower-priority walker yields.
* Calming a fight from the second PC left one arguer standing in the aisle. Fixed.
* Decals and shadows lightened the canvas instead of darkening it (premultiplied-alpha blending). Fixed.
* At 1366×768 the Desk's buttons overflowed into the next card when many alerts were open. Fixed (flex sidebar: Desk and Status never shrink).
* At 1366×768 the failed-day report pushed "Cuba hari ini lagi" off screen. Fixed (sticky buttons, compact report).
* On a phone the duration buttons were below the fold after selecting a customer. Fixed (Desk first in the phone dock).
* In landscape on a phone the stage used only 52% of the height. Fixed, with a regression assertion.
* After the layout update (bigger café, counter moved to the front-left corner, desks along the back wall) the first balance run showed day 2 failing far more often: customers had a much longer walk from the queue to a desk at their old walking speed (2.0). Fixed by raising the customer walking speed to 3.0 (`CFG.CUSTOMER_SPEED`); the simulation is back in line.

## Layout update (to-do list round)

Changed: net-sales label colour, faster Abang (`ABANG_SPEED` 3.5→4.8, errands 3.1→4.2, work time ×0.85), counter moved to the front-left corner with the water dispenser and magazine rack on its old spot, desks fill the back-wall row first, bigger café (depth 10→12) with smaller desks/people (0.85→0.78), 30/60/90 pop-up on the customer (the Abang's Desk side panel is removed), loading screen 3 s.
Tests changed: the sidebar-order check (3 panels now), the duration clicks (now on the pop-up menu), the net-sales colour check, the loader time (≥ 2.9 s). New: a customer pop-up test in the browser, a floor-plan/pathing test and a duration-options test in the logic suite.
Simulation after the change (10 seeds, 10 days, first-try pass): Excellent 10/10 on every day but day 4 (9/10); Good 10/10, 10/10, 9, 9, 8, 9, 8, 8, 9, 8; Sloppy 4/10 on day 1 and 1/7 on day 2. The table below is from the earlier build and is kept for reference only.

## Balance simulation (`node tests/sim.mjs 10 10`)

Scripted players using the same API as the UI, 10 seeds each. "First-try pass" = hit the target the first time that day.

| Skill (reaction · accuracy) | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 8 | Day 10 |
|---|---|---|---|---|---|---|---|---|
| Excellent (0.9 s · 100%) | 10/10 | 10/10 | 9/10 | 8/10 | 8/10 | 9/9 | 6/9 | 1/7 |
| Good (1.7 s · 85%) | 10/10 | 10/10 | 6/10 | 5/10 | 3/9 | 2/6 | 2/4 | 1/1 |
| Sloppy (3.4 s · 55%) | 9/10 | 3/10 | 0/4 | 0/1 | – | – | – | – |

Reading it: day 1 is easy for everyone, difficulty rises from day 3, and sloppy play fails and has to retry from day 2.
Caveats: the scripted player buys few extra PCs (so its late-day numbers are pessimistic), and these are simulated players, not people — treat the curve as a starting point for human playtesting.

## Not covered by any test

Real devices (60 FPS desktop / 30 FPS mobile targets are unmeasured), audible quality of the sounds, human balance, and visual polish beyond the screenshots in `tests/screenshots/`.
