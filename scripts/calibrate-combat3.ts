import { writeFileSync } from 'node:fs';
import { play, type FightSample } from '../tests/playthrough-helper';
import { TOMES } from '../src/progression';

const rows = [];
for (const chapter of [1, 5, 10])
  for (const t of TOMES) {
    const fights: FightSample[] = [];
    const g = play(t.profession, chapter, 19, false, false, t.id, {
      guildLevel: chapter === 1 ? 1 : chapter === 5 ? 10 : 20,
      fights,
    });
    const summarize = (boss: boolean) => {
      const group = fights.filter((f) => f.boss === boss);
      return {
        count: group.length,
        rounds: group.map((f) => f.rounds),
        lossPercent: group.map((f) =>
          Math.round((100 * (f.lifeBefore - f.lifeAtEnd)) / f.heroMaxHp),
        ),
      };
    };
    rows.push({
      chapter,
      tome: t.id,
      outcome: g.state.run.summary?.outcome,
      regular: summarize(false),
      boss: summarize(true),
    });
  }
writeFileSync('qa/combat3-calibration.json', JSON.stringify(rows, null, 2));
const weaker = [];
for (const profession of ['warrior', 'mage', 'rogue'] as const) {
  const fights: FightSample[] = [];
  const g = play(profession, 10, 31, false, false, undefined, {
    guildLevel: 1,
    fights,
    packingAttempts: 1,
    merge: false,
  });
  weaker.push({ profession, outcome: g.state.run.summary?.outcome, fights });
}
writeFileSync('qa/combat3-weaker-builds.json', JSON.stringify(weaker, null, 2));
console.log(JSON.stringify(rows));
