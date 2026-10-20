import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { availableItems, dimensions, openBagCells, RESONANCES } from '../src/backpack';
import {
  start,
  positionEvent,
  recruitToConfigure,
  advanceCamp,
  prepare,
  settleJourneyUI,
} from './helpers';
import { realmName } from '../src/progression';
import { parseSave } from '../src/save';
import { setExpeditionTeam, startExpedition, beginExpeditionBattle } from '../src/expedition';

// Exercise the full stylesheet cascade alongside real game state transitions.
// happy-dom computes CSS but does not paint or measure browser layout.
function setup(g: Game) {
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  const entry = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  for (const [, name] of entry.matchAll(/import '\.\/([^']+)\.css';/g)) {
    const style = w.document.createElement('style');
    style.textContent = readFileSync(new URL('../src/' + name + '.css', import.meta.url), 'utf8');
    w.document.head.append(style);
  }
  w.document.body.innerHTML = '<div id="app"></div>';
  const ui = new UI(g, () => {});
  const el = (q: string) => {
    const node = w.document.querySelector(q);
    assert.ok(node, q);
    return node;
  };
  const css = (q: string) => w.getComputedStyle(el(q));
  const click = (q: string) => el(q).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  return { w, ui, el, css, click };
}

test('combat status rows stay under health tracks and reserves align under the leader portrait', () => {
  const g = start();
  g.retreat();
  g.returnToSelection();
  const original = g.state.meta.heroes[0];
  for (let n = 1; n < 3; n++) {
    const h = structuredClone(original);
    h.id = `hero-${n + 1}`;
    g.state.meta.heroes.push(h);
  }
  g.state.meta.heroSerial = 3;
  for (const h of g.state.meta.heroes) setExpeditionTeam(g.state, h.id);
  assert.equal(startExpedition(g.state, 1), null);
  assert.equal(beginExpeditionBattle(g.state), null);
  const { w, css } = setup(g);
  try {
    assert.equal(css('.exp-battle .hero-effects').marginLeft, '0px');
    assert.equal(css('.exp-battle .enemy-effects').marginRight, '0px');
    assert.equal(css('.exp-battle .hero-health > strong').textAlign, 'left');
    assert.equal(css('.exp-battle .enemy-health > strong').textAlign, 'right');
    assert.equal(css('.exp-battle .exp-enemy-hp').flexDirection, 'row-reverse');
    assert.equal(css('.exp-battle .enemy-health .health-value').textAlign, 'left');
    assert.equal(css('.exp-battle .enemy-effects .battle-status-button').marginLeft, 'auto');
    assert.equal(css('.exp-battle .enemy-effects').maxWidth, 'none');
    const health = css('.exp-battle .fighter-health'),
      leader = css('.exp-leader-portrait'),
      reserves = css('.exp-relay-portraits');
    assert.equal(parseFloat(reserves.left), parseFloat(health.left) + parseFloat(leader.left));
    assert.equal(parseFloat(reserves.top), parseFloat(health.top) + parseFloat(leader.height) + 7);
  } finally {
    w.happyDOM.close();
  }
});

test('enlarged seven-by-six pack fits below resonances and above controls with square aligned cells', () => {
  const g = start(),
    { w, ui, el, css } = setup(g);
  try {
    const grid = css('#pack-grid'),
      pack = css('#view-pack'),
      board = css('#shared-board'),
      footer = css('#adventure-footer'),
      slots = css('.resonance-slot'),
      strip = css('#resonance-strip');
    assert.equal(grid.width, '327px');
    assert.equal(grid.height, '280px');
    assert.ok(parseFloat(board.top) + parseFloat(pack.top) > 426);
    assert.ok(parseFloat(slots.height) < 65);
    assert.equal(parseFloat(grid.gap), 2);
    assert.equal((parseFloat(grid.width) + 2) / 7, (parseFloat(grid.height) + 2) / 6);
    assert.ok(
      parseFloat(pack.left) >= 0 &&
        parseFloat(pack.left) + parseFloat(pack.width) <= parseFloat(board.width),
    );
    assert.ok(parseFloat(pack.top) >= parseFloat(strip.top) + parseFloat(slots.height));
    assert.ok(
      parseFloat(board.top) + parseFloat(pack.top) + parseFloat(grid.height) <
        parseFloat(footer.top),
    );
    assert.equal(
      el('#pack-grid').querySelectorAll('.pack-cell.open').length,
      openBagCells(g.state.run.kills).size,
    );
    assert.notEqual(
      css('.pack-cell.open').backgroundColor,
      css('.pack-cell.closed').backgroundColor,
    );
    assert.notEqual(
      css('.pack-cell.edge-top').borderTopColor,
      css('.pack-cell.closed').borderTopColor,
    );
    // Responsive scale applies to this same board rather than shrinking only its grid.
    for (const [width, height] of [
      [390, 844],
      [360, 740],
      [320, 568],
      [1280, 900],
    ]) {
      Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: height, configurable: true });
      ui.render();
      const scale = +w.document.documentElement.style.getPropertyValue('--game-scale');
      assert.ok(390 * scale <= width + 0.1 && 844 * scale <= height + 0.1);
      assert.equal(css('#pack-grid').width, '327px');
    }
  } finally {
    w.happyDOM.close();
  }
});

