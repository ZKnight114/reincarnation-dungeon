import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { cleanLegacyData, loadSave, parseSave, SAVE_KEY } from '../src/save';
import { firstFree, validateLayout } from '../src/backpack';
import { positionEvent, prepare } from './helpers';
let win: Window, game: Game, ui: UI, now: number;
const realNow = Date.now;
beforeEach(() => {
  now = realNow();
  Date.now = () => now;
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
  game = new Game(undefined, () => 0.6);
  ui = new UI(game, (s) => {
    game = new Game(s, () => 0.6);
    ui.replace(game);
  });
});
afterEach(() => {
  Date.now = realNow;
  return win.happyDOM.close();
});
const el = (q: string) => {
  const e = win.document.querySelector(q);
  assert.ok(e, `Missing ${q}`);
  return e;
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
const begin = () => {
  click('[data-action="chapters"]');
  click('[data-recruit-mode="targeted"]');
  click('[data-profession="warrior"]');
  click('[data-action="recruit"]');
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
};
const start = () => {
  begin();
  prepare(game);
  ui.render();
};
const geometry = () => {
  (el('#pack-grid') as any).getBoundingClientRect = () => ({
    left: 0,
    top: 100,
    right: 420,
    bottom: 460,
    width: 420,
    height: 360,
  });
  (el('#battle-panel') as any).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 300,
    bottom: 90,
    width: 300,
    height: 90,
  });
};
const fixture = (id = 'warrior_blade_3', placed = false, level = 1) => {
  const i = game.makeItem(id, level);
  game.state.run.kills = 14;
  game.state.inventory = [i];
  game.state.draft = placed ? [{ id: i.id, x: 0, y: 0, rotation: 0 }] : [];
  game.state.placements = [];
  game.state.revision++;
  ui.render();
  geometry();
  return i;
};
const drag = (id: string, from: [number, number], to: [number, number], end = 'pointerup') => {
  now += 500;
  geometry();
  const target = el(`[data-pack-item="${id}"]`),
    root = el('#adventure-screen');
  target.dispatchEvent(
    new win.PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: from[0],
      clientY: from[1],
    }),
  );
  root.dispatchEvent(
    new win.PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      clientX: to[0],
      clientY: to[1],
    }),
  );
  root.dispatchEvent(
    new win.PointerEvent(end, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
      clientX: to[0],
      clientY: to[1],
    }),
  );
};
test('guild to targeted recruit and configured hero flow has one entry; no removed controls remain', () => {
  assert.equal(win.document.querySelectorAll('#home-screen button').length, 5);
  begin();
  assert.equal(game.state.phase, 'opening');
  assert.equal(game.state.run.trainee!.talents.length, 4);
  assert.equal(win.document.querySelectorAll('.resonance-slot').length, 4);
  for (const selector of [
    '#stash-items',
    '#opening-tray',
    '[data-pack-action="auto"]',
    '[data-pack-action="remove"]',
    '[data-pack-action="lock"]',
    '[data-pack-action="upgrade"]',
    '[data-pack-merge]',
  ])
    assert.equal(win.document.querySelector(selector), null);
});

test('guild library and level controls survive render frames during a touch press and open their panels', () => {
  const library = el('.guild-progress-controls [data-action="library"]'),
    level = el('.guild-progress-controls [data-action="guild-level"]');
  library.dispatchEvent(
    new win.PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }),
  );
  for (let n = 0; n < 5; n++) {
    now += 100;
    ui.render();
  }
  assert.equal(el('.guild-progress-controls [data-action="library"]'), library);
  assert.equal(el('.guild-progress-controls [data-action="guild-level"]'), level);
  library.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal((el('#modal') as any).open, false);
  assert.equal((el('#guild-feature-screen') as any).hidden, false);
  assert.match(el('#guild-feature-screen').textContent, /公会典籍/);
  assert.equal(win.document.querySelectorAll('.library-book').length, 9);
  click('#guild-feature-screen [data-action="guild"]');
  level.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.match(el('#modal-body').textContent, /冒险公会 Lv.1/);
  assert.ok(el('[data-action="upgrade-guild"]'));
});

