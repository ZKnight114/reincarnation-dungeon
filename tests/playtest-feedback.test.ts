import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ACTION_SECONDS } from '../src/game';
import { availableItems, cells, runBagCells, validateLayout } from '../src/backpack';
import { parseSave } from '../src/save';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { chapterRoute } from '../src/journey';
import { seed, recruitToConfigure, start, positionEvent, setEnemy } from './helpers';

test('random starters persist both batches, allow duplicates and overflow, and guarantee a usable own-class weapon', () => {
  const plans = new Set<string>();
  for (const profession of ['warrior', 'mage', 'rogue'] as const)
    for (let n = 0; n < 30; n++) {
      const g = new Game(undefined, seed(n));
      recruitToConfigure(g, 1, profession);
      assert.equal(g.startRun(), null);
      g.continueJourney();
      const plan = g.state.run.starterPlan!;
      plans.add(JSON.stringify(plan));
      assert.equal(plan.flat().length, 6);
      assert.ok(plan.flat().every((id) => availableItems(profession).some((d) => d.id === id)));
      assert.ok(
        plan
          .flat()
          .some(
            (id) =>
              availableItems(profession).find((d) => d.id === id)!.slot === 'weapon' &&
              cells({ templateId: id }).length === 2,
          ),
      );
      const resumed = new Game(parseSave(JSON.stringify(g.state)), () => 0.999);
      resumed.claimStarterRound();
      assert.deepEqual(
        resumed.state.run.starterOffers.map((i) => i.templateId),
        plan[1],
      );
      resumed.claimStarterRound();
      assert.equal(resumed.state.inventory.length, 6);
      assert.doesNotThrow(() => parseSave(JSON.stringify(resumed.state)));
    }
  assert.ok(plans.size > 50);
  const same = new Game(undefined, () => 0);
  recruitToConfigure(same);
  same.startRun();
  same.continueJourney();
  assert.ok(new Set(same.state.run.starterPlan!.flat()).size < 6);
});

test('a foreign tome supplies just one of six starting gifts, without changing the profession', () => {
  for (let n = 0; n < 25; n++) {
    const g = new Game(undefined, seed(n));
    recruitToConfigure(g);
    g.selectTome('mage_flame_tome');
    g.startRun();
    g.continueJourney();
    g.claimStarterRound();
    g.claimStarterRound();
    assert.equal(g.state.inventory.filter((i) => i.profession === 'mage').length, 1);
    assert.ok(
      g.state.inventory.filter((i) => i.profession === 'mage').every((i) => i.branch === 'flame'),
    );
    assert.equal(g.state.run.profession, 'warrior');
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
});

test('Boss loot remains through ritual, then recycles once at the next node before resonance and journey', () => {
  let g = start();
  const node = chapterRoute(4).trials[0];
  positionEvent(g, 'boss', node);
  setEnemy(g, { hp: 0 });
  const realm = g.state.run.realm,
    count = g.state.inventory.length;
  g.update(0.01);
  assert.equal(g.state.phase, 'camp');
  assert.equal(g.state.run.pendingPromotion, true);
  assert.equal(g.state.run.realm, realm);
  assert.equal(g.state.inventory.length, count + 3);
  const loose = g.looseItems().map((i) => i.id),
    points = g.state.run.points;
  g = new Game(parseSave(JSON.stringify(g.state)), seed(11));
  assert.equal(g.continueCamp(), null);
  assert.equal(g.state.phase, 'awakening');
  assert.equal(g.state.run.realm, realm + 1);
  assert.equal(g.state.run.index, node);
  assert.deepEqual(
    g.looseItems().map((i) => i.id),
    loose,
  );
  assert.equal(g.state.run.points, points);
  const hp = g.state.player.hp,
    growth = structuredClone(g.state.run.growth),
    choices = structuredClone(g.state.run.rewards);
  g = new Game(parseSave(JSON.stringify(g.state)), seed(22));
  g.update(99);
  assert.equal(g.state.player.hp, hp);
  assert.deepEqual(g.state.run.growth, growth);
  assert.deepEqual(g.state.run.rewards, choices);
  assert.equal(g.finishAwakening(), true);
  assert.equal(g.finishAwakening(), false);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  assert.equal(g.state.run.index, node + 1);
  assert.equal(g.looseItems().length, 0);
  assert.equal(g.state.run.points, points + loose.length);
  assert.equal(g.chooseReward(0), null);
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.run.index, node + 1);
  assert.equal(g.looseItems().length, 0);
  assert.equal(g.state.run.points, points + loose.length);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});

function durableFight() {
  const g = start();
  g.continueCamp();
  g.continueJourney();
  setEnemy(g, { hp: 100000, maxHp: 100000, attack: 0, speed: 1 });
  g.state.combat.order = ['hero', 'enemy'];
  return g;
}

test('actual hero sources resolve in separate steps and the enemy waits for the whole queue', () => {
  const g = durableFight(),
    runtime = g.state.combat.runtime!;
  g.update(ACTION_SECONDS);
  assert.ok(runtime.heroTurn);
  assert.equal(runtime.heroActions, 1);
  assert.equal(runtime.enemyActions, 0);
  const first = JSON.stringify(g.state.combat.contributions);
  g.update(0.1);
  assert.equal(JSON.stringify(g.state.combat.contributions), first);
  const seen = new Set<string>();
  while (runtime.heroTurn) {
    assert.equal(g.nextActor(), 'hero');
    g.update(0.35);
    seen.add(JSON.stringify(g.state.combat.contributions));
    assert.equal(runtime.enemyActions, 0);
  }
  assert.ok(seen.size >= 3, 'several separate applications, not precomputed damage');
  g.update(ACTION_SECONDS);
  assert.equal(runtime.enemyActions, 1);
});

