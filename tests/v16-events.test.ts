import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { chapterRoute, runRoute } from '../src/journey';
import { runBagCells } from '../src/backpack';
import { parseSave } from '../src/save';
import {
  SUPPLY_GRADES,
  supplyChance,
  supplyThreshold,
  WHEEL_SECTORS,
  lifeAmount,
} from '../src/event-rules';
import { prepare, fitStarters, recruitToConfigure, seed, setEnemy, setPlayer } from './helpers';

function fresh(chapter = 4) {
  const g = new Game(undefined, seed(19), () => 1700000000000);
  g.state.meta.highestChapter = chapter;
  recruitToConfigure(g, chapter);
  assert.equal(g.startRun(), null);
  return g;
}
const reload = (g: Game, random = seed(71)) =>
  new Game(parseSave(JSON.stringify(g.state)), random, () => 1700000000000);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

/** Traverse real transitions; only enemy damage is bypassed in event-rule fixtures. */
function step(g: Game) {
  const s = g.state;
  switch (s.phase) {
    case 'camp':
      assert.equal(g.continueCamp(), null);
      break;
    case 'journey':
      assert.equal(g.continueJourney(), true);
      break;
    case 'combat':
      setEnemy(g, { hp: 0 });
      g.update(0.01);
      break;
    case 'awakening':
      assert.equal(g.finishAwakening(), true);
      break;
    case 'reward':
      assert.equal(g.chooseResonance(s.run.rewards[0].resonances[0]), null);
      break;
    case 'event': {
      const kind = g.currentEvent()!.kind;
      if (kind === 'supply') g.update(1);
      else
        assert.equal(
          g.chooseEvent(
            kind === 'boss'
              ? 'trial-0'
              : kind === 'rest'
                ? 'heal'
                : kind === 'dig'
                  ? 'dig-finish'
                  : 'skip',
          ),
          null,
        );
      break;
    }
    default:
      throw new Error(s.phase);
  }
}
function at(index: number, chapter = 4) {
  const g = prepare(fresh(chapter));
  let limit = 200;
  while (
    !(g.state.run.index === index && ['event', 'combat', 'awakening'].includes(g.state.phase)) &&
    --limit
  )
    step(g);
  assert.ok(limit > 0);
  return g;
}

test('departure and ready history survive reload, and two batches grant exactly six starters', () => {
  let g = fresh(1);
  assert.equal(g.state.run.prologue, 'departure');
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.run.starterOffers.length, 0);
  g = reload(g);
  assert.equal(g.continueJourney(), true);
  assert.equal(g.state.run.starterOffers.length, 3);
  g.claimStarterRound();
  g = reload(g);
  g.claimStarterRound();
  assert.equal(g.state.inventory.length, 6);
  assert.equal(g.claimStarterRound(), '起始物品已领取');
  fitStarters(g);
  g.finishOpening();
  g.chooseResonance(g.state.run.rewards[0].resonances[0]);
  assert.equal(g.state.run.prologue, 'ready');
  g = reload(g);
  g.continueJourney();
  assert.equal(g.state.run.resonances.length, 1);
  assert.ok(g.state.run.journey.some((x) => x.title === '整备完成'));
  assert.equal(reload(g).state.phase, 'camp');
});

test('all ten routes preserve three spring/Boss/chest/promotion blocks and shortened onboarding', () => {
  const expected = [18, 24, 28, 32, 32, 32, 32, 32, 32, 32];
  for (let chapter = 1; chapter <= 10; chapter++) {
    const route = chapterRoute(chapter);
    assert.equal(route.normal, expected[chapter - 1]);
    assert.equal(route.trials.length, 3);
    for (const [stage, boss] of route.trials.entries()) {
      assert.equal(route.kinds[boss - 1], 'rest');
      assert.equal(route.kinds[boss], 'boss');
      assert.equal(route.kinds[boss + 1], 'treasure');
      assert.equal(route.kinds[boss + 2], 'promotion');
      assert.equal(route.promotions[stage], boss + 2);
    }
    assert.equal(route.kinds.filter((x) => x === 'promotion').length, 3);
    const tail = route.kinds.slice(route.normal, -1);
    assert.ok(tail.every((x) => x === 'boss'));
  }
});

