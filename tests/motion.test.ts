import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { Motion, actorRig } from '../src/motion';
import { ACTOR_APPEARANCE } from '../src/actor-appearance';
import { actorMotion, heroRig } from '../src/pixel';
import { add, positionEvent, start } from './helpers';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => win.happyDOM.close());
const node = (selector: string) => {
  const el = win.document.querySelector(selector) as unknown as HTMLElement | null;
  assert.ok(el, selector);
  return el;
};

test('replacing static art disables a stale sheet but retains the same movement rig and anchors', () => {
  const original = ACTOR_APPEARANCE.warrior;
  try {
    assert.ok(actorMotion('warrior'));
    ACTOR_APPEARANCE.warrior = {
      ...original,
      image: 'new-warrior-full',
      anchors: { center: [46, 40], cast: [88, 37], scale: 0.94 },
    };
    assert.equal(
      actorMotion('warrior'),
      '',
      'old action frames cannot display the previous character',
    );
    node('#app').innerHTML = heroRig('warrior');
    assert.equal(node('.actor-rig').classList.contains('has-sheet'), false);
    assert.equal(node('.actor-rig').style.getPropertyValue('--actor-cast-x'), '88%');
    assert.ok(node('.actor-body .hero-portrait'));
    assert.ok(node('.actor-shadow'));
    assert.ok(node('.actor-fx-layer'));
    const motion = new Motion(node('#app'));
    motion.hit('hero');
    assert.equal(win.document.querySelectorAll('.actor-effect').length, 2);
    motion.reset();
  } finally {
    ACTOR_APPEARANCE.warrior = original;
  }
});

test('each discrete action plays once; rendering and motion cannot advance combat or change a paused run', async () => {
  const g = start(),
    ui = new UI(g, () => {});
  positionEvent(g, 'battle');
  g.state.isRunning = false;
  g.advanceTurn();
  const snapshot = JSON.stringify(g.state);
  ui.render();
  const actor = node(`.${g.state.combat.lastActor}-fighter`);
  assert.ok(actor.classList.contains('acting'));
  ui.render();
  assert.equal(JSON.stringify(g.state), snapshot);
  await new Promise((resolve) => setTimeout(resolve, 365));
  ui.render();
  assert.equal(
    actor.classList.contains('acting'),
    false,
    'same lastActor cannot restart on every UI frame',
  );
  assert.equal(JSON.stringify(g.state), snapshot);
});

test('equipment landing and merging preserve occupied coordinates and health, and do not replay on an unchanged render', () => {
  const g = start(),
    ui = new UI(g, () => {});
  const p = { ...g.state.draft[0] },
    item = g.findItem(p.id)!;
  assert.equal(g.moveToUpper(item.id), true);
  ui.render();
  const hp = g.state.player.hp;
  assert.equal(g.moveItem(item.id, p.x, p.y), null);
  ui.render();
  const receiver = node(`[data-pack-item="${item.id}"]`);
  assert.ok(receiver.classList.contains('equipment-landed'));
  const target = g.state.draft.find((x) => x.id === item.id)!;
  const duplicate = add(g, item.templateId);
  ui.render();
  assert.equal(g.mergeItems(duplicate.id, item.id), null);
  ui.render();
  assert.ok(node(`[data-pack-item="${item.id}"]`).classList.contains('equipment-merged'));
  assert.deepEqual(
    g.state.draft.find((x) => x.id === item.id),
    target,
  );
  assert.equal(g.state.player.hp, hp);
  assert.equal(g.findItem(duplicate.id), null);
  const current = node(`[data-pack-item="${item.id}"]`);
  ui.render();
  assert.equal(node(`[data-pack-item="${item.id}"]`), current);
});

test('item contributions cannot impersonate a resonance activation; only the actual resonance source lights its slot', () => {
  const g = start(),
    ui = new UI(g, () => {}),
    key = g.state.run.resonances[0];
  positionEvent(g, 'battle');
  ui.render();
  const item = g.state.inventory[0];
  g.feedback.push({ serial: 100, id: item.id, kind: 'trigger', amount: 1 });
  ui.render();
  assert.ok(node(`[data-pack-item="${item.id}"]`).classList.contains('triggered'));
  assert.equal(
    node(`[data-inspect-resonance="${key}"]`).classList.contains('resonance-fired'),
    false,
  );
  g.feedback.push({ serial: 101, id: 'resonance:' + key, kind: 'trigger', amount: 1 });
  ui.render();
  assert.ok(node(`[data-inspect-resonance="${key}"]`).classList.contains('resonance-fired'));
});

test('HP feedback starts at current HP, clamps visual percentages and resets for a different encounter', () => {
  node('#app').innerHTML = '<div class="bar"><i id="hp"></i></div>';
  const motion = new Motion(node('#app')),
    hp = node('#hp');
  motion.health(hp, 45, 100, 'one');
  assert.equal(hp.style.width, '45%');
  assert.equal(node('.health-trail').style.width, '45%');
  assert.equal(node('.bar').classList.contains('health-damaged'), false);
  motion.health(hp, 20, 100, 'one');
  assert.ok(node('.bar').classList.contains('health-damaged'));
  motion.health(hp, 60, 100, 'one');
  assert.ok(node('.bar').classList.contains('health-restored'));
  motion.health(hp, 200, 100, 'two');
  assert.equal(hp.style.width, '100%');
  motion.health(hp, NaN, 0, 'two');
  assert.equal(hp.style.width, '0%');
  motion.reset();
});

test('projectiles compensate for scaled canvases and remain inside the noninteractive scene instead of body overlays', () => {
  node('#app').innerHTML =
    `<div id="battle-panel">${actorRig('', 'hero')}${actorRig('', 'enemy')}</div>`;
  const motion = new Motion(node('#app')),
    panel = node('#battle-panel'),
    source = motion.rig('hero')!,
    target = motion.rig('enemy')!;
  panel.getBoundingClientRect = () => ({ left: 20, top: 5, width: 195, height: 94 }) as DOMRect;
  Object.defineProperties(panel, { offsetWidth: { value: 390 }, offsetHeight: { value: 188 } });
  source.getBoundingClientRect = () => ({ left: 50, top: 10, width: 100, height: 150 }) as DOMRect;
  target.getBoundingClientRect = () => ({ left: 260, top: 10, width: 100, height: 150 }) as DOMRect;
  motion.projectile(source, 'enemy', 'bolt');
  const projectile = node('.combat-projectile');
  assert.equal(projectile.parentElement, panel);
  assert.equal(projectile.style.left, '224px');
  assert.equal(projectile.style.getPropertyValue('--tx'), '356px');
  motion.reset();
  assert.equal(win.document.querySelector('.combat-projectile'), null);
});

test('4x effects are bounded and reset removes stale timers; reduced motion suppresses decorative effects', () => {
  node('#app').innerHTML = actorRig('', 'hero');
  const motion = new Motion(node('#app'));
  motion.sync(4);
  assert.equal(node('#app').style.getPropertyValue('--motion-factor'), '0.25');
  for (let n = 0; n < 100; n++) motion.effect('hero', 'impact');
  assert.equal(win.document.querySelectorAll('.actor-effect').length, 28);
  motion.reset();
  assert.equal(win.document.querySelectorAll('.actor-effect').length, 0);
  Object.defineProperty(win, 'matchMedia', { value: () => ({ matches: true }) });
  motion.effect('hero', 'impact');
  motion.number('hero', 'hurt', 10);
  motion.pulse(node('.actor-rig'), 'hurt');
  assert.equal(win.document.querySelectorAll('.actor-effect,.combat-number,.hurt').length, 0);
});
