# Changelog

Versions are named `Alpha 0.N`; the standalone build is `dist/ABANG_CC_2007_ALPHA_N.html`. The save format has its own number (`CFG.VERSION`) and is not tied to the game version.

## Alpha 0.13

### New
- **Assistant (Rina).** Hireable from day 15 on the prep screen: RM50 once, RM60 a month with the rent, no way to let her go. She mops spills and replaces the fuse after a blackout on her own (Auto), or when sent ("Suruh Rina"). Tap her to switch Auto or ask "Apa boleh buat?". About one day in every 10 she is on sick leave (MC), never two days running.
- **Cooling chain.** Kipas Siling → Aircond Mudah Alih → Aircond Kedai: each step replaces the one before, with the old unit traded in for half its price. The portable unit drips, so spills happen more often.
- **Generator.** A blackout lasts 5 seconds instead of 20, for RM3 of diesel each time plus daily servicing.
- **Reputation tiers.** Kedai Biasa → Kedai Best → Kedai Popular → Port Lepak, with passive bonuses (patience, customers, duit kopi tips) and, at Port Lepak, a busier night crowd and more inspector attention. The best tier ever reached is kept in Koleksi.
- **End-of-day recap, "Sorotan hari".** Up to five highlights on every shift report.
- **Café ambience.** Room tone, PC hum, fan/aircond, street with passing motorbikes, night crickets and the generator chug. Own "Suasana kedai" switch in settings.
- **Last saved.** The menu, pause and settings screens say when the game was last saved, and warn if the browser blocks saving.
- **Menu and loading screen:** a neon "by Tenang Squad" tag beside the 2007 pill.

### Changed
- **Easier daily targets.** +RM2 a day up to day 20 (RM68), then +RM1 a day (RM78 on day 30, RM88 on day 40). Before: +3 / +4 / +5, reaching RM158 on day 40, which even a perfect simulated player could not get past around day 29.
- A reminder on the prep screen for the three days before the monthly rent and bills are due.

### Fixed / tests
- The simulated player (`tests/bot.mjs`) ranked unknown perks first, which made new perks look worse than they are; a test now keeps its shopping list complete.
- Browser tests no longer leak touch emulation between tests, wait for pop-ups and frames instead of fixed pauses, and read element sizes as plain numbers. 78 logic tests and 37 browser tests pass.

### Saves
- Existing Alpha 0.12 saves load as they are. The save format did not change; missing fields (reputation tier, assistant, recap counters) are filled in on load.

## Alpha 0.12
- Previous release (see `README_old.md` and `DEV_NOTES.md`).
