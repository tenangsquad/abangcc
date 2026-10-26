# Changelog

Versions are named `Alpha 0.N`; the standalone build is `dist/ABANG_CC_2007_ALPHA_N.html`. The save format has its own number (`CFG.VERSION`) and is not tied to the game version.

## Alpha 0.14

This release includes everything that was built for Alpha 0.13, which was never announced on its own, plus difficulty levels, several saves and save export / import.

### New
- **Assistant (Rina).** Hireable from day 15 on the prep screen: RM50 once, RM60 a month with the rent, no way to let her go. She mops spills and replaces the fuse after a blackout on her own (Auto), or when sent ("Suruh Rina"). Tap her to switch Auto or ask "Apa boleh buat?". About one day in every 10 she is on sick leave (MC), never two days running.
- **Cooling chain.** Kipas Siling → Aircond Mudah Alih → Aircond Kedai: each step replaces the one before, with the old unit traded in for half its price. The portable unit drips, so spills happen more often.
- **Generator.** A blackout lasts 5 seconds instead of 20, for RM3 of diesel each time plus daily servicing.
- **Reputation tiers.** Kedai Biasa → Kedai Best → Kedai Popular → Port Lepak, with passive bonuses (patience, customers, duit kopi tips) and, at Port Lepak, a busier night crowd and more inspector attention. The best tier ever reached is kept in Koleksi.
- **Tiers are earned over days, and settle at the end of the day.** The reputation score still moves all day, but the tier (and its perks) only changes on the shift report. To move up, the score must stay at the next tier's mark for several days in a row, each meeting the target: **2 days for Kedai Best, 5 for Kedai Popular, 10 for Port Lepak** (`days` in `TIERS`), so Port Lepak takes at least 17 days. A day under the mark restarts the count, a missed day is replayed and does not count. Going down is quicker: one step when the score is more than 3 points under the tier's mark. Each star also adds 20 % of the day's reputation gain (⭐⭐ +40 %, ⭐⭐⭐ +60 %; `CFG.REP_STAR_BOOST`). The report shows the change and the count (`3/5 hari berturut-turut`), and the HUD shows ↑ or ↓ next to the tier while the score is pushing it that way. Before this, the tier changed the moment the score crossed a line, so in the bot simulation even a merely good player was at Port Lepak within about five days; now only the best players get there (a perfect bot at about day 17 to 19, a good one in roughly half the runs on medium and almost never on hard).
- **End-of-day recap, "Sorotan hari".** Up to five highlights on every shift report.
- **Café ambience.** Room tone, PC hum, fan/aircond, street with passing motorbikes, night crickets (short random chirps with pauses, not a steady pulse) and the generator chug. Own "Suasana kedai" switch in settings.
- **Last saved.** The menu, pause and settings screens say when the game was last saved, and warn if the browser blocks saving.
- **Difficulty at New Game.** Pick **Senang Sunggoh**, **Susah Sikit Jer** or **Susah Teruk!** when you start a game; the level is locked to that save (Settings only shows it). Each level now changes five things, not three: customer numbers, patience, how often trouble strikes, how often a PC hangs, and the daily target (×0.8 / ×1 / ×1.1, whole RM). Medium is exactly as before. Checked with the bot simulation (`node tests/sim.mjs 40 4 mencabar`): a perfect simulated player clears 40 days on easy and medium and usually on hard; a good (not perfect) one reaches about day 40 on easy, 30 on medium and 20 on hard.
- **Several saves.** Every New Game is its own save (up to 5). **Sambung Main** opens the one written last, **Muat Game** lists all saves with level, day, cash and shop tier and lets you open or delete one, and **Main Baru** asks which old save to replace when the list is full. The old single save is copied in as the first save automatically (the old keys stay in the browser as a safety net). Hats and records are shared by all saves.
- **Save export / import.** **Eksport** (on every save in Muat Game) downloads that save as a `.json` file; **Import save** adds such a file back as a new save, in any browser or device. Imports are checked: not a save, edited by hand (checksum), from a newer version, already in the list, too big or no free place are all refused with a message, and an import never takes over Sambung Main.
- **Night lights: twin fluorescents.** From dusk four office-style twin fluorescent fittings (square casing, two tubes, hanging on chains) hang over the café: one by the counter and three along the aisle in front of the PCs. Each throws a wide cool-white cone and a soft pool onto the floor, one of them flickers now and then, and the café ambience adds a faint tube buzz. They go dark in a blackout. (New "light cone" decal in the engine.)
- **Menu and loading screen:** a neon "by Tenang Squad" tag beside the 2007 pill.

### Changed
- **Easier daily targets.** +RM2 a day up to day 20 (RM68), then +RM1 a day (RM78 on day 30, RM88 on day 40). Before: +3 / +4 / +5, reaching RM158 on day 40, which even a perfect simulated player could not get past around day 29.
- A reminder on the prep screen for the three days before the monthly rent and bills are due.

### Fixed / tests
- The simulated player (`tests/bot.mjs`) ranked unknown perks first, which made new perks look worse than they are; a test now keeps its shopping list complete.
- Browser tests no longer leak touch emulation between tests, wait for pop-ups and frames instead of fixed pauses, and read element sizes as plain numbers. 92 logic tests and 40 browser tests pass.

### Saves
- Existing Alpha 0.12 saves load as they are. The save format did not change; missing fields (reputation tier, assistant, recap counters) are filled in on load. They were all played on the old "Biasa", so they open as **Susah Sikit Jer**.
- Where saves live changed: one key per save (`abangcc2007_save_<id>` plus `_bak`) instead of the single `abangcc2007_alpha_v12` key. **Main Semula** is gone from the menu (Main Baru replaces it) and so is the Kesukaran switch in Settings.

## Alpha 0.12
- Previous release (see `README_old.md` and `DEV_NOTES.md`).
