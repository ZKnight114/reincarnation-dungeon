import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, createState, RECRUIT_COST, TARGET_RECRUIT_COST } from '../src/game';
import {
  BattleEngine,
  battleRuntime,
  fighter,
  damageValue,
  enrageMultiplier,
  estimateBuild,
  COUNTERS,
} from '../src/combat';
import {
  availableItems,
  buildSources,
  finalAttributes,
  runBagCapacity,
  runBagCells,
  contributionPoints,
  analyzePack,
  resonanceScore,
} from '../src/backpack';
import { itemSkills, tomeSkills, resonanceSkills } from '../src/skills';
import { DESIGN_RESONANCE_IDS, RESONANCES, RESONANCE_KEYS } from '../src/resonances';
import { TOMES, guildConditions, currentHero, realmName } from '../src/progression';
import { guildBenefits } from '../src/guild';
import { chapterRoute } from '../src/journey';
import { generateEnemy, growthMultiplier } from '../src/enemies';
import { parseSave, loadSave, SAVE_KEY } from '../src/save';
import {
  start,
  seed,
  positionEvent,
  recruitToConfigure,
  prepare,
  advanceCamp,
  setEnemy,
} from './helpers';
import type { Source } from '../src/skill-types';
test('all forty-eight candidate resonance descriptions spell out the attributes used by their skills', () => {
  assert.equal(RESONANCE_KEYS.length, 48);
  for (const resonance of Object.values(RESONANCES)) {
    assert.doesNotMatch(resonance.description, /%[AHD]|\b[AHD]\b/);
    for (const effect of resonance.effects) assert.doesNotMatch(effect, /%[AHD]|\b[AHD]\b/);
  }
});
import { Window } from 'happy-dom';

const model = (id = 'reference', sources: Source[] = []) =>
  battleRuntime(
    fighter({ attack: 100, hp: 1000, defense: 10, speed: 12 }, 'warrior'),
    fighter({ attack: 20, hp: 10000, defense: 10, speed: 10 }, 'warrior'),
    sources,
    id,
  );
