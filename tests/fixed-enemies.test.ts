import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game';
import { ENEMY_TEMPLATES, generateEnemy } from '../src/enemies';
import { chapterRoute, TRIALS } from '../src/journey';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { itemSkills } from '../src/skills';
import { parseSave } from '../src/save';
import { positionEvent, start } from './helpers';
import type { Attributes } from '../src/types';

test('every chapter ignores profession, tome, items, resonance, shield and historical build strength', () => {
  for (let chapter = 1; chapter <= 10; chapter++) {
    for (const index of [0, ...chapterRoute(chapter).trials]) {
      const s = createState();
      s.run.routeRevision = 16;
      s.run.chapter = chapter;
      s.run.kills = 3;
      s.run.index = index;
      const before = generateEnemy(s, () => 0.5);
      s.run.profession = 'rogue';
      s.run.boundTome = { id: 'rogue_shadow_tome', level: 3 };
      s.run.peakStrength = 1e8;
      s.run.growth = { attack: 1000, hp: 20000, defense: 300 };
      s.run.resonances = ['shadow_master'];
      s.inventory = [];
      s.draft = [];
      s.placements = [];
      s.player.hp = 1;
      s.player.maxHp = 30000;
      s.player.shield = 9000;
      s.meta.guildPurchased = 94;
      assert.deepEqual(
        generateEnemy(s, () => 0.5),
        before,
      );
    }
  }
});

test('the same normal species grows steadily by node and across all ten chapter budgets', () => {
  let chapterHp = 0,
    chapterAttack = 0;
  for (let chapter = 1; chapter <= 10; chapter++) {
    const s = createState();
    s.run.routeRevision = 16;
    s.run.chapter = chapter;
    s.run.kills = 3;
    const route = chapterRoute(chapter);
    const first = generateEnemy(s, () => 0.5);
    assert.ok(first.hp > chapterHp && first.attack > chapterAttack);
    chapterHp = first.hp;
    chapterAttack = first.attack;
    let hp = 0,
      attack = 0;
    for (let index = 0; index < route.normal; index++) {
      if (route.kinds[index] !== 'battle') continue;
      s.run.index = index;
      const e = generateEnemy(s, () => 0.5);
      assert.equal(e.templateId, first.templateId);
      assert.ok(e.hp > hp && e.attack > attack);
      assert.ok(Number.isFinite(e.hp) && e.hp > 0 && e.speed >= 1);
      hp = e.hp;
      attack = e.attack;
    }
  }
});

test('three Boss difficulty choices multiply the same frozen encounter and preserve stored battles', () => {
  for (const tier of [0, 1, 2] as const) {
    const g = start();
    positionEvent(g, 'boss', 8);
    const base = structuredClone(g.state.run.encounter!);
    g.state.run.trials[0] = tier;
    g.spawnEnemy();
    assert.equal(g.state.enemy!.maxHp, Math.round(base.maxHp * TRIALS[tier].hp));
    assert.equal(g.state.enemy!.attack, base.attack * TRIALS[tier].attack);
    assert.deepEqual(g.state.run.encounter, base);
  }
  const g = start();
  positionEvent(g, 'battle');
  // Existing pre-update encounters may contain historical values; a reload must not reroll them.
  g.state.run.encounter!.attack *= 1.37;
  g.state.enemy!.attack = g.state.run.encounter!.attack;
  g.state.combat.runtime!.enemy.attack = g.state.enemy!.attack;
  const restored = parseSave(JSON.stringify(g.state));
  assert.deepEqual(restored.run.encounter, g.state.run.encounter);
  assert.equal(restored.combat.runtime!.enemy.attack, g.state.enemy!.attack);
});

test('extra Bosses progress by fixed step rather than player build strength', () => {
  const s = createState();
  s.run.routeRevision = 16;
  s.run.chapter = 10;
  const route = chapterRoute(10);
  let hp = 0,
    attack = 0;
  for (let index = route.extremeStart; index < route.ending; index++) {
    s.run.index = index;
    const e = generateEnemy(s, () => 0.5);
    const t = ENEMY_TEMPLATES.find((t) => t.id === e.templateId)!;
    const baseHp = e.hp / t.multipliers.hp;
    const baseAttack = e.attack / t.multipliers.attack;
    assert.ok(e.isBoss && baseHp > hp && baseAttack > attack);
    hp = baseHp;
    attack = baseAttack;
  }
});

test('stronger stats end the same fixed battle sooner with less life loss', () => {
  const s = createState();
  s.run.routeRevision = 16;
  s.run.chapter = 5;
  s.run.kills = 3;
  const e = generateEnemy(s, () => 0.5);
  const fight = (stats: Attributes) => {
    const r = battleRuntime(
      fighter(stats, 'warrior'),
      fighter({ hp: e.maxHp, attack: e.attack, defense: e.defense, speed: e.speed }, e.profession!),
      [
        {
          id: 'blade',
          name: '训练剑',
          kind: 'item',
          profession: 'warrior',
          skills: itemSkills('warrior_blade_2', 1),
        },
      ],
      e.templateId!,
    );
    const engine = new BattleEngine(r, 1);
    engine.opening();
    while (r.hero.hp > 0 && r.enemy.hp > 0 && engine.round <= 20) {
      engine.heroTurn();
      engine.enemyTurn();
      if (r.enemy.hp > 0 && r.hero.hp > 0) engine.round++;
    }
    return { rounds: engine.round, loss: stats.hp - r.hero.hp, won: r.enemy.hp === 0 };
  };
  const weak = fight({ hp: 500, attack: 70, defense: 8, speed: 15 });
  const strong = fight({ hp: 800, attack: 150, defense: 16, speed: 15 });
  assert.ok(weak.won && strong.won);
  assert.ok(strong.rounds < weak.rounds && strong.loss < weak.loss);
});
