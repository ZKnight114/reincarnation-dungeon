import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine, battleRuntime, fighter, damageValue } from '../src/combat';
import { resonanceSkills, tomeSkills } from '../src/skills';
import { DESIGN_RESONANCE_IDS, RESONANCE_KEYS, resonanceAvailable } from '../src/resonances';
import { TOME_STREAM } from '../src/combat-rules';
import { TOMES } from '../src/progression';
import { parseSave } from '../src/save';
import { start } from './helpers';
import { updateBossView } from '../src/boss-view';
import { Window } from 'happy-dom';
import {
  beginExpeditionBattle,
  expeditionState,
  setExpeditionTeam,
  startExpedition,
} from '../src/expedition';
import { expeditionBattleState } from '../src/expedition-combat-view';
import type { Source } from '../src/skill-types';

test('new passives and regen resume mid-turn with the same result as synchronous combat', () => {
  const a = model([
    item('blade', 0.25, 4),
    book('rogue_shadow_tome', 3),
    passive('warrior_flurry_2'),
    passive('rogue_shadow_2'),
    passive('warrior_spear_3'),
  ]);
  a.enemy.attack = 20;
  let b = structuredClone(a);
  for (let n = 1; n <= 12; n++) {
    const e = new BattleEngine(a, n);
    e.heroTurn();
    e.enemyTurn();
    let resumed = new BattleEngine(b, n);
    resumed.beginHeroTurn();
    resumed.nextHeroSource();
    b = JSON.parse(JSON.stringify(b));
    resumed = new BattleEngine(b, n);
    while (b.heroTurn) resumed.nextHeroSource();
    resumed.enemyTurn();
    assert.deepEqual(b, JSON.parse(JSON.stringify(a)));
  }
});

test('expedition replay preserves regen, passive counters, source pulses and save validation', () => {
  const g = start('rogue');
  g.state.run.boundTome = { id: 'rogue_shadow_tome', level: 1 };
  g.state.run.trainee!.tomeId = 'rogue_shadow_tome';
  g.state.run.trainee!.tomeLevel = 1;
  g.state.meta.tomes.rogue_shadow_tome.level = 1;
  g.retreat();
  g.returnToSelection();
  const h = g.state.meta.heroes[0];
  setExpeditionTeam(g.state, h.id);
  startExpedition(g.state, 1);
  beginExpeditionBattle(g.state);
  const report = expeditionState(g.state).run!.report!;
  const index = report.frames.findIndex((f) =>
    f.heroFighter?.statuses.some((s) => s.kind === 'regen'),
  );
  assert.ok(index >= 0);
  report.cursor = index;
  const view = expeditionBattleState(g.state)!;
  assert.ok(view.combat.runtime!.hero.statuses.some((s) => s.kind === 'regen'));
  assert.deepEqual(view.combat.runtime!.charges, report.frames[index].charges);
  assert.deepEqual(view.combat.runtime!.flags, {
    ...report.frames[index].flags,
    ...report.frames[index].firedAt,
  });
  assert.ok(report.frames[index].triggeredSources!.includes('tome:rogue_shadow_tome'));
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});

const item = (id = 'blade', a = 1, hits = 1): Source => ({
  id,
  name: id,
  kind: 'item',
  skills: [{ cooldown: 1, actions: [{ kind: 'damage', a, hits }] }],
});
const passive = (id: string, tier = 1): Source => ({
  id: 'resonance:' + id,
  name: id,
  kind: 'resonance',
  skills: resonanceSkills(id, tier),
});
const book = (id: string, level = 1): Source => ({
  id: 'tome:' + id,
  name: id,
  kind: 'tome',
  skills: tomeSkills(id, level),
});
const model = (sources: Source[] = [], id = 'reference') =>
  battleRuntime(
    fighter({ hp: 1000, attack: 100, defense: 0, speed: 12 }, 'warrior', 500),
    fighter({ hp: 10000, attack: 120, defense: 0, speed: 10 }, 'warrior'),
    sources,
    id,
  );
const run = (r: ReturnType<typeof model>, round = 1) => new BattleEngine(r, round).heroTurn();

test('all 48 passives have no independent skill timer, attack or healing spell', () => {
  for (const key of RESONANCE_KEYS)
    for (let tier = 1; tier <= 3; tier++) {
      const def = resonanceSkills(DESIGN_RESONANCE_IDS[key], tier);
      assert.equal(def[0].cooldown, 0);
      assert.deepEqual(def[0].actions, []);
      const r = model([passive(DESIGN_RESONANCE_IDS[key], tier)]);
      for (let n = 1; n <= 15; n++) run(r, n);
      assert.equal(r.enemy.hp, 10000);
      assert.equal(r.hero.hp, 500);
    }
});