test('exploring, combat and loot share the left hero position and baseline; decisions pause walking', async () => {
  const g = start(),
    { w, ui, el, css } = setup(g);
  try {
    const fighter = () => [
      css('.hero-fighter').width,
      css('.hero-fighter').height,
      css('.hero-fighter').transform,
      css('.hero-fighter').animationName,
      css('.battle-scene').left,
      css('.battle-scene').top,
      css('.actor-art').bottom,
    ];
    const origin = fighter();
    assert.equal(el('#battle-panel').classList.contains('exploring'), true);
    assert.equal(css('.battle-scene').justifyContent, 'space-between');
    assert.equal(css('.hero-fighter').animation, 'none');
    g.continueCamp();
    ui.render();
    assert.equal(g.state.phase, 'journey');
    assert.deepEqual(fighter(), origin);
    g.continueJourney();
    ui.render();
    assert.equal(g.state.phase, 'combat');
    assert.deepEqual(fighter(), origin);
    assert.equal(el('#battle-panel').classList.contains('exploring'), false);
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    ui.render();
    assert.equal(g.state.phase, 'camp');
    assert.deepEqual(fighter(), origin);
    assert.equal(el('#battle-panel').classList.contains('has-offers'), false);
    await settleJourneyUI(ui);
    assert.equal(el('#battle-panel').classList.contains('has-offers'), true);
    assert.equal(el('#battle-panel').classList.contains('exploring'), true);
    positionEvent(g, 'rest');
    ui.render();
    assert.equal(el('#battle-panel').classList.contains('exploring'), false);
    assert.equal(el('#battle-panel').classList.contains('waiting'), true);
    assert.equal(el('.actor-rig').getAttribute('data-motion'), 'idle');
  } finally {
    w.happyDOM.close();
  }
});

test('trial and awakening keep the altar visible and restore real growth before resonance choice', () => {
  const g = start();
  positionEvent(g, 'elite');
  const { w, ui, el, css } = setup(g);
  try {
    assert.equal(css('.trial-altar').display, 'block');
    assert.equal(css('.scene-ground').display, 'block');
    g.state.player.hp = 30;
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    ui.render();
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    assert.equal(g.state.phase, 'awakening');
    ui.render();
    assert.equal(el('#adventure-screen').classList.contains('ritual-screen'), true);
    assert.equal(el('#awakening-result').parentElement!.id, 'adventure-screen');
    assert.equal(el('#battle-panel').classList.contains('exploring'), false);
    assert.match(
      el('#awakening-result').textContent,
      new RegExp('恢复生命 ' + g.state.awakening!.healed),
    );
    assert.ok(g.state.awakening!.healed > 0);
    assert.equal(el('.realm-promotion span').textContent, realmName(g.state.run.realm - 1));
    assert.equal(el('.realm-promotion strong').textContent, realmName(g.state.run.realm));
    assert.ok(parseFloat(css('.realm-promotion strong').fontSize) >= 24);
    const resumed = new Game(parseSave(JSON.stringify(g.state)));
    assert.equal(resumed.state.run.realm, g.state.run.realm);
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    g.finishAwakening();
    ui.render();
    assert.equal(g.state.phase, 'reward');
    assert.equal(el('#battle-panel').classList.contains('waiting'), true);
    assert.equal(el('#battle-panel').classList.contains('exploring'), false);
    assert.equal(el('#decision').querySelectorAll('[data-resonance]').length, 3);
    for (const step of el('#stage-route').querySelectorAll('.route-step'))
      assert.ok(parseFloat(w.getComputedStyle(step).fontSize) > 0);
    assert.equal(
      el('#stage-route').querySelectorAll('.route-step').length,
      g.state.run.events.length,
    );
  } finally {
    w.happyDOM.close();
  }
});

