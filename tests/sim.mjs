// Balance simulation: node tests/sim.mjs [days] [seeds]
// Plays the whole campaign with three simulated skill levels and prints income vs target per day.
import { playCampaign, SKILLS } from './bot.mjs';

const days = Number(process.argv[2]) || 10;
const seeds = Number(process.argv[3]) || 5;

for (const skill of Object.keys(SKILLS)) {
  console.log(`\n=== ${skill.toUpperCase()} (${seeds} seeds, ${days} days) ===`);
  const byDay = new Map();
  for (let seed = 1; seed <= seeds; seed++) {
    for (const r of playCampaign({ skill, days, seed: seed * 7919 })) {
      if (!byDay.has(r.day)) byDay.set(r.day, []);
      byDay.get(r.day).push(r);
    }
  }
  console.log('day  goal  avgIncome  firstTryPass  avgAttempts  avgPCs  avgCash');
  for (const [day, rows] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const first = rows.filter((r) => r.attempt === 1);
    const pass = first.filter((r) => r.met).length;
    const avg = (k, set = rows) => (set.reduce((a, r) => a + r[k], 0) / set.length).toFixed(1);
    console.log(`${String(day).padStart(3)}  ${String(rows[0].goal).padStart(4)}  ${avg('income', first).padStart(9)}  ${`${pass}/${first.length}`.padStart(12)}  ${(rows.length / first.length).toFixed(2).padStart(11)}  ${avg('pcs', first).padStart(6)}  ${avg('cash', first).padStart(7)}`);
  }
}
