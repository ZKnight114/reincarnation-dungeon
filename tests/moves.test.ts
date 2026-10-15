import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { planMove, resonanceScore, validateLayout, cells } from '../src/backpack';
import { parseSave } from '../src/save';
import { start, add, positionEvent, recruitToConfigure } from './helpers';
function board(templates: string[], positions: [number, number, number][]) {
  const g = start();
  g.state.run.kills = 20;
  g.state.inventory = templates.map((t) => g.makeItem(t));
  g.state.draft = positions.map(([x, y, rotation], n) => ({
    id: g.state.inventory[n].id,
    x,
    y,
    rotation,
  }));
  g.state.placements = structuredClone(g.state.draft);
  assert.equal(validateLayout(g.state.inventory, g.state.draft), null);
  return g;
}
test('swap exchanges anchors, preserves fixed orientations, and never changes HP or ownership', () => {
  const g = board(
      ['warrior_pole_3', 'warrior_blade_3'],
      [
        [0, 0, 0],
        [3, 0, 0],
      ],
    ),
    [a, b] = g.state.inventory,
    old = structuredClone(g.state.draft);
  g.state.player.hp = 28;
  const plan = g.previewMove(a.id, 3, 0);
  assert.equal(plan.kind, 'swap');
  assert.equal(g.moveItem(a.id, 3, 0), null);
  assert.deepEqual(
    g.state.draft.find((p) => p.id === b.id),
    { ...old[1], x: 0, y: 0 },
  );
  assert.equal(g.state.inventory.length, 2);
  assert.equal(g.state.player.hp, 28);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('a receiver too large for the old corner goes to upper area and survives reload/next event', () => {
  const g = board(
      ['warrior_gem', 'warrior_blade_3'],
      [
        [6, 5, 0],
        [0, 0, 0],
      ],
    ),
    [a, b] = g.state.inventory;
  assert.equal(g.previewMove(a.id, 0, 0).kind, 'eject');
  assert.equal(g.moveItem(a.id, 0, 0), null);
  assert.deepEqual(
    g.looseItems().map((i) => i.id),
    [b.id],
  );
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.looseItems()[0].id, b.id);
  restored.moveItem(b.id, 2, 0);
  assert.equal(advanceCamp(restored), null);
  assert.equal(validateLayout(restored.state.inventory, restored.state.placements), null);
});
test('swap blocked by a third party ejects receiver without moving the third party', () => {
  const g = board(
      ['warrior_gem', 'warrior_blade_3', 'warrior_gem'],
      [
        [0, 0, 0],
        [3, 0, 0],
        [0, 1, 0],
      ],
    ),
    [a, b, c] = g.state.inventory,
    third = structuredClone(g.state.draft[2]);
  assert.equal(g.previewMove(a.id, 3, 0).kind, 'eject');
  g.moveItem(a.id, 3, 0);
  assert.ok(g.looseItems().some((i) => i.id === b.id));
  assert.deepEqual(
    g.state.draft.find((p) => p.id === c.id),
    third,
  );
});
test('an upper item with multiple collisions displaces every overlapped item without loss', () => {
  const g = board(
      ['warrior_gem', 'warrior_gem', 'warrior_gem'],
      [
        [0, 0, 0],
        [0, 1, 0],
        [4, 5, 0],
      ],
    ),
    third = g.state.draft[2],
    s = add(g, 'warrior_blade_3'),
    plan = g.previewMove(s.id, 0, 0);
  assert.equal(plan.kind, 'eject');
  assert.equal(plan.ejected.length, 2);
  g.moveItem(s.id, 0, 0);
  assert.equal(g.state.inventory.length, 4);
  assert.equal(g.looseItems().length, 2);
  assert.deepEqual(
    g.state.draft.find((p) => p.id === third.id),
    third,
  );
  assert.equal(validateLayout(g.state.inventory, g.state.draft), null);
});
test('concave shape holes do not count as collisions and invalid rotations/outside moves never mutate', () => {
  const g = board(['warrior_gem'], [[0, 0, 0]]),
    i = add(g, 'warrior_pole_3');
  assert.equal(g.previewMove(i.id, 0, 0).kind, 'place');
  g.moveItem(i.id, 0, 0);
  const before = JSON.stringify(g.state);
  for (const p of [
    [6, 5, 0],
    [-1, 0, 0],
    [0, 0, 4],
    [0.5, 0, 0],
  ]) {
    assert.ok(g.moveItem(i.id, ...(p as [number, number, number])));
    assert.equal(JSON.stringify(g.state), before);
  }
});
test('drag merging conserves resonance score and exact receiver anchor, no stones and no healing', () => {
  const g = board(
      ['warrior_pole_3', 'warrior_pole_3'],
      [
        [0, 0, 0],
        [3, 0, 0],
      ],
    ),
    [target, donor] = g.state.inventory,
    score = resonanceScore(g.state.inventory, g.state.draft, 'flurry').score,
    shape = cells(target),
    old = structuredClone(g.state.draft[0]);
  g.state.player.hp = 12;
  assert.equal(g.previewMove(donor.id, 0, 0).kind, 'merge');
  assert.equal(g.moveItem(donor.id, 0, 0), null);
  assert.equal(g.findItem(donor.id), null);
  assert.equal(target.quality, 'green');
  assert.deepEqual(g.state.draft[0], old);
  assert.deepEqual(cells(target), shape);
  assert.equal(resonanceScore(g.state.inventory, g.state.draft, 'flurry').score, score);
  assert.equal(g.state.player.hp, 12);
  assert.equal(g.state.run.points, 0);
});
test('every merge grade is correct through Lv4; Lv4 duplicates relocate rather than merge', () => {
  const g = board(['warrior_pole_3'], [[0, 0, 0]]),
    target = g.state.inventory[0];
  g.state.player.hp = 20;
  for (const [level, q] of [
    [1, 'green'],
    [2, 'blue'],
    [3, 'purple'],
  ] as const) {
    const donor = add(g, target.templateId, level);
    assert.equal(g.moveItem(donor.id, 0, 0), null);
    assert.equal(target.quality, q);
    assert.equal(g.state.player.hp, 20);
  }
  const max = add(g, 'warrior_pole_3', 4);
  assert.match(g.mergeItems(max.id, target.id)!, /4 级/);
  assert.equal(g.previewMove(max.id, 0, 0).kind, 'eject');
  assert.equal(g.moveItem(max.id, 0, 0), null);
  assert.equal(g.state.inventory.length, 2);
  assert.equal(target.level, 4);
  assert.ok(g.looseItems().includes(target));
});
test('redemption requires a manual call and exactly six points; it persists and cannot create currency', () => {
  const g = start(),
    gold = g.state.meta.gold,
    count = g.state.inventory.length;
  g.state.run.points = 12;
  g.update(60);
  assert.equal(g.state.inventory.length, count);
  assert.equal(g.redeemEquipment(), null);
  assert.equal(g.state.run.points, 6);
  assert.equal(g.state.inventory.length, count + 1);
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.redeemEquipment(), null);
  assert.equal(restored.state.run.points, 0);
  assert.equal(restored.state.inventory.length, count + 2);
  assert.match(restored.redeemEquipment()!, /6 点/);
  assert.equal(restored.state.meta.gold, gold);
  assert.equal(restored.recycleItem(restored.looseItems()[0].id), true);
  assert.equal(restored.state.run.points, 1);
});
test('points/discard/movement freeze during combat; final weapon cannot be discarded', () => {
  const g = start();
  g.state.run.points = 6;
  advanceCamp(g);
  assert.match(g.redeemEquipment()!, /战斗/);
  assert.equal(g.moveToUpper(g.state.inventory[0].id), false);
  assert.equal(g.recycleItem(g.state.inventory[0].id), false);
  const h = board(['warrior_pole_3'], [[0, 0, 0]]);
  assert.equal(h.recycleItem(h.state.inventory[0].id), false);
  assert.equal(h.state.run.points, 0);
});
test('starter drag claims only its item; next batch requires all three or explicit continue', () => {
  const g = new Game();
  recruitToConfigure(g);
  if (g.state.phase === 'configure' && !g.state.run.trainee?.tomeId) g.confirmAllocation();
  g.selectTome(
    (
      {
        warrior: 'warrior_sword_tome',
        mage: 'mage_flame_tome',
        rogue: 'rogue_poison_tome',
      } as const
    )[g.state.run.profession],
  );
  g.startRun();
  const first = g.state.run.starterOffers.map((i) => i.id);
  assert.equal(g.moveItem(first[0], 1, 1), null);
  assert.equal(g.state.run.starterRound, 0);
  assert.equal(g.state.inventory.length, 1);
  assert.equal(g.state.run.starterOffers.length, 2);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  g.claimStarterRound();
  assert.equal(g.state.run.starterRound, 1);
  assert.equal(g.state.inventory.length, 3);
  g.claimStarterRound();
  assert.equal(g.state.inventory.length, 6);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('pointing at a compatible receiver merges even when the preview footprint overlaps a neighbor or crosses the edge', () => {
  const g = board(
      ['warrior_pole_3', 'warrior_gem'],
      [
        [0, 3, 0],
        [0, 2, 0],
      ],
    ),
    [target, neighbor] = g.state.inventory,
    donor = add(g, 'warrior_pole_3');
  const p = g.previewMove(donor.id, 0, 3, 0, [1, 3]);
  assert.equal(p.kind, 'merge');
  assert.equal(p.target, target.id);
  assert.equal(g.moveItem(donor.id, 0, 3, 0, [1, 3]), null);
  assert.equal(target.level, 2);
  assert.ok(g.state.draft.some((p) => p.id === neighbor.id));
  assert.equal(g.findItem(donor.id), null);
  const donor2 = add(g, 'warrior_pole_3', 2);
  assert.equal(g.moveItem(donor2.id, 0, 3, 0, [1, 3]), null);
  assert.equal(target.level, 3);
  assert.ok(g.findItem(neighbor.id));
});