test('every profession loose footprint uses one square-cell size without independent SVG height clipping', () => {
  for (const job of ['warrior', 'mage', 'rogue'] as const) {
    const g = start(job);
    g.state.inventory.push(...availableItems(job).map((d) => g.makeItem(d.id)));
    g.state.revision++;
    const { w, el, css } = setup(g);
    try {
      const loose = g.looseItems();
      assert.equal(el('#field-items').querySelectorAll('[data-pack-item]').length, loose.length);
      for (const item of loose) {
        const s = css(`#field-items [data-pack-item="${item.id}"]`),
          d = dimensions(item, { rotation: 0 });
        assert.equal(s.maxHeight, 'none');
        assert.equal(s.maxWidth, 'none');
        // calc()/custom properties remain unevaluated by this DOM engine.
        assert.equal(s.width.replace(/\s/g, ''), `${d.w * 47 - 2}px`);
        assert.equal(s.height.replace(/\s/g, ''), `${d.h * 47 - 2}px`);
        assert.ok(d.h * 50 + 12 + 10 <= parseFloat(css('#field-items').height));
      }
    } finally {
      w.happyDOM.close();
    }
  }
});

test('touch dragging targets the enlarged grid at native and scaled sizes and still rejects locked cells', () => {
  for (const scale of [1, 0.8767772511848341]) {
    const g = start();
    g.state.inventory = [g.makeItem('warrior_blade_2')];
    g.state.draft = [];
    g.state.placements = [];
    g.state.revision++;
    const item = g.state.inventory[0],
      { w, el, css } = setup(g);
    try {
      const left = 20 * scale,
        top = (parseFloat(css('#shared-board').top) + parseFloat(css('#view-pack').top)) * scale,
        width = parseFloat(css('#pack-grid').width) * scale,
        height = parseFloat(css('#pack-grid').height) * scale;
      (el('#pack-grid') as any).getBoundingClientRect = () => ({
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
      });
      const drag = (x: number, y: number) => {
        const source = el(`#field-items [data-pack-item="${item.id}"]`),
          root = el('#adventure-screen');
        source.dispatchEvent(
          new w.PointerEvent('pointerdown', {
            bubbles: true,
            pointerType: 'touch',
            pointerId: 1,
            button: 0,
            clientX: 30 * scale,
            clientY: 150 * scale,
          }),
        );
        for (const type of ['pointermove', 'pointerup'])
          root.dispatchEvent(
            new w.PointerEvent(type, {
              bubbles: true,
              pointerType: 'touch',
              pointerId: 1,
              clientX: left + (x * 47 + 22.5) * scale,
              clientY: top + (y * 47 + 22.5) * scale,
            }),
          );
      };
      drag(0, 0);
      assert.equal(g.state.draft.length, 0);
      assert.ok(g.findItem(item.id));
      drag(1, 1);
      assert.deepEqual(g.state.draft, [{ id: item.id, x: 1, y: 1, rotation: 0 }]);
      const piece = el(`.pack-piece[data-pack-item="${item.id}"]`);
      assert.ok(
        Math.abs((parseFloat((piece as any).style.left) / 100) * width - 47 * scale) < 0.001,
      );
      assert.ok(
        Math.abs((parseFloat((piece as any).style.height) / 100) * height - 92 * scale) < 0.001,
      );
    } finally {
      w.happyDOM.close();
    }
  }
});