test('every passive has an effective event response at each contribution tier', () => {
  for (const key of RESONANCE_KEYS)
    for (let tier = 1; tier <= 3; tier++) {
      const id = DESIGN_RESONANCE_IDS[key];
      const support = (id: string): Source => ({
        id,
        name: id,
        kind: 'item',
        family: 'support',
        skills: [{ cooldown: 1, actions: [{ kind: 'shield', h: 0.01 }] }],
      });
      const mage = {
        ...item('spell', 0.2, 4),
        skills: [
          {
            cooldown: 1,
            actions: [{ kind: 'damage' as const, a: 0.2, hits: 4, type: 'magic' as const }],
          },
        ],
      };
      const r = model([
        support('s1'),
        support('s2'),
        item('blade', 0.2, 4),
        mage,
        ...TOMES.map((t) => book(t.id, 3)),
        passive(id, tier),
      ]);
      let fired = 0;
      const e = new BattleEngine(r, 1, (signal) => {
        if (signal.source === 'resonance:' + id) fired++;
      });
      e.opening();
      for (let n = 1; n <= 12; n++) {
        e.round = n;
        r.hero.hp = 550;
        r.hero.shield = 1;
        r.enemy.hp = 2500;
        r.enemy.attack = 400;
        r.enemy.statuses = ['poison', 'burn', 'chill', 'break', 'mark'].map((kind) => ({
          kind: kind as 'poison',
          value: kind === 'poison' || kind === 'burn' ? 3 : 0.1,
          remaining: 3,
          source: 'setup',
        }));
        r.hero.statuses = [{ kind: 'smoke', value: 0.1, remaining: 2, source: 'setup' }];
        e.heroTurn();
        r.hero.shield = 1;
        e.enemyTurn();
      }
      assert.ok(fired > 0, id + ' tier ' + tier + ' has no event response');
    }
});

test('native hit followups never recurse or count as native multi-hits', () => {
  const r = model([item(), passive('warrior_sword_1'), passive('warrior_spear_1')]);
  const signals: string[] = [];
  new BattleEngine(r, 1, (s) => {
    if (s.kind === 'damage') signals.push(s.source);
  }).heroTurn();
  assert.deepEqual(signals, ['blade', 'resonance:warrior_sword_1']);
  assert.equal(r.flags['v3:direct:used'], 1);
});

test('matching tome increases conditional followup without rewriting native item damage', () => {
  const a = model([book('warrior_sword_tome'), passive('warrior_heavy_2')]);
  const b = model([book('warrior_sword_tome')]);
  for (const r of [a, b])
    r.enemy.statuses.push({ kind: 'break', value: 0.1, remaining: 2, source: 'setup' });
  run(a);
  run(b);
  assert.ok(Math.abs(b.enemy.hp - a.enemy.hp - 15) < 1e-7);
});

test('tome pre-cast conditions stay frozen across hits and native statuses', () => {
  const r = model([book('warrior_spear_tome', 3), passive('warrior_heavy_1')]);
  run(r);
  assert.ok(Math.abs(10000 - r.enemy.hp - 120) < 1e-7);
  assert.ok(r.enemy.statuses.some((s) => s.kind === 'break'));
});

test('regen begins on the next two hero starts, refreshes one source, expires at full life and cannot revive', () => {
  const src = book('rogue_shadow_tome', 3),
    r = model([src]),
    e = new BattleEngine(r, 1);
  e.heroTurn();
  assert.equal(r.hero.hp, 540);
  assert.equal(r.hero.statuses.find((s) => s.kind === 'regen')!.remaining, 2);
  e.round = 2;
  e.heroTurn();
  assert.equal(r.hero.hp, 550);
  e.round = 3;
  e.heroTurn();
  assert.equal(r.hero.hp, 560);
  assert.ok(!r.hero.statuses.some((s) => s.kind === 'regen'));
  e.execute(src, src.skills[0], 'hero');
  e.execute(src, src.skills[0], 'hero');
  assert.equal(r.hero.statuses.filter((s) => s.kind === 'regen').length, 1);
  r.hero.hp = 1000;
  r.timers[src.id + ':0'] = 9;
  e.heroTurn();
  e.heroTurn();
  assert.ok(!r.hero.statuses.some((s) => s.kind === 'regen'));
  e.execute(src, src.skills[0], 'hero');
  r.hero.hp = 0;
  e.heroTurn();
  assert.equal(r.hero.hp, 0);
});

test('sustain tome keeps healing after three casts while native item limits remain unchanged', () => {
  const r = model([book('rogue_shadow_tome')]);
  for (let n = 1; n <= 21; n++) {
    r.hero.hp = 500;
    run(r, n);
  }
  assert.equal(r.charges['tome:rogue_shadow_tome:heal:0:2'], 6);
});

