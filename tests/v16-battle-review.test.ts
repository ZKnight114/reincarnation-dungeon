import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { Motion, actorRig } from '../src/motion';
import { parseSave } from '../src/save';
import {
  fitStarters,
  prepare,
  recruitToConfigure,
  positionEvent,
  setEnemy,
  start,
} from './helpers';
import { statusButton, statusDetails } from '../src/battle-status';
import { cells } from '../src/backpack';

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

function drainHistory(ui: UI) {
  for (let n = 0; n < 20; n++) {
    now += 2000;
    ui.render();
  }
}

test('direct supply reveals a single confirmation and switches immediately to equipment and backpack', () => {
  const g = new Game();
  recruitToConfigure(g, 1);
  g.startRun();
  prepare(g);
  g.continueCamp();
  g.continueJourney();
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  const ui = new UI(g, () => {});
  g.continueCamp();
  ui.render();
  g.continueJourney();
  ui.render();
  drainHistory(ui);
  const count = g.state.inventory.length;
  // No transient reveal sheet: narration and the roll finish before the only confirmation.
  assert.equal((node('#decision-sheet') as unknown as HTMLDialogElement).open, false);
  assert.ok(g.chooseEvent('take'));
  g.update(1);
  ui.render();
  assert.equal((node('#decision-sheet') as unknown as HTMLDialogElement).open, false);
  drainHistory(ui);
  assert.equal(win.document.querySelectorAll('#decision button').length, 1);
  assert.equal(node('#decision button').textContent, '确认');
  assert.match(node('#decision-title').textContent!, /补给/);
  assert.match(node('#decision .event-narrative').textContent!, /三件.*装备/);
  tap('[data-event="take"]');
  assert.equal(g.state.phase, 'camp');
  assert.equal(g.state.inventory.length, count + 3);
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(node('#field-items').hidden, false);
  assert.equal((node('#decision-sheet') as unknown as HTMLDialogElement).open, false);
});

test('finishing arrangement or recycling the last loose item keeps backpack open', () => {
  const g = start();
  positionEvent(g, 'battle');
  const ui = new UI(g, () => {});
  ui.render();
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  ui.render();
  drainHistory(ui);
  assert.equal(node('#view-pack').hidden, false);
  for (const item of g.looseItems()) assert.equal(g.recycleItem(item.id), true);
  ui.render();
  assert.equal(g.looseItems().length, 0);
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(node('#journey-panel').hidden, true);
  now += 2000;
  ui.render();
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(g.state.phase, 'camp');
});

test('non-equipment events narrate their result and wait for continue without opening backpack', () => {
  const cases = [
    { kind: 'rest', action: 'heal' },
    { kind: 'rest', action: 'vigor' },
    { kind: 'choice', variant: 2, action: 'heal' },
    { kind: 'choice', variant: 2, action: 'vigor' },
    { kind: 'choice', variant: 0, action: 'risk' },
    { kind: 'choice', variant: 3, action: 'risk' },
    { kind: 'choice', action: 'skip' },
    { kind: 'treasure', action: 'skip' },
    { kind: 'chance', action: 'skip' },
  ] as const;
  for (const c of cases) {
    const g = new Game();
    g.state.meta.highestChapter = 4;
    recruitToConfigure(g, 4);
    g.startRun();
    prepare(g);
    positionEvent(g, c.kind);
    if ('variant' in c) g.currentEvent()!.variant = c.variant;
    g.state.player.hp = g.state.player.maxHp * 0.4;
    const ui = new UI(g, () => {});
    drainHistory(ui);
    const index = g.state.run.index;
    assert.equal(g.chooseEvent(c.action), null);
    ui.render();
    assert.equal(node('#view-pack').hidden, true, c.kind + c.action);
    assert.equal((node('[data-action="continue"]') as HTMLButtonElement).disabled, true);
    drainHistory(ui);
    assert.equal(node('#view-pack').hidden, true, c.kind + c.action);
    assert.equal(node('#journey-panel').hidden, false);
    assert.equal((node('[data-action="continue"]') as HTMLButtonElement).disabled, false);
    assert.equal(g.state.run.index, index);
    const restored = new UI(new Game(parseSave(JSON.stringify(g.state))), () => {});
    drainHistory(restored);
    assert.equal(node('#view-pack').hidden, true, 'restored ' + c.kind + c.action);
  }
});

