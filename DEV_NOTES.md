# ALPHA_12 — development notes (working file)

Goal: bring ABANG_CC_2007_ALPHA_11 into line with `../Requirements.md`. Gap list: `../Requirements_Alignment_ALPHA_11.md` (B1–B10 = bugs, then per-phase tables).
User decision: **update the game** (ALPHA_12, ALPHA_11 untouched), scope **"all of it"**.

## Ground rules
- Classic `<script>` files attached to `window.ABCC` (no modules, no bundler) so it opens from file://. `tools/build.mjs` inlines everything into `dist/ABANG_CC_2007_ALPHA_12.html`.
- State layer stays pure (no DOM, deterministic via `s.seed`), money in sen.
- Test tooling has zero deps: `tools/cdp.mjs` drives Chrome over CDP (Node 25 WebSocket). Headless Chrome has WebGL via swiftshader.
- Never claim a test passed unless it was run. Be honest about placeholders.

## Design decisions
- Rental: `RENTAL.prices {30:100,60:200,90:300}`, tier-2 ×1.25. Wrong duration bills `min(chosen, requested)` at −38%, so it can never beat the correct pick (fixes B2). Requested duration varies per customer via per-type weights.
- Patience is stored in **seconds** (`patience`/`patienceMax`), UI shows percent. Drain 1/s ×peak ×perk mods.
- Suspicious/loud/fight/restricted/nomouse → click PC → Abang's Desk shows the two options → Abang walks over, outcome on arrival. Soft vs harsh table: see `state/incidents.js`.
- Every special moment is a **world object or NPC** (door NPCs: gang, mak, download, truancy, LAN group; objects: spill puddle, fuse box, snack machine suspect; PC issue: nomouse). Situasi Panas only lists alerts + "Tengok" (select), never choice buttons. Choices live in Abang's Desk when the object/NPC is selected.
- Truancy only during school hours (12:00–14:30 in-game) → early-shift slot.
- PC fault kinds: glitch, freeze, overheat, bsod, noconn, hardware. One refund per incident (`faultId`).
- Director = one table `DIRECTOR` + `director(s)`; difficulty preset (santai/biasa/mencabar) stored in save.
- Perks: data-driven `mods`, weighted draft, ≥1 affordable offer (fallback cheap perk "Poster Promosi"), upkeep per day.
- Save: versioned envelope + checksum + backup slot + v11 migration (a version bump never wipes progress, fixes B8).

## Milestones / status
- [x] M0 scaffold: folder split of ALPHA_11, index.html, tools/cdp.mjs, baseline verified identical in headless Chrome
- [x] M1 state refactor + gameplay DONE: js/core/config.js + js/state/{core,economy,movement,perks,customers,pcs,incidents,events,officer,actions,shift,save,index}.js. 46 node tests pass (`node --test tests/state.test.mjs`), balance bot `node tests/sim.mjs 10 10`. Goal = min(day schedule, PCs×18×ratio). Day 1 has no random trouble (scripted beats only). Separation steering: only lower-priority walker yields (fixed head-on deadlock). Old js/state/state.js still on disk but is NOT loaded — delete once UI is ported.
  - NEW state API for UI: State.select(s,{kind,id}) (taps only select), State.options(s,{kind,id}) → [{act,label,sub,css,disabled,cost,choice?}], State.durationOptions, State.perform(s, act, id, choice), State.eventOptions, s.worldEvents[], s.officer, c.act ('argue','hide','cheer','stuck','startled','panic','annoyed','lepak','plead','sneak','greet','inspect'), c.lookAt, c.status adds 'arguing'|'event'|'officer', fx 'outcome' {ok,msg}, 'arrival','startup','event','eventDone','powerBack'. s.lastReport has rental/other/refunds/expense/shortfall/reasons.
  - Renderer TODO: draw worldEvents (puddle, fuse box flashing, snack suspect), c.look override ('mak','uniform'), c.female, hoodie/mirc looks, nomouse (hide mouse), PC fault visuals per kind (freeze/bsod/overheat/noconn), e.g. p.fault names, lingering sleepy.
- [x] M2 renderer DONE (lighting.js, anim.js, props.js, characters.js, picking.js, scene.js, engine upgrades). NOT done: static scene caching.
- [x] M3 UI DONE (js/ui/*.js, CSS sections 10–11). Phone dock puts Desk first; sticky modal buttons.
- [x] M4 DONE: 46 logic + 21 browser tests pass; README, TEST_RESULTS, ../Requirements_Alignment_ALPHA_12.md written; dist built. Static scene cache deliberately skipped (JS build ≈1.6 ms).
