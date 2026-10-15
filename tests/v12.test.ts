import { advanceCamp } from './helpers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { RUN_LENGTH, TRIAL_NODES, VIDEO_YEARS, GRADUATION_NODE } from '../src/journey';
import { parseSave } from '../src/save';
import { bagCellClass } from '../src/pack-ui';
import { openBagCells } from '../src/backpack';
import { start, positionEvent, recruitToConfigure, add } from './helpers';

test('route maps every retained video year exactly once and excludes unsupported opening/pet/mentor steps', () => {
  assert.deepEqual(VIDEO_YEARS, [...Array.from({ length: 36 }, (_, n) => n + 5), 42]);
  assert.equal(RUN_LENGTH, 37);
  assert.deepEqual(
    TRIAL_NODES.map((n) => VIDEO_YEARS[n]),
    [13, 21, 29],
  );
  assert.equal(VIDEO_YEARS[GRADUATION_NODE], 36);
});
test('opening gifts stay available across the two supply batches; unplaced gear expires before initial resonance', () => {
  const g = new Game();
  recruitToConfigure(g);
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
  const weapon = g.state.inventory.find((i) => i.slot === 'weapon')!;
  g.placeItem(weapon.id, 1, 1);
  g.claimStarterRound();
  assert.equal(g.state.inventory.length, 6);
  assert.equal(g.finishOpening(), null);
  assert.equal(g.state.inventory.length, 1);
  assert.equal(g.state.run.points, 5);
  assert.equal(g.state.draft[0].id, weapon.id);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('failed continuation does not expire anything; successful continuation removes loose items once', () => {
  const g = start();
  const loose = add(g, 'warrior_gem');
  const layout = structuredClone(g.state.draft);
  g.state.draft = [];
  assert.ok(advanceCamp(g));
  assert.ok(g.findItem(loose.id));
  assert.equal(g.state.run.points, 0);
  g.state.draft = layout;
  advanceCamp(g);
  assert.equal(g.findItem(loose.id), null);
  assert.equal(g.state.run.points, 1);
  assert.ok(advanceCamp(g));
  assert.equal(g.state.run.points, 1);
});
test('open cells have a bright contour exactly where they meet closed cells', () => {
  const open = openBagCells(0);
  assert.equal(bagCellClass(open, 0, 0), 'closed');
  assert.match(bagCellClass(open, 1, 1), /edge-top/);
  assert.match(bagCellClass(open, 1, 1), /edge-left/);
  assert.equal(bagCellClass(open, 3, 2), 'open ');
  assert.match(bagCellClass(open, 5, 3), /edge-bottom.*edge-right/);
});
test('active phases keep bag or reforge left and speed right; event equipment reveals bag', () => {
  const win = new Window({ url: 'http://localhost/' });
  try {
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
    });
    win.document.body.innerHTML = '<div id="app"></div>';
    const g = start(),
      ui = new UI(g, () => {});
    const check = () => {
      ui.render();
      const footer = win.document.querySelector('#adventure-footer')!;
      assert.equal(
        (footer.firstElementChild as any).dataset.action,
        (win.document.querySelector('#view-pack') as any).hidden ? 'open-pack' : 'redeem',
      );
      assert.equal((footer.lastElementChild as any).dataset.action, 'cycle-speed');
      assert.equal(win.document.querySelector('#battle-panel #point-redeem'), null);
      assert.equal(win.document.querySelectorAll('.route-step').length, RUN_LENGTH);
    };
    check();
    advanceCamp(g);
    g.state.isRunning = false;
    check();
    assert.equal(win.document.querySelectorAll('[aria-current="step"]').length, 1);
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    check();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, false);
    assert.ok(win.document.querySelector('#battle-panel.has-offers'));
    positionEvent(g, 'supply');
    check();
    g.chooseEvent('take');
    check();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, false);
    assert.equal(win.document.querySelector('[data-action="toggle-pack"]'), null);
    const loose = g.looseItems().map((i) => i.id);
    advanceCamp(g);
    check();
    assert.ok(loose.every((id) => !g.findItem(id)));
    positionEvent(g, 'rest');
    check();
    g.chooseEvent('heal');
    check();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, true);
    g.state.run.points = 6;
    g.redeemEquipment();
    check();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, false);
    assert.ok(win.document.querySelector('#battle-panel.has-offers'));
  } finally {
    win.happyDOM.close();
  }
});