test('shield amounts and status stack counts appear on icons and update without replacing the button', () => {
  const g = start();
  positionEvent(g, 'battle');
  const f = g.state.combat.runtime!.hero;
  f.shield = 113.2;
  f.statuses = [
    { kind: 'poison', value: 3, remaining: 2, source: 'a' },
    { kind: 'poison', value: 5, remaining: 3, source: 'b' },
  ];
  g.state.player.shield = f.shield;
  const ui = new UI(g, () => {});
  assert.equal(node('[data-status-kind="shield"] .status-count').textContent, '114');
  assert.equal(node('[data-status-kind="poison"] .status-count').textContent, '2');
  assert.doesNotMatch(node('#player-hp').textContent!, /◇|114/);
  assert.ok(node('.hero-health > .battle-portrait .profession-icon'));
  assert.equal(win.document.querySelector('#player-hp .profession-icon'), null);
  const button = node('#hero-effects button');
  f.shield = 9;
  ui.render();
  assert.equal(node('#hero-effects button'), button);
  assert.equal(node('[data-status-kind="shield"] .status-count').textContent, '9');
  tap('[data-status-side="hero"]');
  assert.match(node('#modal-body').textContent!, /护盾.*9 点/);
});

test('manual continue flies loose equipment to reforge, credits once, then advances', () => {
  const g = start();
  positionEvent(g, 'battle');
  const ui = new UI(g, () => {});
  ui.render();
  setEnemy(g, { hp: 0 });
  g.update(0.01);
  ui.render();
  drainHistory(ui);
  const oldIndex = g.state.run.index,
    points = g.state.run.points,
    loose = g.looseItems().length;
  assert.ok(loose > 0);
  tap('[data-action="continue"]');
  assert.equal(g.state.run.index, oldIndex);
  assert.equal(g.state.run.points, points);
  assert.ok(node('.loot-reclaim-layer'));
  assert.equal(ui.holdingJourney, true);
  assert.equal((node('[data-action="continue"]') as HTMLButtonElement).disabled, true);
  tap('[data-action="continue"]');
  now += 701;
  ui.render();
  assert.equal(g.state.run.points, points + loose);
  assert.equal(g.looseItems().length, 0);
  assert.equal(g.state.run.index, oldIndex);
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(win.document.querySelector('.loot-reclaim-layer'), null);
  now += 221;
  ui.render();
  assert.equal(g.state.run.index, oldIndex + 1);
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.run.points, points + loose);
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});

test('continue without loose items advances immediately; ritual has only a centered continue', () => {
  const g = start(),
    ui = new UI(g, () => {});
  g.collectLooseEquipment();
  ui.render();
  tap('[data-action="continue"]');
  assert.equal(g.state.phase, 'journey');
  assert.equal(win.document.querySelector('.loot-reclaim-layer'), null);
  g.state.phase = 'awakening';
  g.state.awakening = { stage: 1, tier: 0, attack: 0.1, hp: 24, defense: 2, healed: 0 };
  ui.render();
  assert.equal(node('#adventure-footer').dataset.ritual, 'true');
  assert.equal(win.document.querySelector('#adventure-footer [data-action="cycle-speed"]'), null);
  assert.equal(win.document.querySelectorAll('#adventure-footer button').length, 1);
});