test('thirty four-stage items, forty-eight independent resonances and nine three-stage tomes have executable definitions', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const)
    for (const i of availableItems(p))
      for (let n = 1; n <= 4; n++) assert.doesNotThrow(() => itemSkills(i.id, n));
  assert.equal(RESONANCE_KEYS.length, 48);
  for (const id of Object.values(DESIGN_RESONANCE_IDS))
    for (let n = 1; n <= 3; n++) assert.ok(resonanceSkills(id, n).length);
  assert.equal(TOMES.length, 9);
  for (const t of TOMES) for (let n = 1; n <= 3; n++) assert.ok(tomeSkills(t.id, n).length);
});
test('item attributes add to the person and native statuses work with no chosen resonance or battle resource', () => {
  const g = start('rogue');
  g.state.inventory = [g.makeItem('rogue_assassin_2', 4)];
  g.state.draft = [{ id: g.state.inventory[0].id, x: 1, y: 1, rotation: 0 }];
  g.state.run.resonances = [];
  const stats = finalAttributes(g.state, true);
  assert.ok(stats.attack > g.state.inventory[0].attack);
  advanceCamp(g);
  setEnemy(g, { hp: 1e6, maxHp: 1e6, attack: 0 });
  g.advanceTurn();
  assert.ok(g.state.combat.runtime!.enemy.statuses.some((x) => x.kind === 'poison'));
  assert.equal(g.state.combat.stamina, 0);
  assert.equal(g.state.combat.mana, 0);
  assert.ok(buildSources(g.state).every((x) => x.kind !== 'resonance'));
});
test('profession and item contribution share points while a one-cell gem only contributes profession', () => {
  const g = start(),
    gem = g.makeItem('warrior_gem', 4),
    sword = g.makeItem('warrior_blade_4', 4),
    layout = [
      { id: gem.id, x: 0, y: 0, rotation: 0 },
      { id: sword.id, x: 1, y: 0, rotation: 0 },
    ];
  const a = analyzePack([gem, sword], layout, 0, {}, ['cleave', 'flurry', 'warrior_sword_base']);
  assert.equal(contributionPoints(sword), 32);
  assert.equal(a.tiers.cleave, 1);
  assert.equal(a.tiers.flurry, 1);
  assert.equal(a.tiers.warrior_sword_base, 3);
  assert.equal(RESONANCES.warrior_sword_base.matches(gem), false);
});
test('gem amplification is directional and does not alter tome, counter, true or ongoing damage', () => {
  const source: Source = {
    id: 'item-1',
    name: 'test',
    kind: 'item',
    damageBonus: 0.2,
    skills: [
      {
        cooldown: 1,
        actions: [
          { kind: 'damage', a: 1, type: 'physical' },
          { kind: 'damage', a: 1, type: 'true' },
          { kind: 'status', status: 'poison', a: 0.1, duration: 2 },
        ],
      },
    ],
  };
  const a = model('reference', [source]),
    b = model('reference', [{ ...source, damageBonus: 0 }]);
  new BattleEngine(a, 1).heroTurn();
  new BattleEngine(b, 1).heroTurn();
  assert.equal(a.enemy.statuses[0].value, b.enemy.statuses[0].value);
  assert.ok(
    Math.abs(b.enemy.hp - a.enemy.hp - damageValue(20, 'physical', 10, 'warrior', 'warrior')) <
      1e-6,
  );
});
test('automatic healing retains charges and readiness at full health, has three uses and does not heal between fights', () => {
  const r = model('reference', [
      { id: 'item-1', name: 'robe', kind: 'item', skills: itemSkills('mage_ward_3', 4) },
    ]),
    e = new BattleEngine(r, 1);
  e.heroTurn();
  assert.deepEqual(r.charges, {});
  e.heroTurn(); // Healing becomes ready on its independently configured first activation.
  assert.equal(r.timers['item-1:0'], 0);
  for (let n = 0; n < 8; n++) {
    r.hero.hp = 500;
    e.round = n + 2;
    e.heroTurn();
  }
  assert.equal(r.charges['item-1:heal:0:0'], 3);
  r.hero.hp = 500;
  e.round = 20;
  e.heroTurn();
  assert.equal(r.hero.hp, 500);
  const g = start();
  g.state.player.hp = 40;
  g.update(20);
  assert.equal(g.state.player.hp, 40);
});
test('shield cap, symmetric damage types and profession counters do not affect healing or double apply', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const)
    for (const q of ['warrior', 'mage', 'rogue'] as const) {
      assert.equal(damageValue(100, 'true', 50, p, q), 100);
      assert.ok(Math.abs(damageValue(100, 'physical', 60, p, q) - 50 * COUNTERS[p][q]) < 1e-8);
    }
  assert.ok(
    damageValue(100, 'magic', 60, 'warrior', 'warrior') >
      damageValue(100, 'physical', 60, 'warrior', 'warrior'),
  );
  const r = model('reference', [
    {
      id: 'item-1',
      name: 'shield',
      kind: 'item',
      skills: [{ cooldown: 1, actions: [{ kind: 'shield', h: 1 }] }],
    },
  ]);
  new BattleEngine(r, 1).heroTurn();
  assert.equal(r.hero.shield, 500);
});
test('all enemies enrage after fifteen complete rounds and cap at eighty percent extra damage', () => {
  assert.deepEqual(
    [15, 16, 17, 18, 20, 22, 99].map((n) => +enrageMultiplier(n).toFixed(2)),
    [1, 1.2, 1.2, 1.4, 1.6, 1.8, 1.8],
  );
  const a = model(),
    b = model();
  new BattleEngine(a, 15).enemyTurn();
  new BattleEngine(b, 16).enemyTurn();
  assert.ok(Math.abs((1000 - b.hero.hp) / (1000 - a.hero.hp) - 1.2) < 1e-8);
});
test('fourth-stage short spear adds its third-trigger hit without relying on translated item names', () => {
  const r = model('reference', [
      { id: 'item-1', name: '任意名称', kind: 'item', skills: itemSkills('warrior_pole_2', 4) },
    ]),
    e = new BattleEngine(r, 1);
  const losses: number[] = [];
  for (let n = 1; n <= 3; n++) {
    const hp = r.enemy.hp;
    e.round = n;
    e.heroTurn();
    losses.push(hp - r.enemy.hp);
  }
  assert.ok(Math.abs(losses[0] - losses[1]) < 1e-8);
  assert.ok(losses[2] > losses[1]);
});
test('a round first-strike condition remains frozen even if chill changes speed during that round', () => {
  const r = model('reference', [
    {
      id: 'resonance:second_wind',
      name: 'heal',
      kind: 'resonance',
      skills: resonanceSkills('warrior_flurry_2', 1),
    },
  ]);
  r.hero.hp = 500;
  r.heroFirst = false;
  r.enemy.statuses = [{ kind: 'chill', value: 0.3, remaining: 2, source: 'item-1' }];
  new BattleEngine(r, 1).heroTurn();
  assert.equal(r.hero.hp, 500);
});
test('multiple shield-break responses use frozen eligibility and cannot resurrect a dead fighter', () => {
  const sources: Source[] = [
    {
      id: 'resonance:fortress',
      name: 'a',
      kind: 'resonance',
      skills: resonanceSkills('warrior_guard_3', 1),
    },
    {
      id: 'resonance:warrior_shield_master',
      name: 'b',
      kind: 'resonance',
      skills: resonanceSkills('warrior_shield_3', 1),
    },
  ];
  const r = model('reference', sources);
  r.hero.shield = 1;
  const e = new BattleEngine(r, 1);
  e.enemyTurn();
  assert.ok(r.flags['resonance:fortress:reaction:0']);
  assert.ok(r.flags['resonance:warrior_shield_master:reaction:0']);
  assert.ok(r.hero.shield > 100);
  const dead = model('reference', sources);
  dead.hero.hp = 1;
  new BattleEngine(dead, 1).enemyTurn();
  assert.equal(dead.hero.hp, 0);
  assert.equal(dead.hero.shield, 0);
});
test('DOT refreshes by source, caps per target and ticks before a lethal target action', () => {
  const r = model();
  r.enemy.hp = 5;
  r.enemy.statuses = [
    { kind: 'poison', source: 'item-1', value: 90, remaining: 2 },
    { kind: 'poison', source: 'item-2', value: 90, remaining: 2 },
  ];
  const hp = r.hero.hp;
  new BattleEngine(r, 1).enemyTurn();
  assert.equal(r.enemy.hp, 0);
  assert.equal(r.hero.hp, hp);
  assert.equal(r.enemyActions, 0);
  const a = model('reference', [
      { id: 'item-1', name: 'poison', kind: 'item', skills: itemSkills('rogue_assassin_2', 1) },
    ]),
    e = new BattleEngine(a, 1);
  e.heroTurn();
  e.heroTurn();
  assert.equal(a.enemy.statuses.length, 1);
});
test('queen summons independent minions with next-action activation and attacks retarget after a minion dies', () => {
  const r = model('queen');
  r.hero.hp = r.hero.maxHp = 1e6;
  r.enemyActions = 2;
  const e = new BattleEngine(r, 1);
  e.enemyTurn();
  assert.match(r.warning, /孵化/);
  e.enemyTurn();
  assert.equal(r.minions.length, 1);
  assert.equal(r.minions[0].activeAt, 5);
  const bossHp = r.enemy.hp;
  r.minions[0].hp = 1;
  e.execute(
    { id: 'item-1', name: 'bow', kind: 'item', skills: [] },
    { cooldown: 1, actions: [{ kind: 'damage', a: 0.2, hits: 2 }] },
    'hero',
  );
  assert.equal(r.minions[0].hp, 0);
  assert.ok(r.enemy.hp < bossHp);
  r.minions = [];
  r.enemyActions = 7;
  e.enemyTurn();
  r.enemyActions = 11;
  e.enemyTurn();
  assert.equal(r.summons, 3);
  r.minions = [];
  r.enemyActions = 15;
  e.enemyTurn();
  assert.equal(r.summons, 3);
  assert.equal(r.minions.length, 0);
});
test('boss main abilities replace basic attacks and warnings refer to the next enemy action', () => {
  for (const [id, n] of [
    ['ogre', 2],
    ['dragon', 1],
    ['bone_king', 2],
  ] as const) {
    const r = model(id);
    r.enemyActions = n;
    const e = new BattleEngine(r, 1);
    e.enemyTurn();
    assert.match(r.warning, /下次行动/);
    e.enemyTurn();
    assert.equal(r.warning, '');
  }
});