test('allocation precedes an independent nine-book screen, with class filters and a cross-class preview', () => {
  click('[data-action="chapters"]');
  click('[data-recruit-mode="targeted"]');
  click('[data-profession="warrior"]');
  click('[data-action="recruit"]');
  assert.equal(win.document.querySelector('[data-tome]'), null);
  assert.equal(win.document.querySelector('[data-action="start"]'), null);
  click('[data-action="balance-allocation"]');
  click('[data-action="confirm-allocation"]');
  assert.equal(game.state.phase, 'tome');
  assert.equal(win.document.querySelectorAll('[data-tome]').length, 9);
  click('[data-tome-filter="mage"]');
  assert.equal(win.document.querySelectorAll('[data-tome]').length, 3);
  click('[data-tome="mage_flame_tome"]');
  assert.match(el('.tome-effects').textContent, /灼烧/);
  assert.equal(win.document.querySelector('.tome-source'), null);
  assert.match(el('.tome-equipped').textContent, /焚星秘典/);
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 0);
  assert.equal(loadSave()!.phase, 'tome');
  click('[data-action="back-allocation"]');
  assert.equal(game.state.phase, 'configure');
  assert.equal(win.document.querySelector('[data-tome]'), null);
  click('[data-action="confirm-allocation"]');
  click('[data-action="start"]');
  assert.equal(game.state.phase, 'opening');
  assert.equal(game.state.run.profession, 'warrior');
  assert.deepEqual(game.state.run.boundTome, { id: 'mage_flame_tome', level: 1 });
  assert.equal(game.state.meta.tomes.mage_flame_tome.level, 1);
  assert.deepEqual(game.state.meta.tomeGifts, ['warrior']);
});

