import { advanceCamp } from './helpers';
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { loadSave, parseSave } from '../src/save';
import { start } from './helpers';

let win: Window, game: Game, ui: UI;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
  game = new Game();
  ui = new UI(game, (s) => {
    game = new Game(s);
    ui.replace(game);
  });
});
afterEach(() => win.happyDOM.close());
const el = (q: string) => {
  const node = win.document.querySelector(q);
  assert.ok(node, q);
  return node;
};
const click = (q: string) => {
  const n = el(q);
  n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  if (q === '[data-action="continue"]') {
    win.document
      .querySelector('[data-action="continue-story"]')
      ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
};
function swipe(dx: number, dy = 0, cancel = false) {
  const target = el('[data-chapter-carousel]');
  target.dispatchEvent(
    new win.PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      pointerType: 'touch',
      pointerId: 7,
      clientX: 150,
      clientY: 140,
    }),
  );
  target.dispatchEvent(
    new win.PointerEvent(cancel ? 'pointercancel' : 'pointerup', {
      bubbles: true,
      pointerType: 'touch',
      pointerId: 7,
      clientX: 150 + dx,
      clientY: 140 + dy,
    }),
  );
}

test('single latest chapter navigates with arrows, touch swipes and keyboard without showing a chapter list', () => {
  game.state.meta.highestChapter = 5;
  click('[data-action="chapters"]');
  assert.equal(game.state.run.chapter, 5);
  assert.equal(win.document.querySelectorAll('.dungeon-carousel').length, 1);
  assert.equal(win.document.querySelector('.chapter-grid'), null);
  assert.match(el('.dungeon-caption').textContent, /第 5 关/);
  assert.equal((el('[data-action="next-chapter"]') as any).disabled, true);
  click('[data-action="prev-chapter"]');
  assert.equal(game.state.run.chapter, 4);
  swipe(-80);
  assert.equal(game.state.run.chapter, 5);
  swipe(80, 0, true);
  assert.equal(game.state.run.chapter, 5);
  swipe(80, 130);
  assert.equal(game.state.run.chapter, 5);
  swipe(80);
  assert.equal(game.state.run.chapter, 4);
  el('[data-chapter-carousel]').dispatchEvent(
    new win.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }),
  );
  assert.equal(game.state.run.chapter, 3);
  assert.equal(loadSave()!.run.chapter, 3);
  assert.equal(game.state.meta.energy.value, 60);
});
test('targeted recruiter exposes three choices and opens the correct locked-profession dossier for twenty energy', () => {
  click('[data-action="chapters"]');
  click('[data-recruit-mode="targeted"]');
  assert.equal(
    win.document.querySelectorAll('.profession-targets button[data-profession]').length,
    3,
  );
  click('[data-profession="mage"]');
  assert.match(el('#recruit-button').textContent, /法师.*20/);
  click('[data-action="recruit"]');
  assert.equal(game.state.phase, 'configure');
  assert.equal(game.state.run.profession, 'mage');
  assert.equal(game.state.meta.energy.value, 40);
  assert.equal(win.document.querySelectorAll('.talent-badge').length, 4);
  assert.equal(win.document.querySelectorAll('.attribute-row').length, 4);
  assert.equal(win.document.querySelector('button[data-profession]'), null);
  assert.match(el('.admission-file').textContent, /入会档案|定向招募/);
});
test('attribute plus/minus, reset, balanced assignment and remaining budget control actual admission', () => {
  click('[data-action="chapters"]');
  click('[data-action="recruit"]');
  assert.equal(el('#remaining-points').textContent, '12');
  click('[data-attribute="speed"][data-delta="1"]');
  assert.equal(game.state.run.trainee!.allocation.speed, 1);
  assert.equal(el('#remaining-points').textContent, '11');
  click('[data-attribute="speed"][data-delta="-1"]');
  assert.equal(game.state.run.trainee!.allocation.speed, 0);
  click('[data-action="balance-allocation"]');
  assert.equal(el('#remaining-points').textContent, '0');
  assert.equal((el('[data-attribute="hp"][data-delta="1"]') as any).disabled, true);
  click('[data-action="reset-allocation"]');
  assert.equal(el('#remaining-points').textContent, '12');
  assert.equal((el('[data-action="confirm-allocation"]') as any).disabled, true);
  click('[data-action="balance-allocation"]');
  click('[data-action="confirm-allocation"]');
  if (game.state.phase === 'tome' && !game.state.run.trainee?.tomeId) {
    game.confirmAllocation();
    game.selectTome(
      (
        {
          warrior: 'warrior_sword_tome',
          mage: 'mage_flame_tome',
          rogue: 'rogue_poison_tome',
        } as const
      )[game.state.run.profession],
    );
    ui.render();
  }
  click('[data-action="start"]');
  assert.equal(game.state.phase, 'opening');
  assert.equal(loadSave()!.run.trainee!.allocation.speed, 3);
});
test('returning to chapter changes destination while preserving recruited identity, talents and points', () => {
  game.state.meta.highestChapter = 3;
  click('[data-action="chapters"]');
  click('[data-action="recruit"]');
  click('[data-attribute="defense"][data-delta="1"]');
  const recruit = structuredClone(game.state.run.trainee);
  click('[data-action="chapters"]');
  click('[data-action="prev-chapter"]');
  assert.equal(game.state.run.chapter, 2);
  assert.equal(win.document.querySelector('[data-action="recruit"]'), null);
  click('[data-action="resume-recruit"]');
  assert.deepEqual(game.state.run.trainee, { ...recruit, realmStart: 1 });
  assert.equal(game.state.run.realm, 1);
  assert.equal(game.state.meta.energy.value, 55);
  assert.match(el('.admission-file').textContent, /第 2 关/);
});
test('drops and displaced items occupy one continuous shape group with no equipment cards or temporary section', () => {
  game = start();
  ui.replace(game);
  const old = game.makeItem('warrior_pole_3');
  game.state.inventory.push(old);
  game.state.revision++;
  advanceCamp(game);
  game.state.enemy!.hp = 0;
  game.update(0.01);
  ui.render();
  assert.equal(win.document.querySelectorAll('.field-shapes').length, 1);
  assert.equal(win.document.querySelectorAll('#field-items [data-pack-item]').length, 3);
  assert.equal(win.document.querySelector('#field-items button'), null);
  assert.equal(win.document.querySelector('.field-loose'), null);
  assert.equal(win.document.querySelector('.field-offers'), null);
  assert.equal(win.document.querySelector('.card-art'), null);
  for (const node of win.document.querySelectorAll('.field-piece')) {
    assert.equal(node.tagName.toLowerCase(), 'svg');
    assert.equal(node.querySelectorAll('.item-outline').length, 1);
    assert.equal(node.querySelectorAll('.item-painting').length, 1);
    assert.match(node.getAttribute('viewBox')!, /^0 0 \d+ \d+$/);
  }
  assert.equal(win.document.querySelector(`#field-items [data-pack-item="${old.id}"]`), null);
  assert.equal(game.state.run.points, 1);
  assert.doesNotThrow(() => parseSave(JSON.stringify(game.state)));
});
test('touch grabbing a lower occupied cell of an upper shape preserves that cell as the drag anchor', () => {
  game = start();
  game.state.inventory = [game.makeItem('warrior_blade_3')];
  game.state.draft = [];
  game.state.placements = [];
  game.state.revision++;
  ui.replace(game);
  const item = game.state.inventory[0];
  (el('#pack-grid') as any).getBoundingClientRect = () => ({
    left: 0,
    top: 200,
    right: 420,
    bottom: 560,
    width: 420,
    height: 360,
  });
  const shape = el(`[data-pack-item="${item.id}"]`);
  (shape as any).getBoundingClientRect = () => ({
    left: 20,
    top: 10,
    right: 60,
    bottom: 130,
    width: 40,
    height: 120,
  });
  shape.dispatchEvent(
    new win.PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 40,
      clientY: 110,
    }),
  );
  el('#adventure-screen').dispatchEvent(
    new win.PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 150,
      clientY: 410,
    }),
  );
  el('#adventure-screen').dispatchEvent(
    new win.PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 150,
      clientY: 410,
    }),
  );
  assert.deepEqual(game.state.draft, [{ id: item.id, x: 2, y: 1, rotation: 0 }]);
});
test('paused battle steps one actor at a time and shows round, actor and integral cooldown text', () => {
  game = start();
  ui.replace(game);
  click('[data-action="continue"]');
  assert.match(el('#turn-order').textContent, /第 1 回合.*勇者行动/);
  click('[data-action="combat-tools"]');
  click('[data-action="pause"]');
  const before = game.state.enemy!.hp;
  click('[data-action="step-turn"]');
  assert.equal(game.state.isRunning, false);
  assert.equal(game.state.combat.actionIndex, 1);
  assert.ok(game.state.enemy!.hp < before);
  assert.match(el('#turn-order').textContent, /敌人行动/);
  assert.ok(
    [...win.document.querySelectorAll('.cooldown-label')].some((e) => /回合/.test(e.textContent)),
  );
  click('[data-action="step-turn"]');
  assert.equal(game.state.combat.actionIndex, 2);
  assert.equal(game.state.combat.lastActor, 'enemy');
  click('[data-action="step-turn"]');
  assert.equal(game.state.combat.round, 2);
  assert.equal(loadSave()!.combat.round, 2);
});

test('heavy weapons display the first activation countdown before either actor moves and after reload', () => {
  game = start();
  const heavy = game.makeItem('warrior_blade_4');
  game.state.inventory.push(heavy);
  game.state.draft = [{ id: heavy.id, x: 2, y: 1, rotation: 0 }];
  ui.replace(game);
  click('[data-action="continue"]');
  assert.equal(game.state.phase, 'combat');
  assert.equal(game.state.combat.runtime!.timers[heavy.id + ':0'], undefined);
  const label = () => el(`[data-pack-item="${heavy.id}"] .cooldown-label`).textContent;
  assert.equal(label(), '2 回合');
  game = new Game(parseSave(JSON.stringify(game.state)));
  ui.replace(game);
  assert.equal(label(), '2 回合');
  game.advanceTurn();
  ui.render();
  assert.equal(game.state.combat.hits[heavy.id], 0);
  assert.equal(label(), '1 回合');
});
