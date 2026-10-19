import { setEnemy, setPlayer } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, storyDuration } from '../src/game';
import { UI } from '../src/ui';
import { cells, openBagCells } from '../src/backpack';
import { journeyGroups } from '../src/presentation';
import { parseSave } from '../src/save';
import { start, positionEvent } from './helpers';

test('all history survives a long run and reload; a node has only one marker', () => {
  const g = start();
  for (let n = 0; n < 300; n++) g.chronicle('经过 ' + n, '结果 ' + n, 'story', 1);
  assert.equal(g.state.run.journey.length, 302);
  g.continueCamp();
  const restored = parseSave(JSON.stringify(g.state));
  assert.equal(restored.run.journey.length, 303);
  const groups = journeyGroups(restored.run.journey);
  assert.deepEqual(
    groups.map((g) => g.event),
    [0, 1],
  );
  assert.equal(groups[1].entries.length, 301);
  const win = new Window({ url: 'http://localhost/' });
  try {
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
    });
    win.document.body.innerHTML = '<div id="app"></div>';
    const ui = new UI(g, () => {});
    assert.equal(win.document.querySelectorAll('.journey-time').length, 2);
    assert.equal(win.document.querySelectorAll('.journey-entry').length, 303);
    const history = win.document.querySelector('#journey-history')!;
    Object.defineProperty(history, 'scrollHeight', { value: 1000 });
    Object.defineProperty(history, 'clientHeight', { value: 300 });
    history.scrollTop = 82;
    history.dispatchEvent(new win.Event('scroll'));
    g.chronicle('继续探索', '保留先前的阅读位置', 'story', 1);
    ui.render();
    assert.equal(win.document.querySelectorAll('.journey-time').length, 2);
    assert.equal(win.document.querySelectorAll('.journey-entry').length, 304);
    assert.equal(history.scrollTop, 82);
    ui.replace(new Game(parseSave(JSON.stringify(g.state))));
    assert.equal(history.querySelectorAll('.journey-time').length, 2);
    assert.equal(history.querySelectorAll('.journey-entry').length, 304);
  } finally {
    win.happyDOM.close();
  }
});

test('unconditional gifts reveal once, wait for continue and expire on the next small node', () => {
  for (const kind of ['supply', 'treasure'] as const) {
    const g = start();
    positionEvent(g, kind);
    assert.equal(g.state.phase, 'camp');
    const ids = g.looseItems().map((i) => i.id),
      count = g.state.inventory.length,
      node = g.state.run.index;
    assert.equal(ids.length, 3);
    g.update(90);
    assert.equal(g.state.run.index, node);
    assert.equal(g.state.inventory.length, count);
    assert.equal(g.continueJourney(), false);
    g.continueCamp();
    assert.ok(ids.every((id) => !g.findItem(id)));
    assert.equal(g.state.run.points, 3);
  }
});

test('awakening is saved, pauses before resonance, and cannot grant growth twice', () => {
  const g = start();
  positionEvent(g, 'elite');
  g.state.player.hp = 30;
  g.state.enemy!.hp = 0;
  g.advanceTurn();
  if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
  assert.equal(g.state.phase, 'awakening');
  const a = structuredClone(g.state.awakening),
    growth = structuredClone(g.state.run.growth),
    items = g.state.draft.length;
  assert.ok(a!.healed > 0);
  assert.ok(g.chooseReward(0));
  assert.ok(g.continueCamp());
  assert.ok(g.redeemEquipment());
  g.update(300);
  if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
  assert.equal(g.state.phase, 'awakening');
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.deepEqual(restored.state.awakening, a);
  assert.equal(restored.finishAwakening(), true);
  assert.equal(restored.finishAwakening(), false);
  assert.deepEqual(restored.state.run.growth, growth);
  assert.equal(restored.state.inventory.length, items);
  assert.equal(restored.chooseReward(0), null);
  assert.equal(restored.state.run.resonances.length, 2);
  assert.equal(restored.state.phase, 'journey');
  assert.doesNotThrow(() => parseSave(JSON.stringify(restored.state)));
});

test('same-batch drops can repeat and merge without being automatically packed', () => {
  const g = start('warrior', () => 0.1);
  g.continueCamp();
  g.continueJourney();
  g.state.enemy!.hp = 0;
  g.advanceTurn();
  const items = g.looseItems();
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map((i) => i.templateId)).size, 1);
  assert.equal(g.mergeItems(items[0].id, items[1].id), null);
  assert.equal(items[1].level, 2);
  assert.ok(g.looseItems().includes(items[1]));
});

test('progressive masks stay connected and add contiguous edge strips', () => {
  for (let kills = 0; kills <= 14; kills++) {
    const open = openBagCells(kills),
      seen = new Set<string>(),
      pending = [[...open][0]];
    while (pending.length) {
      const key = pending.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k = `${x + dx},${y + dy}`;
        if (open.has(k) && !seen.has(k)) pending.push(k);
      }
    }
    assert.equal(seen.size, open.size);
  }
});

