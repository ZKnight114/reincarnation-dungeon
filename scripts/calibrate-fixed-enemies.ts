import { mkdirSync, writeFileSync } from 'node:fs';
import { TOMES } from '../src/progression';
import { play, type FightSample } from '../tests/playthrough-helper';

// Offline fixed-difficulty calibration. No result or player budget is read by the enemy factory.
mkdirSync('qa', { recursive: true });
const samples = [];
for (const chapter of [1, 5, 10]) {
  for (const t of TOMES) {
    const fights: FightSample[] = [];
    const guildLevel = chapter === 1 ? 1 : chapter === 5 ? 10 : 20;
    const g = play(t.profession, chapter, 19, false, false, t.id, { guildLevel, fights });
    samples.push({
      chapter,
      tome: t.id,
      guildLevel,
      outcome: g.state.run.summary?.outcome,
      fights,
    });
  }
  console.log(
    JSON.stringify({
      group: 'tomes',
      chapter,
      completed: samples.filter((r) => r.chapter === chapter && r.outcome === 'win').length,
      samples: 9,
    }),
  );
}
writeFileSync('qa/fixed-enemies-tomes.json', JSON.stringify(samples, null, 2));
const seeds = [];
for (const chapter of [1, 3, 5, 10]) {
  for (const profession of ['warrior', 'mage', 'rogue'] as const) {
    for (const seed of [1, 7, 31]) {
      const fights: FightSample[] = [];
      const guildLevel = chapter <= 3 ? chapter : chapter === 5 ? 6 : 12;
      const g = play(profession, chapter, seed, false, false, undefined, { guildLevel, fights });
      seeds.push({
        chapter,
        profession,
        seed,
        guildLevel,
        outcome: g.state.run.summary?.outcome,
        fights,
      });
    }
  }
  console.log(
    JSON.stringify({
      group: 'seeds',
      chapter,
      completed: seeds.filter((r) => r.chapter === chapter && r.outcome === 'win').length,
      samples: 9,
    }),
  );
}
writeFileSync('qa/fixed-enemies-seeds.json', JSON.stringify(seeds, null, 2));
const weaker = [];
for (const profession of ['warrior', 'mage', 'rogue'] as const) {
  const fights: FightSample[] = [];
  const g = play(profession, 10, 31, false, false, undefined, {
    guildLevel: 1,
    fights,
    merge: false,
    packingAttempts: 1,
  });
  weaker.push({ profession, outcome: g.state.run.summary?.outcome, fights });
}
writeFileSync('qa/fixed-enemies-weaker.json', JSON.stringify(weaker, null, 2));
const extremes = [];
for (const [profession, tome] of [
  ['warrior', 'warrior_sword_tome'],
  ['rogue', 'rogue_shadow_tome'],
] as const) {
  const fights: FightSample[] = [];
  const g = play(profession, 10, 7, true, false, tome, { guildLevel: 20, fights });
  extremes.push({ profession, tome, outcome: g.state.run.summary?.outcome, fights });
}
writeFileSync('qa/fixed-enemies-extreme.json', JSON.stringify(extremes, null, 2));
console.log(
  JSON.stringify({
    weaker: weaker.map((r) => ({ profession: r.profession, outcome: r.outcome })),
    extremes: extremes.map((r) => ({
      tome: r.tome,
      outcome: r.outcome,
      bossRounds: r.fights.filter((f) => f.boss).map((f) => f.rounds),
    })),
  }),
);
