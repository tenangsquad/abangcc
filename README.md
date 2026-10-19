# ABANG CC: 2007 — Alpha 0.12

A cozy 3D cartoon cyber-café management game set in Malaysia, 2007. Browser only, no install, no external assets.
You run a tiny kedai siber: seat customers on the right PC for the right time, fix crashes, deal with suspicious customers,
survive blackouts and the inspector, and hit the daily target — then pick one perk and do it again.

## Run it

| What | Command |
|---|---|
| **Play (no tools)** | Double-click `index.html` (works from `file://`), or open `dist/ABANG_CC_2007_ALPHA_12.html` — one standalone file. |
| Serve as a static site | Any static server on this folder, e.g. `npx serve .` or `python -m http.server`. Deploy the folder, or just `dist/…html`. |
| Build the single-file bundle | `node tools/build.mjs` → `dist/ABANG_CC_2007_ALPHA_12.html` (no dependencies; Node 22+). |
| Logic tests (51) | `node --test tests/state.test.mjs` |
| Browser tests (23) | `node --test tests/browser.test.mjs` — needs Chrome or Edge (set `CHROME_PATH` if unusual). Real mouse/touch events, real WebGL. Screenshots land in `tests/screenshots/`. |
| Balance simulation | `node tests/sim.mjs 10 10` — three simulated skill levels play the whole campaign; prints income vs target per day. |

There are **no npm packages** anywhere. The browser tests drive Chrome through its DevTools protocol using Node's built-in `WebSocket`.

## How to play

* **Tap a customer** (in the room or the queue) → pick **30 / 60 / 90 min** (`1` `2` `3`) → tap a PC that pulses green. The ★ is what they asked for; any other length is billed less.
* **Tap a PC** with a problem → a menu pops up right beside that PC with what you can do (✕ closes it). Abang walks over and it happens when he arrives. The side panel (Abang's Desk) only describes what you selected.
  Faults: crash, frozen screen, overheating, BSOD, lost internet, hardware failure. Restarting under a customer refunds 25 % (once per incident).
* **Suspicious PC** (❓): *Tegur baik-baik* (safe, gentle) or *Tuduh & halau* (bold, bigger payoff — and bigger penalty if they were innocent). Guilt is never shown; CCTV gives an imperfect hint.
* **Special events are things in the room** — people at the door (gang, mak, download, truancy, LAN group, the officer), a puddle, the fuse box, a suspect at the snack machine. Tap them, or tap **TENGOK** on a card in *Situasi Panas*. That panel only points; the choices pop up on the object itself.
* From **day 2** you may buy one of two random perks. Each has a downside. Daily target: RM30 on day 1, +RM3 a day through day 10 (RM57), then +RM4 a day, later +RM5 — so you will need upgrades to keep up. Sessions are short: 30 min = 10 s, 60 min = 16 s, 90 min = 22 s. Rent and bills are paid once a month (every 30 days), not daily.
* Camera: fixed isometric; optional gentle zoom (wheel / pinch / buttons), pan when zoomed. It never rotates.
* Keys: `Space` pause · `N` next customer · `1 2 3` duration · `R` restart · `+ -` zoom.

## Project layout

```
index.html            page shell (loads the scripts in order)
css/style.css         all styling
js/core/config.js     every tunable: CFG, RENTAL, DIRECTOR (difficulty), TYPES (9 customers), PERKS, FAULTS, EVENTS, ROOM
js/state/*.js         the simulation — pure data, no DOM, deterministic (seeded)
    core.js economy.js movement.js perks.js customers.js pcs.js incidents.js events.js officer.js actions.js shift.js save.js index.js
js/gfx/*.js           the 3D renderer (own WebGL2 engine, no libraries)
    engine.js (instancing, toon shader, planar sun shadows) lighting.js (time of day) anim.js (animation state machine)
    props.js (room) characters.js picking.js (ray casting) scene.js (orchestration, PCs, events)
js/ui/*.js            loader.js (splash screen) audio.js hud.js panels.js labels.js modals.js input.js main.js (+ core.js shared helpers)
tests/                state.test.mjs  browser.test.mjs  bot.mjs  sim.mjs  load-state.mjs
tools/                build.mjs  make-wallpaper.mjs (draws the loading-screen art into index.html)  cdp.mjs (Chrome driver)  stage.html (render-only dev page)
dist/                 the standalone bundle (generated)
```

Nine concerns, kept apart: simulation (`state/`), 3D renderer (`gfx/engine+scene`), character controllers (`state/movement.js` locomotion, `gfx/anim.js` + `gfx/characters.js` animation),
interaction/ray casting (`gfx/picking.js`, `ui/input.js`), UI (`ui/`), audio (`ui/audio.js`), assets (`gfx/props.js` signs/posters are generated textures), save/load (`state/save.js`), tests (`tests/`).

## Balancing

Everything lives in `js/core/config.js`. `DIRECTOR` is the single difficulty table (spawn rate, patience drain, fault chances, trouble frequency, special slots, inspection, target curve); `Santai / Biasa / Mencabar` presets scale it (Settings). `node tests/sim.mjs` shows the effect.

## Known limitations (be honest)

* **Art is procedural.** Every model — CRTs, desks, characters, props, posters — is built in code from rounded primitives. It is a stylised placeholder set, not hand-modelled art. There is **no GLB/glTF loader**: no external model files exist, and none are claimed. A real asset pipeline would be a new module.
* The renderer is a custom WebGL2 engine, not Three.js. Shadows are planar (floor only), not a full shadow map; there is no ambient-occlusion pass (contact blobs stand in).
* Characters are posed from a small rig, not skeletal animation clips. Animation states: IDLE, WALK, TURN, SIT, PLAY, TYPE, REACT, ANGRY, INSPECT, LEAVE.
* Picking uses ray tests against bounding shapes (box / spheres), not per-triangle.
* Sounds are tiny synthesised effects; there is no music.
* The simulation is fully tested headlessly and in headless Chrome (software GL). It has **not** been run on real phones or GPUs; the 60 FPS / 30 FPS targets are not measured here — quality tiers and an automatic step-down exist for slow devices.
* No static-scene caching: the whole scene is rebuilt each frame. Measured: ~1.6 ms of JavaScript for ~870 instances (an 8-PC busy shop), so caching would save under a millisecond; the cost that matters is GPU draw time, which instancing already keeps to ~100 draw calls.
* Balance is simulation-tuned with scripted players, not with human playtesters.

## Loading screen

A splash screen with an illustrated wallpaper (sunset over a shophouse street, the ABANG CC shop with glowing CRTs, Abang waving) and a progress bar covers the game for about 1.7 s while it boots, then fades out. The art is inline SVG generated by `node tools/make-wallpaper.mjs` (edit that file, not the markup in `index.html`); `js/ui/loader.js` drives the bar. Skip it with `?noloader` in the address. It respects `prefers-reduced-motion`.
