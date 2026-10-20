import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { RESONANCES } from '../src/backpack';
import { parseSave } from '../src/save';
import { UI } from '../src/ui';
import { fitStarters, recruitToConfigure } from './helpers';

let win: Window,
  now = 1700000000000;
const originalNow = Date.now;
beforeEach(() => {
  Date.now = () => now;
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  Date.now = originalNow;
  return win.happyDOM.close();
});
function initial() {
  const g = new Game();
  recruitToConfigure(g);
  g.startRun();
  g.continueJourney();
  g.claimStarterRound();
  g.claimStarterRound();
  fitStarters(g);
  assert.equal(g.finishOpening(), null);
  g.continueJourney();
  g.continueJourney();
  return g;
}
function drain(ui: UI) {
  for (let n = 0; n < 20; n++) {
    now += 2000;
    ui.render();
  }
}
function tap(q: string) {
  const el = win.document.querySelector(q);
  assert.ok(el, q);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}

test('shared refresh changes exactly one candidate and persists its single use', () => {
  const g = initial(),
    before = [...g.state.run.rewards[0].resonances];
  assert.equal(g.refreshResonance(1), null);
  const reward = g.state.run.rewards[0];
  assert.equal(reward.resonances[0], before[0]);
  assert.equal(reward.resonances[2], before[2]);
  assert.ok(!before.includes(reward.resonances[1]));
  assert.equal(new Set(reward.resonances).size, 3);
  assert.ok(reward.resonances.every((k) => RESONANCES[k].rank === 1));
  const saved = parseSave(JSON.stringify(g.state));
  assert.equal(saved.run.rewards[0].refreshUsed, true);
  const restored = new Game(saved),
    snapshot = JSON.stringify(restored.state);
  assert.ok(restored.refreshResonance(2));
  assert.equal(JSON.stringify(restored.state), snapshot);
});

test('invalid indices and exhausted candidate pool do not consume opportunity or change state', () => {
  const g = initial(),
    snapshot = JSON.stringify(g.state);
  for (const n of [-1, 3, 1.5, NaN]) assert.ok(g.refreshResonance(n));
  assert.equal(JSON.stringify(g.state), snapshot);
  g.resonanceChoices = () => [...g.state.run.rewards[0].resonances];
  assert.ok(g.refreshResonance(0));
  assert.equal(JSON.stringify(g.state), snapshot);
});

test('old rewards without refresh flag remain loadable; malformed flags are rejected', () => {
  const g = initial();
  delete g.state.run.rewards[0].refreshUsed;
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.refreshResonance(0), null);
  const invalid = structuredClone(g.state) as any;
  invalid.run.rewards[0].refreshUsed = 'false';
  assert.throws(() => parseSave(JSON.stringify(invalid)));
});

test('later refresh preserves prerequisite rules and never offers an already selected resonance', () => {
  const g = initial();
  const chosen = g.state.run.rewards[0].resonances[0];
  g.chooseResonance(chosen);
  // Isolate the replacement rule from travel; current offer has three legal later candidates.
  g.state.phase = 'reward';
  g.state.run.rewards = [
    {
      kind: 'resonance',
      title: '选择共鸣',
      buffs: [],
      resonances: g.resonanceChoices().slice(0, 3),
    },
  ];
  assert.equal(g.refreshResonance(0), null);
  for (const k of g.state.run.rewards[0].resonances) {
    assert.notEqual(k, chosen);
    assert.ok(g.resonanceChoices().includes(k));
  }
});

test('details and backpack are secondary dialogs; refresh cannot accidentally select a resonance', () => {
  const g = initial(),
    ui = new UI(g, () => {});
  drain(ui);
  const before = JSON.stringify(g.state.run.rewards),
    draft = JSON.stringify(g.state.draft);
  assert.equal(win.document.querySelectorAll('.resonance-candidate').length, 3);
  assert.equal(win.document.querySelectorAll('.resonance-levels').length, 0);
  tap('[data-resonance-detail]');
  assert.equal(win.document.querySelectorAll('.resonance-detail-tiers section').length, 3);
  assert.equal((win.document.querySelector('#modal') as unknown as HTMLDialogElement).open, true);
  assert.equal(
    (win.document.querySelector('#decision-sheet') as unknown as HTMLDialogElement).open,
    true,
  );
  assert.equal(JSON.stringify(g.state.run.rewards), before);
  tap('#modal [data-action="close"]');
  tap('[data-resonance-pack]');
  assert.ok(win.document.querySelector('.resonance-pack-preview'));
  assert.equal(JSON.stringify(g.state.draft), draft);
  tap('#modal [data-action="close"]');
  tap('[data-refresh-resonance="0"]');
  assert.equal(g.state.phase, 'initial');
  assert.equal(g.state.run.resonances.length, 0);
  assert.equal(win.document.querySelectorAll('[data-refresh-resonance]:disabled').length, 3);
  tap('[data-resonance]');
  assert.equal(g.state.run.resonances.length, 1);
  assert.equal(g.state.phase, 'journey');
  assert.equal(
    (win.document.querySelector('#decision-sheet') as unknown as HTMLDialogElement).open,
    false,
  );
});
