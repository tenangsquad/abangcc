# Abang CC: upgrade collection

Every upgrade idea discussed for Abang CC: 2007, with what is done and what is still open. Add new ideas at the bottom of the right section and tick them off when they ship.

Legend: ✅ Done · 🟡 Partly done · ⬜ To do

**Done so far:** ✅ Cooling chain (Kipas Siling → Aircond Mudah Alih → Aircond Kedai) · ✅ Generator · ✅ Assistant (Rina) · ✅ Reputation tiers · ✅ End-of-day recap · ✅ Ambient audio · ✅ Last-saved indicator

---

## 1. New perks and items

| Status | Idea | Notes |
|---|---|---|
| ✅ Done | **Cooling chain: Kipas Siling → Aircond Mudah Alih → Aircond Kedai** | Each step is offered only after the one before and replaces it; the old unit is traded in for half its price off the next. The portable unit drips, so spills happen more often. Has 3D models. Data: `PERKS` (`line: 'cooling'`, `rank`) in `js/core/config.js`. |
| ✅ Done | **Generator** | A blackout lasts 5 seconds instead of 20 and rentals keep running. Costs RM3 diesel per blackout plus daily servicing. Has a 3D model that shakes and smokes while running. |
| ⬜ To do | **Gaming Headset Rental** | Per-session upsell of about RM0.50 that FPS and LAN customers take more often. Downside: headsets go missing and can start `nomouse`-style incidents. |
| ⬜ To do | **Kad Prepaid / Loyalty Card** | Regulars come back more often and are more patient. Downside: the discount trims each session's income, so it only pays off over several days. |
| ✅ Done | **Assistant (Rina), unlocks day 15** | One-off RM50 hire, RM60 a month with the rent, cannot be dismissed. Auto-mops spills and replaces the fuse after a blackout; tap her to toggle Auto or ask "Apa boleh buat?", or tap a spill/fuse box and choose "Suruh Rina". Calls in sick (MC) about one day per 10 days (sometimes two, never back to back). Idol-inspired cute look. Code: `js/state/assistant.js`. Ideas for later: more jobs (reset a PC, tell loud customers to quiet down), a second skill level. |
| ⬜ To do | **Cleaner Mingguan** | Auto-clears spills and cuts overheating for a daily wage. The "buy a fix to a recurring chore" perk. |
| ⬜ To do | **Pelan Pembayaran (Touch'n Go-style card reader)** | Counter service gets faster. Downside: the payment line sometimes goes down, so you serve at the old speed. |

## 2. Customers and events

| Status | Idea | Notes |
|---|---|---|
| ⬜ To do | **Kaki Ice Kacang / delivery boy (day 2+)** | Parks outside, wants a quick phone charge or a printout. A 2007 flavour touch. |
| ⬜ To do | **Kakak Cyber Date (MIRC-adjacent)** | Social event: warn her or ignore it. Risk: a bad-reputation spike. |
| ⬜ To do | **Pak Guard / ketua kampung inspection** | A second inspection type with different rules from the officer's raid. |
| ⬜ To do | **Hujan lebat (weather event)** | The roof drips, customers come in for shelter, more spills. A daily mood swing not tied to PCs. |

## 3. Progression and the long game

| Status | Idea | Notes |
|---|---|---|
| ✅ Done | **Reputation tiers: Kedai Biasa → Best → Popular → Port Lepak** | Start at 60 / 75 / 90 reputation, 3-point cushion before a tier is lost. Best: 4% more patience. Popular: 8%, more customers, sometimes RM0.20 *duit kopi*. Port Lepak: 12%, bigger tips, but more night crowd and +2 inspection risk per night. Shown in the HUD; best tier is kept in Koleksi. Data: `TIERS` in `js/core/config.js`. |
| ✅ Done | **End-of-day recap "Sorotan hari"** | Up to 5 highlights per report: best hour, who stormed off, the PC that kept breaking, biggest sale, near miss, tips, generator, combos, tier changes. Built by `State.buildRecap`. |
| ⬜ To do | **Goals beyond day 20 / mid-game milestones** | The goal climbs RM5 a day. Milestones like "lunasi pinjaman" or "bil bulan ini" would break up the grind. |
| ⬜ To do | **More hats with moment-based unlocks** | The 4 hats unlock by clearing days. Unlocks tied to moments, like "tolak 5 budak ponteng", would feel earned. |

## 4. Polish and quality

| Status | Idea | Notes |
|---|---|---|
| ✅ Done | **Ambient audio** | Room tone, PC hum that grows with busy PCs, fan or aircond, street with passing motorbikes, crickets at night, generator chug. Own "Suasana kedai" setting. Written quietly: **tune the volumes by ear**. |
| 🟡 Partly | **More audio** | A keyboard patter already exists. Ideas still open: a counter bell, sounds that react to events. |
| ✅ Done | **"Last saved" indicator** | On the menu, pause and settings screens. Warns if the browser blocks saving. |
| ⬜ To do | **Save export / import** | A save code or `.json` download so progress can move between devices without a server. See section 5. |
| ⬜ To do | **Phone layout pass** | Re-check the menu, loading screen, recap and settings on a real phone-size screen. The sideways-phone layout is the one least checked. |
| ⬜ To do | **Customer variety** | Skin tones, hair and shirt colours so the queue doesn't look like 9 copies. |
| ⬜ To do | **Day-1 hints** | One-line hints on the first fault, first event and first perk draft. |
| ⬜ To do | **Accessibility** | Colour-blind-safe fault indicators and a bigger-text option. |

## 5. Saving the game on a server (to decide later)

The save is already one self-contained JSON envelope with a version, a timestamp and a checksum (`js/state/save.js`), so uploading it is easy. The hard parts are around it.

| Status | Option | Effort | Notes |
|---|---|---|---|
| ⬜ To do | **1. Export / import a save code or file** | About an afternoon, free | No server. Moves progress between devices manually. Good first step, and its code is reused by option 2. |
| ⬜ To do | **2. Hosted backend (Supabase or Firebase)** | About a day | Login (Google or email link, or guest with a code) and a database with almost no server code. Free tier is plenty. Needs a size limit on uploads and one save row per user. |
| ⬜ To do | **3. Own server (Node/PHP + database)** | Most work | Full control, but you write and run login, storage and security yourself. |

Questions to settle first:
- **Two devices disagree:** simplest rule is "newest save wins, but ask the player if both changed". The save's `t` timestamp makes this possible.
- **Cheating:** a browser game can't stop players editing their own save. The checksum only catches accidents. Leave leaderboards out unless the server re-checks results.
- **Privacy (Malaysian PDPA):** logins store personal data (email). Guest-only saves with a random code avoid that.
- **Offline play:** keep saving locally first and sync when online; the standalone `dist/` file must keep working.
- **Hosting:** server saves need the game served from a web address (for example GitHub Pages or Netlify), not opened as a file.

## 6. Suggested order

1. Save export / import (small, useful now).
2. Listen to the ambience and tune the volumes.
3. Day-1 hints.
4. A few more perks and events from sections 1 and 2.
5. Phone layout pass.
6. Cloud saves, once it is clear where the game will be hosted.

## 7. Housekeeping notes

- Balance numbers (prices, rates, tier perks) are all in `js/core/config.js`. The bot simulation is `node tests/sim.mjs 14 4`.
- Tests: `node --test tests/state.test.mjs` (logic) and `node --test tests/browser.test.mjs` (real Chrome). The browser tests use a slow software-rendered page, so if one fails, rerun it alone first.
- Rebuild the single-file version with `node tools/build.mjs`.
