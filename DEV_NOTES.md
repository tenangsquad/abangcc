# ALPHA_12 / ALPHA_13 — development notes (working file; Alpha 0.13 changes are listed in CHANGELOG.md)

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
- Perk lines: `line` + `rank` on a PERKS entry make a chain (cooling: fan → portable → aircond). `eligiblePerks` offers only the next rank, `applyPerk` removes the unit it replaces and `S.perkPrice` takes `CFG.UPGRADE_CREDIT` of its price off. Use `S.coolLevel(s)` instead of `hasPerk('aircond')`.
- Assistant: `js/state/assistant.js`, state in `s.assistant` (null until hired). Hire on prep from `CFG.ASSISTANT.unlockDay`; one-off fee + monthly wage in `S.monthlyBills`; sick days planned once per `mcBlock` days (`rollSickLeave`, called from `State.proceed`). Jobs: spill (`mop`) and blackout (`fuse`) through `resolveEvent(..., { by: 'assistant' })`. Drawn as `kind: 'player'` with `e.assistant` (look `idol`, gear `assistant`) in characters.js; picked/labelled as kind `'assistant'`.
- Reputation tiers: `TIERS` + `tierIndexFor` in config.js (3-point hold), `s.repTier` moved by `S.updateTier` every tick; effects are read through `S.tierOf(s)` (patience drain, spawn, tips, lepak weight, risk drift).
- End-of-day recap: counters in `s.shiftStats` (hourly, pcFaults, walkByType, servedByType, bestSale, closeCall, tips, generatorRuns, tierMoves) → `State.buildRecap` → `report.recap`.
- Audio ambience: `UI.Sound.ambience(state)` (js/ui/audio.js) is steered from `UI.refresh`; own switch `settings.ambience`.
- Last saved: `State.saveInfo()` → `UI.savedLabel()`; any element with `data-saved` is kept fresh by `UI.refreshSaved`.
- Save: versioned envelope + checksum + backup slot + v11 migration (a version bump never wipes progress, fixes B8).

## Milestones / status
- [x] M0 scaffold: folder split of ALPHA_11, index.html, tools/cdp.mjs, baseline verified identical in headless Chrome
- [x] M1 state refactor + gameplay DONE: js/core/config.js + js/state/{core,economy,movement,perks,customers,pcs,incidents,events,officer,actions,shift,save,index}.js. 46 node tests pass (`node --test tests/state.test.mjs`), balance bot `node tests/sim.mjs 10 10`. Goal = min(day schedule, PCs×18×ratio). Day 1 has no random trouble (scripted beats only). Separation steering: only lower-priority walker yields (fixed head-on deadlock). Old js/state/state.js still on disk but is NOT loaded — delete once UI is ported.
  - NEW state API for UI: State.select(s,{kind,id}) (taps only select), State.options(s,{kind,id}) → [{act,label,sub,css,disabled,cost,choice?}], State.durationOptions, State.perform(s, act, id, choice), State.eventOptions, s.worldEvents[], s.officer, c.act ('argue','hide','cheer','stuck','startled','panic','annoyed','lepak','plead','sneak','greet','inspect'), c.lookAt, c.status adds 'arguing'|'event'|'officer', fx 'outcome' {ok,msg}, 'arrival','startup','event','eventDone','powerBack'. s.lastReport has rental/other/refunds/expense/shortfall/reasons.
  - Renderer TODO: draw worldEvents (puddle, fuse box flashing, snack suspect), c.look override ('mak','uniform'), c.female, hoodie/mirc looks, nomouse (hide mouse), PC fault visuals per kind (freeze/bsod/overheat/noconn), e.g. p.fault names, lingering sleepy.
