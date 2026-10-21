import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, storyDuration } from '../src/game';
import { UI } from '../src/ui';
import { parseSave } from '../src/save';
import { viewportFit } from '../src/viewport-fit';
import { fitStarters, recruitToConfigure, seed } from './helpers';

test('opening UI plays supply, equipment completion, resonance prompt and result with two manual continues', () => {
  const w = new Window({ url: 'http://localhost/' }),
    originalNow = Date.now;
  let now = 1700000000000;
  Date.now = () => now;
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  w.document.body.innerHTML = '<div id="app"></div>';
  const g = new Game(undefined, seed(19));
  recruitToConfigure(g);
  g.startRun();
  const ui = new UI(g, () => {});
  const click = (q: string) => {
    const b = w.document.querySelector(q) as unknown as HTMLButtonElement | null;
    assert.ok(b, q);
    assert.equal(b.disabled, false, q);
    b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }) as unknown as Event);
  };
  const playUntil = (done: () => boolean) => {
    for (let n = 0; n < 100 && !done(); n++) {
      now += 100;
      if (!ui.holdingJourney && !ui.holdingCombat) g.update(0.1);
      ui.render();
    }
    assert.ok(done());
  };
  const ready = () =>
    !!w.document.querySelector('[data-action="continue-resonance"]:not(:disabled)');
  try {
    assert.equal(w.document.querySelectorAll('.journey-pending').length, 1);
    assert.equal(w.document.querySelectorAll('.journey-new').length, 0);
    assert.equal(ui.holdingJourney, true, 'the scene paints before the first departure line');
    assert.equal(
      w.document.querySelector('#adventure-footer .footer-main button')!.textContent,
      '冒险中...',
    );
    now += 150;
    ui.render();
    assert.equal(w.document.querySelectorAll('.journey-new').length, 1);
    now += 300;
    ui.render();
    assert.equal(
      ui.holdingJourney,
      true,
      'the departure reveal remains visible long enough to perceive',
    );
    playUntil(() => g.state.phase === 'opening');
    assert.match(g.state.run.journey[0].text, /公会.*装备补给/);
    click('[data-action="claim-starters"]');
    click('[data-action="claim-starters"]');
    fitStarters(g);
    ui.render();
    click('[data-action="finish-opening"]');
    playUntil(() => g.state.run.prologue === 'equipped');
    assert.equal(w.document.querySelectorAll('.journey-new').length > 0, true);
    assert.equal(g.state.run.prologue, 'equipped');
    assert.equal(g.state.run.rewards.length, 0);
    assert.equal(w.document.querySelector('#decision-sheet')!.hasAttribute('open'), false);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
    playUntil(ready);
    g.update(30);
    assert.equal(g.state.run.prologue, 'equipped');
    click('[data-action="continue-resonance"]');
    assert.equal(g.state.run.prologue, 'resonance');
    assert.equal(g.state.run.journey.at(-1)!.title, '选择初始共鸣');
    playUntil(() => g.state.phase === 'initial' && !!w.document.querySelector('[data-resonance]'));
    click('[data-resonance]');
    assert.equal(g.state.run.prologue, 'ready');
    playUntil(ready);
    g.update(30);
    assert.equal(g.state.run.prologue, 'ready');
    click('[data-action="continue-resonance"]');
    assert.equal(g.state.phase, 'journey');
    assert.equal(g.state.run.prologue, undefined);
    assert.equal(g.state.run.index, 0);
    assert.equal(g.state.run.resonances.length, 1);
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
    playUntil(() => g.state.phase === 'combat');
  } finally {
    Date.now = originalNow;
    w.happyDOM.close();
  }
});

test('Boss and end-of-run choices follow narrative reveal without a second three-second wait', () => {
  for (const kind of ['boss', 'elite', 'graduation', 'ending'] as const)
    assert.ok(storyDuration({ kind, completed: false, variant: 0 }) <= 0.6);
});

test('portrait phones fill their visible frame while retaining square cells and all controls', () => {
  for (const [w, h] of [
    [360, 640],
    [390, 686],
    [412, 732],
    [430, 932],
  ]) {
    const fit = viewportFit(w, h);
    assert.equal(fit.mobile, true);
    assert.equal(fit.frameWidth, w);
    assert.equal(fit.frameHeight, h);
    assert.ok(fit.contentWidth <= w + 1e-9 && fit.contentHeight <= h + 1e-9);
    assert.ok(Math.abs(fit.contentWidth / 390 - fit.contentHeight / 844) < 1e-9);
  }
  assert.equal(viewportFit(1280, 720).mobile, false);
  assert.equal(viewportFit(844, 390).mobile, false);
});