test('story timing differs for short encounters and important growth milestones', () => {
  const g = start(),
    first = g.currentEvent()!;
  assert.ok(storyDuration(first) >= 1.2 && storyDuration(first) <= 2.5);
  assert.equal(storyDuration(g.state.run.events[8]), 3.2);
});

test('history appends without replaying old cards and preserves the reading position across backpack switches', () => {
  const g = start();
  g.continueCamp();
  const win = new Window({ url: 'http://localhost/' });
  try {
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
    });
    win.document.body.innerHTML = '<div id="app"></div>';
    const ui = new UI(g, () => {}),
      click = (q: string) =>
        win.document
          .querySelector(q)!
          .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const history = win.document.querySelector('#journey-history')!,
      oldCard = history.querySelector('.journey-entry');
    Object.defineProperty(history, 'scrollHeight', { value: 1200 });
    Object.defineProperty(history, 'clientHeight', { value: 300, configurable: true });
    history.scrollTop = 120;
    history.dispatchEvent(new win.Event('scroll'));
    click('[data-action="open-pack"]');
    Object.defineProperty(history, 'clientHeight', { value: 0, configurable: true });
    history.scrollTop = 0;
    history.dispatchEvent(new win.Event('scroll'));
    g.chronicle('新的收益', '已保留在同一节点', 'loot', 0);
    ui.render();
    assert.equal(history.querySelector('.journey-entry'), oldCard);
    Object.defineProperty(history, 'clientHeight', { value: 300, configurable: true });
    click('[data-action="continue-story"]');
    assert.equal(history.scrollTop, 120);
    assert.equal(history.querySelectorAll('.journey-time').length, 2);
    assert.equal(history.querySelectorAll('.journey-entry').length, 4);
  } finally {
    win.happyDOM.close();
  }
});

test('combat has skip and speed but no player pause, stepping or control dialog', () => {
  const g = start(),
    win = new Window({ url: 'http://localhost/' });
  try {
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
    });
    win.document.body.innerHTML = '<div id="app"></div>';
    const ui = new UI(g, () => {});
    g.continueCamp();
    g.continueJourney();
    ui.render();
    const click = (q: string) =>
      win.document.querySelector(q)!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(win.document.querySelector('[data-action="combat-tools"]'), null);
    assert.equal(win.document.querySelector('[data-action="pause"]'), null);
    assert.equal(win.document.querySelector('[data-action="step-turn"]'), null);
    click('[data-action="skip-combat"]');
    assert.equal(g.state.skipCombat, true);
    assert.equal(g.state.isRunning, true);
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    ui.render();
    assert.equal(win.document.querySelector('[data-action="skip-combat"]'), null);
    assert.equal(
      (win.document.querySelector('#modal') as unknown as HTMLDialogElement).open,
      false,
    );
  } finally {
    win.happyDOM.close();
  }
});

test('damage feedback shows actual life lost after shield absorption', () => {
  const g = start();
  g.continueCamp();
  g.continueJourney();
  setEnemy(g, { attack: 100 });
  setPlayer(g, { shield: 10 });
  const before = g.state.player.hp;
  g.state.combat.order = ['enemy', 'hero'];
  g.state.combat.actionIndex = 0;
  g.advanceTurn();
  const lost = before - g.state.player.hp,
    hit = g.feedback.find((f) => f.kind === 'hurt'),
    blocked = g.feedback.find((f) => f.kind === 'blocked');
  assert.ok(lost > 0);
  assert.equal(hit?.amount, lost);
  assert.equal(blocked?.amount, 10);
});

test('discarded opening equipment remains under the departure marker', () => {
  const g = new Game();
  g.enterChapters();
  g.recruit('warrior');
  g.balanceAllocation();
  if (g.state.phase === 'configure' && !g.state.run.trainee?.tomeId) g.confirmAllocation();
  g.selectTome(
    (
      {
        warrior: 'warrior_sword_tome',
        mage: 'mage_flame_tome',
        rogue: 'rogue_poison_tome',
      } as const
    )[g.state.run.profession],
  );
  g.startRun();
  g.claimStarterRound();
  g.claimStarterRound();
  const weapon = g.state.inventory.find((i) => i.slot === 'weapon' && cells(i).length === 2)!;
  assert.equal(g.placeItem(weapon.id, 2, 1), null);
  assert.equal(g.finishOpening(), null);
  assert.ok(g.state.run.journey.some((l) => l.title === '回收未入包装备'));
  assert.ok(g.state.run.journey.every((l) => l.event === 0));
  g.chooseReward(0);
  g.continueCamp();
  assert.deepEqual(
    journeyGroups(g.state.run.journey).map((l) => l.event),
    [0, 1],
  );
});
