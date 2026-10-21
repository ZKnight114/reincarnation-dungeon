import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, createState } from '../src/game';
import {
  GUILD_NODES,
  guildBenefits,
  guildConditions,
  medalReward,
  startingRealm,
} from '../src/guild';
import { allocationLimit, pointsSpent } from '../src/hero';
import { finalAttributes } from '../src/backpack';
import { currentHero } from '../src/progression';
import { parseSave } from '../src/save';
import { start, positionEvent } from './helpers';
import { battleRuntime, BattleEngine, fighter } from '../src/combat';
import { itemSkills } from '../src/skills';
import { generateEnemy } from '../src/enemies';
import { itemBadge } from '../src/item-badge';

test('linear route has 90 ordinary nodes, four milestones and exactly the approved totals', () => {
  assert.equal(GUILD_NODES.length, 94);
  assert.equal(GUILD_NODES.filter((n) => n.critical).length, 4);
  assert.equal(
    GUILD_NODES.reduce((sum, n) => sum + n.cost, 0),
    5630,
  );
  assert.deepEqual(guildBenefits(94), {
    attack: 30,
    hp: 300,
    defense: 15,
    attackPercent: 0.3,
    hpPercent: 0.3,
    defensePercent: 0.3,
    points: 4,
  });
  for (let level = 1; level <= 30; level++)
    assert.equal(GUILD_NODES.filter((n) => n.level === level && !n.critical).length, 3);
});
test('single-cell badges contain only profession, while both warrior and rogue swords share the category mark', () => {
  const g = start();
  const gem = itemBadge(g.makeItem('warrior_gem'));
  assert.doesNotMatch(gem, /<path|undefined|阶/);
  assert.match(gem, /<text[^>]*>战<\/text>/);
  assert.doesNotMatch(gem, /data-category/);
  assert.match(itemBadge(g.makeItem('warrior_blade_2')), /data-category="sword"/);
  assert.match(itemBadge(g.makeItem('rogue_assassin_2')), /data-category="sword"/);
  assert.match(itemBadge(g.makeItem('warrior_blade_2')), /<text[^>]*>剑<\/text>/);
  assert.match(itemBadge(g.makeItem('rogue_assassin_2')), /<text[^>]*>刺<\/text>/);
});
test('level unlocks do not give attributes; nodes charge once and enforce order, level and home phase', () => {
  const g = new Game();
  g.state.meta.medals = 30;
  assert.ok(g.buyGuildNode(1));
  assert.equal(g.buyGuildNode(0), null);
  assert.equal(g.state.meta.medals, 26);
  assert.ok(g.buyGuildNode(0));
  g.buyGuildNode(1);
  g.buyGuildNode(2);
  assert.ok(g.buyGuildNode(3));
  g.state.meta.guildHistory = { trained: 1, trials: 3, aRated: 0, sRated: 0 };
  g.state.meta.staminaSpent = 5;
  g.state.meta.wins = 1;
  const benefits = guildBenefits(g.state.meta.guildPurchased);
  assert.equal(g.upgradeGuildAvailable(), null);
  assert.equal(g.state.meta.guildLevel, 3);
  assert.deepEqual(guildBenefits(g.state.meta.guildPurchased), benefits);
  assert.equal(g.buyGuildNode(3), null);
  g.enterChapters();
  assert.ok(g.buyGuildNode(4));
});
test('first two completed apprentices unlock multiple guild levels without chapter requirements', () => {
  const s = createState(),
    g = new Game(s);
  s.meta.staminaSpent = 10;
  s.meta.wins = 2;
  s.meta.guildHistory = { trained: 2, trials: 6, aRated: 0, sRated: 0 };
  assert.equal(g.upgradeGuildAvailable(), null);
  assert.equal(s.meta.guildLevel, 5);
  assert.equal(s.meta.highestChapter, 1);
  assert.equal(guildConditions(s).length, 3);
});
test('chapter determines recruiting realm and ten chapters are the only selectable chapters', () => {
  const g = new Game();
  g.state.meta.guildLevel = 30;
  g.state.meta.highestChapter = 10;
  g.enterChapters();
  assert.equal(g.chooseChapter(11), false);
  assert.equal(g.chooseChapter(10), true);
  assert.equal(g.recruit('warrior'), null);
  assert.equal(g.state.run.realm, 9);
  assert.equal(g.state.run.trainee!.realmStart, 9);
  assert.deepEqual(
    Array.from({ length: 10 }, (_, i) => startingRealm(i + 1)),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});
test('milestones bind extra allocation points at recruitment, including balanced remainder and save round-trip', () => {
  const g = new Game();
  g.state.meta.guildLevel = 5;
  g.state.meta.guildPurchased = GUILD_NODES.filter((n) => n.level <= 5).length;
  g.enterChapters();
  g.chooseChapter(1);
  g.recruit('mage');
  assert.equal(allocationLimit(g.state.run.trainee), 13);
  g.balanceAllocation();
  assert.equal(pointsSpent(g.state.run.trainee!), 13);
  assert.ok(g.allocate('attack', 1));
  g.confirmAllocation();
  assert.equal(g.state.phase, 'tome');
  assert.equal(allocationLimit(parseSave(JSON.stringify(g.state)).run.trainee), 13);
});
test('guild percentages add after all non-guild stats and a running apprentice is insulated from further purchases', () => {
  const g = start();
  const a = finalAttributes(g.state);
  g.state.meta.guildPurchased = 94;
  g.state.meta.guildLevel = 30;
  assert.deepEqual(finalAttributes(g.state), a);
  g.state.run.trainee!.guildBonus = guildBenefits(94);
  const b = finalAttributes(g.state);
  assert.ok(Math.abs(b.attack - (a.attack + 30) * 1.3) < 1e-8);
  assert.ok(Math.abs(b.hp - (a.hp + 300) * 1.3) < 1e-8);
});
test('medal rewards distinguish cleared trials, failure, retreat and optional extension without score farming', () => {
  const s = createState();
  s.run.chapter = 10;
  s.run.trials = [0, 1, 2];
  s.run.stages = 3;
  assert.equal(medalReward(s, 'win'), 88);
  assert.equal(medalReward(s, 'death'), 12);
  assert.equal(medalReward(s, 'retreat'), 6);
  s.run.extreme = true;
  assert.equal(medalReward(s, 'win'), 126);
  assert.equal(medalReward(s, 'death'), 88);
  s.run.extreme = false;
  s.run.stages = 0;
  assert.equal(medalReward(s, 'retreat'), 0);
});
test('real finish pays once, round-trips, increments lifetime outcomes and keeps graduation rating immutable', () => {
  const g = start();
  positionEvent(g, 'graduation');
  g.chooseEvent('graduate');
  const medals = g.state.meta.medals;
  assert.equal(medals, 42);
  assert.equal(g.state.meta.guildHistory.trained, 1);
  assert.equal(g.state.meta.guildHistory.trials, 3);
  assert.equal(g.retreat(), false);
  const saved = parseSave(JSON.stringify(g.state));
  assert.equal(saved.meta.medals, medals);
  const h = structuredClone(saved.meta.heroes[0]);
  const enhanced = currentHero(h, guildBenefits(94));
  assert.ok(enhanced.stats.attack > h.stats.attack);
  assert.equal(enhanced.rating, h.rating);
  assert.deepEqual(saved.meta.heroes[0], h);
  assert.deepEqual(currentHero(enhanced, guildBenefits(94)).stats, enhanced.stats);
});
test('v15.1 migration preserves graduates and active bonuses, starts a fresh unpaid route, and rejects malformed new currencies', () => {
  const g = start(),
    old: any = structuredClone(g.state);
  old.rulesRevision = 1;
  old.meta.guildLevel = 4;
  delete old.meta.medals;
  delete old.meta.guildPurchased;
  delete old.meta.guildHistory;
  delete old.run.trainee.guildBonus;
  delete old.run.trainee.attributePoints;
  const migrated = parseSave(JSON.stringify(old));
  assert.equal(migrated.rulesRevision, 2);
  assert.equal(migrated.meta.medals, 0);
  assert.equal(migrated.meta.guildPurchased, 0);
  assert.ok(Math.abs(migrated.run.trainee!.guildBonus!.attackPercent - 0.15) < 1e-8);
  const corrupt = structuredClone(migrated);
  corrupt.meta.medals = -1;
  assert.throws(() => parseSave(JSON.stringify(corrupt)));
  const future = structuredClone(migrated);
  future.rulesRevision = 3;
  assert.throws(() => parseSave(JSON.stringify(future)), /不支持此规则版本/);
});

test('old unstarted chapters above ten migrate to the tenth chapter without resetting the recruited identity', () => {
  const g = new Game();
  g.enterChapters();
  assert.equal(g.recruit('warrior'), null);
  const old: any = structuredClone(g.state);
  old.rulesRevision = 1;
  old.meta.highestChapter = 12;
  old.run.chapter = 12;
  const name = old.run.trainee.name;
  const talents = old.run.trainee.talents;
  const s = parseSave(JSON.stringify(old));
  assert.equal(s.phase, 'configure');
  assert.equal(s.meta.highestChapter, 10);
  assert.equal(s.run.chapter, 10);
  assert.equal(s.run.realm, 9);
  assert.equal(s.run.trainee!.realmStart, 9);
  assert.equal(s.run.trainee!.name, name);
  assert.deepEqual(s.run.trainee!.talents, talents);
  assert.deepEqual(s.meta.energy, old.meta.energy);
  assert.equal(s.meta.staminaSpent, old.meta.staminaSpent);
});
test('first activation delay remains independent of cooldown and is preserved when resuming mid-battle', () => {
  const stats = { attack: 100, hp: 1000, defense: 0, speed: 10 };
  const r = battleRuntime(
    fighter(stats, 'warrior'),
    fighter({ ...stats, hp: 10000 }, 'mage'),
    [{ id: 'heavy', name: '重剑', kind: 'item', skills: itemSkills('warrior_blade_4', 1) }],
    'reference',
  );
  const engine = new BattleEngine(r, 1);
  engine.heroTurn();
  assert.equal(r.enemy.hp, 10000);
  engine.round = 2;
  engine.heroTurn();
  assert.equal(r.enemy.hp, 10000);
  const resumed = structuredClone(r);
  const next = new BattleEngine(resumed, 3);
  next.heroTurn();
  assert.ok(resumed.enemy.hp < 10000);
  assert.equal(resumed.timers['heavy:0'], 3);
});
test('purchasing guild perks and improving build growth never increases fixed encounter stats', () => {
  const g = start();
  g.state.run.index = 20;
  const low = generateEnemy(g.state, () => 0.2);
  g.state.run.growth.attack += 500;
  g.state.run.growth.hp += 5000;
  g.state.run.peakStrength = 40000;
  assert.deepEqual(
    generateEnemy(g.state, () => 0.2),
    low,
  );
  g.state.meta.guildLevel = 30;
  g.state.meta.guildPurchased = 94;
  assert.deepEqual(
    generateEnemy(g.state, () => 0.2),
    low,
  );
});
