import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, storyDuration } from '../src/game';
import { UI } from '../src/ui';
import { APTITUDES, rollAptitude } from '../src/aptitude';
import { TALENTS, rollTalents, validTalents } from '../src/talents';
import { bagCells, runBagCells, occupiedCells } from '../src/backpack';
import { PACK_WIDTH, PACK_HEIGHT, PACK_PITCH, packPoint, shapeSize } from '../src/pack-geometry';
import { parseSave } from '../src/save';
import { generateEnemy } from '../src/enemies';
import { seed, recruitToConfigure, prepare, start, positionEvent, setPlayer } from './helpers';
import type { Aptitude } from '../src/types';

function fresh(n = 19) {
  const g = new Game(undefined, seed(n));
  g.state.meta.highestChapter = 4;
  recruitToConfigure(g, 4);
  g.startRun();
  g.continueJourney();
  prepare(g);
  return g;
}
function dom(g: Game) {
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  w.document.body.innerHTML = '<div id="app"></div>';
  const ui = new UI(g, () => {});
  const el = (q: string) => {
    const e = w.document.querySelector(q);
    assert.ok(e, q);
    return e;
  };
  const click = (q: string) => el(q).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  return { w, ui, el, click };
}

test('four aptitudes keep the exact talent category rules and enforce minimum qualities across three professions', () => {
  for (const p of ['warrior', 'mage', 'rogue'] as const)
    for (const aptitude of Object.keys(APTITUDES) as Aptitude[])
      for (let n = 0; n < 100; n++) {
        const keys = rollTalents(seed(n), p, aptitude),
          a = APTITUDES[aptitude];
        assert.ok(validTalents(keys, p));
        assert.equal(keys.filter((k) => TALENTS[k].category === 'profession').length, 1);
        assert.ok(keys.filter((k) => TALENTS[k].quality === 'gold').length >= a.gold);
        assert.ok(
          keys.filter((k) => ['purple', 'gold'].includes(TALENTS[k].quality!)).length >=
            a.gold + a.purple,
        );
      }
  assert.deepEqual(
    [0, 0.599, 0.6, 0.869, 0.87, 0.969, 0.97, 0.999].map((n) => rollAptitude(() => n)),
    ['common', 'common', 'gifted', 'gifted', 'brilliant', 'brilliant', 'legendary', 'legendary'],
  );
});

test('the first fifteen cells form a 3x4 core plus a bottom-aligned three-cell left column; every expansion stays connected', () => {
  const initial = bagCells(15);
  assert.equal(initial.size, 15);
  for (let y = 1; y <= 4; y++) for (let x = 2; x <= 4; x++) assert.ok(initial.has(`${x},${y}`));
  assert.deepEqual([...initial].filter((k) => k.startsWith('1,')).sort(), ['1,2', '1,3', '1,4']);
  for (let count = 15; count <= 42; count++) {
    const open = bagCells(count),
      seen = new Set<string>(),
      queue = [[...open][0]];
    while (queue.length) {
      const k = queue.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = `${x + dx},${y + dy}`;
        if (open.has(next) && !seen.has(next)) queue.push(next);
      }
    }
    assert.equal(seen.size, count);
  }
  assert.equal(PACK_WIDTH, 327);
  assert.equal(PACK_HEIGHT, 280);
  assert.equal(shapeSize(4), 186);
  assert.deepEqual(packPoint(PACK_PITCH * 2 + 20, PACK_PITCH + 20), { x: 2, y: 1 });
  assert.equal(packPoint(45, 10), null);
  assert.equal(packPoint(10, 46), null);
  assert.equal(packPoint(327, 10), null);
});

test('previous save topology is preserved while new runs use the irregular opening; aptitude spoofing is rejected', () => {
  const g = start(),
    raw: any = structuredClone(g.state);
  delete raw.layoutRevision;
  delete raw.run.packLayout;
  const restored = parseSave(JSON.stringify(raw));
  assert.equal(restored.run.packLayout, 'legacy');
  assert.deepEqual(restored.draft, raw.draft);
  assert.ok(runBagCells(restored).has('1,1'));
  assert.equal(runBagCells(fresh().state).has('1,1'), false);
  const forged: any = structuredClone(fresh().state);
  forged.run.trainee.aptitude = 'legendary';
  forged.run.trainee.talents = rollTalents(() => 0.1, 'warrior', 'common');
  assert.throws(() => parseSave(JSON.stringify(forged)));
});

