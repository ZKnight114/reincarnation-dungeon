import { setEnemy, setPlayer } from './helpers';
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game, generateEvents } from '../src/game';
import { parseSave } from '../src/save';
import { UI } from '../src/ui';
import { resonanceScore } from '../src/backpack';
import { TRIALS, stageGrowth } from '../src/journey';
import { start, seed, positionEvent, add } from './helpers';
import type { TrialTier } from '../src/types';

function pendingTrial(tier: TrialTier = 0, index = 8) {
  const g = start('warrior', seed(8));
  positionEvent(g, 'elite', index);
  g.state.phase = 'event';
  g.state.enemy = null;
  g.state.run.trials[[8, 16, 24].indexOf(index)] = null;
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  assert.equal(g.chooseTrial(tier), null);
  return g;
}
test('route removes opening/pet/mentor years while preserving observed trial, recovery and digging order', () => {
  for (let n = 0; n < 100; n++) {
    const e = generateEvents(seed(n));
    assert.equal(e.length, 37);
    assert.equal(e[2].kind, 'supply');
    assert.equal(e[4].kind, 'dig');
    assert.equal(e[9].kind, 'treasure');
    assert.equal(e[14].kind, 'chance');
    for (const node of [8, 16, 24]) assert.equal(e[node].kind, 'boss');
    for (const node of [7, 15, 23]) assert.equal(e[node].kind, 'rest');
    assert.equal(e[31].kind, 'graduation');
    assert.equal(e[36].kind, 'ending');
    assert.ok(!e.some((e) => e.kind === 'mentor'));
  }
});
test('trial difficulty raises the same enemy health and attack, grants more growth only after victory, and restores health only as a victory event', () => {
  const games = ([0, 1, 2] as const).map((t) => pendingTrial(t));
  const baseline = games[0].state.enemy!;
  for (const [tier, g] of games.entries()) {
    assert.equal(g.state.enemy!.maxHp, Math.round(baseline.maxHp * TRIALS[tier].hp));
    assert.equal(g.state.enemy!.attack, baseline.attack * TRIALS[tier].attack);
    assert.deepEqual(g.state.run.growth, { attack: 0, hp: 0, defense: 0 });
    g.state.player.hp = 30;
    g.state.enemy!.hp = 0;
    g.update(0.01);
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    assert.ok(g.state.player.hp > 30);
    assert.deepEqual(g.state.run.growth, stageGrowth('warrior', g.state.run.trials, 1));
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    assert.equal(g.state.phase, 'awakening');
    if (g.state.run.pendingPromotion) assert.equal(g.continueCamp(), null);
    g.finishAwakening();
    assert.equal(g.state.run.rewards[0].kind, 'resonance');
    assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
  }
  assert.ok(games[2].state.run.growth.hp > games[1].state.run.growth.hp);
  assert.ok(games[1].state.run.growth.hp > games[0].state.run.growth.hp);
});
test('trial selection and combat survive reload; retries cannot choose a new difficulty or obtain growth early', () => {
  const g = pendingTrial(2, 16),
    hp = g.state.enemy!.maxHp;
  const restored = new Game(parseSave(JSON.stringify(g.state)));
  assert.equal(restored.state.enemy!.maxHp, hp);
  assert.equal(restored.state.run.trials[1], 2);
  assert.ok(restored.chooseTrial(0));
  restored.state.player.hp = 0;
  restored.update(0.01);
  const h = restored.state.meta.heroes[0];
  assert.equal(h.stages, 1);
  assert.equal(h.trials[1], 2);
  assert.equal(h.outcome, 'death');
  assert.ok(h.loadout!.equipment.length > 0);
  assert.doesNotThrow(() => parseSave(JSON.stringify(restored.state)));
});
test('graduation binds only equipped gear with its merged level, exact shape orientation and resonance power', () => {
  const g = start();
  g.state.run.kills = 14;
  const i = add(g, 'warrior_pole_3');
  const donor = add(g, i.templateId);
  g.mergeItems(donor.id, i.id);
  g.state.draft = g.state.draft.filter((p) => p.id !== i.id);
  assert.equal(g.placeItem(i.id, 0, 4, 0), null);
  const loose = add(g, 'warrior_guard_4', 3);
  const layout = structuredClone(g.state.draft),
    equipped = structuredClone(g.packAnalysis(true).active);
  g.retreat();
  const h = g.state.meta.heroes[0];
  assert.deepEqual(h.loadout!.placements, layout);
  assert.deepEqual(h.loadout!.equipment, equipped);
  assert.ok(!h.loadout!.equipment.some((i) => i.id === loose.id));
  assert.equal(h.loadout!.equipment.find((item) => item.id === i.id)!.level, 2);
  assert.notEqual(
    h.loadout!.equipment.find((item) => item.id === i.id),
    i,
  );
  for (const k of h.resonances)
    assert.equal(
      resonanceScore(h.loadout!.equipment, h.loadout!.placements, k).tier,
      h.resonanceTiers[k],
    );
  assert.equal(g.state.inventory.length, 0);
  assert.equal(g.findItem(i.id), null);
  assert.ok(g.moveItem(i.id, 0, 0));
  assert.equal(g.recycleItem(i.id), false);
  assert.deepEqual(parseSave(JSON.stringify(g.state)).meta.heroes[0], h);
  const original = structuredClone(h);
  g.returnToSelection();
  g.enterChapters();
  g.recruit('mage');
  g.balanceAllocation();
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
  g.continueJourney();
  g.claimStarterRound();
  assert.deepEqual(g.state.meta.heroes[0], original);
  assert.ok(g.state.inventory.every((i) => i.profession === 'mage'));
  i.level = 5;
  assert.deepEqual(g.state.meta.heroes[0], original);
});
test('bound loadout validation rejects overlaps, unattached gear, another profession, or forged resonance tiers', () => {
  const g = start();
  g.retreat();
  const bad = (change: (s: any) => void) => {
    const s = structuredClone(g.state);
    change(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  };
  bad(
    (s) =>
      (s.meta.heroes[0].loadout.placements[1] = {
        ...s.meta.heroes[0].loadout.placements[0],
        id: s.meta.heroes[0].loadout.placements[1].id,
      }),
  );
  bad((s) => s.meta.heroes[0].loadout.placements.pop());
  bad((s) => (s.meta.heroes[0].loadout.equipment[0].profession = 'mage'));
  bad((s) => {
    const h = s.meta.heroes[0];
    h.resonanceTiers[h.resonances[0]] = 3;
  });
});
test('old route saves are rejected instead of migrating incompatible layouts', () => {
  const g = start();
  const s: any = structuredClone(g.state);
  s.version = 9;
  assert.throws(() => parseSave(JSON.stringify(s)), /v14/);
});
test('monthly spring offers actual healing versus a permanent basic max-health gain without filling missing life', () => {
  const g = start();
  positionEvent(g, 'rest');
  g.state.player.hp = 40;
  const before = g.state.player.maxHp;
  assert.equal(g.chooseEvent('vigor'), null);
  assert.equal(g.state.player.hp, 40);
  assert.ok(g.state.player.maxHp > before);
  assert.equal(g.state.run.buffs.vitality, 1);
  assert.equal(g.continueCamp(), null);
  assert.ok(g.state.run.journey.some((j) => j.kind === 'growth' && j.title === '凝聚泉华'));
  assert.doesNotThrow(() => parseSave(JSON.stringify(g.state)));
});
test('journey retains event results even after many combat turns; loot and milestone records are distinct', () => {
  const g = pendingTrial(1);
  setEnemy(g, { maxHp: 1e7, hp: 1e7 });
  setPlayer(g, { maxHp: 1e5, hp: 1e5 });
  for (let n = 0; n < 60; n++) g.advanceTurn();
  g.state.enemy!.hp = 0;
  g.update(0.01);
  assert.ok(g.state.log.length <= 50);
  assert.ok(g.state.run.journey.some((j) => j.title === '公会启程'));
  assert.ok(g.state.run.journey.some((j) => j.title === '战斗胜利'));
  assert.ok(g.state.run.journey.some((j) => j.kind === 'loot'));
  assert.equal(g.continueCamp(), null);
  assert.ok(g.state.run.journey.some((j) => j.kind === 'growth' && j.event === 9));
});

let win: Window, g: Game, ui: UI;
beforeEach(() => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
  });
  win.document.body.innerHTML = '<div id="app"></div>';
  g = start();
  ui = new UI(g, (s) => {
    g = new Game(s);
    ui.replace(g);
  });
});
afterEach(() => win.happyDOM.close());
const el = (q: string) => {
  const n = win.document.querySelector(q);
  assert.ok(n, q);
  return n as any;
};
const click = (q: string) => {
  const n = el(q);
  n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  if (q === '[data-action="continue"]') {
    win.document
      .querySelector('[data-action="continue-story"]')
      ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
};
test('the lower region shows journey, special choices open in a modal, or the backpack exclusively; combat always shows backpack', () => {
  positionEvent(g, 'rest');
  ui.render();
  assert.equal(el('#view-pack').hidden, true);
  assert.equal(el('#journey-panel').hidden, false);
  assert.equal(el('#decision-sheet').open, true);
  assert.equal(el('#decision-sheet').closest('#journey-panel'), null);
  assert.equal(el('#decision-sheet').tagName, 'DIALOG');
  assert.equal(win.document.querySelector('.sheet-backdrop'), null);
  assert.equal(win.document.querySelector('#battle-panel .journey-entry'), null);
  click('[data-action="open-pack"]');
  assert.equal(el('#view-pack').hidden, false);
  assert.equal(el('#journey-panel').hidden, true);
  click('[data-event="heal"]');
  assert.equal(g.state.phase, 'camp');
  assert.equal(el('#journey-panel').hidden, false);
  assert.match(el('#journey-history').textContent, /恢复/);
  assert.equal(el('#decision-sheet').open, false);
  click('[data-action="continue"]');
  if ((g.state.phase as string) === 'combat') {
    assert.equal(el('#view-pack').hidden, false);
    assert.equal(el('#journey-panel').hidden, true);
  }
});
test('three trial options live in the event dialog, select a real battle and expose no extra reopen/fold controls', () => {
  positionEvent(g, 'elite');
  g.state.phase = 'event';
  g.state.enemy = null;
  g.state.run.trials[0] = null;
  ui.render();
  assert.equal(win.document.querySelectorAll('[data-trial-tier]').length, 3);
  assert.equal(el('#view-pack').hidden, true);
  click('[data-trial-tier="2"]');
  assert.equal(g.state.phase, 'event');
  click('[data-action="challenge-trial"]');
  assert.equal(g.state.phase, 'combat');
  assert.equal(g.state.run.trials[0], 2);
  assert.equal(el('#view-pack').hidden, false);
  for (const q of [
    '[data-action="fold-sheet"]',
    '[data-action="show-sheet"]',
    '[data-action="journal"]',
    '[data-pack-action="auto"]',
    '[data-speed]',
  ])
    assert.equal(win.document.querySelector(q), null);
  assert.equal(win.document.querySelectorAll('[data-action="cycle-speed"]').length, 1);
});
test('graduate equipment can be inspected by click or keyboard without exposing a move, sell, merge or transfer action', () => {
  const before = structuredClone(g.packAnalysis(true).active);
  g.retreat();
  ui.render();
  click('[data-action="hero-details"]');
  const hero = g.state.meta.heroes[0],
    gear = hero.loadout!.equipment[0];
  assert.equal(win.document.querySelectorAll('#modal [data-bound-item]').length, before.length);
  click(`#modal [data-bound-item="${gear.id}"]`);
  assert.match(el('#modal [data-bound-detail]').textContent, new RegExp(gear.name));
  assert.deepEqual(g.state.inventory, []);
  assert.equal(win.document.querySelector('#modal [data-pack-item]'), null);
  assert.equal(win.document.querySelector('#modal [data-pack-action]'), null);
  click('[data-action="close"]');
  click('[data-action="selection"]');
  click('[data-action="roster"]');
  click(`[data-hero="${hero.id}"]`);
  click('[data-archive-tab="equipment"]');
  el('#modal [data-bound-item]').dispatchEvent(
    new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  assert.match(el('#modal [data-bound-detail]').textContent, new RegExp(gear.name));
  assert.deepEqual(g.state.meta.heroes[0].loadout!.equipment, before);
});
test('journey markup escapes externally supplied names and text, including results', () => {
  g.chronicle('<img src=x>', '<script>alert(1)</script>', 'loot', 0);
  ui.render();
  assert.equal(win.document.querySelector('#journey-history img'), null);
  assert.equal(win.document.querySelector('#journey-history script'), null);
  assert.match(el('#journey-history').textContent, /<img src=x>/);
});
