import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { BattleEngine, battleRuntime, fighter } from '../src/combat';
import { cooldownView } from '../src/cooldown';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { Motion } from '../src/motion';
import { cells, dimensions, buildSources, validateLayout, runBagCells } from '../src/backpack';
import { CATALOGUE } from '../src/catalogue';
import { itemPainting } from '../src/scene';
import { parseSave } from '../src/save';
import { OLD_SPEAR_CELLS } from '../src/footprints';
import { start, positionEvent, setEnemy, settleJourneyUI } from './helpers';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  for (const [, name] of main.matchAll(/import '\.\/([^']+)\.css';/g)) {
    const style = win.document.createElement('style');
    style.textContent = readFileSync(new URL('../src/' + name + '.css', import.meta.url), 'utf8');
    win.document.head.append(style);
  }
  win.document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => win.happyDOM.close());
const el = (q: string) => {
  const n = document.querySelector(q);
  assert.ok(n, q);
  return n as HTMLElement;
};

test('a three-turn cooldown clears 0, 1/3, 2/3, 1 from its actual activation, survives resume and resets only on firing', () => {
  const stats = { attack: 10, hp: 10000, defense: 0, speed: 10 };
  const skill = { cooldown: 3, actions: [{ kind: 'damage' as const, a: 1 }] };
  const r = battleRuntime(
    fighter(stats, 'warrior'),
    fighter(stats, 'warrior'),
    [
      {
        id: 'support',
        name: 'support',
        kind: 'item',
        skills: [{ cooldown: 1, actions: [{ kind: 'shield', a: 0.1 }] }],
      },
      { id: 'blade', name: 'blade', kind: 'item', skills: [skill] },
    ],
    'slime',
  );
  let engine = new BattleEngine(r, 1);
  engine.heroTurn();
  assert.deepEqual(cooldownView(r, 'blade', 0, skill), { remaining: 3, progress: 0 });
  for (const [turn, progress] of [
    [2, 1 / 3],
    [3, 2 / 3],
    [4, 1],
  ]) {
    engine.beginHeroTurn();
    assert.deepEqual(cooldownView(r, 'blade', 0, skill), { remaining: 4 - turn, progress });
    engine.nextHeroSource(); // another source cannot change the sword's clock
    assert.equal(cooldownView(r, 'blade', 0, skill).progress, progress);
    const resumed = JSON.parse(JSON.stringify(r));
    assert.deepEqual(cooldownView(resumed, 'blade', 0, skill), cooldownView(r, 'blade', 0, skill));
    engine.nextHeroSource();
    if (turn === 4)
      assert.deepEqual(cooldownView(r, 'blade', 0, skill), { remaining: 3, progress: 0 });
  }
});

test('cooldown clips the bottom of the exact item silhouette; whole artwork never changes brightness', () => {
  const g = start();
  positionEvent(g, 'battle');
  g.state.isRunning = false;
  const ui = new UI(g, () => {}),
    r = g.state.combat.runtime!;
  const item = g.state.inventory.find(
    (i) =>
      g.state.placements.some((p) => p.id === i.id) &&
      r.sources.find((s) => s.id === i.id)?.skills.some((s) => s.cooldown >= 3),
  )!;
  assert.ok(item);
  const skills = r.sources.find((s) => s.id === item.id)!.skills;
  const index = skills.findIndex((s) => s.cooldown > 0),
    skill = skills[index];
  r.flags[`${item.id}:${index}:firedAt`] = 1;
  for (const elapsed of [0, 1, 2, 3]) {
    r.heroActions = 1 + elapsed;
    ui.render();
    const piece = el(`[data-pack-item="${item.id}"]`),
      rect = piece.querySelector('clipPath rect')!;
    const h = dimensions(item, { rotation: 0 }).h * 100;
    assert.ok(
      Math.abs(Number(rect.getAttribute('y')) - Math.min(1, elapsed / skill.cooldown) * h) < 1e-6,
    );
    assert.equal(
      piece.querySelector('.item-cooldown-mask')!.getAttribute('d'),
      piece.querySelector('.item-outline')!.getAttribute('d'),
    );
    assert.equal(getComputedStyle(piece.querySelector('.item-painting')!).filter, '');
  }
});

