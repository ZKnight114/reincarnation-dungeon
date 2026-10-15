import { setEnemy, setPlayer } from './helpers';
import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import {
  availableItems,
  cells,
  contributionPoints,
  firstFree,
  PROFESSION_KEYS,
  RESONANCES,
  resonanceScore,
} from '../src/backpack';
import { resonanceAvailable, validResonanceOrder } from '../src/resonances';
import { parseSave } from '../src/save';
import { UI } from '../src/ui';
import { start, seed, positionEvent, add, placeFree } from './helpers';

test('all active footprints omit T, include square and preserve five-cell reservations', () => {
  for (const p of PROFESSION_KEYS) {
    assert.ok(availableItems(p).some((i) => i.shape === 'O4'));
    assert.ok(availableItems(p).every((i) => !['T4', 'Z5'].includes(i.shape)));
  }
});
test('initial candidates are three distinct basic resonances; only chosen lineages unlock advanced and highest choices', () => {
  for (const p of PROFESSION_KEYS)
    for (let n = 0; n < 30; n++) {
      const g = start(p, seed(n));
      const base = g.state.run.resonances[0];
      assert.equal(RESONANCES[base].rank, 1);
      for (const k of g.resonanceChoices()) {
        assert.ok(RESONANCES[k].rank === 1 || RESONANCES[k].requires.includes(base));
      }
      const highest = g.resonanceChoices().find((k) => RESONANCES[k].rank === 3)!;
      assert.ok(highest);
      assert.ok(validResonanceOrder([base, highest], p));
      assert.equal(validResonanceOrder([highest], p), false);
      assert.equal(resonanceAvailable(highest, p, [], false), false);
    }
});
test('profession and item thresholds differ, include all equipped profession gear and exclude loose items', () => {
  const g = start(),
    s = g.state;
  s.run.kills = 14;
  assert.equal(resonanceScore(s.inventory, s.draft, 'cleave').score, 13);
  assert.deepEqual(resonanceScore(s.inventory, s.draft, 'cleave').thresholds, [12, 48, 96]);
  assert.deepEqual(
    resonanceScore(s.inventory, s.draft, 'warrior_sword_base').thresholds,
    [4, 12, 24],
  );
  const sword = add(g, 'warrior_blade_2', 3);
  assert.equal(contributionPoints(sword), 8);
  const before = resonanceScore(s.inventory, s.draft, 'warrior_sword_base').score;
  assert.equal(placeFree(g, sword.id), null);
  assert.equal(resonanceScore(s.inventory, s.draft, 'warrior_sword_base').score, before + 8);
});
test('merge conserves occupied-item contribution at every grade while freeing cells', () => {
  for (let level = 1; level < 4; level++) {
    const g = start();
    g.state.inventory = [];
    g.state.draft = [];
    g.state.placements = [];
    const a = add(g, 'warrior_blade_2', level),
      b = add(g, 'warrior_blade_2', level);
    placeFree(g, a.id);
    placeFree(g, b.id);
    const before = resonanceScore(g.state.inventory, g.state.draft, 'warrior_sword_base').score;
    assert.equal(g.mergeItems(a.id, b.id), null);
    assert.equal(
      resonanceScore(g.state.inventory, g.state.draft, 'warrior_sword_base').score,
      before,
    );
    assert.equal(g.packAnalysis(true).occupied, 2);
  }
});
test('highest resonance remains a separate effect and starts at the current contribution tier', () => {
  const g = start();
  g.state.run.resonances = ['cleave'];
  positionEvent(g, 'elite', 8);
  g.state.enemy!.hp = 0;
  g.update(0.01);
  g.finishAwakening();
  g.state.run.rewards[0].resonances = ['execution', 'flurry', 'iron_guard'];
  assert.equal(g.chooseResonance('execution'), null);
  assert.deepEqual(g.state.run.resonances, ['cleave', 'execution']);
  assert.equal(g.packAnalysis(true).tiers.execution, 1);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('save rejects an advanced card without its prerequisite or with an initial advanced candidate', () => {
  const g = start();
  const s = structuredClone(g.state);
  s.run.resonances = ['execution'];
  assert.throws(() => parseSave(JSON.stringify(s)));
  const other = start();
  positionEvent(other, 'elite', 8);
  other.state.enemy!.hp = 0;
  other.update(0.01);
  const bad = structuredClone(other.state);
  bad.run.rewards[0].resonances = ['inferno', 'flurry', 'iron_guard'];
  assert.throws(() => parseSave(JSON.stringify(bad)));
});
test('digging reveals whole silhouettes over multiple hits and adds only completely uncovered items, with reload mid-dig', () => {
  for (const p of PROFESSION_KEYS)
    for (let n = 0; n < 10; n++) {
      let g = start(p, seed(n));
      positionEvent(g, 'dig');
      const d = g.state.run.dig!;
      assert.equal(d.placements.length, 3);
      assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
      const ids = d.equipment.map((i) => i.id),
        before = g.state.inventory.length;
      const targets = d.placements.flatMap((p) =>
        cells(
          d.equipment.find((i) => i.id === p.id)!,
          p.rotation,
        ).map(([x, y]) => (p.y + y) * 4 + p.x + x),
      );
      for (const cell of targets) {
        assert.equal(g.digCell(cell), null);
        g = new Game(parseSave(JSON.stringify(g.state)));
      }
      assert.equal(g.state.run.dig!.claimed.length, 3);
      assert.equal(g.state.inventory.length, before + 3);
      assert.ok(ids.every((id) => g.state.inventory.some((i) => i.id === id)));
      const snapshots = g.state.inventory.length;
      assert.ok(g.digCell(targets[0]));
      assert.equal(g.state.inventory.length, snapshots);
      assert.equal(g.chooseEvent('dig-finish'), null);
      assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
    }
});
test('dig budget cannot be rerolled on reload, exhausted clicks do not create items and finish can be chosen', () => {
  let g = start();
  positionEvent(g, 'dig');
  for (let n = 0; n < 12; n++) g.digCell(n);
  g = new Game(parseSave(JSON.stringify(g.state)));
  const before = g.state.inventory.length;
  assert.ok(g.digCell(12));
  assert.equal(g.state.inventory.length, before);
  assert.equal(g.chooseEvent('dig-finish'), null);
  assert.equal(g.state.phase, 'camp');
});
test('32-node normal graduation counts as success, unlocks chapter, pays gold once and binds the loadout', () => {
  const g = start(),
    gold = g.state.meta.gold;
  positionEvent(g, 'graduation');
  assert.equal(g.state.run.resonances.length, 4);
  const gear = g.packAnalysis(true).active.map((i) => i.id);
  assert.equal(g.chooseEvent('graduate'), null);
  assert.equal(g.state.phase, 'summary');
  assert.equal(g.completed(), 32);
  assert.equal(g.state.meta.heroes[0].outcome, 'win');
  assert.equal(g.state.meta.gold, gold + 160);
  assert.equal(g.state.meta.highestChapter, 5);
  assert.deepEqual(
    g.state.meta.heroes[0].loadout!.equipment.map((i) => i.id),
    gear,
  );
  assert.equal(g.retreat(), false);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('extreme choice continues with four resonances and tougher fights instead of settling early', () => {
  const g = start();
  positionEvent(g, 'graduation');
  g.chooseEvent('extreme');
  advanceCamp(g);
  assert.equal(g.state.run.index, 32);
  assert.equal(g.state.phase, 'combat');
  assert.equal(g.state.run.resonances.length, 4);
  assert.equal(g.state.meta.heroes.length, 0);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  g.state.player.hp = 0;
  g.update(0.01);
  assert.equal(g.state.meta.heroes[0].outcome, 'death');
  assert.equal(g.state.meta.gold, 100);
});
test('risk events spend only current life and grant a basic attribute without gold or healing', () => {
  const g = start();
  positionEvent(g, 'choice', 1);
  g.currentEvent()!.variant = 0;
  g.state.player.hp = 100;
  const gold = g.state.meta.gold;
  g.chooseEvent('risk');
  assert.equal(g.state.player.hp, 85);
  assert.equal(g.state.run.eventGrowth.attack, 0.08);
  assert.equal(g.state.meta.gold, gold);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('skip presentation produces identical discrete fight results and stops for owned loot', () => {
  const a = start(),
    b = new Game(parseSave(JSON.stringify(a.state)), seed(44));
  advanceCamp(a);
  advanceCamp(b);
  b.state.enemy = structuredClone(a.state.enemy);
  b.state.combat.runtime = structuredClone(a.state.combat.runtime);
  b.state.skipCombat = true;
  while (a.state.phase === 'combat') a.update(0.7);
  while (b.state.phase === 'combat') b.update(0.7);
  assert.equal(a.state.player.hp, b.state.player.hp);
  assert.equal(a.state.lastReport!.rounds, b.state.lastReport!.rounds);
  assert.deepEqual(a.state.lastReport!.items, b.state.lastReport!.items);
  assert.equal(b.state.run.autoExplore, false);
  assert.equal(b.state.phase, 'camp');
});
test('item resonance changes real attacks and advanced followup adds damage without recursive extra hits', () => {
  const make = (keys: any[]) => {
    const g = start();
    g.state.inventory = [g.makeItem('warrior_blade_2', 4)];
    g.state.draft = [];
    placeFree(g, g.state.inventory[0].id);
    g.state.run.resonances = keys;
    advanceCamp(g);
    g.state.enemy!.hp = g.state.enemy!.maxHp = 1e8;
    g.state.enemy!.attack = 0;
    for (let n = 0; n < 10; n++) g.advanceTurn();
    return g;
  };
  const plain = make([]),
    basic = make(['warrior_sword_base']),
    advanced = make(['warrior_sword_base', 'warrior_sword_edge']);
  const damage = (g: Game) =>
    Object.values(g.state.combat.contributions).reduce((n, c) => n + c.damage, 0);
  assert.ok(damage(basic) > damage(plain));
  assert.ok(damage(advanced) > damage(basic));
  assert.deepEqual(advanced.state.combat.hits, basic.state.combat.hits);
});
test('new choices render three contribution rows and digging replaces lower pack with an interactive board', () => {
  const win = new Window({ url: 'http://localhost/' });
  try {
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
    });
    win.document.body.innerHTML = '<div id="app"></div>';
    const g = start();
    positionEvent(g, 'elite', 8);
    g.state.enemy!.hp = 0;
    g.update(0.01);
    g.finishAwakening();
    const ui = new UI(g, () => {});
    assert.equal(win.document.querySelectorAll('[data-resonance]').length, 3);
    assert.equal(win.document.querySelectorAll('.resonance-levels span').length, 9);
    positionEvent(g, 'dig');
    ui.render();
    assert.equal(win.document.querySelectorAll('.dig-cell').length, 16);
    assert.equal((win.document.getElementById('view-pack') as any).hidden, true);
    win.document
      .querySelector('[data-event="dig-0"]')!
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(g.state.run.dig!.shovels, 11);
  } finally {
    win.happyDOM.close();
  }
});
