import test from 'node:test';
import assert from 'node:assert/strict';
import { rollTalents, TALENTS, validTalents, applyTalentSources } from '../src/talents';
import { RESONANCE_KEYS, RESONANCES, resonanceAvailable } from '../src/resonances';
import { Game } from '../src/game';
import { CATALOGUE } from '../src/catalogue';
import { equipmentFamily } from '../src/categories';
import { itemSkills } from '../src/skills';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { parseSave, saveGame, loadSave, SAVE_KEY } from '../src/save';
import { seed, start, add } from './helpers';
import { Window } from 'happy-dom';
import type { Source } from '../src/skill-types';

test('four guaranteed talents support cross-category and same family with different quality', () => {
  assert.equal(Object.values(TALENTS).filter((t) => t.quality).length, 42);
  for (const p of ['warrior', 'mage', 'rogue'] as const)
    for (let n = 0; n < 300; n++) {
      const keys = rollTalents(seed(n), p);
      assert.ok(validTalents(keys, p));
      assert.equal(keys.filter((k) => TALENTS[k].category === 'profession').length, 1);
      assert.equal(TALENTS[keys[0]].profession, p);
      assert.equal(TALENTS[keys[1]].category, 'item');
      assert.equal(TALENTS[keys[2]].category, 'attribute');
    }
  assert.ok(
    validTalents(
      ['warrior_soul:gold', 'sword_mastery:blue', 'hardy:purple', 'sword_mastery:gold'],
      'warrior',
    ),
  );
  assert.equal(
    validTalents(
      ['warrior_soul:blue', 'sword_mastery:blue', 'hardy:blue', 'sword_mastery:blue'],
      'warrior',
    ),
    false,
  );
});
test('public resonance pool has 48 entries and shares swords/support across professions', () => {
  assert.equal(RESONANCE_KEYS.length, 48);
  const g = new Game(),
    sword = g.makeItem('rogue_assassin_4'),
    book = g.makeItem('mage_ward_3'),
    smoke = g.makeItem('rogue_leather_3');
  assert.equal(equipmentFamily(sword), 'sword');
  assert.ok(RESONANCES.warrior_sword_base.matches(sword));
  assert.ok(RESONANCES.mage_robe_base.matches(book) && RESONANCES.mage_robe_base.matches(smoke));
  assert.ok(resonanceAvailable('warrior_sword_base', 'rogue', [], true));
  assert.equal(resonanceAvailable('mage_staff_base', 'rogue', [], true), false);
  assert.ok(resonanceAvailable('mage_staff_base', 'rogue', [], true, ['staff']));
  assert.equal(resonanceAvailable('mage_staff_master', 'rogue', [], false, ['staff']), false);
  assert.ok(
    resonanceAvailable('mage_staff_master', 'rogue', ['mage_staff_base'], false, ['staff']),
  );
});
test('new four-cell L weapons are vertical, alchemy only supplies smoke', () => {
  for (const [id, d] of Object.entries(CATALOGUE))
    if (
      d.cells.length === 4 &&
      ['warrior_blade_4', 'mage_ice_4', 'rogue_assassin_4', 'rogue_archer_4'].includes(id)
    ) {
      assert.equal(Math.max(...d.cells.map((c) => c[0])) + 1, 2);
      assert.equal(Math.max(...d.cells.map((c) => c[1])) + 1, 3);
    }
  for (const size of [2, 3, 4])
    for (const level of [1, 2, 3, 4])
      assert.ok(
        itemSkills(`rogue_leather_${size}`, level)
          .flatMap((s) => s.actions)
          .every((a) => a.kind === 'smoke'),
      );
});
function runtime(sources: Source[], hp = 500) {
  return battleRuntime(
    fighter({ attack: 100, hp: 1000, defense: 0, speed: 15 }, 'warrior', hp),
    fighter({ attack: 100, hp: 10000, defense: 0, speed: 10 }, 'warrior'),
    sources,
    'reference',
  );
}
test('native sword and profession rates add once, shared mastery excludes tome/resonance', () => {
  const items: Source[] = [
    {
      id: 'item-1',
      name: '剑',
      kind: 'item',
      family: 'sword',
      profession: 'warrior',
      skills: [{ cooldown: 1, actions: [{ kind: 'damage', a: 1, type: 'physical' }] }],
    },
    {
      id: 'tome:test',
      name: '典籍',
      kind: 'tome',
      profession: 'mage',
      skills: [{ cooldown: 1, actions: [{ kind: 'damage', a: 1, type: 'magic' }] }],
    },
  ];
  const sources = applyTalentSources(items, [
    'warrior_soul:blue',
    'sword_mastery:blue',
    'sword_mastery:gold',
  ]);
  const r = runtime(sources);
  new BattleEngine(r, 1, () => {}, true).heroTurn();
  assert.equal(r.enemy.hp, 10000 - 125 - 100);
  assert.equal(sources[1].talentDirect, 0);
  assert.equal(sources[1].talentDamage, 0);
});
test('lifesteal shares a full-round cap, ignores shields, survives serialization', () => {
  const base: Source = {
    id: 'item-1',
    name: '双剑',
    kind: 'item',
    family: 'sword',
    profession: 'rogue',
    skills: [{ cooldown: 1, actions: [{ kind: 'damage', a: 10, type: 'physical', hits: 3 }] }],
  };
  const r = runtime(applyTalentSources([base], ['rogue_soul:gold', 'sword_mastery:gold']));
  const e = new BattleEngine(r, 1, () => {}, true);
  e.heroTurn();
  assert.equal(r.hero.hp, 520);
  const resumed = JSON.parse(JSON.stringify(r));
  new BattleEngine(resumed, 1, () => {}, true).heroTurn();
  assert.equal(resumed.hero.hp, 520);
  const blocked = runtime(applyTalentSources([base], ['sword_mastery:gold']));
  blocked.enemy.shield = 5000;
  new BattleEngine(blocked, 1, () => {}, true).heroTurn();
  assert.equal(blocked.hero.hp, 500);
});
test('smoke protects exact enemy actions, takes strongest effect, and expires without healing', () => {
  const sources: Source[] = [
    {
      id: 'item-1',
      name: '烟幕',
      kind: 'item',
      family: 'support',
      skills: [{ cooldown: 3, actions: [{ kind: 'smoke', a: 0.2, duration: 2 }] }],
    },
  ];
  const r = runtime(sources, 1000),
    e = new BattleEngine(r, 1, () => {}, true);
  e.heroTurn();
  e.enemyTurn();
  assert.equal(r.hero.hp, 920);
  assert.equal(r.hero.statuses[0].remaining, 1);
  e.round = 2;
  e.heroTurn();
  e.enemyTurn();
  assert.equal(r.hero.hp, 840);
  assert.equal(r.hero.statuses.length, 0);
  e.round = 3;
  e.heroTurn();
  e.enemyTurn();
  assert.equal(r.hero.hp, 740);
});
test('save guard preserves old bytes on invalid live data and retains rolling recovery backups', () => {
  const win = new Window();
  Object.assign(globalThis, { localStorage: win.localStorage });
  const g = new Game();
  saveGame(g.state);
  const before = win.localStorage.getItem(SAVE_KEY);
  g.state.meta.energy.value = -1;
  assert.throws(() => saveGame(g.state));
  assert.equal(win.localStorage.getItem(SAVE_KEY), before);
  g.state.meta.energy.value = 59;
  saveGame(g.state);
  assert.equal(win.localStorage.getItem(SAVE_KEY + '-backup-1'), before);
  assert.equal(loadSave()!.meta.energy.value, 59);
  win.happyDOM.close();
});
test('saved pack edits remain loadable when the finished encounter has older source snapshots', () => {
  const g = start();
  g.state.combat.runtime = runtime([]);
  g.state.combat.runtime.enemyId = 'skeleton';
  const item = add(g, 'warrior_blade_2');
  g.placeItem(item.id, 0, 0);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});

test('support resonance fires once per round across multiple items and serialized recovery', () => {
  const r = runtime([
    ...[1, 2].map((n): Source => ({
      id: `item-${n}`,
      name: '烟雾瓶',
      kind: 'item',
      family: 'support',
      profession: 'rogue',
      skills: [{ cooldown: 1, actions: [{ kind: 'smoke', a: 0.1, duration: 1 }] }],
    })),
    {
      id: 'resonance:support',
      name: '辅助高阶',
      kind: 'resonance',
      profession: 'warrior',
      skills: [
        {
          cooldown: 0,
          trigger: 'support',
          actions: [{ kind: 'damage', a: 0.1, type: 'physical' }],
        },
      ],
    },
  ]);
  const before = r.enemy.hp;
  new BattleEngine(r, 1).heroTurn();
  assert.equal(before - r.enemy.hp, 10);
  const restored = JSON.parse(JSON.stringify(r));
  new BattleEngine(restored, 1).heroTurn();
  assert.equal(
    restored.enemy.hp,
    r.enemy.hp,
    'refresh must not repeat the same-round support proc',
  );
  new BattleEngine(restored, 2).heroTurn();
  assert.equal(r.enemy.hp - restored.enemy.hp, 10, 'a new round may trigger again');
});