test('mid-source save resumes the exact queue, dependencies and integral cooldowns', () => {
  const a = durableFight();
  a.update(1.13);
  assert.ok(a.state.combat.runtime!.heroTurn);
  const b = new Game(parseSave(JSON.stringify(a.state)), seed(5));
  for (let n = 0; n < 100; n++) {
    a.update(0.1);
    b.update(0.1);
  }
  assert.deepEqual(b.state.combat, a.state.combat);
  assert.deepEqual(b.state.player, a.state.player);
  assert.deepEqual(b.state.enemy, a.state.enemy);
  const invalid = structuredClone(a.state);
  invalid.combat.runtime!.heroTurn = { index: 1000, tomeFired: false, supportFired: false };
  assert.throws(() => parseSave(JSON.stringify(invalid)));
});

test('skip, 1/2/4x, frame size and synchronous estimates drain identical real combat', () => {
  const initial = durableFight().state;
  setEnemy(new Game(initial), { hp: 100, maxHp: 100, attack: 5 });
  const results: unknown[] = [];
  for (const [speed, skip, delta] of [
    [1, false, 0.016],
    [2, false, 0.1],
    [4, false, 0.25],
    [1, true, 0.25],
  ] as const) {
    const g = new Game(parseSave(JSON.stringify(initial)), seed(123));
    g.state.speed = speed;
    g.state.skipCombat = skip;
    for (let n = 0; n < 10000 && g.state.phase === 'combat'; n++) g.update(delta * speed);
    assert.equal(g.state.phase, 'camp');
    results.push({
      hp: g.state.player.hp,
      rounds: g.state.lastReport!.rounds,
      contributions: g.state.lastReport!.items,
    });
  }
  const manual = new Game(parseSave(JSON.stringify(initial)), seed(123));
  while (manual.state.phase === 'combat') manual.advanceTurn();
  results.push({
    hp: manual.state.player.hp,
    rounds: manual.state.lastReport!.rounds,
    contributions: manual.state.lastReport!.items,
  });
  results.slice(1).forEach((r) => assert.deepEqual(r, results[0]));
});

test('lethal first source cancels later items', () => {
  const stats = { attack: 100, hp: 100, defense: 0, speed: 10 };
  const signals: string[] = [];
  const runtime = battleRuntime(
    fighter(stats, 'warrior'),
    fighter({ ...stats, hp: 10 }, 'mage'),
    [
      {
        id: 'second',
        name: 'second',
        kind: 'item',
        skills: [{ cooldown: 2, actions: [{ kind: 'damage', a: 1 }] }],
      },
      {
        id: 'first',
        name: 'first',
        kind: 'item',
        skills: [{ cooldown: 2, actions: [{ kind: 'damage', a: 1 }] }],
      },
    ],
    'slime',
  );
  const engine = new BattleEngine(runtime, 1, (s) => signals.push(s.source));
  engine.beginHeroTurn();
  engine.nextHeroSource();
  assert.equal(runtime.enemy.hp, 0);
  assert.equal(runtime.heroTurn, null);
  assert.ok(signals.includes('second'));
  assert.ok(!signals.includes('first'));
});

test('support, attack, tome and dependent resonance fire in that order, with identical drain results', () => {
  const stats = { attack: 10, hp: 100, defense: 0, speed: 10 };
  const sources: Parameters<typeof battleRuntime>[2] = [
    {
      id: 'res',
      name: 'res',
      kind: 'resonance',
      skills: [
        { trigger: 'support', cooldown: 0, actions: [{ kind: 'shield', a: 1 }] },
        { trigger: 'tome', cooldown: 0, actions: [{ kind: 'damage', a: 1 }] },
      ],
    },
    {
      id: 'book',
      name: 'book',
      kind: 'tome',
      skills: [{ cooldown: 2, actions: [{ kind: 'damage', a: 1 }] }],
    },
    {
      id: 'blade',
      name: 'blade',
      kind: 'item',
      skills: [{ cooldown: 2, actions: [{ kind: 'damage', a: 1 }] }],
    },
    {
      id: 'support',
      name: 'support',
      kind: 'item',
      family: 'support',
      skills: [{ cooldown: 2, actions: [{ kind: 'shield', a: 1 }] }],
    },
  ];
  const a = battleRuntime(
    fighter(stats, 'warrior'),
    fighter({ ...stats, hp: 1000 }, 'warrior'),
    sources,
    'slime',
  );
  const b = structuredClone(a),
    fired: string[] = [];
  const stepped = new BattleEngine(a, 1, (s) => {
    if (s.kind === 'trigger') fired.push(s.source);
  });
  stepped.beginHeroTurn();
  stepped.nextHeroSource();
  assert.equal(a.hero.shield, 10);
  assert.equal(a.enemy.hp, 1000);
  const restored = JSON.parse(JSON.stringify(a));
  const resumed = new BattleEngine(restored, 1, (s) => {
    if (s.kind === 'trigger') fired.push(s.source);
  });
  while (restored.heroTurn) resumed.nextHeroSource();
  new BattleEngine(b, 1).heroTurn();
  assert.deepEqual(restored, b);
  assert.deepEqual(fired, ['support', 'blade', 'book', 'res', 'res']);
});

test('retiring on won Boss loot preserves the earned stage and a valid graduate, without duplicate reward', () => {
  const g = start();
  positionEvent(g, 'boss', chapterRoute(4).trials[0]);
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  assert.equal(g.state.run.pendingPromotion, true);
  assert.equal(g.retreat(), true);
  assert.equal(g.state.run.pendingPromotion, false);
  assert.equal(g.state.meta.heroes[0].stages, 1);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  assert.equal(g.retreat(), false);
});