test('resonance choice displays the selected name and exposes manual continue after the history finishes', () => {
  const g = new Game();
  recruitToConfigure(g, 1);
  g.startRun();
  g.continueJourney();
  g.claimStarterRound();
  g.claimStarterRound();
  fitStarters(g);
  g.finishOpening();
  g.continueJourney();
  g.continueJourney();
  const ui = new UI(g, () => {});
  const key = g.state.run.rewards[0].resonances[0];
  tap(`[data-resonance="${key}"]`);
  assert.equal(g.state.phase, 'journey');
  assert.equal(node('#view-pack').hidden, true);
  assert.match(node('#journey-history').textContent!, /获得「/);
  assert.equal((node('[data-action="continue-resonance"]') as HTMLButtonElement).disabled, true);
  drainHistory(ui);
  assert.equal((node('[data-action="continue-resonance"]') as HTMLButtonElement).disabled, false);
  g.update(20);
  assert.equal(g.state.phase, 'journey');
  tap('[data-action="continue-resonance"]');
  assert.equal(g.state.phase, 'journey');
  assert.equal(g.state.run.prologue, undefined);
  assert.equal(g.state.run.index, 0);
});

test('enemy warning is absent from the combat strip while skill forecasting remains in details', () => {
  const g = start();
  positionEvent(g, 'battle');
  g.state.combat.runtime!.warning = '下一回合蓄力攻击';
  assert.doesNotMatch(statusButton(g.state, 'enemy'), /status-warning/);
  assert.match(statusDetails(g.state, 'enemy'), /下一回合蓄力攻击/);
});

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

test('an event result revealed after backpack inspection animates only the new entry', () => {
  const g = new Game();
  recruitToConfigure(g);
  g.startRun();
  prepare(g);
  positionEvent(g, 'rest');
  const ui = new UI(g, () => {});
  drainHistory(ui);
  const old = Array.from(win.document.querySelectorAll('.journey-entry'));
  assert.equal(win.document.querySelector('.journey-new'), null);
  // Opening the backpack is an ordinary UI action, not a state injection.
  tap('[data-action="open-pack"]');
  assert.equal(node('#view-pack').hidden, false);
  assert.equal(g.chooseEvent('vigor'), null);
  ui.render();
  assert.equal(node('#view-pack').hidden, true);
  const entries = Array.from(win.document.querySelectorAll('.journey-entry'));
  assert.equal(entries.length, old.length + 1);
  assert.deepEqual(entries.slice(0, -1), old, 'the previous DOM and scroll history are retained');
  assert.equal(entries.at(-1)!.classList.contains('journey-new'), true);
  assert.equal(
    old.some((entry) => entry.classList.contains('journey-new')),
    false,
  );
  assert.equal((node('#decision-sheet') as unknown as HTMLDialogElement).open, false);
});

test('moon spring presents actual current and maximum life before either choice', () => {
  const g = new Game();
  recruitToConfigure(g);
  g.startRun();
  prepare(g);
  positionEvent(g, 'rest');
  g.state.player.hp = g.state.player.maxHp * 0.4;
  const ui = new UI(g, () => {});
  drainHistory(ui);
  assert.equal((node('#decision-sheet') as unknown as HTMLDialogElement).open, true);
  assert.match(node('.spring-health').textContent!, /当前生命.*\//);
  assert.equal(node('.spring-health .bar i').style.width, '40%');
  assert.equal(win.document.querySelectorAll('#decision [data-event]').length, 2);
});

test('treasure digging grants each discovered equipment but narrates one final result', () => {
  const g = start();
  positionEvent(g, 'dig');
  const count = g.state.run.journey.length,
    initial = g.state.inventory.length;
  const d = g.state.run.dig!;
  // Reveal a complete real footprint through normal digging actions.
  const placement = d.placements[0];
  const item = d.equipment.find((i) => i.id === placement.id)!;
  for (const [x, y] of cells(item, placement.rotation)) {
    assert.equal(g.digCell((placement.y + y) * 4 + placement.x + x), null);
  }
  assert.ok(d.claimed.length > 0);
  assert.equal(g.state.inventory.length, initial + d.claimed.length);
  assert.equal(g.state.run.journey.length, count, 'discoveries do not append individual logs');
  assert.equal(g.chooseEvent('dig-finish'), null);
  assert.equal(g.state.run.journey.length, count + 1);
  assert.equal(g.state.run.journey.at(-1)!.title, '挖宝结束');
  assert.match(g.state.run.journey.at(-1)!.text, new RegExp(`挖出 ${d.claimed.length} 件装备`));
});
