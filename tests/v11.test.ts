import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import {
  availableItems,
  bagCapacity,
  bagCells,
  cells,
  firstFree,
  openBagCells,
  PACK_COLS,
  PACK_ROWS,
  PROFESSION_KEYS,
  definition,
  planMove,
  validateLayout,
} from '../src/backpack';
import { CATALOGUE } from '../src/catalogue';
import { parseSave } from '../src/save';
import { fitStarters, start, recruitToConfigure, add, positionEvent, seed } from './helpers';

test('all 30 offered templates use exactly the reviewed silhouettes and names, with no rotation or T', () => {
  assert.equal(PACK_COLS, 7);
  assert.equal(PACK_ROWS, 6);
  assert.equal(Object.keys(CATALOGUE).length, 30);
  for (const p of PROFESSION_KEYS)
    for (const d of availableItems(p)) {
      const c = CATALOGUE[d.id as keyof typeof CATALOGUE];
      assert.equal(d.name, c.name);
      assert.deepEqual(cells({ templateId: d.id }), c.cells);
      assert.deepEqual(cells({ templateId: d.id }, 3), c.cells);
      if (
        c.cells.length === 4 &&
        Math.max(...c.cells.map((p) => p[0])) === 1 &&
        Math.max(...c.cells.map((p) => p[1])) === 1
      )
        assert.notEqual(d.slot, 'weapon');
    }
  assert.equal(definition({ templateId: 'rogue_assassin_4' }).name, '影袭双剑');
});
test('every profession receives six random gifts and may keep a usable subset in fifteen cells', () => {
  for (const p of PROFESSION_KEYS) {
    const g = new Game();
    recruitToConfigure(g, 1, p);
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
    g.claimStarterRound();
    g.claimStarterRound();
    fitStarters(g);
    assert.ok(g.packAnalysis(true).occupied <= 15);
    assert.equal(g.state.inventory.length, 6);
    assert.equal(g.packAnalysis(true).hasWeapon, true);
    assert.equal(openBagCells(0).size, 15);
    assert.equal(validateLayout(g.state.inventory, g.state.draft, openBagCells(0)), null);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
});
test('opening drags keep the other two offers until taken; final take shows second batch and reload never rerolls', () => {
  for (const p of PROFESSION_KEYS) {
    const g = new Game();
    recruitToConfigure(g, 1, p);
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
    g.state.run.starterPlan = [
      ['warrior_gem', 'warrior_blade_2', 'warrior_guard_2'],
      ['warrior_gem', 'warrior_blade_2', 'warrior_guard_2'],
    ].map((row) =>
      row.map((id) =>
        id
          .replace('warrior_gem', p + '_gem')
          .replace(
            'warrior_blade_2',
            p === 'mage' ? 'mage_flame_2' : p === 'rogue' ? 'rogue_assassin_2' : 'warrior_blade_2',
          )
          .replace(
            'warrior_guard_2',
            p === 'mage' ? 'mage_ward_2' : p === 'rogue' ? 'rogue_leather_2' : 'warrior_guard_2',
          ),
      ),
    );
    g.state.run.starterOffers = g.state.run.starterPlan[0].map((id) => g.makeItem(id));
    const ids = g.state.run.starterOffers.map((i) => i.id);
    for (let n = 0; n < 3; n++) {
      const item = g.findItem(ids[n])!,
        q = firstFree([...g.state.inventory, item], g.state.draft, item.id, openBagCells(0))!;
      assert.equal(g.moveItem(item.id, q.x, q.y), null);
      assert.equal(g.state.inventory.length, n + 1);
      if (n < 2) {
        assert.equal(g.state.run.starterRound, 0);
        assert.equal(g.state.run.starterOffers.length, 2 - n);
      }
      assert.deepEqual(
        parseSave(JSON.stringify(g.state)).run.starterOffers,
        g.state.run.starterOffers,
      );
    }
    assert.equal(g.state.run.starterRound, 1);
    assert.equal(g.state.run.starterOffers.length, 3);
  }
});
test('closed cells reject placement, swap/ejection and save tampering without claiming a starter', () => {
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
  const id = g.state.run.starterOffers[0].id,
    before = JSON.stringify(g.state);
  for (const [x, y, r] of [
    [0, 0, 0],
    [1, 1, 1],
  ]) {
    assert.ok(g.moveItem(id, x, y, r));
    assert.equal(JSON.stringify(g.state), before);
  }
  g.claimStarterRound();
  const i = g.state.inventory[0];
  g.state.draft = [{ id: i.id, x: 0, y: 0, rotation: 0 }];
  assert.throws(() => parseSave(JSON.stringify(g.state)));
  const h = start();
  const loose = add(h, 'warrior_guard_4');
  const old = JSON.stringify(h.state.draft);
  assert.equal(h.previewMove(loose.id, 0, 0).kind, 'invalid');
  assert.ok(h.moveItem(loose.id, 0, 0));
  assert.equal(JSON.stringify(h.state.draft), old);
});
test('victory unlocks cells before the loot arrangement and the masks stay nested through 42', () => {
  let previous = bagCells(15);
  for (let kills = 1; kills <= 14; kills++) {
    const open = openBagCells(kills);
    assert.equal(open.size, bagCapacity(kills));
    assert.ok([...previous].every((k) => open.has(k)));
    previous = open;
  }
  assert.equal(previous.size, 42);
  const g = start();
  advanceCamp(g);
  g.state.enemy!.hp = 0;
  g.update(0.01);
  assert.equal(g.state.run.kills, 1);
  assert.equal(openBagCells(g.state.run.kills).size, 17);
  assert.equal(g.state.run.lastLootIds.length, 3);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('next small node reclaims all loose equipment, including redeemed and ejected gear, once', () => {
  let g = start();
  advanceCamp(g);
  g.state.enemy!.hp = 0;
  g.update(0.01);
  g.state.run.points = 6;
  g.redeemEquipment();
  const held = g.state.draft.find((p) => g.findItem(p.id)!.slot !== 'weapon')!.id;
  g.moveToUpper(held);
  const stale = g.looseItems().map((i) => i.id),
    node = g.state.run.index;
  g = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(advanceCamp(g), null);
  assert.equal(g.state.run.index, node + 1);
  assert.equal(g.state.run.points, stale.length);
  assert.ok(stale.every((id) => !g.findItem(id)));
  assert.deepEqual(g.state.run.lastLootIds, []);
  const points = g.state.run.points;
  assert.ok(advanceCamp(g));
  assert.equal(g.state.run.points, points);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('placed battle drop and its merged receiver survive cleanup; source drop cannot be counted twice', () => {
  const g = start();
  advanceCamp(g);
  g.state.enemy!.hp = 0;
  g.update(0.01);
  const i = g.findItem(g.state.run.lastLootIds[0])!;
  g.state.run.kills = 14;
  const p = firstFree(g.state.inventory, g.state.draft, i.id)!;
  g.moveItem(i.id, p.x, p.y);
  advanceCamp(g);
  assert.ok(g.findItem(i.id));
  assert.equal(g.state.run.points, 2);
});
test('special-event loot expires on the immediately next small node', () => {
  const g = start();
  positionEvent(g, 'supply');
  g.chooseEvent('take');
  const drops = [...g.state.run.lastLootIds],
    node = g.state.run.index;
  advanceCamp(g);
  assert.ok(drops.every((id) => !g.findItem(id)));
  assert.equal(g.state.run.index, node + 1);
  assert.equal(g.state.run.points, 3);
});
test('same fixed shapes swap; a blocked receiver goes to the battlefield rather than being lost', () => {
  const g = start();
  g.state.run.kills = 14;
  g.state.inventory = [
    g.makeItem('warrior_blade_3'),
    g.makeItem('warrior_pole_3'),
    g.makeItem('warrior_gem'),
  ];
  const [a, b, c] = g.state.inventory;
  g.state.draft = [
    { id: a.id, x: 0, y: 0, rotation: 0 },
    { id: b.id, x: 3, y: 0, rotation: 0 },
  ];
  assert.equal(g.previewMove(a.id, 3, 0).kind, 'swap');
  g.moveItem(a.id, 3, 0);
  assert.equal(g.state.draft.find((p) => p.id === b.id)!.x, 0);
  g.placeItem(c.id, 6, 5);
  assert.equal(g.previewMove(c.id, 3, 0).kind, 'eject');
  g.moveItem(c.id, 3, 0);
  assert.ok(g.looseItems().some((i) => i.id === a.id));
  assert.equal(g.state.inventory.length, 3);
  assert.equal(validateLayout(g.state.inventory, g.state.draft), null);
});

test('resonance estimates and graduation power respond to real damage and followup benefits', () => {
  const g = start();
  g.state.inventory = [g.makeItem('warrior_blade_2', 4)];
  g.state.draft = [];
  const p = firstFree(g.state.inventory, [], g.state.inventory[0].id, openBagCells(0))!;
  g.placeItem(p.id, p.x, p.y);
  g.state.run.resonances = [];
  const plain = g.packAnalysis(true).dps,
    basePower = g.heroPreview()!.power;
  g.state.run.resonances = ['warrior_sword_base'];
  const basic = g.packAnalysis(true).dps;
  assert.ok(basic > plain);
  assert.ok(g.heroPreview()!.power > basePower);
  g.state.run.resonances.push('warrior_sword_edge');
  assert.ok(g.packAnalysis(true).dps > basic);
  assert.ok(Number.isFinite(g.packAnalysis(true).efficiency));
});
test('bound graduate pack saves the open-cell capacity and rejects closed-grid or rotated archives', () => {
  const g = start();
  g.retreat();
  const h = g.state.meta.heroes[0];
  assert.equal(h.loadout!.capacity, 15);
  assert.deepEqual(parseSave(JSON.stringify(g.state)).meta.heroes[0], h);
  const bad = structuredClone(g.state);
  bad.meta.heroes[0].loadout!.placements[0].x = 0;
  assert.throws(() => parseSave(JSON.stringify(bad)));
  const rotated = structuredClone(g.state);
  rotated.meta.heroes[0].loadout!.placements[0].rotation = 1;
  assert.throws(() => parseSave(JSON.stringify(rotated)));
});
test('fixed-shape digging always generates three reachable items and preserves the exact puzzle on reload', () => {
  for (const p of PROFESSION_KEYS)
    for (let n = 0; n < 30; n++) {
      const g = start(p, seed(n));
      positionEvent(g, 'dig');
      const d = g.state.run.dig!;
      assert.ok(d.placements.length >= 2 && d.placements.length <= 4);
      assert.ok(d.placements.every((p) => p.rotation === 0));
      assert.deepEqual(parseSave(JSON.stringify(g.state)).run.dig, d);
    }
});
