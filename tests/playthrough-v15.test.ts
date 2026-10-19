import test from 'node:test';
import assert from 'node:assert/strict';
import { play } from './playthrough-helper';

test('a warrior with a mage tome completes a real short run and saves a mixed-class graduate', () => {
  const g = play('warrior', 1, 19, false, false, 'mage_flame_tome');
  assert.equal(g.state.phase, 'summary');
  assert.equal(g.state.run.summary!.outcome, 'win');
  assert.equal(g.state.meta.heroes[0].profession, 'warrior');
  assert.equal(g.state.meta.heroes[0].tomeId, 'mage_flame_tome');
  assert.equal(g.state.run.boundTome!.id, 'mage_flame_tome');
});
import { chapterRoute } from '../src/journey';
import { parseSave } from '../src/save';

test('all three professions can finish the short tutorial with real combat, packing and merges', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const) {
    const g = play(p, 1, 19),
      h = g.state.meta.heroes[0];
    assert.equal(g.state.phase, 'summary');
    assert.equal(h.outcome, 'win');
    assert.equal(h.completed, 18);
    assert.equal(h.realm, 3);
    assert.equal(h.resonances.length, 4);
    assert.equal(h.loadout!.capacity, 42);
    assert.ok(h.loadout!.equipment.some((i) => i.level > 1));
    assert.ok(h.loadout!.equipment.every((i) => i.level <= 4));
    assert.equal(g.state.meta.pendingPages.length, 0);
    assert.equal(g.state.meta.gold, 215);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
});
test('three professions with accumulated guild investments can finish extreme Boss encounters and keep the final layout', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const) {
    const g = play(p, 4, 19, true, false, undefined, { guildLevel: 20 }),
      h = g.state.meta.heroes[0];
    assert.equal(h.outcome, 'win');
    assert.equal(h.completed, chapterRoute(4).length);
    assert.equal(h.loadout!.placements.length, h.loadout!.equipment.length);
    assert.ok(h.tomeId);
    assert.equal(h.tomeLevel, 1);
    assert.equal(g.state.meta.pendingPages.length, 0);
    assert.equal(g.state.meta.gold, 420);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
});
