import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { foeSprite } from '../src/pixel';
import { start, positionEvent } from './helpers';

function setup(g: Game) {
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  w.document.body.innerHTML = '<div id="app"></div>';
  const ui = new UI(g, () => {});
  const node = (q: string) => {
    const e = w.document.querySelector(q)!;
    assert.ok(e, q);
    return e;
  };
  const rect = (q: string, x: number, y: number, width: number, height: number) => {
    node(q).getBoundingClientRect = () => new w.DOMRect(x, y, width, height);
  };
  const drag = (
    id: string,
    to: [number, number],
    cancel = false,
    buttonAt: [number, number] = [0, 440],
  ) => {
    rect('#pack-grid', 0, 100, 350, 300);
    rect('#point-redeem', buttonAt[0], buttonAt[1], 64, 54);
    const source = node(`[data-pack-item="${id}"]`),
      root = node('#adventure-screen');
    source.dispatchEvent(
      new w.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 175,
        clientY: 225,
      }),
    );
    root.dispatchEvent(
      new w.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: to[0],
        clientY: to[1],
      }),
    );
    const highlighted = !!w.document.querySelector('.recycle-target');
    root.dispatchEvent(
      new w.PointerEvent(cancel ? 'pointercancel' : 'pointerup', {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: to[0],
        clientY: to[1],
      }),
    );
    return highlighted;
  };
  return { w, ui, node, drag };
}

test('drag recycling accepts equipped gear even while redeem is disabled, without granting random gear', () => {
  const g = start(),
    { w, node, drag } = setup(g);
  try {
    node('[data-action="open-pack"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const item = g.state.inventory.find((i) => i.slot === 'armor')!;
    const before = g.state.inventory.length;
    assert.equal((node('#point-redeem') as any).disabled, true);
    assert.equal(drag(item.id, [32, 467]), true);
    assert.equal(g.findItem(item.id), null);
    assert.equal(g.state.inventory.length, before - 1);
    assert.equal(g.state.run.points, 1);
    assert.equal(w.document.querySelector('.recycle-target'), null);
  } finally {
    w.happyDOM.close();
  }
});

test('upper equipment can be recycled and the post-drag click cannot consume the newly completed six points', () => {
  const g = start();
  const item = g.state.inventory.find((i) => i.slot === 'armor')!;
  assert.equal(g.moveToUpper(item.id), true);
  g.state.run.points = 5;
  const { w, node, drag } = setup(g);
  try {
    const before = g.state.inventory.length;
    assert.equal(drag(item.id, [32, 467]), true);
    assert.equal(g.state.run.points, 6);
    assert.equal(g.state.inventory.length, before - 1);
    node('#point-redeem').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(g.state.run.points, 6);
    assert.equal(g.state.inventory.length, before - 1);
  } finally {
    w.happyDOM.close();
  }
});

test('bag cells take precedence even if a future layout overlaps the reforge target', () => {
  const g = start(),
    { w, node, drag } = setup(g);
  try {
    node('[data-action="open-pack"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const item = g.state.inventory.find((i) => i.slot === 'armor')!;
    assert.equal(drag(item.id, [32, 225], false, [0, 200]), false);
    assert.ok(g.findItem(item.id));
    assert.equal(g.state.run.points, 0);
  } finally {
    w.happyDOM.close();
  }
});

test('recycling is restricted to the button; cancellation and last weapon protection retain equipment', () => {
  for (const mode of ['gap', 'cancel', 'weapon']) {
    const g = start(),
      { w, ui, drag } = setup(g);
    try {
      w.document
        .querySelector('[data-action="open-pack"]')!
        .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      let item = g.state.inventory.find((i) => i.slot === 'armor')!;
      if (mode === 'weapon') {
        item = g.state.inventory.find((i) => i.slot === 'weapon')!;
        g.state.inventory = [item];
        g.state.draft = [{ id: item.id, x: 1, y: 1, rotation: 0 }];
        g.state.revision++;
        ui.render();
      }
      const before = structuredClone(g.state.inventory);
      drag(item.id, mode === 'gap' ? [32, 420] : [32, 467], mode === 'cancel');
      assert.deepEqual(g.state.inventory, before);
      assert.equal(g.state.run.points, 0);
    } finally {
      w.happyDOM.close();
    }
  }
});

test('starter offers recycle into points and move to the next batch only after that batch is handled', () => {
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
  const weapon = g.state.run.starterOffers[0];
  assert.equal(g.moveItem(weapon.id, 1, 1), null);
  const first = g.state.run.starterOffers[0];
  assert.equal(g.recycleItem(first.id), true);
  assert.equal(g.state.run.starterRound, 0);
  for (const i of [...g.state.run.starterOffers]) assert.equal(g.recycleItem(i.id), true);
  assert.equal(g.state.run.points, 2);
  assert.equal(g.state.run.starterRound, 1);
  assert.equal(g.state.run.starterOffers.length, 3);
});

test('journey exposes only backpack utility; opening bag holds playback until continue and next phase switches automatically', () => {
  const g = start(),
    { w, ui, node } = setup(g);
  try {
    assert.equal(w.document.querySelector('#point-redeem'), null);
    assert.equal(w.document.querySelector('[data-action="toggle-pack"]'), null);
    node('[data-action="open-pack"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal((node('#view-pack') as any).hidden, false);
    assert.ok(w.document.querySelector('#point-redeem'));
    g.continueCamp();
    ui.render();
    node('[data-action="open-pack"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(ui.holdingJourney, true);
    node('[data-action="continue-story"]').dispatchEvent(
      new w.MouseEvent('click', { bubbles: true }),
    );
    assert.equal(ui.holdingJourney, false);
    assert.equal(g.state.phase, 'combat');
    assert.equal((node('#view-pack') as any).hidden, false);
    positionEvent(g, 'rest');
    ui.render();
    assert.equal((node('#journey-panel') as any).hidden, false);
    assert.equal(w.document.querySelector('#point-redeem'), null);
  } finally {
    w.happyDOM.close();
  }
});