test('Boss heals immediately, chest costs current life, promotion preserves percentage and next-node resonance runs first', () => {
  let g = at(3, 1);
  g.chooseTrial(2);
  const max = g.state.player.maxHp;
  setPlayer(g, { hp: max * 0.2 });
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  close(g.state.player.hp, max * 0.5);
  close(g.state.lastReport!.lifeAtEnd!, max * 0.2);
  close(g.state.lastReport!.recovery!, max * 0.3);
  assert.equal(g.state.run.stages, 0);
  assert.equal(g.state.run.pendingPromotion, true);
  assert.equal(g.state.inventory.length - g.state.draft.length, 3);
  g = reload(g);
  g.update(5);
  close(g.state.player.hp, max * 0.5);
  g.continueCamp(); // recycles the Boss drops at the next small node
  assert.equal(g.state.run.index, 4);
  assert.equal(g.looseItems().length, 0);
  g.continueJourney();
  const before = g.state.player.hp;
  assert.equal(g.chooseEvent('open'), null);
  close(g.state.player.hp, before * 0.9);
  assert.equal(g.looseItems().length, 3);
  assert.ok(g.chooseEvent('open'));
  g = reload(g);
  g.continueCamp();
  g.continueJourney();
  assert.equal(g.state.phase, 'awakening');
  assert.equal(g.state.run.realm, 1);
  assert.equal(g.state.awakening!.healed, 0);
  close(g.state.player.hp / g.state.player.maxHp, 0.45);
  g = reload(g);
  g.finishAwakening();
  assert.equal(g.state.run.index, 6);
  assert.equal(g.state.phase, 'reward');
  assert.equal(g.state.run.resonanceAtNode, true);
  assert.equal(g.state.run.events[6].completed, false);
  g.chooseResonance(g.state.run.rewards[0].resonances[0]);
  assert.equal(g.state.phase, 'journey');
  g.continueJourney();
  assert.equal(g.state.phase, 'combat');
  assert.equal(g.state.run.resonances.length, 2);
  assert.doesNotThrow(() => reload(g));
});

test('ordinary recovery caps at maximum, never revives and never counts as build healing', () => {
  const g = at(0, 1),
    max = g.state.player.maxHp;
  setPlayer(g, { hp: max * 0.96 });
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  close(g.state.player.hp, max);
  close(g.state.lastReport!.recovery!, max * 0.04);
  assert.equal(
    Object.values(g.state.lastReport!.items).reduce((n, x) => n + x.healing, 0),
    0,
  );
  const dead = at(0, 1);
  setPlayer(dead, { hp: 0 });
  setEnemy(dead, { hp: 0 });
  dead.update(0.01);
  assert.equal(dead.state.phase, 'summary');
  assert.equal(dead.state.run.summary!.outcome, 'death');
  assert.equal(dead.state.lastReport!.recovery, 0);
});

test('wheel interleaves six equal attributes; each outcome pays once and survives mid-spin reload', () => {
  assert.deepEqual(
    WHEEL_SECTORS.map((x) => x.attribute),
    ['hp', 'attack', 'defense', 'hp', 'attack', 'defense'],
  );
  for (let sector = 0; sector < 6; sector++) {
    let g = reload(at(14), () => (sector + 0.5) / 6);
    g.state.player.hp = 0.5; // fractions must not round into a lethal cost
    const old = { ...g.state.player },
      inventory = g.state.inventory.length;
    assert.equal(g.chooseEvent('spin'), null);
    close(g.state.player.hp, old.hp * 0.85);
    assert.equal(g.state.run.wheel!.sector, sector);
    assert.equal(g.finishWheel(), false);
    assert.ok(g.chooseEvent('spin'));
    g.update(1);
    g = reload(g, () => 0.99);
    assert.equal(g.state.run.wheel!.sector, sector);
    close(g.state.player.hp, old.hp * 0.85);
    g.update(3);
    assert.equal(g.finishWheel(), true);
    const ratio = g.state.player.hp / g.state.player.maxHp;
    close(ratio, (old.hp * 0.85) / old.maxHp);
    assert.equal(g.state.inventory.length, inventory);
    const growth = structuredClone(g.state.run.eventGrowth);
    g = reload(g);
    assert.equal(g.finishWheel(), false);
    assert.deepEqual(g.state.run.eventGrowth, growth);
    assert.equal(g.state.run.rewards.length, 0);
  }
});

