import { play } from '../tests/playthrough-helper';
for (const chapter of [1, 2, 3, 4])
  for (const p of ['warrior', 'mage', 'rogue'] as const) {
    const g = play(p, chapter, 19, false, process.argv.includes('--verbose')),
      h = g.state.meta.heroes[0];
    console.log(
      JSON.stringify({
        chapter,
        profession: p,
        outcome: h?.outcome,
        completed: h?.completed,
        power: h?.power,
        rating: h?.rating,
        rounds: g.state.run.rounds,
      }),
    );
  }
for (const p of ['warrior', 'mage', 'rogue'] as const) {
  const g = play(p, 4, 19, true),
    h = g.state.meta.heroes[0];
  console.log(
    JSON.stringify({
      chapter: 4,
      extreme: true,
      profession: p,
      outcome: h?.outcome,
      completed: h?.completed,
      power: h?.power,
      rating: h?.rating,
      rounds: g.state.run.rounds,
    }),
  );
}