test('status targets survive frame refreshes and the detail list updates while open', () => {
  const g = fresh();
  g.continueCamp();
  g.continueJourney();
  const { w, ui, el, click } = dom(g);
  try {
    assert.equal(w.document.querySelector('.battle-vitals'), null);
    const button = el('[data-status-side="hero"]');
    setPlayer(g, { shield: 37 });
    ui.render();
    assert.equal(el('[data-status-side="hero"]'), button);
    click('[data-status-side="hero"]');
    assert.match(el('.battle-status-details').textContent, /37 点/);
    setPlayer(g, { shield: 19 });
    ui.render();
    assert.equal(el('[data-status-side="hero"]'), button);
    assert.match(el('.battle-status-details').textContent, /19 点/);
    click('[data-action="close"]');
    click('[data-status-side="enemy"]');
    assert.ok(el('.battle-status-details').textContent.includes(g.state.enemy!.name));
  } finally {
    w.happyDOM.close();
  }
});

test('visible story playback holds continuation, voluntary backpack inspection can always return, and encounter feedback precedes combat', () => {
  const original = Date.now;
  let now = 100000;
  Date.now = () => now;
  const g = fresh(),
    { w, ui, el, click } = dom(g);
  try {
    click('[data-action="continue"]');
    assert.equal(g.state.phase, 'journey');
    assert.equal(ui.holdingJourney, true);
    assert.equal((el('[data-action="continue-story"]') as any).disabled, true);
    click('[data-action="open-pack"]');
    assert.equal(ui.holdingJourney, true);
    assert.equal((el('[data-action="continue-story"]') as any).disabled, false);
    click('[data-action="continue-story"]');
    assert.equal(g.state.phase, 'journey');
    for (let n = 0; n < 6; n++) {
      now += 500;
      ui.render();
    }
    g.state.run.storyElapsed = storyDuration(g.currentEvent()!) - 0.4;
    ui.render();
    assert.ok(el('#battle-panel').classList.contains('encounter-approach'));
    assert.equal(ui.holdingJourney, true);
    now += 681;
    ui.render();
    assert.equal(ui.holdingJourney, false);
    g.update(0.5);
    ui.render();
    assert.equal(g.state.phase, 'combat');
  } finally {
    Date.now = original;
    w.happyDOM.close();
  }
});

test('four completed digging finds survive reload and cannot be collected twice; final rows keep explicit sizing', () => {
  const g = fresh();
  positionEvent(g, 'dig');
  const d = g.state.run.dig!;
  d.equipment = Array.from({ length: 4 }, () => g.makeItem('warrior_gem'));
  d.placements = d.equipment.map((i, n) => ({ id: i.id, x: n, y: 0, rotation: 0 }));
  const before = g.state.inventory.length;
  for (const n of [0, 1, 2, 3]) assert.equal(g.digCell(n), null);
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.state.run.dig!.claimed.length, 4);
  assert.equal(restored.state.inventory.length, before + 4);
  assert.ok(restored.digCell(4));
  assert.equal(restored.state.inventory.length, before + 4);
  const { w, el, click } = dom(restored);
  try {
    assert.doesNotMatch(el('.dig-status').textContent, /已挖出|\d\/\d/);
    assert.equal(w.document.querySelectorAll('.dig-cell:disabled').length, 16);
    click('[data-event="dig-finish"]');
    assert.equal(restored.state.phase, 'camp');
    assert.equal(restored.state.inventory.length, before + 4);
  } finally {
    w.happyDOM.close();
  }
});

test('digging generates two, three and four fixed finds with reload retaining the budget and hidden silhouettes', () => {
  const counts = new Set<number>();
  for (let n = 0; n < 50; n++) {
    const g = fresh(n);
    positionEvent(g, 'dig');
    const d = g.state.run.dig!;
    counts.add(d.equipment.length);
    const saved = parseSave(JSON.stringify(g.state));
    assert.deepEqual(saved.run.dig, d);
    assert.equal(d.shovels, 12);
    assert.equal(
      new Set(
        d.placements.flatMap((p) =>
          occupiedCells(
            d.equipment.find((i) => i.id === p.id)!,
            p,
          ).map(([x, y]) => `${x},${y}`),
        ),
      ).size,
      d.placements.reduce(
        (total, p) =>
          total +
          occupiedCells(
            d.equipment.find((i) => i.id === p.id)!,
            p,
          ).length,
        0,
      ),
    );
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
});

test('fixed monster growth follows chapter progression without reacting to current life or purchased guild power', () => {
  const g = fresh();
  g.continueCamp();
  g.continueJourney();
  const a = generateEnemy(g.state, () => 0.5);
  g.state.player.hp = 1;
  assert.deepEqual(
    generateEnemy(g.state, () => 0.5),
    a,
  );
  g.state.meta.guildLevel = 20;
  g.state.meta.guildPurchased = 10;
  assert.deepEqual(
    generateEnemy(g.state, () => 0.5),
    a,
  );
  g.state.run.chapter = 10;
  const later = generateEnemy(g.state, () => 0.5);
  assert.ok(later.hp > a.hp && later.attack > a.attack);
});