test('blood chest works below one life and leaving is free', () => {
  assert.equal(lifeAmount(0.001), '不足0.01');
  const g = at(9);
  g.state.player.hp = 0.1;
  g.chooseEvent('open');
  close(g.state.player.hp, 0.09);
  assert.equal(g.looseItems().length, 3);
  const leave = at(9),
    hp = leave.state.player.hp;
  leave.chooseEvent('skip');
  close(leave.state.player.hp, hp);
  assert.equal(leave.looseItems().length, 0);
});

test('supply chances and grades are stage-based, stable across reload and issued only once', () => {
  for (let stage = 0; stage < 3; stage++) {
    const threshold = supplyThreshold(7, stage);
    assert.equal(supplyChance(threshold - 1, threshold), 0);
    assert.equal(supplyChance(threshold, threshold), 0.3);
    assert.equal(supplyChance(threshold * 1.5, threshold), 0.45);
    for (const grades of Object.values(SUPPLY_GRADES[stage])) {
      assert.equal(grades.length, 3);
      assert.ok(grades.every((x: number) => x >= 1 && x <= 3));
    }
  }
  let g = at(2);
  const supply = structuredClone(g.state.run.supply!);
  const inventory = g.state.inventory.length;
  g = reload(g, () => 0.99);
  assert.deepEqual(g.state.run.supply, supply);
  g.update(1);
  const drops = g.looseItems();
  assert.equal(drops.length, 3);
  assert.deepEqual(drops.map((x) => x.level).sort(), [...supply.levels].sort());
  g = reload(g);
  g.update(10);
  assert.equal(g.state.inventory.length, inventory + 3);
  const forged = structuredClone(g.state);
  forged.run.supply!.levels = [4, 4, 4];
  assert.throws(() => parseSave(JSON.stringify(forged)));
});

test('spring maximum-life choice preserves life percentage and last normal fight opens all 42 cells', () => {
  const g = at(2, 1);
  const old = g.state.player.maxHp;
  g.state.player.hp = old * 0.4;
  g.chooseEvent('vigor');
  close(g.state.player.hp / g.state.player.maxHp, 0.4);
  close(g.state.player.maxHp, old * 1.12);
  assert.ok(!g.state.run.journey.some((x) => x.text.includes('不恢复当前生命')));
  const end = at(16, 1);
  step(end);
  assert.equal(runBagCells(end.state).size, 42);
  assert.doesNotThrow(() => reload(end));
});

test('all three supply stages apply explicit low, normal and great grades without rerolling on load', () => {
  for (let stage = 0; stage < 3; stage++)
    for (const result of ['low', 'normal', 'great'] as const) {
      let g = reload(at([2, 12, 20][stage]), () => (result === 'great' ? 0.01 : 0.99));
      delete g.state.run.supply;
      g.state.phase = 'journey';
      const preview = g.heroPreview()!,
        threshold = supplyThreshold(4, stage);
      g.heroPreview = () => ({ ...preview, power: result === 'low' ? threshold - 1 : threshold });
      g.continueJourney();
      assert.equal(g.state.run.supply!.result, result);
      g = reload(g);
      g.update(1);
      assert.deepEqual(
        g
          .looseItems()
          .map((i) => i.level)
          .sort(),
        [...SUPPLY_GRADES[stage][result]].sort(),
      );
      assert.doesNotThrow(() => reload(g));
    }
});

test('flat and random maximum-life choices preserve the paid remaining-life percentage', () => {
  const g = at(1);
  g.currentEvent()!.variant = 2;
  const max = g.state.player.maxHp;
  g.state.player.hp = max * 0.4;
  g.chooseEvent('vigor');
  close(g.state.player.hp / g.state.player.maxHp, 0.4);
  assert.ok(g.state.player.maxHp > max);
  const random = reload(at(1), () => 0.3);
  random.currentEvent()!.variant = 4;
  const old = random.state.player.maxHp,
    hp = old * 0.5;
  random.state.player.hp = hp;
  random.chooseEvent('risk');
  close(random.state.player.hp / random.state.player.maxHp, (hp - Math.ceil(hp * 0.15)) / old);
  assert.ok(random.state.player.maxHp > old);
});

test('retiring between Boss and promotion does not invent a realm increase or duplicate recovery', () => {
  const g = at(3, 1);
  g.chooseTrial(0);
  step(g);
  assert.equal(g.state.run.pendingPromotion, true);
  assert.equal(g.retreat(), true);
  assert.equal(g.state.meta.heroes[0].stages, 0);
  assert.equal(g.state.meta.heroes[0].realm, 0);
  assert.doesNotThrow(() => reload(g));
});