test('lifesteal uses HP loss, ignores shields/overkill and respects source and combined round budgets', () => {
  const r = model([
    item('blade', 10, 4),
    passive('rogue_volley_2', 3),
    passive('rogue_poison_2', 3),
    book('rogue_poison_tome', 3),
  ]);
  r.enemy.statuses = [
    { kind: 'mark', value: 0.1, remaining: 10, source: 'setup' },
    { kind: 'poison', value: 1, remaining: 10, source: 'setup' },
  ];
  r.enemy.shield = 500;
  const signals: { source: string; amount: number }[] = [];
  new BattleEngine(r, 1, (s) => {
    if (s.kind === 'healing') signals.push(s);
  }).heroTurn();
  assert.ok(
    signals.filter((s) => s.source.startsWith('resonance:')).reduce((n, s) => n + s.amount, 0) <=
      20,
  );
  assert.ok(
    signals
      .filter((s) => s.source === 'resonance:rogue_volley_2')
      .reduce((n, s) => n + s.amount, 0) <= 10,
  );
  const shielded = model([item(), passive('rogue_volley_2', 3)]);
  shielded.enemy.shield = 500;
  shielded.enemy.statuses = [{ kind: 'mark', value: 0.1, remaining: 2, source: 'setup' }];
  run(shielded);
  assert.equal(shielded.hero.hp, 500);
  const overkill = model([item('blade', 100), passive('rogue_volley_2', 3)]);
  overkill.enemy.hp = 5;
  overkill.enemy.statuses = [{ kind: 'mark', value: 0.1, remaining: 2, source: 'setup' }];
  run(overkill);
  assert.ok(Math.abs(overkill.hero.hp - 500.35) < 1e-7);
});

test('zero-effect auxiliary activation does not charge stars and two distinct items do', () => {
  const support = (id: string): Source => ({
    id,
    name: id,
    kind: 'item',
    family: 'support',
    skills: [{ cooldown: 1, actions: [{ kind: 'shield', h: 0.01 }] }],
  });
  const r = model([
    support('a'),
    support('b'),
    book('mage_arcane_tome', 3),
    passive('mage_arcane_1'),
  ]);
  r.timers['tome:mage_arcane_tome:0'] = 9;
  run(r);
  assert.equal(r.charges['v3:star'], 2);
  r.hero.shield = 300;
  run(r, 2);
  assert.equal(r.charges['v3:star'], 2);
  r.hero.shield = 0;
  run(r, 3);
  assert.equal(r.charges['v3:star'], 3);
  r.timers['tome:mage_arcane_tome:0'] = 0;
  r.sources.push(passive('mage_arcane_3'));
  run(r, 4);
  assert.equal(r.charges['v3:star'], 2);
});

test('star energy belongs to the native tome hit and counts toward actual-damage lifesteal', () => {
  const r = model([book('mage_arcane_tome'), passive('rogue_volley_2', 3)]);
  r.charges['v3:star'] = 3;
  r.enemy.statuses = [{ kind: 'mark', value: 0.1, remaining: 2, source: 'setup' }];
  new BattleEngine(r, 1).heroTurn();
  assert.equal(r.enemy.hp, 9930);
  assert.ok(Math.abs(r.hero.hp - 504.9) < 1e-7);
  assert.equal(r.charges['v3:star'], 0);
});

test('pending multi-hit reward applies to the next tome, never the same cast', () => {
  const r = model([book('warrior_spear_tome'), passive('rogue_volley_2')]);
  // The corresponding ranged tome uses the same three-hit storage rule.
  r.sources[0] = book('rogue_ranged_tome');
  r.enemy.statuses = [{ kind: 'mark', value: 0.1, remaining: 20, source: 'setup' }];
  run(r);
  assert.equal(r.charges['v3:resonance:rogue_volley_2:pending'], 10);
  assert.ok(Math.abs(10000 - r.enemy.hp - 75.9) < 1e-7);
  run(r, 2);
  run(r, 3);
  run(r, 4);
  assert.ok(Math.abs(10000 - r.enemy.hp - 161.8) < 1e-7);
});