test('cooling source steps produce no hero attacks; actual offensive activation flashes its own item and uses its weapon style', () => {
  const g = start();
  positionEvent(g, 'battle');
  setEnemy(g, { hp: 100000, maxHp: 100000, attack: 0, speed: 1 });
  g.state.combat.order = ['hero', 'enemy'];
  g.state.isRunning = false;
  const ui = new UI(g, () => {}),
    motion = (ui as unknown as { motion: Motion }).motion;
  const acts: string[] = [],
    original = motion.act.bind(motion);
  motion.act = (side, style) => {
    acts.push(`${side}:${style}`);
    original(side, style);
  };
  const r = g.state.combat.runtime!;
  for (const s of r.sources)
    s.skills.forEach((skill, n) => {
      if (skill.cooldown) r.timers[`${s.id}:${n}`] = 2;
    });
  g.state.isRunning = true;
  g.update(0.7);
  ui.render();
  while (r.heroTurn) {
    g.update(0.35);
    ui.render();
  }
  assert.equal(acts.length, 0, 'a whole hero turn spent cooling is idle');
  g.update(0.7);
  ui.render();
  const before = g.feedback.at(-1)?.serial ?? 0;
  g.update(0.7);
  ui.render();
  while (r.heroTurn) {
    g.update(0.35);
    ui.render();
  }
  assert.ok(acts.some((a) => a.startsWith('hero:')));
  for (const signal of g.feedback.filter(
    (f) => f.serial > before && f.kind === 'trigger' && f.id.startsWith('item-'),
  )) {
    const piece = el(`[data-pack-item="${signal.id}"]`);
    assert.ok(piece.querySelector('.item-activation-rim'));
    assert.equal(piece.querySelector('.item-activation-label')!.textContent, '发动');
  }
  const count = acts.length;
  ui.render();
  assert.equal(acts.length, count, 'unchanged rendering cannot replay an attack');
});

test('a lethal weapon activation still animates after combat runtime is cleared, then the hero remains behind loot', async () => {
  const g = start();
  positionEvent(g, 'battle');
  g.state.combat.order = ['hero', 'enemy'];
  setEnemy(g, { hp: 1, attack: 0, speed: 1 });
  const ui = new UI(g, () => {});
  while (g.state.phase === 'combat') g.update(0.35);
  ui.render();
  assert.equal(g.state.combat.runtime, null);
  assert.equal(g.state.phase, 'camp');
  const actor = el('.hero-fighter');
  assert.ok(actor.classList.contains('acting'));
  assert.equal(
    getComputedStyle(actor.querySelector('.actor-body')!).animation.includes('motion-strike'),
    true,
  );
  assert.equal(el('#battle-panel').classList.contains('has-offers'), false);
  await settleJourneyUI(ui);
  assert.equal(el('#battle-panel').classList.contains('has-offers'), true);
  assert.equal(getComputedStyle(el('.battle-scene')).zIndex, '-1');
});