- [x] M2 renderer DONE (lighting.js, anim.js, props.js, characters.js, picking.js, scene.js, engine upgrades). NOT done: static scene caching.
- [x] M3 UI DONE (js/ui/*.js, CSS sections 10–11). Phone dock puts Desk first; sticky modal buttons.
- [x] M4 DONE: 46 logic + 21 browser tests pass; README, TEST_RESULTS, ../Requirements_Alignment_ALPHA_12.md written; dist built. Static scene cache deliberately skipped (JS build ≈1.6 ms).

## Phone layout (one game, two layouts)
- `js/ui/layout.js` sets `<html data-layout="phone|desktop">` once at start (touch screen with short side ≤ 600 px → phone; `?layout=phone|desktop` overrides). On "phone" it moves the existing panel nodes into four corner docks inside `#viewport` (`.dock-tl/tr/bl/br`) and puts them back on "desktop" (`ABCC.Layout.apply(name)`), so ids and listeners never change.
- All phone styling lives in `css/phone.css`, every rule under `html[data-layout="phone"]`; `style.css` (desktop) is untouched. The scene is full-bleed behind the docks, so the room is height-limited (≈ 40 % bigger than the old sidebar layout on an iPhone 16 Pro).
- Designed for 874×402 (iPhone 16 Pro sideways, safe-area insets via `env()`); also checked at 874×335 (Safari with toolbar) and 667×375.
- Upright: `.rotate-hint` card (pure CSS) + `layout.js` pauses the shift on the orientation change. Android Chrome gets fullscreen + landscape lock on the first tap; iOS can't lock, so it only has the card.
- Screenshots for this were taken with a headless Chrome driven over CDP from PowerShell (no Node on that machine); `tests/browser.test.mjs` A22 / A22b / Layouts were rewritten but not run there.

## Main menu page
- The menu is no longer a pop-up: phase `menu` shows `#home` (`js/ui/home.js`, `css/home.css`) over the live 3D scene (`<html data-screen="home">` hides the HUD/sidebar/docks and shifts the canvas right). Every other phase sets `data-screen="game"`.
- The game always **boots into `menu`**. A stored session is kept in `s.resumeTo` (the phase it was in; `active` becomes `paused`): "Sambung Main" calls `resumeSession()` in `modals.js`. "Menu utama" from the pause dialog sets `resumeTo` the same way, so Continue now resumes the paused shift instead of restarting the day. `UI.hasSession(s)` decides whether Continue / Main Semula show.
- Tiles are plain `<button data-modal="…">`, handled by `UI.handleModal`. Restart and "Padam save" use an in-page confirm dialog (`renderConfirm`) instead of the browser's `confirm()`.
- Icons are inline SVG from `js/ui/icons.js` (`UI.icon(name, px, tint?)`): play, resume, restart, guide, collection, settings, home. They replace the ▶ / ? / emoji glyphs, which look different on every system.

## Float layout, living home, tip, credits
- **Float** = the phone corner-dock layout on a PC. `layout.js` now knows three layouts (`desktop` | `float` | `phone`); `phone.css` shares its dock rules between phone and float via `html:is([data-layout="phone"], [data-layout="float"])`, float adds `--z: 1.3` (docks are drawn with `zoom`) and keeps the desktop-size hint / toast / world menu. Settings → Susun atur (`UI.settings.layout` = `classic` | `float`, read by `layout.js` straight from localStorage at boot; `Layout.set(pref)` applies it live; phones ignore it). `?layout=float` forces it.
- **Living home**: while `phase === 'menu'`, `main.js` draws `UI.homeScene.step(real, dt)` (js/ui/homescene.js) instead of the real state. It is a throw-away shop built with `State.create()` + `startShift()` (same PC count and perks as the real one), seated by `State.quickSeat`, with trouble/events/fx stripped. Nothing of it is saved or heard; the real session is never touched.
- **Music** plays on the menu page (`UI.Sound.music({night:false})` in `refresh`) once the browser has had a tap. **Tip**: `TIPS` in home.js, one a day by date, tap for the next. **Kredit**: `CREDITS` block in modals.js (edit it to change the makers / lines).