test('graduation restores four saved resonance slots, with rank colors distinct from effect stages', () => {
  for (const count of [1, 4]) {
    const g = start();
    g.state.run.resonances = (
      ['cleave', 'warrior_mix', 'execution', 'warrior_sword_base'] as const
    ).slice(0, count);
    g.retreat();
    const h = g.state.meta.heroes[0],
      { w, el, css } = setup(g);
    try {
      assert.equal(el('.graduate-resonances').children.length, 4);
      assert.equal(el('.graduate-resonances').querySelectorAll('.empty').length, 4 - count);
      const colors = new Set<string>();
      for (const key of h.resonances) {
        const slot = el(`[data-summary-resonance="${key}"]`);
        assert.match(slot.textContent, new RegExp(`${h.resonanceTiers[key] ?? 0}/3 段`));
        assert.ok(slot.classList.contains('resonance-rank-' + RESONANCES[key].rank));
        colors.add(w.getComputedStyle(slot).borderTopColor);
      }
      if (count === 4) assert.equal(colors.size, 3);
      const row = css('.graduate-resonances'),
        record = css('.summary-record'),
        details = css('[data-action="hero-details"]');
      assert.equal(row.position, 'static');
      assert.equal(record.position, 'static');
      assert.equal(details.position, 'static');
      assert.equal(css('.graduation-spotlight').display, 'grid');
    } finally {
      w.happyDOM.close();
    }
  }
});

test('the spinning event pauses the explorer until its applied result is confirmed', () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const g = start();
  g.state.run.events[19].variant = 0;
  positionEvent(g, 'chance', 19);
  const { w, ui, el, click } = setup(g);
  try {
    click('[data-event="spin"]');
    assert.equal(el('#battle-panel').classList.contains('exploring'), false);
    assert.equal(el('#battle-panel').classList.contains('waiting'), true);
    now += 3700;
    ui.render();
    click('[data-action="wheel-confirm"]');
    assert.equal(el('#battle-panel').classList.contains('exploring'), true);
  } finally {
    Date.now = realNow;
    w.happyDOM.close();
  }
});

test('configuration attributes, tome selection and start control occupy distinct bounds on one canvas', () => {
  const g = recruitToConfigure(new Game());
  g.backToAllocation();
  const { w, el, css, click } = setup(g);
  try {
    const bounds = (q: string) => {
      const s = css(q);
      return [parseFloat(s.top), parseFloat(s.height)] as const;
    };
    const rows = bounds('.attribute-rows'),
      row = css('.attribute-row'),
      submit = bounds('.admission-submit');
    assert.ok(rows[0] + parseFloat(row.height) * 4 < submit[0]);
    assert.ok(submit[0] + submit[1] <= parseFloat(css('.admission-file').height));
    assert.equal(w.document.querySelector('.tome-config'), null);
    click('[data-action="confirm-allocation"]');
    assert.equal(g.state.phase, 'tome');
    assert.equal(el('.tome-catalogue').children.length, 9);
    assert.equal(css('.tome-catalogue').gridTemplateColumns, 'repeat(3, 1fr)');
    assert.equal(css('.tome-catalogue').gridTemplateRows, 'repeat(3, 1fr)');
    assert.equal(css('.tome-start').position, 'static');
    assert.equal((el('[data-action="start"]') as any).disabled, false);
    click('.tome-equipped');
    assert.equal(w.document.querySelectorAll('[data-tome-rank]').length, 3);
    click('[data-tome-rank="3"]');
    assert.match(el('#modal-body').textContent, /人物属性 · 3阶效果/);
  } finally {
    w.happyDOM.close();
  }
});

test('guild scenery cannot intercept taps and progression controls sit above the background', () => {
  const g = new Game(),
    { w, css } = setup(g);
  try {
    assert.equal(css('.guild-scene').pointerEvents, 'none');
    assert.ok(parseInt(css('.guild-progress-controls').zIndex) > 0);
  } finally {
    w.happyDOM.close();
  }
});

test('footer colors follow exploration, loot, resonance and graduation without changing continuation rules', async () => {
  const g = start(),
    { w, ui, el, css } = setup(g);
  try {
    const colors = new Set<string>();
    const color = (tone: string) => {
      assert.equal(el('#adventure-footer').getAttribute('data-tone'), tone);
      colors.add(css('#adventure-footer .primary-button').borderImageSource);
    };
    color('explore');
    g.continueCamp();
    ui.render();
    assert.equal(el('#adventure-footer').getAttribute('data-tone'), 'journey');
    assert.equal(el('#adventure-footer').getAttribute('data-readiness'), 'waiting');
    g.continueJourney();
    ui.render();
    assert.equal(el('#adventure-footer').getAttribute('data-tone'), 'battle');
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    ui.render();
    await settleJourneyUI(ui);
    color('loot');
    positionEvent(g, 'boss');
    g.state.enemy!.hp = 0;
    g.advanceTurn();
    assert.equal(g.state.phase, 'camp');
    assert.equal(g.continueCamp(), null);
    ui.render();
    color('resonance');
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    g.finishAwakening();
    g.chooseReward(0);
    g.state.run.extreme = true;
    positionEvent(g, 'ending');
    g.chooseEvent('finish');
    ui.render();
    color('graduate');
    assert.equal(colors.size, 4);
  } finally {
    w.happyDOM.close();
  }
});

