import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ACTION_SECONDS, TARGET_RECRUIT_COST } from '../src/game';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_POINTS,
  BASE_ATTRIBUTES,
  heroAttributes,
  pointsSpent,
} from '../src/hero';
import { definition } from '../src/backpack';
import { parseSave } from '../src/save';
import { start, seed, positionEvent, placeFree } from './helpers';

function endless() {
  const g = start();
  g.state.inventory = [g.makeItem('warrior_blade_2', 2)];
  g.state.draft = [];
  placeFree(g, g.state.inventory[0].id);
  advanceCamp(g);
  g.state.enemy!.hp = g.state.enemy!.maxHp = 1e8;
  g.state.enemy!.attack = 0;
  return g;
}

test('chapter selector defaults to latest unlocked dungeon and navigation cannot recruit or cross boundaries', () => {
  const g = new Game();
  g.state.meta.highestChapter = 7;
  g.enterChapters();
  assert.equal(g.state.run.chapter, 7);
  assert.equal(g.chooseChapter(8), false);
  assert.equal(g.chooseChapter(0), false);
  assert.equal(g.chooseChapter(6), true);
  assert.equal(g.state.phase, 'chapter');
  assert.equal(g.state.run.trainee, null);
  g.backHome();
  g.enterChapters();
  assert.equal(g.state.run.chapter, 7);
});
test('basic recruitment samples all three professions while targeted recruitment guarantees one and costs twenty', () => {
  for (const [roll, profession] of [
    [0.1, 'warrior'],
    [0.4, 'mage'],
    [0.8, 'rogue'],
  ] as const) {
    const g = new Game(undefined, () => roll);
    g.enterChapters();
    assert.equal(g.recruit(), null);
    assert.equal(g.state.run.trainee!.profession, profession);
    assert.equal(g.state.meta.energy.value, 50);
  }
  for (const profession of ['warrior', 'mage', 'rogue'] as const) {
    const g = new Game(undefined, seed(1));
    g.enterChapters();
    assert.equal(g.recruit(profession), null);
    assert.equal(g.state.run.profession, profession);
    assert.equal(g.state.run.trainee!.recruitment, 'targeted');
    assert.equal(g.state.meta.energy.value, 60 - TARGET_RECRUIT_COST);
    assert.equal(g.state.meta.gold, 100);
  }
  const poor = new Game();
  poor.state.meta.energy.value = 19;
  poor.enterChapters();
  assert.match(poor.recruit('mage')!, /20/);
  assert.equal(poor.state.meta.energy.value, 19);
  assert.equal(poor.state.run.trainee, null);
  assert.ok(poor.recruit('bad' as any));
  assert.equal(poor.state.meta.energy.value, 19);
});
test('four stable talents and twelve allocation points survive navigation and restore without a free reroll', () => {
  let g = new Game(undefined, seed(3));
  g.enterChapters();
  g.recruit('rogue');
  const original = structuredClone(g.state.run.trainee!);
  assert.equal(original.talents.length, 4);
  assert.equal(new Set(original.talents).size, 4);
  assert.match(g.startRun()!, /12/);
  for (let n = 0; n < 12; n++) assert.equal(g.allocate('speed', 1), null);
  assert.ok(g.allocate('attack', 1));
  assert.ok(g.allocate('hp', -1));
  const planned = structuredClone(g.state.run.trainee!);
  g.enterChapters();
  g.backHome();
  g = new Game(parseSave(JSON.stringify(g.state)), seed(55));
  g.enterChapters();
  g.resumeRecruit();
  assert.deepEqual(g.state.run.trainee, planned);
  assert.equal(g.state.meta.energy.value, 40);
  assert.equal(g.allocate('speed', -1), null);
  assert.equal(g.allocate('hp', 1), null);
  assert.equal(g.startRun(), null);
  assert.ok(g.allocate('attack', -1));
  assert.deepEqual(g.state.run.trainee!.talents, original.talents);
});
test('allocation changes actual weapon damage, max health, defense and initiative instead of only dossier labels', () => {
  const g = new Game(undefined, seed(19));
  g.enterChapters();
  g.recruit('warrior');
  const base = heroAttributes(g.state.run.trainee, 'warrior', false);
  for (const key of ATTRIBUTE_KEYS) for (let n = 0; n < 3; n++) g.allocate(key, 1);
  const planned = heroAttributes(g.state.run.trainee, 'warrior');
  assert.equal(pointsSpent(g.state.run.trainee!), ATTRIBUTE_POINTS);
  assert.equal(planned.attack, base.attack + 6);
  assert.equal(planned.hp, base.hp + 24);
  assert.equal(planned.defense, base.defense + 3);
  assert.equal(planned.speed, base.speed + 3);
  g.startRun();
  g.claimStarterRound();
  const weapon = g.state.inventory.find((i) => i.slot === 'weapon')!;
  g.placeItem(weapon.id, 1, 1);
  assert.equal(
    g.packAnalysis(true).bonuses[weapon.id].power,
    planned.attack / BASE_ATTRIBUTES.warrior.attack,
  );
  assert.equal(g.state.player.maxHp, planned.hp);
  assert.equal(g.state.player.defense, planned.defense);
  assert.equal(g.playerSpeed(), planned.speed);
});
test('attributes and turn-save schema reject over-budget points, duplicate talents, fractional cooldowns or invalid action order', () => {
  const g = endless();
  const bad = (edit: (s: any) => void) => {
    const s = structuredClone(g.state);
    edit(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  };
  bad((s) => (s.run.trainee.allocation.speed = 13));
  bad((s) => (s.run.trainee.talents[1] = s.run.trainee.talents[0]));
  bad((s) => (s.run.trainee.profession = 'mage'));
  bad((s) => (s.combat.order = ['hero', 'hero']));
  bad((s) => (s.combat.actionIndex = 3));
  bad((s) => (s.combat.elapsed = ACTION_SECONDS));
  bad((s) => (s.combat.timers[s.inventory[0].id] = 0.5));
  bad((s) => (s.combat.timers[s.inventory[0].id] = 3));
  bad((s) => (s.enemy.speed = 0));
});
test('no damage, resource restoration or cooldown progression occurs between discrete actor actions', () => {
  const g = endless();
  g.state.combat.stamina = 0;
  const hp = g.state.enemy!.hp;
  g.update(ACTION_SECONDS / 2);
  assert.equal(g.state.enemy!.hp, hp);
  assert.equal(g.state.combat.stamina, 0);
  assert.deepEqual(g.state.combat.timers, {});
  assert.equal(g.state.combat.lastActor, null);
  g.update(ACTION_SECONDS / 2);
  assert.equal(g.state.combat.lastActor, 'hero');
  assert.ok(g.state.enemy!.hp < hp);
  assert.equal(g.state.combat.round, 1);
});
test('two-round cooldown fires on hero turns 1,3,5 and each actor gets exactly one action per round', () => {
  const g = endless(),
    id = g.state.inventory[0].id;
  assert.equal(definition(g.state.inventory[0]).cooldown, 2);
  const hits: number[] = [];
  for (let n = 0; n < 10; n++) {
    g.advanceTurn();
    if (g.state.combat.lastActor === 'hero') hits.push(g.state.combat.hits[id]);
  }
  assert.deepEqual(hits, [1, 1, 2, 2, 3]);
  assert.equal(g.state.combat.round, 5);
  assert.equal(g.state.combat.actionIndex, 2);
  assert.equal(g.state.run.rounds, 5);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('higher speed acts first and equal speed favors the hero at the next round boundary', () => {
  const g = endless();
  assert.equal(g.state.combat.order[0], 'hero');
  g.state.enemy!.speed = g.playerSpeed() + 1;
  g.advanceTurn();
  g.advanceTurn();
  g.advanceTurn();
  assert.equal(g.state.combat.round, 2);
  assert.equal(g.state.combat.lastActor, 'enemy');
  g.advanceTurn();
  g.state.enemy!.speed = g.playerSpeed();
  g.advanceTurn();
  assert.equal(g.state.combat.round, 3);
  assert.equal(g.state.combat.lastActor, 'hero');
});
test('a fast hero lethal hit cancels the dead enemy turn; a faster enemy lethal hit cancels hero equipment', () => {
  const fast = start();
  advanceCamp(fast);
  fast.state.enemy!.hp = 1;
  const hp = fast.state.player.hp;
  assert.equal(fast.nextActor(), 'hero');
  fast.advanceTurn();
  assert.equal(fast.state.phase, 'camp');
  assert.equal(fast.state.player.hp, hp);
  assert.equal(fast.state.lastReport!.rounds, 1);
  const slow = start();
  slow.state.meta.highestChapter = 20;
  slow.state.run.chapter = 20;
  slow.state.run.trainee!.allocation = { attack: 0, hp: 12, defense: 0, speed: 0 };
  positionEvent(slow, 'boss');
  assert.equal(slow.nextActor(), 'enemy');
  slow.state.player.hp = 1;
  slow.advanceTurn();
  assert.equal(slow.state.phase, 'summary');
  assert.deepEqual(slow.state.lastReport!.items, {});
  assert.equal(slow.state.meta.heroes[0].outcome, 'death');
});
test('poison resolves before the enemy attack and expires after exactly three enemy actions', () => {
  const g = endless(),
    id = g.state.inventory[0].id;
  g.state.run.resonances = [];
  g.state.enemy!.effects = [{ kind: 'poison', damage: 7, remaining: 3, timer: 0, sourceId: id }];
  for (let n = 0; n < 6; n++) g.advanceTurn();
  assert.equal(g.state.enemy!.effects.length, 0);
  const report = g.state.combat.contributions[id],
    weapon = g.state.inventory[0],
    base =
      (weapon.attack * g.packAnalysis().bonuses[id].power * 60) / (60 + g.state.enemy!.defense);
  assert.ok(Math.abs(report.damage - (base * 2 + 21)) < 1e-5);
  const lethal = start();
  lethal.state.meta.highestChapter = 20;
  lethal.state.run.chapter = 20;
  lethal.state.run.trainee!.allocation = { attack: 0, hp: 12, defense: 0, speed: 0 };
  positionEvent(lethal, 'boss');
  lethal.state.enemy!.hp = 1;
  lethal.state.enemy!.effects = [
    { kind: 'burn', damage: 3, remaining: 3, timer: 0, sourceId: lethal.state.inventory[0].id },
  ];
  const hp = lethal.state.player.hp;
  lethal.advanceTurn();
  assert.equal(lethal.state.phase, 'awakening');
  assert.ok(lethal.state.player.hp >= hp);
});
test('chill changes next-round initiative without skipping an action or changing item cooldown', () => {
  const g = start('mage');
  g.state.inventory = [g.makeItem('mage_ice_2', 4)];
  g.state.draft = [];
  placeFree(g, g.state.inventory[0].id);
  g.state.run.resonances = [];
  advanceCamp(g);
  const e = g.state.enemy!;
  e.hp = e.maxHp = 1e8;
  e.attack = 0;
  e.speed = g.playerSpeed() + 1;
  g.advanceTurn();
  g.advanceTurn();
  g.state.run.resonances = ['frost'];
  g.advanceTurn();
  assert.equal(g.state.combat.lastActor, 'enemy');
  g.advanceTurn();
  assert.ok(e.effects.some((x) => x.kind === 'chill'));
  g.advanceTurn();
  assert.equal(g.state.combat.round, 3);
  assert.equal(g.state.combat.lastActor, 'hero');
  assert.equal(g.state.combat.hits[g.state.inventory[0].id], 3);
  assert.equal(g.state.combat.timers[g.state.inventory[0].id], 1);
});
test('pause freezes automatic turns; manual stepping and halfway save restore preserve order and cooldowns', () => {
  const g = endless();
  g.update(0.3);
  g.state.isRunning = false;
  const snapshot = JSON.stringify(g.state.combat);
  g.update(30);
  assert.equal(JSON.stringify(g.state.combat), snapshot);
  g.state.isRunning = true;
  const restored = new Game(parseSave(JSON.stringify(g.state)), seed(7));
  g.update(4);
  restored.update(4);
  assert.deepEqual(restored.state.combat, g.state.combat);
  assert.deepEqual(restored.state.player, g.state.player);
  assert.deepEqual(restored.state.enemy, g.state.enemy);
  g.state.isRunning = false;
  assert.equal(g.advanceTurn(), true);
});
test('different rendering frame sizes produce the same discrete combat decisions', () => {
  const big = endless(),
    small = new Game(parseSave(JSON.stringify(big.state)));
  big.update(7);
  for (let n = 0; n < 140; n++) small.update(0.05);
  assert.equal(big.state.combat.round, small.state.combat.round);
  assert.equal(big.state.combat.actionIndex, small.state.combat.actionIndex);
  assert.deepEqual(big.state.combat.hits, small.state.combat.hits);
  assert.deepEqual(big.state.combat.timers, small.state.combat.timers);
  assert.equal(big.state.enemy!.hp, small.state.enemy!.hp);
  assert.equal(big.state.player.hp, small.state.player.hp);
});
