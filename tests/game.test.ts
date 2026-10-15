import { advanceCamp } from './helpers';
import { heroAttributes, BASE_ATTRIBUTES } from '../src/hero';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Game,
  createState,
  generateEvents,
  ENERGY_CAP,
  ENERGY_INTERVAL,
  RECRUIT_COST,
} from '../src/game';
import {
  availableItems,
  BUFF_KEYS,
  cells,
  contributionPoints,
  definition,
  PACK_ITEMS,
  PROFESSION_KEYS,
  PROFESSIONS,
  resonanceScore,
  validateLayout,
} from '../src/backpack';
import { parseSave } from '../src/save';
import type { Profession, ResonanceKey } from '../src/types';
import { start, seed, positionEvent, placeFree, recruitToConfigure, add } from './helpers';
test('v10 starts as a guild with reserve gold, full recruitment energy and no hero yet', () => {
  const s = createState();
  assert.equal(s.version, 14);
  assert.equal(s.phase, 'home');
  assert.equal(s.meta.energy.value, 60);
  assert.equal(s.meta.gold, 100);
  assert.deepEqual(s.meta.heroes, []);
  assert.equal('schools' in s.meta, false);
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});
test('100 seeded routes have 37 nodes, three independent trials and optional graduation', () => {
  for (let n = 0; n < 100; n++) {
    const e = generateEvents(seed(n));
    assert.equal(e.length, 37);
    assert.equal(e.filter((x) => x.kind === 'battle').length, 16);
    for (const i of [8, 16, 24]) assert.equal(e[i].kind, 'elite');
    assert.equal(e[31].kind, 'graduation');
    assert.equal(
      e.some((x) => x.kind === 'mentor'),
      false,
    );
    assert.equal(e[36].kind, 'ending');
    assert.equal(e.filter((x) => x.kind === 'dig').length, 3);
  }
});
test('three professions each define one neutral item plus three series at each 2/3/4 footprint; all 5-grid definitions reserved', () => {
  assert.equal(PACK_ITEMS.length, 39);
  for (const p of PROFESSION_KEYS) {
    const defs = availableItems(p);
    assert.equal(defs.length, 10);
    const single = defs.filter((d) => cells({ templateId: d.id }).length === 1);
    assert.equal(single.length, 1);
    assert.equal(single[0].branch, 'neutral');
    for (const size of [2, 3, 4]) {
      const group = defs.filter((d) => cells({ templateId: d.id }).length === size);
      assert.equal(group.length, 3);
      assert.equal(new Set(group.map((d) => d.branch)).size, 3);
      assert.equal(group.filter((d) => d.role === 'weapon').length, 2);
    }
    assert.equal(PACK_ITEMS.filter((d) => d.profession === p && !d.available).length, 3);
    const g = start(p);
    assert.equal(g.state.inventory.length, 6);
    assert.equal(g.state.run.resonances.length, 1);
    assert.equal(g.state.player.hp, g.state.player.maxHp);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
    for (const d of PACK_ITEMS.filter((d) => !d.available))
      assert.throws(() => g.makeItem(d.id), /未投放/);
  }
});
test('random recruit fixes its profession, resume does not charge again and gold stays reserved', () => {
  const g = new Game(undefined, seed(19)),
    gold = g.state.meta.gold;
  assert.ok(g.startRun());
  g.enterChapters();
  g.chooseChapter(1);
  assert.equal(g.state.phase, 'chapter');
  assert.equal(g.recruit(), null);
  const t = structuredClone(g.state.run.trainee!);
  assert.equal(g.state.meta.energy.value, 50);
  assert.ok(g.recruit());
  g.backHome();
  g.enterChapters();
  assert.equal(g.resumeRecruit(), true);
  assert.deepEqual(g.state.run.trainee, t);
  assert.ok(g.startRun('mage'));
  g.balanceAllocation();
  assert.equal(g.startRun(), null);
  assert.equal(g.state.meta.energy.value, 50);
  assert.equal(g.state.meta.gold, gold);
});
test('energy recovers discrete points, retains remainder, stops at cap and does not bank full time', () => {
  let now = 1000000;
  const g = new Game(createState(now), seed(1), () => now);
  g.state.meta.energy.value = 0;
  now += ENERGY_INTERVAL * 2 + 1234;
  g.recoverEnergy();
  assert.equal(g.state.meta.energy.value, 2);
  assert.equal(g.energyWait(), ENERGY_INTERVAL - 1234);
  assert.equal(g.recoverEnergy(), false);
  now += ENERGY_INTERVAL * 100;
  g.recoverEnergy();
  assert.equal(g.state.meta.energy.value, 60);
  const stamp = g.state.meta.energy.updatedAt;
  now += ENERGY_INTERVAL * 100;
  recruitToConfigure(g);
  assert.equal(g.state.meta.energy.value, 40);
  assert.equal(g.state.meta.energy.updatedAt, now);
  assert.ok(g.state.meta.energy.updatedAt > stamp);
  g.recoverEnergy(now + ENERGY_INTERVAL - 1);
  assert.equal(g.state.meta.energy.value, 40);
});
test('offline recovery resumes exact partial interval and ignores backwards clock', () => {
  const now = 1000000,
    s = createState(now);
  s.meta.energy.value = 5;
  const restored = new Game(
    parseSave(JSON.stringify(s)),
    seed(1),
    () => now + ENERGY_INTERVAL * 3 + 200,
  );
  assert.equal(restored.state.meta.energy.value, 8);
  assert.equal(restored.energyWait(now + ENERGY_INTERVAL * 3 + 200), ENERGY_INTERVAL - 200);
  const stamp = restored.state.meta.energy.updatedAt;
  restored.recoverEnergy(now - 10000);
  assert.equal(restored.state.meta.energy.value, 8);
  assert.equal(restored.state.meta.energy.updatedAt, stamp);
});
test('insufficient energy blocks recruitment and survives save without a deducted balance', () => {
  const g = new Game();
  g.state.meta.energy.value = 9;
  g.enterChapters();
  g.chooseChapter(1);
  assert.match(g.recruit()!, /体力/);
  assert.equal(g.state.run.trainee, null);
  assert.equal(g.state.meta.energy.value, 9);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('neutral items contribute profession resonance but adjacent neutral item boosts a weapon', () => {
  const g = start(),
    gem = g.state.inventory.find((i) => i.branch === 'neutral')!,
    wpn = g.makeItem('warrior_blade_2'),
    layout = [
      { id: gem.id, x: 0, y: 0, rotation: 0 },
      { id: wpn.id, x: 1, y: 0, rotation: 0 },
    ];
  assert.equal(contributionPoints(gem), 1);
  assert.equal(resonanceScore([gem, wpn], layout, 'cleave').score, 3);
  g.state.inventory = [gem, wpn];
  g.state.draft = layout;
  assert.equal(g.packAnalysis(true).links.length, 1);
  assert.ok(
    Math.abs(
      g.packAnalysis(true).bonuses[wpn.id].power -
        (heroAttributes(g.state.run.trainee, 'warrior').attack / BASE_ATTRIBUTES.warrior.attack +
          0.1),
    ) < 1e-8,
  );
});
test('every normal fight immediately owns all three drops, no extra choice, points or gold', () => {
  for (const p of PROFESSION_KEYS)
    for (let n = 1; n <= 10; n++) {
      const g = start(p, seed(n)),
        before = g.state.inventory.length,
        gold = g.state.meta.gold;
      advanceCamp(g);
      g.state.enemy!.hp = 0;
      g.update(0.05);
      assert.equal(g.state.phase, 'camp');
      assert.equal(g.state.inventory.length, before + 3);
      assert.equal(g.state.run.lastLootIds.length, 3);
      assert.equal(new Set(g.state.inventory.slice(-3).map((i) => i.id)).size, 3);
      assert.ok(
        g.state.inventory.slice(-3).every((i) => definition(i).available && i.profession === p),
      );
      assert.deepEqual(g.state.run.rewards, []);
      assert.equal(g.state.run.points, 0);
      assert.equal(g.state.meta.gold, gold);
      assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
    }
});
test('trial victories grant three items, recovery, growth and a unique resonance, with gameplay after the fourth', () => {
  const g = start();
  for (const [stage, index] of [8, 16, 24].entries()) {
    positionEvent(g, 'elite', index);
    g.state.player.hp = 30;
    const before = g.state.inventory.length;
    g.state.enemy!.hp = 0;
    g.update(0.05);
    assert.equal(g.state.inventory.length, before + 3);
    assert.equal(g.state.phase, 'awakening');
    g.finishAwakening();
    assert.ok(g.state.player.hp > 30);
    assert.equal(g.state.run.stages, stage + 1);
    assert.equal(g.skipReward(), false);
    const key = g.state.run.rewards[0].resonances[0];
    assert.equal(g.chooseResonance(key), null);
    assert.ok(g.chooseResonance(key));
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
  assert.equal(g.state.run.resonances.length, 4);
  assert.equal(advanceCamp(g), null);
  assert.equal(g.state.phase, 'event');
  assert.equal(g.state.run.index, 25);
  assert.equal(g.state.meta.heroes.length, 0);
});
test('treasure and supply give three items, lottery is free, and gold has no current spending', () => {
  for (const kind of ['treasure', 'supply'] as const) {
    const g = start(),
      count = g.state.inventory.length,
      gold = g.state.meta.gold;
    positionEvent(g, kind);
    assert.equal(g.state.phase, 'camp');
    assert.equal(g.currentEvent()!.completed, true);
    assert.equal(g.state.inventory.length, count + 3);
    assert.equal(g.state.meta.gold, gold);
    assert.ok(g.chooseEvent('open'));
  }
  for (const roll of [0.2, 0.6, 0.9, 0.99]) {
    const g = start('mage', () => roll),
      index = g.state.run.events.findIndex((e) => e.kind === 'chance');
    positionEvent(g, 'chance', index);
    g.currentEvent()!.variant = 0;
    const gold = g.state.meta.gold,
      count = g.state.inventory.length;
    g.state.player.hp = 1;
    assert.equal(g.chooseEvent('spin'), null);
    assert.equal(g.state.meta.gold, gold);
    assert.ok(g.state.player.hp >= 1);
    if (roll < 0.5) {
      assert.equal(g.state.inventory.length, count + 3);
      assert.ok(g.state.inventory.slice(-3).every((i) => i.level === 2));
    }
  }
});
test('buffs are basic and only appear in sacrifice, health changes only from equipment or events', () => {
  const g = start();
  g.state.player.hp = 40;
  g.update(60);
  assert.equal(g.state.player.hp, 40);
  const index = g.state.run.events.findIndex((e) => e.kind === 'chance');
  positionEvent(g, 'chance', index);
  g.currentEvent()!.variant = 1;
  g.state.player.hp = 1;
  assert.ok(g.chooseEvent('sacrifice'));
  g.state.player.hp = 100;
  g.chooseEvent('sacrifice');
  assert.equal(g.state.run.rewards[0].kind, 'buff');
  g.state.run.rewards[0].buffs = ['vitality'];
  const hp = g.state.player.hp;
  g.chooseReward(0);
  assert.equal(g.state.player.hp, hp);
  assert.deepEqual(BUFF_KEYS, ['power', 'tempo', 'vitality', 'defense']);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
function fight(p: Profession, template: string, keys: ResonanceKey[] = []) {
  const g = start(p);
  g.state.inventory = [g.makeItem(template, 3)];
  g.state.draft = [];
  placeFree(g, g.state.inventory[0].id);
  g.state.run.resonances = keys;
  advanceCamp(g);
  g.state.enemy!.hp = g.state.enemy!.maxHp = 1e8;
  g.state.enemy!.attack = 0;
  return g;
}
test('profession effects are dormant without resonance and activate only their matching series', () => {
  for (const [p, id, k, effect] of [
    ['rogue', 'rogue_assassin_3', 'venom', 'poison'],
    ['mage', 'mage_flame_3', 'ignite', 'burn'],
    ['mage', 'mage_ice_3', 'frost', 'chill'],
  ] as const) {
    const base = fight(p, id);
    base.update(5);
    assert.equal(base.state.enemy!.effects.length, 0);
    const active = fight(p, id, [k]);
    active.update(5);
    assert.ok(active.state.enemy!.effects.some((e) => e.kind === effect));
  }
  const wrong = fight('rogue', 'rogue_archer_3', ['venom']);
  wrong.update(5);
  assert.equal(wrong.state.enemy!.effects.length, 0);
});
test('third-hit attacks, life return, shield reinforcement and mage mana return have actual effects', () => {
  const base = fight('warrior', 'warrior_blade_3'),
    cleave = fight('warrior', 'warrior_blade_3', ['cleave']);
  base.update(8);
  cleave.update(8);
  assert.ok(
    Object.values(cleave.state.combat.contributions).reduce((n, r) => n + r.damage, 0) >
      Object.values(base.state.combat.contributions).reduce((n, r) => n + r.damage, 0),
  );
  const heal = fight('rogue', 'rogue_archer_3', ['leech']);
  heal.state.player.hp = 20;
  heal.update(5);
  assert.ok(heal.state.player.hp > 20);
  const guard = fight('warrior', 'warrior_blade_3', ['iron_guard']);
  guard.update(5);
  assert.ok(guard.state.player.shield > 0);
  const ice = fight('mage', 'mage_ice_3', ['mana_flow']);
  ice.state.combat.mana = 0;
  ice.update(5);
  assert.ok(ice.feedback.some((f) => f.kind === 'resource'));
});
test('two bosses keep heavy strike and summons without blocking permanent hero graduation', () => {
  for (const chapter of [1, 2]) {
    const g = start();
    g.state.meta.highestChapter = 2;
    g.state.run.chapter = chapter;
    positionEvent(g, 'boss');
    g.state.enemy!.hp = g.state.enemy!.maxHp = 1e8;
    g.state.player.hp = g.state.player.maxHp = 1000;
    g.update(7.1);
    if (chapter === 1) assert.ok(g.state.log.some((l) => l.text.includes('蓄力重击')));
    else assert.equal(g.state.combat.minions, 1);
  }
});
test('death always retains exactly one hero, early failure low rank, no gold; repeated settlement cannot duplicate', () => {
  const g = start(),
    gold = g.state.meta.gold;
  advanceCamp(g);
  g.state.player.hp = 0;
  g.update(0.05);
  assert.equal(g.state.phase, 'summary');
  assert.equal(g.state.meta.heroes.length, 1);
  const h = g.state.meta.heroes[0];
  assert.equal(h.outcome, 'death');
  assert.equal(h.rating, 'D');
  assert.equal(h.stages, 0);
  assert.equal(g.state.meta.gold, gold);
  assert.equal(g.retreat(), false);
  g.update(10);
  assert.equal(g.state.meta.heroes.length, 1);
  assert.equal(g.state.inventory.length, 0);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  g.returnToSelection();
  assert.equal(g.state.meta.heroes[0].power, h.power);
});
test('late failure preserves more growth than early failure but cannot receive A/S', () => {
  const early = start(),
    late = start();
  early.retreat();
  positionEvent(late, 'boss');
  late.state.player.hp = 0;
  late.update(0.05);
  const a = early.state.meta.heroes[0],
    b = late.state.meta.heroes[0];
  assert.ok(b.power > a.power);
  assert.equal(b.stages, 2);
  assert.ok(['D', 'C', 'B'].includes(b.rating));
  assert.equal(b.power, b.score.growth + b.score.build + b.score.performance);
});
test('full 37-node extreme run awards a fixed hero and currency once, then permits another recruit', () => {
  const g = start(),
    gold = g.state.meta.gold;
  let steps = 0;
  while (g.state.phase !== 'summary' && steps++ < 300) {
    const s = g.state;
    if (s.phase === 'camp') advanceCamp(g);
    else if (s.phase === 'combat') {
      s.enemy!.hp = 0;
      g.update(0.05);
    } else if (s.phase === 'awakening') g.finishAwakening();
    else if (s.phase === 'reward') g.chooseReward(0);
    else if (s.phase === 'event') {
      const e = g.currentEvent()!;
      g.chooseEvent(
        e.kind === 'elite'
          ? 'trial-0'
          : e.kind === 'rest'
            ? 'heal'
            : e.kind === 'supply'
              ? 'take'
              : e.kind === 'treasure'
                ? 'open'
                : e.kind === 'dig'
                  ? 'dig-finish'
                  : e.kind === 'graduation'
                    ? 'extreme'
                    : e.kind === 'mentor'
                      ? 'learn'
                      : e.kind === 'ending'
                        ? 'finish'
                        : 'skip',
      );
    }
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
  assert.equal(g.completed(), 37);
  const hero = structuredClone(g.state.meta.heroes[0]);
  assert.equal(hero.outcome, 'win');
  assert.equal(hero.stages, 3);
  assert.equal(hero.resonances.length, 4);
  assert.equal(g.state.meta.gold, gold + 230);
  assert.equal(g.state.inventory.length, 0);
  assert.equal(g.retreat(), false);
  g.returnToSelection();
  recruitToConfigure(g, 2, 'rogue');
  g.startRun('rogue');
  assert.deepEqual(g.state.meta.heroes[0], hero);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('hero scoring values utility and discounts resource-starved damage rather than only summing attack', () => {
  const g = start();
  g.state.run.kills = 14;
  const base = g.heroPreview()!;
  const armor = add(g, 'warrior_guard_4', 3);
  placeFree(g, armor.id);
  const defended = g.heroPreview()!;
  assert.ok(defended.score.build > base.score.build);
  assert.ok(defended.stats.defense > base.stats.defense);
  assert.ok(defended.stats.sustain > base.stats.sustain);
  g.state.inventory = [
    g.makeItem('warrior_blade_4', 5),
    g.makeItem('warrior_blade_4', 5),
    g.makeItem('warrior_blade_4', 5),
    g.makeItem('warrior_blade_4', 5),
  ];
  g.state.draft = [];
  for (const i of g.state.inventory) placeFree(g, i.id);
  const a = g.packAnalysis(true);
  assert.ok(a.efficiency < 1);
  assert.equal(g.heroPreview()!.stats.attack, Math.round(a.dps * a.efficiency));
});
test('malformed saves reject old schema, invalid jobs, reserved gear, duplicate heroes, invalid energy and forged score', () => {
  assert.throws(() => parseSave('{"version":7}'), /v14/);
  const g = start();
  g.retreat();
  const bad = (fn: (s: any) => void) => {
    const s = structuredClone(g.state);
    fn(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  };
  bad((s) => (s.meta.energy.value = 61));
  bad((s) => s.meta.heroes.push(s.meta.heroes[0]));
  bad((s) => (s.meta.heroes[0].profession = 'wood'));
  bad((s) => s.meta.heroes[0].power++);
  bad((s) => (s.meta.heroes[0].rating = 'S'));
  bad((s) => (s.run.stages = 4));
  assert.throws(
    () => parseSave(JSON.stringify(g.state).replace('"revision":', '"__proto__":{},"revision":')),
    /无效字段/,
  );
});
