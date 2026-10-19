import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { BattleEngine, battleRuntime, damageValue, fighter } from '../src/combat';
import { Game, ACTION_SECONDS } from '../src/game';
import { COMBAT_PACING } from '../src/combat-pacing';
import { parseSave } from '../src/save';
import { UI } from '../src/ui';
import type { BattleSignal } from '../src/combat';
import type { Source } from '../src/skill-types';
import { start, positionEvent, setEnemy } from './helpers';

const model = (id: string, sources: Source[] = []) =>
  battleRuntime(
    fighter({ attack: 20, hp: 1000, defense: 10, speed: 12 }, 'warrior'),
    fighter({ attack: 20, hp: 10000, defense: 10, speed: 10 }, 'rogue'),
    sources,
    id,
  );
function wolfFight() {
  const g = start();
  positionEvent(g, 'battle');
  setEnemy(g, {
    templateId: 'wolf',
    species: 11,
    profession: 'rogue',
    hp: 10000,
    maxHp: 10000,
    attack: 20,
    speed: 1,
  });
  const r = g.state.combat.runtime!;
  r.enemyId = 'wolf';
  r.enemyActions = 2;
  g.state.combat.order = ['enemy', 'hero'];
  return g;
}

test('wolf double strike loses HP in two separate steps, counts one turn, expires once and matches its formula', () => {
  const r = model('wolf'),
    signals: BattleSignal[] = [];
  r.enemyActions = 2;
  r.hero.statuses.push({ kind: 'break', source: 'test', value: 0.1, remaining: 2 });
  r.enemy.statuses.push({ kind: 'chill', source: 'test', value: 0.1, remaining: 2 });
  const e = new BattleEngine(r, 1, (s) => signals.push(s));
  const hit = damageValue(13, 'physical', 9, 'rogue', 'warrior');
  e.beginEnemyTurn();
  assert.equal(r.enemyActions, 3);
  assert.equal(r.hero.hp, 1000);
  e.nextEnemyStep();
  assert.ok(Math.abs(r.hero.hp - (1000 - hit)) < 1e-6);
  assert.equal(r.enemyTurn!.index, 1);
  assert.equal(r.hero.statuses[0].remaining, 2);
  e.nextEnemyStep();
  assert.ok(Math.abs(r.hero.hp - (1000 - 2 * hit)) < 1e-6);
  assert.equal(r.enemyTurn, null);
  assert.equal(r.hero.statuses[0].remaining, 2);
  assert.equal(r.enemy.statuses[0].remaining, 1);
  assert.equal(signals.filter((s) => s.kind === 'activation').length, 2);
});

test('mid-enemy save continues only the second hit and rejects forged or conflicting cursors', () => {
  const g = wolfFight();
  g.update(ACTION_SECONDS);
  assert.equal(g.state.combat.runtime!.enemyTurn!.index, 1);
  const hp = g.state.player.hp;
  const saved = parseSave(JSON.stringify(g.state));
  const resumed = new Game(structuredClone(saved));
  for (const dt of [0.1, 0.2]) {
    g.update(dt);
    resumed.update(dt);
  }
  assert.deepEqual(resumed.state.combat, g.state.combat);
  assert.equal(resumed.state.player.hp, g.state.player.hp);
  assert.ok(resumed.state.player.hp < hp);
  assert.equal(resumed.state.combat.runtime!.enemyActions, 3);
  assert.equal(resumed.state.combat.runtime!.enemyTurn, null);
  for (const edit of [
    (s: any) => {
      s.combat.runtime.enemyTurn.index = 50;
    },
    (s: any) => {
      s.combat.runtime.enemyTurn.minions = ['minion:99'];
    },
    (s: any) => {
      s.combat.runtime.heroTurn = { index: 0, tomeFired: false, supportFired: false };
    },
  ]) {
    const bad = structuredClone(saved);
    edit(bad);
    assert.throws(() => parseSave(JSON.stringify(bad)));
  }
});

test('lethal retaliation after the first enemy hit cancels the second, while DOT death prevents the whole attack', () => {
  const r = model('wolf', [{ id: 'counter', name: 'counter', kind: 'item', skills: [] }]);
  r.enemyActions = 2;
  r.enemy.hp = 1;
  r.charges['counter:counter'] = 1;
  r.flags['counter:counter'] = 100;
  const signals: BattleSignal[] = [];
  const e = new BattleEngine(r, 1, (s) => signals.push(s));
  e.beginEnemyTurn();
  e.nextEnemyStep();
  assert.equal(r.enemy.hp, 0);
  assert.equal(r.enemyTurn, null);
  assert.equal(signals.filter((s) => s.kind === 'activation').length, 1);
  const dot = model('wolf');
  dot.enemy.hp = 1;
  dot.enemy.statuses.push({ kind: 'poison', value: 5, remaining: 2, source: 'poison' });
  const emitted: BattleSignal[] = [];
  new BattleEngine(dot, 1, (s) => emitted.push(s)).enemyTurn();
  assert.equal(dot.enemyActions, 0);
  assert.equal(dot.hero.hp, 1000);
  assert.equal(
    emitted.some((s) => s.kind === 'activation'),
    false,
  );
});