test('item grade border stays above its illustration and badges differ on all four stages', () => {
  const g = start(),
    { w, ui, el, css } = setup(g);
  try {
    const item = g.state.inventory[0],
      colors = new Set<string>();
    for (let n = 1; n <= 4; n++) {
      const upgraded = g.makeItem(item.templateId, n);
      g.state.inventory.push(upgraded);
      g.state.revision++;
      ui.render();
      const q = `#field-items [data-pack-item="${upgraded.id}"]`;
      const piece = el(q),
        drawing = piece.querySelector('.item-painting')!;
      assert.equal(drawing.nextElementSibling!.getAttribute('class'), 'item-grade-rim');
      assert.ok(piece.classList.contains('quality-' + upgraded.quality));
      assert.equal(
        piece.querySelector('.item-category-badge')!.getAttribute('aria-label')?.startsWith('战士'),
        true,
      );
      colors.add((piece as any).style.getPropertyValue('--item-color'));
      assert.equal(css(q + ' .item-grade-rim').pointerEvents, 'none');
      assert.equal(css(q + ' .item-grade-badge').pointerEvents, 'none');
    }
    assert.equal(colors.size, 4);
  } finally {
    w.happyDOM.close();
  }
});

test('graduation immediately shows a one-screen summary with a prominent realm and no tome reward', () => {
  const g = start();
  positionEvent(g, 'graduation');
  const { w, ui, el, css, click } = setup(g);
  try {
    click('[data-event="graduate"]');
    assert.equal(g.state.phase, 'summary');
    assert.equal(el('#decision-sheet').hasAttribute('open'), false);
    assert.equal(el('#summary-screen').hasAttribute('hidden'), false);
    const hero = g.state.meta.heroes[0];
    assert.equal(el('.summary-realm strong').textContent, realmName(hero.realm));
    assert.ok(parseFloat(css('.summary-realm strong').fontSize) >= 24);
    assert.match(el('.summary-record').textContent, /32\/32 步/);
    assert.equal(w.document.querySelector('#summary-screen [data-action="pending-pages"]'), null);
    assert.equal(g.state.meta.pendingPages.length, 0);
    const frame = css('.graduation-spotlight');
    const rows = frame.gridTemplateRows.split(' ').map(parseFloat);
    const contentHeight =
      rows.reduce((total, height) => total + height, 0) +
      (rows.length - 1) * parseFloat(frame.rowGap || frame.gap) +
      parseFloat(frame.paddingTop) +
      parseFloat(frame.paddingBottom);
    assert.ok(contentHeight <= 844);
    for (const child of el('.graduation-spotlight').children) {
      const style = w.getComputedStyle(child);
      assert.notEqual(style.position, 'absolute', child.className);
    }
    click('[data-action="hero-details"]');
    assert.ok(el('[data-bound-item]'));
    click('[data-action="close"]');
    click('[data-action="selection"]');
    assert.equal(g.state.phase, 'home');
    ui.render();
  } finally {
    w.happyDOM.close();
  }
});
test('tutorial graduation offers only completion and does not advertise an unavailable extreme challenge', () => {
  const g = new Game();
  recruitToConfigure(g, 1, 'warrior');
  g.startRun();
  g.continueJourney();
  prepare(g);
  positionEvent(g, 'graduation');
  const { w, el, click } = setup(g);
  try {
    assert.doesNotMatch(el('#decision').textContent, /挑战.*极限/);
    assert.equal(w.document.querySelector('[data-event="extreme"]'), null);
    assert.doesNotMatch(g.state.run.journey.at(-1)!.text, /极限/);
    click('[data-event="graduate"]');
    assert.match(el('.summary-record').textContent, /23\/23 步/);
    assert.equal(g.state.meta.pendingPages.length, 0);
  } finally {
    w.happyDOM.close();
  }
});
