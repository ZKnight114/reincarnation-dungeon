import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, STORY_SECONDS, storyDuration } from '../src/game';
import { UI } from '../src/ui';
import { eventStory } from '../src/journey';
import { parseSave } from '../src/save';
import { start, add, recruitToConfigure, positionEvent } from './helpers';

test('each node plays its own story before combat or event; resolution waits for explicit continue', () => {
  const g = start();
  assert.equal(g.continueCamp(), null);
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.enemy, null);
  const story = g.state.run.journey.at(-1)!;
  assert.equal(story.text, eventStory(g.currentEvent()!.kind, g.currentEvent()!.variant));
  g.update(storyDuration(g.currentEvent()!) / 2);
  assert.equal(g.state.phase, 'journey');
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.state.run.storyElapsed, storyDuration(g.currentEvent()!) / 2);
  restored.update(storyDuration(g.currentEvent()!) / 2);
  assert.equal(restored.state.phase, 'combat');
  assert.equal(restored.state.combat.round, 1);
  assert.equal(restored.state.combat.actionIndex, 0);
  restored.state.enemy!.hp = 0;
  restored.advanceTurn();
  assert.equal(restored.state.phase, 'camp');
  const ids = restored.looseItems().map((i) => i.id),
    node = restored.state.run.index;
  restored.state.run.autoExplore = true;
  restored.update(60);
  assert.equal(restored.state.phase, 'camp');
  assert.equal(restored.state.run.index, node);
  assert.deepEqual(
    restored.looseItems().map((i) => i.id),
    ids,
  );
  restored.continueCamp();
  assert.equal(restored.state.phase, 'journey');
  assert.equal(restored.state.run.index, node + 1);
  assert.ok(ids.every((id) => !restored.findItem(id)));
  assert.equal(restored.state.run.journey.at(-1)!.event, node + 2);
  assert.equal(restored.continueJourney(), true);
  assert.equal(restored.state.phase, 'event');
  assert.equal(restored.continueJourney(), false);
});
test('all 37 nodes have a story gate including trial, digging and both graduation choices', () => {
  const g = start();
  let gates = 0,
    steps = 0;
  while (g.state.phase !== 'summary' && steps++ < 400) {
    const s = g.state;
    if (s.phase === 'camp') assert.equal(g.continueCamp(), null);
    else if (s.phase === 'journey') {
      gates++;
      assert.equal(s.enemy, null);
      assert.equal(s.run.dig, null);
      assert.equal(s.run.journey.at(-1)!.event, s.run.index + 1);
      assert.equal(g.continueJourney(), true);
    } else if (s.phase === 'combat') {
      s.enemy!.hp = 0;
      g.advanceTurn();
    } else if (s.phase === 'awakening') g.finishAwakening();
    else if (s.phase === 'reward') g.chooseReward(0);
    else if (s.phase === 'event') {
      const e = g.currentEvent()!;
      assert.equal(
        g.chooseEvent(
          ['elite', 'boss'].includes(e.kind)
            ? 'trial-0'
            : e.kind === 'rest'
              ? 'heal'
              : e.kind === 'supply'
                ? 'take'
                : e.kind === 'treasure'
                  ? 'open'
                  : e.kind === 'dig'
                    ? 'dig-finish'
                    : e.kind === 'graduation'
                      ? 'extreme'
                      : e.kind === 'ending'
                        ? 'finish'
                        : e.variant === 2
                          ? 'heal'
                          : 'skip',
        ),
        null,
      );
    }
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
  assert.equal(gates, 37);
  assert.equal(g.completed(), 37);
});
test('upper merge preserves receiver, shape and zero contribution until packed; rejects mismatch and Lv4 without mutations', () => {
  const g = start(),
    a = add(g, 'warrior_pole_3'),
    b = add(g, a.templateId),
    layout = structuredClone(g.state.draft),
    hp = g.state.player.hp,
    points = g.state.run.points;
  assert.equal(g.mergeItems(a.id, b.id), null);
  assert.equal(g.findItem(a.id), null);
  assert.equal(b.level, 2);
  assert.equal(b.quality, 'green');
  assert.deepEqual(g.state.draft, layout);
  assert.ok(g.looseItems().includes(b));
  assert.equal(g.state.player.hp, hp);
  assert.equal(g.state.run.points, points);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  for (const [template, level] of [
    ['warrior_guard_3', 2],
    ['warrior_pole_3', 1],
    ['warrior_pole_3', 4],
  ] as const) {
    const other = add(g, template, level),
      before = JSON.stringify(g.state);
    assert.ok(g.mergeItems(other.id, b.id));
    assert.equal(JSON.stringify(g.state), before);
  }
  const max = add(g, 'warrior_pole_3', 4),
    max2 = add(g, max.templateId, 4),
    before = JSON.stringify(g.state);
  assert.match(g.mergeItems(max.id, max2.id)!, /4 级/);
  assert.equal(JSON.stringify(g.state), before);
});
test('unclaimed starter offers merge in the upper area and advance batches once without losing offers', () => {
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
  const target = g.state.run.starterOffers[0],
    donor = add(g, target.templateId);
  assert.equal(g.mergeItems(donor.id, target.id), null);
  assert.ok(g.state.inventory.includes(target));
  assert.equal(target.level, 2);
  assert.equal(g.state.run.starterOffers.length, 2);
  assert.equal(g.state.run.starterRound, 0);
  g.claimStarterRound();
  assert.equal(g.state.run.starterRound, 1);
  assert.equal(g.state.run.starterOffers.length, 3);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('native-style pointer gestures merge upper items, highlight targets and ignore holes in L shapes', () => {
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
      a = add(g, 'warrior_pole_3'),
      b = add(g, a.templateId),
      ui = new UI(g, () => {});
    const root = win.document.querySelector('#adventure-screen')!,
      grid = win.document.querySelector('#pack-grid')!;
    const rect = (left: number, top: number, width: number, height: number) => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    });
    (grid as any).getBoundingClientRect = () => rect(0, 300, 350, 300);
    (win.document.querySelector('#field-items') as any).getBoundingClientRect = () =>
      rect(0, 0, 350, 200);
    (win.document.querySelector('#battle-panel') as any).getBoundingClientRect = () =>
      rect(0, 0, 350, 250);
    const source = win.document.querySelector(`[data-pack-item="${a.id}"]`)!,
      target = win.document.querySelector(`[data-pack-item="${b.id}"]`)!;
    (source as any).getBoundingClientRect = () => rect(10, 20, 80, 80);
    (target as any).getBoundingClientRect = () => rect(150, 20, 80, 80);
    const pointer = (type: string, x: number, y: number) =>
      root.dispatchEvent(
        new win.PointerEvent(type, {
          bubbles: true,
          pointerType: 'touch',
          pointerId: 9,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    source.dispatchEvent(
      new win.PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 9,
        button: 0,
        clientX: 70,
        clientY: 40,
      }),
    );
    pointer('pointermove', 170, 40);
    assert.equal(target.classList.contains('merge-target'), false);
    pointer('pointermove', 210, 40);
    assert.equal(target.classList.contains('merge-target'), true);
    pointer('pointerup', 210, 40);
    assert.equal(b.level, 2);
    assert.equal(g.findItem(a.id), null);
    assert.equal(
      g.state.draft.some((p) => p.id === b.id),
      false,
    );
    assert.equal(win.document.querySelector('.drag-floating'), null);
    assert.equal((win.document.querySelector('#equipment-detail') as any).open, false);
    ui.render();
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  } finally {
    win.happyDOM.close();
  }
});
test('journey shows the current sentence without a dialog or backpack, then special results remain until continue', () => {
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
    g.continueCamp();
    ui.render();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, true);
    assert.equal((win.document.querySelector('#decision-sheet') as any).open, false);
    assert.equal(
      win.document.querySelectorAll('.journey-entry').length,
      g.state.run.journey.length,
    );
    assert.ok(win.document.querySelector('#battle-panel.exploring'));
    assert.ok(win.document.querySelector('[data-action="continue-story"]'));
    g.continueJourney();
    ui.render();
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, false);
    positionEvent(g, 'rest');
    ui.render();
    g.chooseEvent('heal');
    ui.render();
    assert.match(win.document.querySelector('#journey-history')!.textContent!, /恢复/);
    g.update(100);
    ui.render();
    assert.equal(g.state.phase, 'camp');
    assert.ok(win.document.querySelector('[data-action="continue"]'));
    g.state.run.points = 6;
    g.redeemEquipment();
    ui.render();
    assert.ok(win.document.querySelector('#battle-panel.exploring.has-offers'));
    assert.equal((win.document.querySelector('#view-pack') as any).hidden, false);
  } finally {
    win.happyDOM.close();
  }
});
