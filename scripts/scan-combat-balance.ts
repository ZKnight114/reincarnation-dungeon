import { mkdirSync, writeFileSync } from 'node:fs';
import { play, type FightSample } from '../tests/playthrough-helper';

// Reproducible samples with moderate guild investment and several recruitment/drop seeds.
// These are synthetic construction runs, not a claim about real-player win rates.
mkdirSync('qa', { recursive: true });
const rows = [];
for (const chapter of [1, 3, 5, 10]) {
  for (const profession of ['warrior', 'mage', 'rogue'] as const) {
    for (const seed of [1, 7, 31]) {
      const fights: FightSample[] = [];
      const guildLevel = chapter <= 3 ? chapter : chapter === 5 ? 6 : 12;
      const g = play(profession, chapter, seed, false, false, undefined, { guildLevel, fights });
      rows.push({
        chapter,
        profession,
        seed,
        guildLevel,
        outcome: g.state.run.summary?.outcome,
        fights,
      });
    }
  }
  const group = rows.filter((r) => r.chapter === chapter);
  console.log(
    JSON.stringify({
      chapter,
      samples: group.length,
      completed: group.filter((r) => r.outcome === 'win').length,
      died: group.filter((r) => r.outcome === 'death').length,
    }),
  );
}
writeFileSync('qa/combat-balance-multi-seed.json', JSON.stringify(rows, null, 2));
const extremes = [];
for (const [profession, tome] of [
  ['warrior', 'warrior_sword_tome'],
  ['rogue', 'rogue_shadow_tome'],
] as const) {
  const fights: FightSample[] = [];
  const g = play(profession, 10, 7, true, false, tome, { guildLevel: 20, fights });
  extremes.push({ profession, tome, outcome: g.state.run.summary?.outcome, fights });
}
writeFileSync('qa/combat-balance-extreme.json', JSON.stringify(extremes, null, 2));
console.log(
  JSON.stringify(
    extremes.map((r) => ({
      tome: r.tome,
      outcome: r.outcome,
      bossRounds: r.fights.filter((f) => f.boss).map((f) => f.rounds),
    })),
  ),
);
