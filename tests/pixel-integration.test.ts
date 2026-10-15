import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { archiveDetails } from '../src/archive-ui';
import { RESONANCES, resonanceScore } from '../src/backpack';
import { parseSave } from '../src/save';
import { positionEvent, start } from './helpers';
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
  const click = (q: string) => {
    const el = w.document.querySelector(q) as any;
    assert.ok(el, q);
    assert.ok(!el.disabled);
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  };
  return { w, ui, click };
}

test('home separates the paged adventurer archive from the guild scene and filters/sorts real records', () => {
  const g = start();
  g.retreat();
  const template = structuredClone(g.state.meta.heroes[0]);
  g.state.meta.heroes = Array.from({ length: 14 }, (_, n) => ({
    ...structuredClone(template),
    id: 'hero-' + (n + 1),
    name: '勇者' + n,
    power: 100 + n,
    profession: n % 2 ? ('mage' as const) : ('warrior' as const),
  }));
  g.state.phase = 'home';
  g.state.revision++;
  const { w, ui, click } = setup(g);
  try {
    assert.equal((w.document.querySelector('#roster-screen') as any).hidden, true);
    assert.equal(w.document.querySelector('#home-screen [data-hero]'), null);
    assert.equal(w.document.querySelectorAll('#guild-nav button').length, 2);
    click('[data-action="roster"]');
    assert.equal((w.document.querySelector('#home-screen') as any).hidden, true);
    assert.equal(w.document.querySelectorAll('#guild-roster [data-hero]').length, 6);
    assert.equal(
      w.document.querySelector('#guild-roster [data-hero]')!.getAttribute('data-hero'),
      'hero-14',
    );
    click('[data-action="roster-next"]');
    assert.match(w.document.querySelector('#roster-page')!.textContent, /2 \/ 3/);
    click('[data-roster-filter="warrior"]');
    assert.equal(w.document.querySelectorAll('#guild-roster [data-hero]').length, 6);
    assert.match(w.document.querySelector('#guild-count')!.textContent, /7 \/ 500/);
    click('[data-action="roster-sort"]');
    assert.equal(
      w.document.querySelector('#guild-roster [data-hero]')!.getAttribute('data-hero'),
      'hero-1',
    );
    click('[data-hero="hero-1"]');
    assert.equal(
      w.document.querySelector('[data-archive-tab="profile"]')!.getAttribute('aria-pressed'),
      'true',
    );
    click('[data-archive-tab="equipment"]');
    assert.ok(w.document.querySelector('[data-bound-item]'));
    click('[data-action="close"]');
    click('[data-action="guild"]');
    assert.equal((w.document.querySelector('#roster-screen') as any).hidden, true);
    ui.render();
  } finally {
    w.happyDOM.close();
  }
});

test('resonance rank styling stays distinct from contribution stages across choice, strip, item and archive', () => {
  const g = start();
  g.state.run.resonances = ['cleave', 'warrior_mix', 'execution'];
  g.state.revision++;
  const { w, ui, click } = setup(g);
  try {
    for (const key of g.state.run.resonances) {
      const rank = RESONANCES[key].rank,
        el = w.document.querySelector(`[data-inspect-resonance="${key}"]`)!;
      assert.ok(el.classList.contains('resonance-rank-' + rank));
      assert.equal(
        el.querySelectorAll('.tier-marks i.on').length,
        resonanceScore(g.state.inventory, g.state.draft, key).tier,
      );
    }
    const weapon = g.state.inventory.find((i) => i.branch === 'blade')!;
    click(`[data-pack-item="${weapon.id}"]`);
    assert.match(w.document.querySelector('#equipment-detail')!.textContent, /升阶效果/);
    assert.equal(w.document.querySelector('#equipment-detail .resonance-rank-1'), null);
    click('[data-pack-action="close"]');
    g.retreat();
    ui.render();
    const h = g.state.meta.heroes[0];
    const archive = archiveDetails(h, 'resonances');
    for (let rank = 1; rank <= 3; rank++)
      assert.match(archive, new RegExp('resonance-rank-' + rank));
    click('[data-action="hero-details"]');
    click('[data-archive-tab="resonances"]');
    assert.equal(w.document.querySelectorAll('.archive-resonance').length, 3);
    const other = start();
    other.state.phase = 'reward';
    other.state.run.rewards = [
      {
        kind: 'resonance',
        title: '选择共鸣',
        buffs: [],
        resonances: ['cleave', 'warrior_mix', 'execution'],
      },
    ];
    other.state.revision++;
    ui.replace(other);
    for (let rank = 1; rank <= 3; rank++)
      assert.ok(w.document.querySelector('#decision .resonance-rank-' + rank));
  } finally {
    w.happyDOM.close();
  }
});

test('real wheel result is applied and saved once, the matching sector spins before confirm and cannot reroll', () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    for (const [random, sector] of [
      [0.1, 0],
      [0.6, 1],
      [0.85, 2],
      [0.99, 3],
    ] as const) {
      const base = start();
      const g = new Game(base.state, () => random);
      g.state.run.events[19].variant = 0;
      positionEvent(g, 'chance', 19);
      const { w, ui, click } = setup(g);
      try {
        assert.equal(g.state.phase, 'event');
        click('[data-event="spin"]');
        const points = g.state.run.points,
          inv = g.state.inventory.length,
          history = g.state.run.journey.length;
        assert.ok(w.document.querySelector('.wheel-rotor'));
        assert.ok((ui as any).wheel.sector === sector);
        assert.equal(
          (w.document.querySelector('[data-action="wheel-confirm"]') as any).disabled,
          true,
        );
        (w.document.querySelector('[data-event="spin"]') as any)?.click();
        ui.render();
        assert.equal(g.state.run.points, points);
        assert.equal(g.state.inventory.length, inv);
        assert.equal(g.state.run.journey.length, history);
        assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
        now += 3700;
        ui.render();
        click('[data-action="wheel-confirm"]');
        assert.equal((w.document.querySelector('#decision-sheet') as any).open, false);
        assert.equal(g.state.run.journey.length, history);
        assert.equal(g.state.phase, 'camp');
      } finally {
        w.happyDOM.close();
      }
    }
  } finally {
    Date.now = realNow;
  }
});
