import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { parseSave, SAVE_KEY } from '../src/save';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { statusRows, statusDetails } from '../src/battle-status';
import { trialView } from '../src/trial-ui';
import { heroRig } from '../src/pixel';
import { recruitAppearance, validAppearance, appearanceLayers } from '../src/character-parts';
import { TALENTS } from '../src/hero';
import { start, positionEvent, setEnemy, seed } from './helpers';
import { chapterRoute, TRIALS } from '../src/journey';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
    innerWidth: 390,
    innerHeight: 844,
  });
  win.document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => win.happyDOM.close());
const click = (selector: string) => {
  const el = win.document.querySelector(selector);
  assert.ok(el, selector);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};

test('trial tier selection previews frozen boss and changes no game state until challenge', () => {
  const g = start();
  positionEvent(g, 'boss', chapterRoute(4).trials[0]);
  g.state.phase = 'event';
  g.state.enemy = null;
  g.state.run.trials[0] = null;
  const ui = new UI(g, () => {}),
    before = JSON.stringify(g.state);
  assert.equal(win.document.querySelectorAll('[data-trial-tier]').length, 3);
  const frozen = structuredClone(g.state.run.encounter!);
  click('[data-trial-tier="2"]');
  assert.equal(
    JSON.stringify(g.state),
    before.replace(/"lastSaveTime":\d+/, `"lastSaveTime":${g.state.lastSaveTime}`),
  );
  assert.ok(win.document.querySelector('[data-trial-tier="2"][aria-checked="true"]'));
  assert.ok(win.document.querySelector('.trial-risk')!.textContent!.includes('×' + TRIALS[2].hp));
  click('[data-action="challenge-trial"]');
  assert.equal(g.state.phase, 'combat');
  assert.equal(g.state.run.trials[0], 2);
  assert.equal(g.state.enemy!.templateId, frozen.templateId);
  assert.equal(g.state.enemy!.maxHp, Math.round(frozen.maxHp * TRIALS[2].hp));
  ui.render();
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});

test('promotion crosses one small node before resonance, reload preserves choices and journey stays at that node', () => {
  let g = start();
  const node = chapterRoute(4).trials[0];
  positionEvent(g, 'boss', node);
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  g.continueCamp();
  const loose = g.looseItems().length,
    points = g.state.run.points,
    growth = structuredClone(g.state.run.growth);
  assert.equal(g.state.run.index, node);
  g.finishAwakening();
  assert.equal(g.state.run.index, node + 1);
  assert.equal(g.state.run.points, points + loose);
  const choices = structuredClone(g.state.run.rewards);
  g = new Game(parseSave(JSON.stringify(g.state)), seed(3));
  assert.deepEqual(g.state.run.rewards, choices);
  assert.equal(g.finishAwakening(), false);
  assert.equal(g.chooseReward(0), null);
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.run.index, node + 1);
  assert.deepEqual(g.state.run.growth, growth);
  assert.equal(g.state.run.points, points + loose);
  const current = g.currentEvent()!;
  assert.equal(current.completed, false);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  const forged = structuredClone(g.state);
  forged.run.resonanceAtNode = true;
  assert.throws(() => parseSave(JSON.stringify(forged)));
});

test('talent chips show only name and quality, click toggles anchored description and outside click closes it', () => {
  const g = new Game(undefined, seed(19));
  g.enterChapters();
  g.recruit('mage');
  const ui = new UI(g, () => {});
  const key = g.state.run.trainee!.talents[0],
    chip = win.document.querySelector(`[data-inspect-talent="${key}"]`)!;
  assert.equal(win.document.querySelectorAll('[data-inspect-talent]').length, 4);
  assert.equal(chip.querySelector('p'), null);
  click(`[data-inspect-talent="${key}"]`);
  assert.match(
    win.document.querySelector('[role="tooltip"]')!.textContent!,
    new RegExp(TALENTS[key].name),
  );
  assert.equal(
    win.document.querySelector('[role="tooltip"] p')!.textContent,
    TALENTS[key].description,
  );
  assert.equal(chip.getAttribute('aria-expanded'), 'true');
  ui.render();
  assert.ok(win.document.querySelector('[role="tooltip"]'));
  click('[data-action="balance-allocation"]');
  assert.equal(win.document.querySelector('[role="tooltip"]'), null);
});

test('combat uses live HP-adjacent icon lists, retains matchup calculation and limits floating text to HP changes', () => {
  const g = start();
  positionEvent(g, 'battle');
  const r = g.state.combat.runtime!;
  r.hero.shield = 27;
  g.state.player.shield = 27;
  r.hero.statuses = [{ kind: 'chill', source: 'enemy', remaining: 2, value: 0.2 }];
  r.enemy.shield = 16;
  const ui = new UI(g, () => {});
  assert.equal(win.document.querySelector('.enemy-inspect'), null);
  assert.ok(win.document.querySelector('.fighter-health [data-status-side="hero"]'));
  assert.ok(win.document.querySelector('.fighter-health [data-status-side="enemy"]'));
  click('[data-status-side="hero"]');
  assert.match(win.document.querySelector('#modal-body')!.textContent!, /27 点/);
  assert.match(win.document.querySelector('#modal-body')!.textContent!, /速度降低 20%/);
  r.hero.shield = 7;
  g.state.player.shield = 7;
  ui.render();
  assert.match(win.document.querySelector('#modal-body')!.textContent!, /7 点/);
  g.feedback.push(
    { serial: 100, id: 'hero', kind: 'blocked', amount: 12 },
    { serial: 101, id: 'hero', kind: 'hurt', amount: 3 },
    { serial: 102, id: 'enemy:bat', kind: 'healing', amount: 5 },
  );
  ui.render();
  assert.equal(win.document.querySelector('.combat-number.blocked'), null);
  assert.equal(win.document.querySelector('.hero-fighter .combat-number.hurt')!.textContent, '−3');
  assert.equal(win.document.querySelector('.enemy-fighter .combat-number.heal')!.textContent, '+5');
});