test('boss and active minions resolve separately; hatching does not give a newborn an immediate attack', () => {
  const r = model('queen'),
    emitted: BattleSignal[] = [];
  r.enemyActions = 4;
  r.minions = [1, 2].map((n) => ({
    ...fighter({ attack: 20, hp: 500, defense: 10, speed: 10 }, 'rogue'),
    id: 'minion:' + n,
    activeAt: 5,
  }));
  r.summons = 2;
  const e = new BattleEngine(r, 1, (s) => emitted.push(s));
  e.beginEnemyTurn();
  const hp: number[] = [r.hero.hp];
  while (r.enemyTurn) {
    e.nextEnemyStep();
    hp.push(r.hero.hp);
  }
  assert.equal(hp.length, 4);
  assert.ok(hp.every((n, i) => i === 0 || n < hp[i - 1]));
  assert.deepEqual(
    emitted.filter((s) => s.kind === 'activation').map((s) => s.source),
    ['enemy:queen', 'minion:1', 'minion:2'],
  );
  const newborn = model('queen'),
    signals: BattleSignal[] = [];
  newborn.enemyActions = 3;
  new BattleEngine(newborn, 1, (s) => signals.push(s)).enemyTurn();
  assert.equal(newborn.minions[0].activeAt, 5);
  assert.equal(signals.filter((s) => s.kind === 'activation').length, 1);
});

test('cooling items have no timed beats, still tick once and keep support before attack before tome', () => {
  const source = (id: string, kind: Source['kind'], action: 'damage' | 'shield'): Source => ({
    id,
    name: id,
    kind,
    skills: [{ cooldown: 3, actions: [{ kind: action, a: 0.1 }] }],
  });
  const r = model('wolf', [
    source('blade', 'item', 'damage'),
    source('cooling', 'item', 'damage'),
    source('book', 'tome', 'damage'),
    source('guard', 'item', 'shield'),
  ]);
  r.timers['cooling:0'] = 3;
  const fired: string[] = [];
  const e = new BattleEngine(r, 1, (s) => {
    if (s.kind === 'activation') fired.push(s.source);
  });
  e.beginHeroTurn();
  e.nextHeroBeat();
  assert.deepEqual(fired, ['guard']);
  e.nextHeroBeat();
  assert.deepEqual(fired, ['guard', 'blade']);
  e.nextHeroBeat();
  assert.deepEqual(fired, ['guard', 'blade', 'book']);
  assert.equal(r.timers['cooling:0'], 2);
  assert.equal(r.heroTurn, null);
});

test('live frame mode resolves at most one enemy hit, while skip and offline simulation drain all steps', () => {
  const g = wolfFight();
  g.update(10, 1);
  assert.equal(g.state.combat.runtime!.enemyTurn!.index, 1);
  assert.equal(g.state.combat.runtime!.enemyActions, 3);
  const resumed = new Game(parseSave(JSON.stringify(g.state)));
  resumed.advanceTurn();
  assert.equal(resumed.state.combat.runtime!.enemyTurn, null);
  assert.equal(resumed.state.combat.runtime!.enemyActions, 3);
  const auto = new Game(parseSave(JSON.stringify(g.state)));
  auto.update(COMBAT_PACING.attack);
  assert.equal(auto.state.player.hp, resumed.state.player.hp);
});

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  for (const [, name] of main.matchAll(/import '\.\/([^']+)\.css';/g)) {
    const style = win.document.createElement('style');
    style.textContent = readFileSync(new URL('../src/' + name + '.css', import.meta.url), 'utf8');
    win.document.head.append(style);
  }
});
afterEach(() => win.happyDOM.close());

test('each real enemy hit animates once, replaces the old hurt number and does not replay on redraw', () => {
  const g = wolfFight(),
    ui = new UI(g, () => {});
  g.update(ACTION_SECONDS);
  ui.render();
  assert.equal(
    document
      .querySelector('.enemy-fighter.acting .actor-rig')
      ?.getAttribute('data-activation-source'),
    'enemy:wolf',
  );
  const first = document.querySelector('.combat-number.hurt');
  assert.ok(first);
  g.update(COMBAT_PACING.attack);
  ui.render();
  assert.equal(document.querySelectorAll('.combat-number.hurt').length, 1);
  assert.notEqual(document.querySelector('.combat-number.hurt'), first);
  const number = document.querySelector('.combat-number.hurt');
  ui.render();
  assert.equal(document.querySelector('.combat-number.hurt'), number);
});

test('pure boss preparation never attacks and melee hits do not create a projectile', () => {
  const g = wolfFight();
  setEnemy(g, { templateId: 'queen', species: 19, profession: 'rogue' });
  g.state.combat.runtime!.enemyId = 'queen';
  g.state.combat.runtime!.enemyActions = 2;
  const ui = new UI(g, () => {});
  g.update(ACTION_SECONDS);
  ui.render();
  assert.equal(document.querySelector('.enemy-fighter')!.classList.contains('acting'), false);
  assert.match(g.state.combat.runtime!.warning, /孵化/);
  const melee = wolfFight();
  document.getElementById('app')!.replaceChildren();
  const meleeUI = new UI(melee, () => {});
  melee.state.combat.order = ['hero', 'enemy'];
  melee.update(ACTION_SECONDS);
  meleeUI.render();
  assert.equal(document.querySelector('.combat-projectile'), null);
});