test('detail layout names adjacency recipients, concrete effects and both fighters professions', () => {
  start();
  const sword = game.state.inventory.find((i) => i.templateId === 'warrior_blade_3')!;
  click(`[data-pack-item="${sword.id}"]`);
  assert.match(el('.item-adjacency-effect').textContent, /每相邻1件防御物品.*自身直接伤害增加8%/);
  assert.match(el('.item-native-effect').textContent, /人物攻击|人物最大生命/);
  assert.doesNotMatch(el('#equipment-detail').textContent, /%[AHD]|外给增幅|接受联动/);
  assert.equal(el('.item-description-header h2').textContent, sword.name + ' 【1阶】');
  click('[data-pack-action="close"]');
  click('[data-action="continue"]');
  assert.equal(el('#player-hp .profession-icon').getAttribute('aria-label'), '战士');
  const professions = { warrior: '战士', mage: '法师', rogue: '盗贼' };
  assert.equal(
    el('#enemy-hp .profession-icon').getAttribute('aria-label'),
    professions[game.state.enemy!.profession!],
  );
  assert.equal(el('#combat-hud .profession-icon').getAttribute('aria-label'), '战士');
});
test('tap opens structured details and tapping an empty cell never places equipment', () => {
  start();
  const i = fixture('warrior_blade_3');
  click(`[data-pack-item="${i.id}"]`);
  assert.equal((el('#equipment-detail') as any).open, true);
  assert.match(el('#equipment-detail').textContent, /人物攻击|四阶变化|贡献标签/);
  click('#equipment-detail [data-pack-action="close"]');
  click('[data-pack-cell="0,0"]');
  click('[data-pack-cell="3,3"]');
  assert.deepEqual(game.state.draft, []);
});
test('touch drag from upper area places once; synthetic click does not reopen details', () => {
  start();
  const i = fixture();
  drag(i.id, [30, 30], [150, 130]);
  assert.deepEqual(game.state.draft, [{ id: i.id, x: 2, y: 0, rotation: 0 }]);
  el(`[data-pack-item="${i.id}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal((el('#equipment-detail') as any).open, false);
  assert.equal(el('#view-pack').querySelector('.selected'), null);
  assert.equal(win.document.querySelector('.drag-floating'), null);
  assert.equal(loadSave()!.draft[0].x, 2);
});
test('drag from an occupied cell preserves the grabbed offset; board to upper retains item', () => {
  start();
  const i = fixture('warrior_blade_3', true);
  drag(i.id, [30, 190], [210, 310]);
  assert.deepEqual(game.state.draft, [{ id: i.id, x: 3, y: 2, rotation: 0 }]);
  drag(i.id, [210, 250], [30, 30]);
  assert.deepEqual(game.state.draft, []);
  assert.ok(game.findItem(i.id));
  assert.ok(el(`#field-items [data-pack-item="${i.id}"]`));
});
test('outside, out-of-bounds and pointercancel restore the exact layout', () => {
  start();
  const i = fixture('warrior_guard_4', true),
    before = JSON.stringify(game.state.draft);
  for (const [to, end] of [
    [[1000, 1000], 'pointerup'],
    [[90, 250], 'pointercancel'],
    [[270, 430], 'pointerup'],
  ] as const) {
    drag(i.id, [30, 130], [...to], end);
    assert.equal(JSON.stringify(game.state.draft), before);
    assert.equal(win.document.querySelector('.drag-floating'), null);
  }
});
test('exact dragged duplicate merges into receiver without consuming a spare', () => {
  start();
  const target = fixture('warrior_blade_3', true),
    source = game.makeItem('warrior_blade_3'),
    spare = game.makeItem('warrior_blade_3');
  game.state.inventory.push(source, spare);
  game.state.revision++;
  ui.render();
  drag(source.id, [30, 30], [30, 130]);
  assert.equal(target.level, 2);
  assert.equal(game.findItem(source.id), null);
  assert.ok(game.findItem(spare.id));
  assert.equal(game.state.draft[0].id, target.id);
  assert.ok(el('.pack-piece').classList.contains('quality-blue'));
});
test('occupied backpack drop swaps when both fit, otherwise ejects to upper area', () => {
  start();
  const a = fixture('warrior_blade_3', true),
    b = game.makeItem('warrior_pole_3');
  game.state.inventory.push(b);
  game.placeItem(b.id, 3, 0);
  game.state.revision++;
  ui.render();
  drag(a.id, [30, 130], [210, 130]);
  assert.deepEqual(
    game.state.draft.find((p) => p.id === a.id),
    { id: a.id, x: 3, y: 0, rotation: 0 },
  );
  assert.deepEqual(
    game.state.draft.find((p) => p.id === b.id),
    { id: b.id, x: 0, y: 0, rotation: 0 },
  );
  const c = game.makeItem('warrior_gem');
  game.state.inventory.push(c);
  game.placeItem(c.id, 4, 5);
  game.state.revision++;
  ui.render();
  drag(c.id, [270, 430], [210, 130]);
  assert.equal(
    game.state.draft.some((p) => p.id === a.id),
    false,
  );
  assert.ok(el(`#field-items [data-pack-item="${a.id}"]`));
  assert.equal(validateLayout(game.state.inventory, game.state.draft), null);
});
test('fixed item orientation has no rotation controls in the board or detail dialog', () => {
  start();
  const i = fixture('warrior_pole_3');
  click(`[data-pack-item="${i.id}"]`);
  assert.equal(win.document.querySelector('[data-pack-action="rotate"]'), null);
  assert.ok(game.moveItem(i.id, 1, 1, 1));
  assert.equal(game.moveItem(i.id, 1, 1, 0), null);
});
test('equipment is one continuous silhouette and one illustration with a round cooldown label', () => {
  start();
  const i = fixture('warrior_blade_3', true);
  const piece = el('.pack-piece');
  assert.equal(piece.querySelectorAll('.item-outline').length, 1);
  assert.equal(piece.querySelectorAll('.item-painting').length, 1);
  assert.equal(piece.querySelectorAll('.item-category-badge').length, 1);
  assert.equal(piece.querySelectorAll('.cooldown-label').length, 1);
  assert.equal(win.document.querySelectorAll('.pack-piece').length, 1);
  assert.equal(i.templateId, 'warrior_blade_3');
});
test('point redemption is manual and discard uses the details action; neither creates gold', () => {
  start();
  fixture('warrior_blade_3', true);
  const i = game.makeItem('warrior_gem');
  game.state.inventory.push(i);
  game.state.run.points = 5;
  game.state.revision++;
  ui.render();
  const gold = game.state.meta.gold;
  click(`[data-pack-item="${i.id}"]`);
  click('#equipment-detail [data-pack-action="discard"]');
  assert.equal(game.state.run.points, 6);
  assert.equal(game.state.inventory.length, 1);
  click('[data-action="redeem"]');
  assert.equal(game.state.run.points, 0);
  assert.equal(game.state.inventory.length, 2);
  assert.equal(game.state.meta.gold, gold);
  assert.equal(loadSave()!.run.points, 0);
  assert.equal((el('#point-redeem') as any).disabled, true);
});
test('combat frames preserve backpack nodes and show cooldowns, starvation, projectiles and details', () => {
  start();
  click('[data-action="continue"]');
  const pause = el('[data-action="combat-tools"]'),
    cell = el('.pack-cell');
  game.update(2);
  ui.render();
  assert.ok(el('.pack-cell') === cell, 'combat must retain board nodes');
  assert.ok(el('[data-action="combat-tools"]') === pause, 'combat must retain pause button');
  assert.ok(win.document.querySelector('.combat-projectile'));
  assert.ok(win.document.querySelector('.triggered'));
  assert.ok(
    [...win.document.querySelectorAll('.cooldown-label')].some(
      (e) => e.textContent === '就绪' || /回合/.test(e.textContent),
    ),
  );
  const i = game.state.inventory[0];
  click(`[data-pack-item="${i.id}"]`);
  assert.equal((el('#equipment-detail') as any).open, true);
  assert.equal(win.document.querySelector('[data-pack-action="rotate"]'), null);
  click('#equipment-detail [data-pack-action="close"]');
  click('[data-action="combat-tools"]');
  click('[data-action="pause"]');
  assert.equal(game.state.isRunning, false);
});
test('opening gifts and upper equipment survive reload and continue into next round without capacity restriction', () => {
  begin();
  click('[data-action="claim-starters"]');
  const ids = game.state.inventory.map((i) => i.id),
    offers = game.state.run.starterOffers.map((i) => i.id);
  game = new Game(parseSave(JSON.stringify(game.state)));
  ui.replace(game);
  assert.deepEqual(
    game.state.inventory.map((i) => i.id),
    ids,
  );
  assert.deepEqual(
    game.state.run.starterOffers.map((i) => i.id),
    offers,
  );
  assert.equal((el('[data-action="claim-starters"]') as any).disabled, false);
  click('[data-action="claim-starters"]');
  assert.equal(game.state.inventory.length, 6);
});
test('save cleanup preserves previous raw data and current v15 saves', () => {
  localStorage.setItem('recursion-dungeon-save-v6', 'old');
  localStorage.setItem(SAVE_KEY, 'stale');
  localStorage.setItem('other-project', 'keep');
  cleanLegacyData();
  assert.equal(localStorage.getItem('recursion-dungeon-save-v6'), 'old');
  assert.equal(localStorage.getItem(SAVE_KEY), 'stale');
  assert.equal(localStorage.getItem('other-project'), 'keep');
  ui.persist();
  const raw = localStorage.getItem(SAVE_KEY);
  cleanLegacyData();
  assert.equal(localStorage.getItem(SAVE_KEY), raw);
  assert.equal(loadSave()!.version, 15);
});
test('names, descriptions and logs escape injected markup', () => {
  start();
  const i = game.state.inventory[0];
  i.name = '<img src=x onerror=alert(1)>';
  game.state.revision++;
  game.chronicle('<img src=x>', '<img src=x>');
  ui.render();
  click(`[data-pack-item="${i.id}"]`);
  assert.equal(el('#equipment-detail').querySelectorAll('img').length, 0);
  click('#equipment-detail [data-pack-action="close"]');
  assert.equal(el('#journey-panel').querySelectorAll('img').length, 0);
});
test('retreat clears local points and equipment; reset returns to the one-entry camp', () => {
  start();
  game.state.run.points = 10;
  click('[data-action="settings"]');
  click('[data-action="retreat"]');
  click('[data-action="confirm-retreat"]');
  assert.equal(game.state.phase, 'summary');
  assert.equal(game.state.inventory.length, 0);
  assert.equal(game.state.run.points, 0);
  click('[data-action="selection"]');
  assert.equal(game.state.phase, 'home');
  begin();
  click('[data-action="settings"]');
  click('[data-action="reset"]');
  click('[data-action="confirm-reset"]');
  assert.equal(game.state.phase, 'home');
  assert.equal(loadSave()!.meta.runs, 0);
});
test('pointer capture loss cancels an active drag without moving or consuming equipment', () => {
  start();
  const i = fixture('warrior_blade_3', true),
    before = JSON.stringify(game.state.draft);
  geometry();
  el(`[data-pack-item="${i.id}"]`).dispatchEvent(
    new win.PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX: 30,
      clientY: 130,
    }),
  );
  el('#adventure-screen').dispatchEvent(
    new win.PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 210,
      clientY: 130,
    }),
  );
  assert.ok(win.document.querySelector('.drag-floating'));
  el('#adventure-screen').dispatchEvent(
    new win.PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }),
  );
  assert.equal(win.document.querySelector('.drag-floating'), null);
  assert.equal(JSON.stringify(game.state.draft), before);
});
test('equipment no longer depends on stamina or mana', () => {
  start();
  click('[data-action="continue"]');
  const i = game.state.inventory.find((i) => i.templateId === 'warrior_blade_2')!;
  game.state.combat.stamina = 0;
  game.state.combat.timers[i.id] = 0;
  ui.render();
  assert.equal(el(`[data-pack-item="${i.id}"]`).classList.contains('resource-starved'), false);
  game.state.combat.stamina = 10;
  ui.render();
  assert.equal(el(`[data-pack-item="${i.id}"]`).classList.contains('resource-starved'), false);
});
test('footer touch pointer-up starts combat and pauses without waiting for a compatibility click', () => {
  start();
  const tap = (selector: string) => {
    const b = el(selector);
    for (const type of ['pointerdown', 'pointerup'])
      b.dispatchEvent(
        new win.PointerEvent(type, {
          bubbles: true,
          pointerType: 'touch',
          pointerId: 2,
          button: 0,
          clientX: 200,
          clientY: 800,
        }),
      );
  };
  tap('[data-action="continue"]');
  assert.equal(game.state.phase, 'journey');
  tap('[data-action="continue-story"]');
  assert.equal(game.state.phase, 'combat');
  assert.equal(game.state.run.index, 0);
  tap('[data-action="combat-tools"]');
  click('[data-action="pause"]');
  click('[data-action="close"]');
  assert.equal(game.state.isRunning, false);
  tap('[data-action="cycle-speed"]');
  assert.equal(game.state.speed, 2);
  assert.equal(game.state.isRunning, false);
  assert.doesNotThrow(() => parseSave(JSON.stringify(game.state)));
});
