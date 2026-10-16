import { play } from '../tests/playthrough-helper';
const cases = [
  [1, 1],
  [3, 5],
  [5, 10],
  [7, 15],
  [10, 20],
  [10, 1],
  [10, 30],
];
const seeds = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [19];
if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff))
  throw new Error('Seeds must be unsigned 32-bit integers.');
for (const seed of seeds)
  for (const [chapter, guildLevel] of cases) {
    for (const profession of ['warrior', 'mage', 'rogue'] as const) {
      const fights: { index: number; boss: boolean; rounds: number; survived: boolean }[] = [];
      const g = play(profession, chapter, seed, false, false, undefined, { guildLevel, fights });
      const h = g.state.meta.heroes[0];
      const average = (boss: boolean) => {
        const list = fights.filter((f) => f.boss === boss);
        return list.length
          ? +(list.reduce((n, f) => n + f.rounds, 0) / list.length).toFixed(1)
          : null;
      };
      console.log(
        JSON.stringify({
          seed,
          chapter,
          guildLevel,
          profession,
          outcome: h?.outcome,
          power: h?.power,
          rating: h?.rating,
          medals: g.state.run.summary?.medals,
          normalRounds: average(false),
          bossRounds: average(true),
          fights,
        }),
      );
    }
  }