test('status lists show summed DOT strengths, remaining turns, minions, warning and actual enrage', () => {
  const g = start();
  positionEvent(g, 'battle');
  const r = g.state.combat.runtime!;
  r.enemy.statuses = [
    { kind: 'poison', source: 'a', value: 9, remaining: 3 },
    { kind: 'poison', source: 'b', value: 11, remaining: 1 },
  ];
  r.warning = '下次行动：吐息';
  g.state.combat.round = 16;
  const rows = statusRows(g.state, 'enemy');
  assert.match(rows.find((x) => x.kind === 'poison')!.detail!, /剩余 3 回合.*剩余 1 回合/);
  assert.match(statusDetails(g.state, 'enemy'), /伤害 \+20%/);
  assert.match(statusDetails(g.state, 'enemy'), /下次行动：吐息/);
});

test('new appearances vary by gender/parts, are independent of gameplay random and persist through save and graduation', () => {
  const looks = Array.from({ length: 80 }, (_, n) => recruitAppearance('hero-' + n));
  assert.equal(new Set(looks.map((a) => a.gender)).size, 2);
  assert.ok(new Set(looks.map((a) => JSON.stringify(a))).size > 60);
  for (const a of looks) {
    assert.ok(validAppearance(a));
    assert.equal(appearanceLayers('warrior', a).length, 6);
  }
  const g = start(),
    appearance = structuredClone(g.state.run.trainee!.appearance!);
  assert.ok(validAppearance(appearance));
  assert.ok(!heroRig('warrior', appearance).includes('actor-sprite'));
  g.state = new Game(parseSave(JSON.stringify(g.state))).state;
  assert.deepEqual(g.state.run.trainee!.appearance, appearance);
  g.retreat();
  assert.deepEqual(g.state.meta.heroes[0].appearance, appearance);
  const broken = structuredClone(g.state);
  broken.meta.heroes[0].appearance!.hair = 8;
  assert.throws(() => parseSave(JSON.stringify(broken)));
  const legacy = structuredClone(g.state);
  delete legacy.meta.heroes[0].appearance;
  delete legacy.run.trainee!.appearance;
  assert.doesNotThrow(() => parseSave(JSON.stringify(legacy)));
  assert.ok(heroRig('warrior').includes('actor-sprite'));
  const manifest = JSON.parse(
    readFileSync(new URL('../src/assets/characters/manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.layers.length, 60);
  for (const part of manifest.layers) {
    const png = readFileSync(new URL('../src/assets/characters/' + part + '.png', import.meta.url));
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 192);
  }
});

test('long robes cover lower garments and rear hair stays behind clothes without changing saved part IDs', () => {
  const a = { version: 1, gender: 'female', head: 2, hair: 6, torso: 3, legs: 1 } as const;
  assert.ok(validAppearance(a));
  const before = structuredClone(a);
  assert.deepEqual(appearanceLayers('mage', a), [
    'characters/hair-back/6',
    'characters/mage/back-3',
    'characters/mage/legs-1',
    'characters/heads/female-2',
    'characters/mage/torso-3',
    'characters/hair/6',
  ]);
  assert.deepEqual(a, before);
  const manifest = JSON.parse(
    readFileSync(new URL('../src/assets/characters/manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.longRobe.garmentSlot, 'torso');
  assert.equal(manifest.longRobe.underlyingSlot, 'legs');
  assert.equal(manifest.appearanceIdVersion, 1);
  assert.equal(manifest.floorY, 182);
  for (const key of appearanceLayers('mage', a)) {
    assert.ok(manifest.layers.includes(key.replace('characters/', '')));
  }
});

test('rear flaps follow the outfit across mixed trousers and all legal layers exist in the manifest', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../src/assets/characters/manifest.json', import.meta.url), 'utf8'),
  );
  for (const job of ['warrior', 'mage', 'rogue'] as const) {
    for (let torso = 0; torso < 4; torso++) {
      for (let legs = 0; legs < 4; legs++) {
        const a = { version: 1, gender: 'female', head: 1, hair: 5, torso, legs } as const;
        const layers = appearanceLayers(job, a);
        assert.equal(layers[1], `characters/${job}/back-${torso}`);
        assert.ok(
          layers.indexOf(`characters/heads/female-1`) <
            layers.indexOf(`characters/${job}/torso-${torso}`),
        );
        for (const key of layers)
          assert.ok(manifest.layers.includes(key.replace('characters/', '')));
      }
    }
  }
});