test('journey reveals each whole framed entry once, keeps all history and one node heading', () => {
  const g = start(),
    ui = new UI(g, () => {});
  g.continueCamp();
  ui.render();
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    while (document.querySelector('.journey-pending')) {
      now += 501;
      ui.render();
    }
    now += 501;
    const old = Array.from(document.querySelectorAll('.journey-entry'));
    g.state.run.journey.push(
      ...['遭遇', '结果', '收益'].map((title) => ({
        event: 1,
        title,
        text: title,
        kind: 'story' as const,
      })),
    );
    g.state.revision++;
    ui.render();
    const group = el('[data-journey-node="1"]');
    assert.equal(group.querySelectorAll('.journey-time').length, 1);
    const entries = Array.from(group.querySelectorAll<HTMLElement>('.journey-entry')).slice(-3);
    assert.equal(entries.filter((n) => n.classList.contains('journey-pending')).length, 2);
    assert.equal(
      getComputedStyle(entries[1]).display,
      'none',
      'pending frames stay hidden under playing-story styles',
    );
    assert.match(getComputedStyle(entries[0]).animation, /journey-reveal/);
    assert.ok(entries.every((n) => n.classList.contains('journey-entry-frame')));
    now += 501;
    ui.render();
    assert.equal(getComputedStyle(entries[1]).display, 'block');
    assert.equal(getComputedStyle(entries[2]).display, 'none');
    now += 501;
    ui.render();
    assert.equal(entries.filter((n) => n.classList.contains('journey-pending')).length, 0);
    entries[0].dispatchEvent(new win.Event('animationend') as unknown as Event);
    ui.render();
    assert.equal(entries[0].classList.contains('journey-new'), false);
    assert.equal(getComputedStyle(entries[0]).animation, 'none');
    assert.ok(
      old.every((n) => n.isConnected),
      'history entries are appended, never replaced',
    );
    assert.equal(document.querySelectorAll('.journey-node-frame').length, 0);
  } finally {
    Date.now = originalNow;
  }
});

test('every four-cell straight item is vertical, and spear art is rotated without changing the source asset', () => {
  for (const [id, d] of Object.entries(CATALOGUE)) {
    if (d.cells.length !== 4) continue;
    assert.ok(new Set(d.cells.map((c) => c[1])).size !== 1, id);
  }
  const g = start(),
    spear = g.makeItem('warrior_pole_4');
  assert.deepEqual(cells(spear), [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ]);
  assert.match(itemPainting(spear), /translate\(0 400\) rotate\(-90\)/);
  assert.deepEqual(dimensions(spear, { rotation: 0 }), { w: 1, h: 4 });
});

test('old horizontal spear saves preserve every item, move an unfit spear to loose equipment and reload idempotently', () => {
  const g = start(),
    s = g.state,
    spear = g.makeItem('warrior_pole_4');
  spear.legacyCells = structuredClone(OLD_SPEAR_CELLS);
  s.inventory.push(spear);
  s.placements = s.draft = [{ id: spear.id, x: 2, y: 1, rotation: 0 }];
  delete s.footprintRevision;
  const restored = parseSave(JSON.stringify(s));
  assert.equal(restored.inventory.length, s.inventory.length);
  assert.ok(!restored.inventory.find((i) => i.id === spear.id)!.legacyCells);
  assert.equal(validateLayout(restored.inventory, restored.draft, runBagCells(restored)), null);
  assert.deepEqual(parseSave(JSON.stringify(restored)), restored);
});

test('a legacy spear in an ongoing fight keeps its source dependencies until victory, then turns vertical', () => {
  const g = start(),
    s = g.state,
    spear = g.makeItem('warrior_pole_4');
  spear.legacyCells = structuredClone(OLD_SPEAR_CELLS);
  s.inventory.push(spear);
  s.draft = [{ id: spear.id, x: 2, y: 1, rotation: 0 }];
  positionEvent(g, 'battle');
  s.combat.runtime!.sources = buildSources(s);
  delete s.footprintRevision;
  const resumed = new Game(parseSave(JSON.stringify(s)));
  assert.deepEqual(resumed.state.combat.runtime, s.combat.runtime);
  assert.deepEqual(cells(resumed.findItem(spear.id)!), OLD_SPEAR_CELLS);
  setEnemy(resumed, { hp: 0 });
  resumed.update(0.01);
  assert.deepEqual(cells(resumed.findItem(spear.id)!), [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ]);
  assert.doesNotThrow(() => parseSave(JSON.stringify(resumed.state)));
});