test('bat life steal neither consumes charges at full health nor resurrects a lethal counter victim', () => {
  const full = model('bat');
  new BattleEngine(full, 1).enemyTurn();
  assert.equal(full.charges.batHeal, undefined);
  const r = model('bat', [{ id: 'item-1', name: 'counter', kind: 'item', skills: [] }]);
  r.enemy.hp = 1;
  r.charges['item-1:counter'] = 1;
  r.flags['item-1:counter'] = 100;
  new BattleEngine(r, 1).enemyTurn();
  assert.equal(r.enemy.hp, 0);
  assert.equal(r.charges.batHeal, undefined);
});
test('encounter growth follows builds partially, freezes before trial selection and does not react to lost health', () => {
  const g = start();
  const s = g.state;
  s.run.index = 8;
  const a = generateEnemy(s, 200, seed(3)),
    b = generateEnemy(s, 800, seed(3));
  assert.equal(a.templateId, b.templateId);
  assert.equal(a.profession, b.profession);
  assert.ok(b.maxHp > a.maxHp && b.maxHp < a.maxHp * 4);
  assert.ok(growthMultiplier(4) < 4);
  s.player.hp = 1;
  assert.deepEqual(generateEnemy(s, 200, seed(3)), a);
  positionEvent(g, 'boss', 8);
  assert.equal(s.enemy!.isBoss, true);
  const before = structuredClone(s.enemy);
  g.advanceTurn();
  assert.equal(s.enemy!.maxHp, before!.maxHp);
});
test('short chapters retain three trial breakthroughs, four resonance choices and open all forty-two cells', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => chapterRoute(n).length),
    [18, 24, 31, 37],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => chapterRoute(n).normal),
    [18, 24, 28, 32],
  );
  for (const chapter of [1, 2, 3, 4]) {
    const s = createState();
    s.run.chapter = chapter;
    const r = chapterRoute(chapter);
    assert.equal(r.trials.length, 3);
    assert.ok(r.trials.every((n) => r.kinds[n] === 'boss'));
    assert.equal(runBagCapacity(s), 15);
    s.run.kills = r.kinds.slice(0, r.normal).filter((k) => k === 'battle' || k === 'boss').length;
    assert.equal(runBagCapacity(s), 42);
    assert.equal(runBagCells(s).size, 42);
  }
  const g = start();
  for (const index of [8, 16, 24]) {
    const previous = g.state.run.realm;
    positionEvent(g, 'boss', index);
    g.state.enemy!.hp = 0;
    g.update(0.01);
    assert.equal(g.state.phase, 'camp');
    assert.equal(g.continueCamp(), null);
    assert.equal(g.state.run.realm, g.state.run.trainee!.realmStart! + g.state.run.stages);
    assert.equal(g.state.run.realm, previous + 1);
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    g.finishAwakening();
    g.chooseReward(0);
  }
  assert.equal(g.state.run.resonances.length, 4);
  assert.equal(realmName(g.state.run.realm), '白银初阶');
});
test('five/twenty recruitment tracks cumulative energy; guild upgrades require all three conditions and buff existing heroes', () => {
  assert.equal(RECRUIT_COST, 5);
  assert.equal(TARGET_RECRUIT_COST, 20);
  const g = new Game();
  recruitToConfigure(g);
  assert.equal(g.state.meta.staminaSpent, 20);
  g.startRun();
  prepare(g);
  g.retreat();
  g.returnToSelection();
  assert.equal(guildConditions(g.state).length, 3);
  assert.ok(g.upgradeGuild());
  g.state.meta.wins = 1;
  const saved = structuredClone(g.state.meta.heroes[0]);
  assert.equal(g.upgradeGuild(), null);
  assert.deepEqual(currentHero(saved, guildBenefits(0)).stats, saved.stats);
  g.state.meta.medals = 12;
  assert.equal(g.buyGuildNode(0), null);
  assert.equal(g.buyGuildNode(1), null);
  const boosted = currentHero(saved, guildBenefits(g.state.meta.guildPurchased));
  assert.ok(boosted.stats.attack > saved.stats.attack);
  assert.ok(boosted.power > saved.power);
  assert.equal(boosted.rating, saved.rating);
  assert.deepEqual(g.state.meta.heroes[0], saved);
});
test('graduation creates no tome pages while previously earned rewards persist and remain claimable', () => {
  const g = start();
  const library = structuredClone(g.state.meta.tomes);
  positionEvent(g, 'graduation');
  g.chooseEvent('graduate');
  assert.equal(g.state.phase, 'summary');
  assert.equal(g.state.meta.pendingPages.length, 0);
  assert.deepEqual(g.state.meta.tomes, library);
  // A pending reward earned in an earlier version keeps its existing entitlement.
  const reward = {
    heroId: g.state.meta.heroes[0].id,
    choices: ['warrior_sword_tome', 'warrior_spear_tome', 'mage_flame_tome'],
    extreme: false,
    refreshed: false,
  };
  g.state.meta.pendingPages.push(reward);
  const original = structuredClone(reward);
  g.returnToSelection();
  recruitToConfigure(g, 1, 'mage');
  assert.deepEqual(g.state.meta.pendingPages[0], original);
  g.startRun();
  prepare(g);
  g.retreat();
  g.returnToSelection();
  const id = reward.choices[0],
    before = g.state.meta.tomes[id].level;
  assert.equal(g.claimPage(reward.heroId, id), null);
  assert.ok(g.claimPage(reward.heroId, id));
  if (!before) assert.equal(g.state.meta.tomes[id].level, 1);
  const owned = g.state.meta.tomes[id];
  owned.pages = 3;
  g.state.meta.gold = 1000;
  assert.equal(g.upgradeTome(id), null);
  assert.equal(owned.level, 2);
  assert.equal(owned.pages, 0);
  assert.equal(g.state.meta.gold, 800);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('graduation with a complete library creates no reward', () => {
  const g = start();
  for (const o of Object.values(g.state.meta.tomes)) o.level = 3;
  g.state.run.boundTome = { id: g.state.run.trainee!.tomeId!, level: 1 };
  positionEvent(g, 'graduation');
  g.chooseEvent('graduate');
  assert.equal(g.state.meta.pendingPages.length, 0);
});

test('a previously earned single-choice tome reward can still save without new graduation drops', () => {
  const g = start();
  for (const o of Object.values(g.state.meta.tomes)) o.level = 3;
  g.state.meta.tomes.mage_flame_tome.level = 2;
  positionEvent(g, 'graduation');
  g.chooseEvent('graduate');
  assert.equal(g.state.meta.pendingPages.length, 0);
  g.state.meta.pendingPages.push({
    heroId: g.state.meta.heroes[0].id,
    choices: ['mage_flame_tome'],
    extreme: false,
    refreshed: false,
  });
  assert.deepEqual(g.state.meta.pendingPages[0].choices, ['mage_flame_tome']);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('one graduation click captures the current draft, pays once, and persists the final realm', () => {
  const g = start();
  positionEvent(g, 'graduation');
  const item = g.packAnalysis(true).active.find((i) => i.slot === 'weapon')!;
  const expected = structuredClone(g.state.draft);
  const gold = g.state.meta.gold;
  const tomeState = structuredClone(g.state.meta.tomes);
  // Loose loot is allowed at graduation and is never bound to this hero.
  const loose = g.makeItem('warrior_blade_2');
  g.state.inventory.push(loose);
  assert.equal(g.chooseEvent('graduate'), null);
  assert.equal(g.state.phase, 'summary');
  const hero = g.state.meta.heroes[0];
  assert.deepEqual(hero.loadout!.placements, expected);
  assert.ok(hero.loadout!.equipment.some((i) => i.id === item.id));
  assert.ok(!hero.loadout!.equipment.some((i) => i.id === loose.id));
  assert.equal(hero.realm, g.state.run.realm);
  assert.equal(g.state.inventory.length, 0);
  assert.equal(g.state.meta.gold, gold + 160);
  assert.equal(g.state.meta.pendingPages.length, 0);
  assert.deepEqual(g.state.meta.tomes, tomeState);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  assert.ok(g.chooseEvent('graduate'));
  assert.ok(g.continueCamp());
  assert.equal(g.state.meta.heroes.length, 1);
  assert.equal(g.state.meta.gold, gold + 160);
});
test('graduation rejects an invalid final draft before completing the event or paying rewards', () => {
  const g = start();
  positionEvent(g, 'graduation');
  const gold = g.state.meta.gold;
  g.state.draft = [];
  assert.ok(g.chooseEvent('graduate'));
  assert.equal(g.state.phase, 'event');
  assert.equal(g.currentEvent()!.completed, false);
  assert.equal(g.state.meta.heroes.length, 0);
  assert.equal(g.state.meta.gold, gold);
});
test('neutral build estimation is not clipped by a small target health pool and uses native skills', () => {
  const source = (a: number): Source => ({
    id: 'item-1',
    name: 'attack',
    kind: 'item',
    skills: [{ cooldown: 1, actions: [{ kind: 'damage', a }] }],
  });
  const stats = { attack: 100, hp: 1000, defense: 10, speed: 12 };
  const a = estimateBuild(stats, [source(2)]),
    b = estimateBuild(stats, [source(8)]);
  assert.ok(b.output > a.output * 3.9);
});
test('current combat resumes exact timers, statuses and sources and rejects forged runtime/realm/tome data', () => {
  const g = start();
  advanceCamp(g);
  g.advanceTurn();
  const saved = parseSave(JSON.stringify(g.state));
  const restored = new Game(saved, seed(77));
  g.advanceTurn();
  restored.advanceTurn();
  assert.deepEqual(restored.state.combat, g.state.combat);
  for (const edit of [
    (s: any) => s.run.realm++,
    (s: any) => (s.run.boundTome.level = 3),
    (s: any) => (s.combat.runtime.enemyId = 'fake'),
    (s: any) => (s.run.encounter.hp = NaN),
  ]) {
    const s = structuredClone(g.state);
    edit(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  }
});
test('v14 migration keeps the original raw backup, currency and hero identity without replaying opening effects', () => {
  const g = start();
  advanceCamp(g);
  g.advanceTurn();
  const raw: any = structuredClone(g.state);
  raw.version = 14;
  raw.combat.order = ['enemy', 'hero'];
  raw.combat.actionIndex = 1;
  delete raw.meta.guildLevel;
  delete raw.meta.staminaSpent;
  delete raw.meta.tomes;
  delete raw.meta.pendingPages;
  const w = new Window({ url: 'http://localhost/' });
  globalThis.localStorage = w.localStorage as unknown as Storage;
  const source = JSON.stringify(raw);
  localStorage.setItem('recursion-dungeon-save-v14', source);
  const restored = loadSave()!;
  assert.equal(restored.version, 15);
  assert.equal(restored.meta.gold, raw.meta.gold);
  assert.equal(restored.run.trainee!.id, raw.run.trainee.id);
  assert.equal(restored.combat.runtime!.heroActions, 0);
  assert.equal(restored.combat.runtime!.enemyActions, 1);
  assert.equal(restored.combat.runtime!.heroFirst, false);
  assert.equal(localStorage.getItem('recursion-dungeon-save-v14-backup'), source);
  assert.equal(localStorage.getItem('recursion-dungeon-save-v14'), source);
  assert.equal(localStorage.getItem(SAVE_KEY), null);
  w.happyDOM.close();
});

test('v14 camp cooldowns normalize to current item skills and discard removed item timers', () => {
  const raw: any = structuredClone(start().state);
  raw.version = 14;
  for (const i of raw.inventory) raw.combat.timers[i.id] = 4;
  raw.combat.timers['item-9999'] = 4;
  const restored = parseSave(JSON.stringify(raw));
  for (const i of restored.inventory)
    assert.ok(
      restored.combat.timers[i.id] <= (itemSkills(i.templateId, i.level)[0]?.cooldown ?? 0),
    );
  assert.equal(restored.combat.timers['item-9999'], undefined);
});

test('cross-class tome grants only its own equipment series as a minority of loot and keeps profession fixed', () => {
  const g = start();
  g.state.meta.tomes.mage_flame_tome.level = 1;
  g.state.run.trainee!.tomeId = 'mage_flame_tome';
  g.state.run.trainee!.tomeLevel = 1;
  g.state.run.boundTome = { id: 'mage_flame_tome', level: 1 };
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  const drops = Array.from({ length: 400 }, () =>
    (g as any).lootItem(),
  ) as Game['state']['inventory'];
  const aux = drops.filter((i) => i.profession !== 'warrior');
  assert.ok(aux.length > 20 && aux.length < 100, `auxiliary fraction: ${aux.length}/400`);
  assert.ok(aux.every((i) => i.profession === 'mage' && i.branch === 'flame'));
  assert.equal(g.state.run.profession, 'warrior');
  const foreign = aux.find((i) => i.templateId === 'mage_flame_2')!;
  g.state.inventory.push(foreign);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  g.state.draft = [];
  const before = finalAttributes(g.state, true).attack;
  g.state.draft = [{ id: foreign.id, x: 1, y: 1, rotation: 0 }];
  assert.ok(finalAttributes(g.state, true).attack > before);
  g.state.placements = structuredClone(g.state.draft);
  assert.ok(buildSources(g.state).some((s) => s.id === foreign.id));
  assert.equal(resonanceScore(g.state.inventory, g.state.draft, 'cleave').score, 0);
  assert.ok(resonanceScore(g.state.inventory, g.state.draft, 'ignite').score > 0);
  const saved = parseSave(JSON.stringify(g.state));
  assert.equal(saved.inventory.at(-1)!.profession, 'mage');
  g.retreat();
  const archive = parseSave(JSON.stringify(g.state)).meta.heroes[0];
  assert.ok(archive.loadout!.equipment.some((i) => i.profession === 'mage'));
  assert.equal(archive.profession, 'warrior');
});

test('free tome selection is a single grant per recruited profession and only commits on departure', () => {
  const g = new Game();
  g.enterChapters();
  g.recruit('warrior');
  assert.ok(g.selectTome('mage_flame_tome'));
  assert.ok(g.confirmAllocation());
  g.balanceAllocation();
  assert.equal(g.confirmAllocation(), null);
  assert.equal(g.selectTome('mage_flame_tome'), null);
  assert.equal(g.selectTome('rogue_poison_tome'), null);
  assert.equal(g.state.meta.tomes.mage_flame_tome.level, 0);
  assert.equal(g.state.meta.tomes.rogue_poison_tome.level, 0);
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.startRun(), null);
  assert.equal(restored.state.meta.tomes.rogue_poison_tome.level, 1);
  assert.equal(restored.state.meta.tomes.mage_flame_tome.level, 0);
  restored.retreat();
  restored.returnToSelection();
  restored.enterChapters();
  restored.recruit('warrior');
  restored.balanceAllocation();
  restored.confirmAllocation();
  assert.ok(restored.selectTome('mage_flame_tome'));
  assert.equal(restored.selectTome('rogue_poison_tome'), null);
  assert.equal(restored.state.run.profession, 'warrior');
});