test('poison needs consecutive ticks on the same target and starts accumulating again after redemption', () => {
  const r = model([item(), passive('rogue_poison_3')]);
  const poison = () =>
    (r.enemy.statuses = [{ kind: 'poison', value: 2, remaining: 2, source: 'setup' }]);
  poison();
  new BattleEngine(r, 1).enemyTurn();
  r.enemy.statuses = [];
  new BattleEngine(r, 2).enemyTurn();
  poison();
  new BattleEngine(r, 3).enemyTurn();
  assert.equal(r.charges['v3:resonance:rogue_poison_3:layers'], undefined);
  new BattleEngine(r, 4).enemyTurn();
  assert.equal(r.charges['v3:resonance:rogue_poison_3:layers'], 1);
  run(r, 5);
  assert.equal(r.charges['v3:resonance:rogue_poison_3:layers'], 0);
  poison();
  new BattleEngine(r, 5).enemyTurn();
  assert.equal(r.charges['v3:resonance:rogue_poison_3:layers'], 0);
});

test('talent reflection from a minion hits that attacker, not the queen', () => {
  const r = model([{ ...item(), reflect: 0.5 }], 'queen');
  r.minions = [
    {
      ...fighter({ hp: 100, attack: 20, defense: 0, speed: 10 }, 'warrior'),
      id: 'minion:1',
      activeAt: 1,
    },
  ];
  r.enemyActions = 2;
  const boss = r.enemy.hp;
  const e = new BattleEngine(r, 1);
  e.beginEnemyTurn();
  e.nextEnemyStep();
  assert.equal(r.enemy.hp, boss);
  assert.ok(r.minions[0].hp < 100);
});

test('off-class tome unlocks only its own stream and round trips the chosen resonance', () => {
  const g = start();
  g.state.meta.tomes.mage_flame_tome.level = 1;
  g.state.run.boundTome = { id: 'mage_flame_tome', level: 1 };
  g.state.run.trainee!.tomeId = 'mage_flame_tome';
  g.state.run.trainee!.tomeLevel = 1;
  const blue = RESONANCE_KEYS.find((k) => DESIGN_RESONANCE_IDS[k] === 'mage_flame_1')!;
  const ice = RESONANCE_KEYS.find((k) => DESIGN_RESONANCE_IDS[k] === 'mage_ice_1')!;
  assert.ok(resonanceAvailable(blue, 'warrior', [], true, [], 'mage_flame_tome'));
  assert.ok(!resonanceAvailable(ice, 'warrior', [], true, [], 'mage_flame_tome'));
  g.state.run.resonances = [blue];
  g.state.run.rewards = [];
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  assert.equal(TOME_STREAM.mage_flame_tome, 'mage_flame');
});

test('direct mitigation caps at 45%, penetration caps at 70% and DOT does not take direct mitigation', () => {
  const r = model([item()]);
  r.hero.statuses = [
    { kind: 'smoke', value: 0.4, remaining: 2, source: 'a' },
    { kind: 'guard', value: 0.3, remaining: 2, source: 'b' },
  ];
  new BattleEngine(r, 1).enemyTurn();
  assert.ok(Math.abs(500 - r.hero.hp - 66) < 1e-7);
  const a = model([book('mage_ice_tome', 3), passive('mage_ice_1', 3)]);
  a.enemy.defense = 60;
  a.enemy.statuses = [{ kind: 'chill', value: 0.1, remaining: 2, source: 'setup' }];
  run(a);
  assert.ok(
    Math.abs(10000 - a.enemy.hp - damageValue(115, 'magic', 60, 'warrior', 'warrior', 0.55)) < 1e-7,
  );
  const dot = model();
  dot.hero.statuses = [
    { kind: 'smoke', value: 0.4, remaining: 2, source: 'a' },
    { kind: 'guard', value: 0.3, remaining: 2, source: 'b' },
    { kind: 'poison', value: 20, remaining: 2, source: 'enemy:reference' },
  ];
  new BattleEngine(dot, 1).heroTurn();
  assert.equal(dot.hero.hp, 480);
  assert.equal(damageValue(100, 'true', 60, 'warrior', 'warrior'), 100);
});

test('both battle modes share preparation, phase and live-minion visuals with no warning exclamation', () => {
  const w = new Window();
  globalThis.document = w.document as unknown as Document;
  const scene = document.createElement('div'),
    r = model([], 'queen');
  r.warning = '下次行动：孵化';
  r.phase = true;
  r.minions = [{ ...r.enemy, id: 'minion:1', hp: 30, maxHp: 100, activeAt: 4 }];
  updateBossView(scene, r);
  assert.ok(scene.classList.contains('boss-preparing'));
  assert.match(scene.innerHTML, /幼蛛/);
  assert.match(scene.innerHTML, /30%/);
  assert.doesNotMatch(scene.innerHTML, /！|!/);
  r.minions[0].hp = 0;
  r.warning = '';
  updateBossView(scene, r);
  assert.equal(scene.querySelectorAll('.boss-minion').length, 0);
  assert.ok(scene.classList.contains('boss-phase'));
  w.happyDOM.close();
});
