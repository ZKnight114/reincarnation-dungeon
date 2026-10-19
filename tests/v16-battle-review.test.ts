import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { Motion, actorRig } from '../src/motion';
import { parseSave } from '../src/save';
import { positionEvent, setEnemy, start } from './helpers';

let win: Window;
let now = 1700000000000;
const originalNow = Date.now;
beforeEach(() => {
  now = 1700000000000;
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
const node = (selector: string) => {
  const el = win.document.querySelector(selector) as unknown as HTMLElement;
  assert.ok(el, selector);
  return el;
};
function tap(selector: string) {
  node(selector).dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event);
}

test('visible skip applies to this battle, persists reload and clears on the next enemy; hidden global capability remains', () => {
  const g = start();
  positionEvent(g, 'battle');
  const ui = new UI(g, () => {});
  ui.render();
  assert.equal(node('[data-action="skip-combat"]').classList.contains('primary-button'), true);
  assert.equal(win.document.querySelector('[data-action="fast-explore"]'), null);
  tap('[data-action="skip-combat"]');
  assert.equal(g.state.combat.skip, true);
  assert.equal(g.state.skipCombat, false);
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.skippingCombat(), true);
  positionEvent(
    restored,
    'battle',
    restored.state.run.events.findIndex((e, i) => i > 0 && e.kind === 'battle'),
  );
  assert.equal(restored.skippingCombat(), false);
  restored.state.skipCombat = true;
  assert.equal(new Game(parseSave(JSON.stringify(restored.state))).skippingCombat(), true);
});

test('old visible global-skip saves are normalized without losing the active encounter or run', () => {
  const g = start();
  positionEvent(g, 'battle');
  const old = structuredClone(g.state);
  delete old.combat.skip;
  old.skipCombat = true;
  const restored = parseSave(JSON.stringify(old));
  assert.equal(restored.combat.skip, true);
  assert.equal(restored.skipCombat, false);
  assert.equal(restored.run.trainee!.id, old.run.trainee!.id);
  assert.deepEqual(restored.draft, old.draft);
});

test('Boss encounter animation starts only after confirming difficulty and holds combat during the dash', () => {
  const g = start();
  g.state.run.index = 8;
  g.state.run.events.forEach((e, i) => (e.completed = i < 8));
  g.continueCamp();
  const ui = new UI(g, () => {});
  ui.render();
  assert.equal(node('#battle-panel').classList.contains('encounter-approach'), false);
  g.continueJourney();
  ui.render();
  assert.equal(g.state.phase, 'event');
  assert.equal(node('#battle-panel').classList.contains('encounter-approach'), false);
  assert.equal(
    win.document.querySelectorAll('.trial-quality-blue,.trial-quality-purple,.trial-quality-gold')
      .length,
    3,
  );
  tap('[data-action="challenge-trial"]');
  assert.equal(g.state.phase, 'combat');
  assert.equal(ui.holdingCombat, true);
  assert.equal(node('#battle-panel').classList.contains('encounter-approach'), true);
  now += 681;
  ui.render();
  assert.equal(ui.holdingCombat, false);
  assert.equal(node('#battle-panel').classList.contains('encounter-approach'), false);
});

test('victory history is readable before loose loot even on an ongoing historical run', () => {
  const g = start();
  positionEvent(g, 'battle');
  const ui = new UI(g, () => {});
  ui.render();
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  ui.render();
  assert.equal(g.state.phase, 'camp');
  assert.equal(node('#view-pack').hidden, true);
  assert.equal(node('#field-items').hidden, true);
  assert.match(node('#journey-history').textContent!, /击败了/);
  assert.equal((node('[data-action="continue"]') as HTMLButtonElement).disabled, true);
  now += 501;
  ui.render();
  assert.equal(node('#view-pack').hidden, true);
  now += 901;
  ui.render();
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(node('#field-items').hidden, false);
});

test('new history resumes following newest text after reading older entries', () => {
  const g = start(),
    ui = new UI(g, () => {});
  ui.render();
  tap('[data-action="continue"]');
  const history = node('#journey-history');
  Object.defineProperties(history, { scrollHeight: { value: 1200 }, clientHeight: { value: 300 } });
  history.scrollTop = 20;
  history.dispatchEvent(new win.Event('scroll') as unknown as Event);
  ui.render();
  assert.equal(history.scrollTop, 20, 'reading within the same history is not interrupted');
  g.continueJourney();
  ui.render();
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  now += 1000;
  ui.render();
  assert.equal(history.scrollTop, 1200, 'new result resets follow mode');
});

test('hero HUD separates identity, life bar and three stat columns; statuses still open details', () => {
  const g = start();
  positionEvent(g, 'battle');
  const ui = new UI(g, () => {});
  ui.render();
  assert.ok(node('#combat-hud > strong > small'));
  assert.ok(node('#combat-hud > .hud-life .hud-health-track'));
  assert.equal(win.document.querySelectorAll('#combat-hud > .hud-values > span').length, 3);
  tap('[data-status-side="hero"]');
  assert.match(node('.battle-status-details').textContent!, /状态/);
});

test('damage feedback remains visible with reduced motion and at 4x; zero loss never displays fake damage', () => {
  node('#app').innerHTML = actorRig('', 'hero');
  Object.defineProperty(win, 'matchMedia', { value: () => ({ matches: true }) });
  const motion = new Motion(node('#app'));
  motion.sync(4);
  motion.number('hero', 'hurt', 0);
  assert.equal(win.document.querySelector('.combat-number'), null);
  motion.number('hero', 'hurt', 12);
  assert.equal(node('.combat-number.hurt').textContent, '−12');
  motion.reset();
});
