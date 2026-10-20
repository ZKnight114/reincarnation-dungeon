import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/game';
import { UI } from '../src/ui';
import { parseSave } from '../src/save';
import { heroBattleBuild } from '../src/progression';
import {
  expeditionState,
  expeditionEnemy,
  expeditionHero,
  setExpeditionTeam,
  moveExpeditionMember,
  startExpedition,
  beginExpeditionBattle,
  finishExpeditionBattle,
  retreatExpedition,
  startDispatch,
  claimDispatch,
  DISPATCH_MS,
  expeditionUnlocked,
  expeditionStars,
  claimExpeditionStars,
} from '../src/expedition';
import { chapterEnemy, expeditionGoals, stageReward } from '../src/expedition-chapters';
import { start } from './helpers';
import { expeditionBattleState, expeditionBuildPanel } from '../src/expedition-combat-view';
import { combatHud, combatResonances } from '../src/combat-view';
import { expeditionResult, expeditionMap } from '../src/expedition-views';
import { resonanceScore } from '../src/backpack';

export function expeditionFixture(count = 3) {
  const g = start();
  g.retreat();
  g.returnToSelection();
  const original = structuredClone(g.state.meta.heroes[0]);
  for (let n = 1; n < count; n++) {
    const h = structuredClone(original);
    h.id = 'hero-' + (n + 1);
    h.name = ['洛克', '艾琳', '伊芙'][n];
    g.state.meta.heroes.push(h);
  }
  g.state.meta.heroSerial = count;
  return g;
}
function strong(g: Game) {
  for (const h of g.state.meta.heroes) {
    h.stats.attack = 2000;
    h.stats.hp = 5000;
    h.stats.defense = 100;
  }
}
function clearBattle(g: Game) {
  assert.equal(beginExpeditionBattle(g.state), null);
  const report = expeditionState(g.state).run!.report!;
  report.cursor = report.frames.length - 1;
  assert.equal(finishExpeditionBattle(g.state), null);
}

test('two-star results and map light the first two stars while goal rows preserve their own outcomes', () => {
  const g = expeditionFixture(1),
    s = g.state;
  strong(g);
  setExpeditionTeam(s, s.meta.heroes[0].id);
  startExpedition(s, 1);
  clearBattle(g);
  assert.equal(startExpedition(s, 1, 1), null);
  clearBattle(g); // Warrior-only party misses the Mage goal, but retains full life.
  const w = new Window();
  try {
    w.document.body.innerHTML = expeditionResult(s);
    assert.deepEqual(
      [...w.document.querySelectorAll('.exp-result-stars .exp-star')].map((e) =>
        e.classList.contains('filled'),
      ),
      [true, true, false],
    );
    assert.deepEqual(
      [...w.document.querySelectorAll('.exp-goals .exp-star')].map((e) =>
        e.classList.contains('filled'),
      ),
      [true, false, true],
    );
    w.document.body.innerHTML = expeditionMap(s, null, 0);
    assert.deepEqual(
      [...w.document.querySelectorAll('[data-action="exp-stage-1"] .exp-star')].map((e) =>
        e.classList.contains('filled'),
      ),
      [true, true, false],
    );
  } finally {
    w.happyDOM.close();
  }
});

test('graduated heroes form a unique ordered team; one member can challenge and three is the cap', () => {
  const g = expeditionFixture(4),
    s = g.state;
  assert.ok(startExpedition(s, 1));
  for (const h of s.meta.heroes.slice(0, 3)) assert.equal(setExpeditionTeam(s, h.id), null);
  assert.ok(setExpeditionTeam(s, s.meta.heroes[3].id));
  assert.equal(moveExpeditionMember(s, 1, -1), null);
  assert.equal(expeditionState(s).team[0], s.meta.heroes[1].id);
  assert.equal(setExpeditionTeam(s, s.meta.heroes[0].id), null);
  assert.equal(setExpeditionTeam(s, s.meta.heroes[2].id), null);
  assert.equal(startExpedition(s, 1), null);
  assert.ok(setExpeditionTeam(s, s.meta.heroes[2].id));
  assert.ok(startExpedition(s, 2));
});

test('battles execute bound item/tome/resonance skills, use fixed enemies, and preserve graduation data', () => {
  const g = expeditionFixture(1);
  strong(g);
  const s = g.state,
    h = s.meta.heroes[0],
    before = JSON.stringify(h);
  const sources = heroBattleBuild(h).sources;
  assert.ok(sources.some((source) => source.kind === 'item'));
  assert.ok(sources.some((source) => source.kind === 'tome'));
  const foe = expeditionEnemy(1, 0);
  setExpeditionTeam(s, h.id);
  startExpedition(s, 1);
  beginExpeditionBattle(s);
  const report = expeditionState(s).run!.report!;
  assert.ok(report.won);
  assert.ok(
    report.frames.some((f) => f.damage > 0 && sources.some((source) => source.name === f.label)),
  );
  assert.deepEqual(expeditionEnemy(1, 0), foe);
  assert.equal(JSON.stringify(h), before);
  assert.ok(finishExpeditionBattle(s));
});

test('reserves actually replace a fallen leader and the enemy keeps its damage', () => {
  const g = expeditionFixture(2),
    s = g.state;
  s.meta.heroes[0].stats = { ...s.meta.heroes[0].stats, attack: 30, hp: 15, defense: 0, speed: 20 };
  s.meta.heroes[1].stats = { ...s.meta.heroes[1].stats, attack: 2000, hp: 5000 };
  for (const h of s.meta.heroes) setExpeditionTeam(s, h.id);
  startExpedition(s, 1);
  beginExpeditionBattle(s);
  const p = expeditionState(s).run!.report!;
  const swap = p.frames.findIndex((f) => f.slot === 1);
  assert.ok(swap > 0);
  assert.ok(p.frames[swap - 1].hurt > 0);
  assert.equal(p.frames[swap].enemyHp, p.frames[swap - 1].enemyHp);
  assert.equal(p.hp[0], 0);
  assert.ok(p.won && p.hp[1] > 0);
});

test('one win completes one stage, unlocks the next and pays once; repeat clears pay less', () => {
  const g = expeditionFixture(1);
  strong(g);
  const s = g.state,
    before = JSON.stringify(s.meta.heroes),
    gold = s.meta.gold,
    medals = s.meta.medals;
  setExpeditionTeam(s, s.meta.heroes[0].id);
  startExpedition(s, 1);
  clearBattle(g);
  assert.equal(expeditionUnlocked(s), 2);
  assert.equal(expeditionState(s).cleared, 0);
  assert.equal(s.meta.gold, gold + 40);
  assert.equal(s.meta.medals, medals + 2);
  const restoredWin = parseSave(JSON.stringify(s));
  assert.equal(restoredWin.meta.expedition!.run!.outcome, 'won');
  assert.ok(finishExpeditionBattle(restoredWin));
  assert.equal(restoredWin.meta.gold, gold + 40);
  assert.ok(finishExpeditionBattle(s));
  assert.equal(s.meta.gold, gold + 40);
  startExpedition(s, 1);
  clearBattle(g);
  assert.equal(s.meta.gold, gold + 50);
  assert.equal(s.meta.medals, medals + 3);
  assert.equal(JSON.stringify(s.meta.heroes), before);
  assert.ok(startExpedition(s, 2));
  assert.equal(startExpedition(s, 1, 1), null);
  assert.deepEqual(expeditionState(s).run!.hp, [1]);
});

test('mid-battle replay survives saving without rerolls and rejects invalid playback cursors', () => {
  const g = expeditionFixture(1);
  strong(g);
  const s = g.state;
  setExpeditionTeam(s, s.meta.heroes[0].id);
  startExpedition(s, 1);
  beginExpeditionBattle(s);
  const report = expeditionState(s).run!.report!;
  report.cursor = Math.min(2, report.frames.length - 1);
  const restored = parseSave(JSON.stringify(s));
  assert.deepEqual(restored.meta.expedition, s.meta.expedition);
  const r = expeditionState(restored).run!.report!;
  r.cursor = r.frames.length - 1;
  finishExpeditionBattle(restored);
  assert.equal(expeditionState(restored).run!.node, 0);
  assert.equal(expeditionState(restored).run!.outcome, 'won');
  assert.doesNotThrow(() => parseSave(JSON.stringify(restored)));
  const invalid = structuredClone(s);
  invalid.meta.expedition!.run!.report!.cursor = -1;
  assert.throws(() => parseSave(JSON.stringify(invalid)));
});

test('purchased guild bonuses strengthen graduate combat without changing its bound baseline', () => {
  const g = expeditionFixture(1),
    s = g.state,
    record = s.meta.heroes[0];
  s.meta.guildPurchased = 0;
  const before = expeditionHero(s, record.id)!;
  const snapshot = JSON.stringify(record);
  s.meta.guildPurchased = 3;
  const after = expeditionHero(s, record.id)!;
  assert.ok(after.stats.attack > before.stats.attack);
  assert.ok(after.stats.hp > before.stats.hp);
  assert.ok(after.stats.defense > before.stats.defense);
  assert.equal(JSON.stringify(record), snapshot);
  assert.deepEqual(after.loadout, before.loadout);
});

test('ten independent stages, profession reserves, best stars and manual chests remain consistent', () => {
  const g = expeditionFixture(2),
    s = g.state,
    e = expeditionState(s);
  const mage = start('mage');
  mage.retreat();
  mage.returnToSelection();
  s.meta.heroes[1] = { ...structuredClone(mage.state.meta.heroes[0]), id: s.meta.heroes[1].id };
  strong(g);
  for (const h of s.meta.heroes) setExpeditionTeam(s, h.id);
  assert.equal(chapterEnemy(4).isElite, true);
  assert.equal(chapterEnemy(9).isBoss, true);
  assert.equal(expeditionGoals(1)[1].profession, 'mage');
  assert.ok(startExpedition(s, 1, 1));
  for (let node = 0; node < 10; node++) {
    assert.equal(startExpedition(s, 1, node), null);
    clearBattle(g);
    assert.ok(e.goals![node][0]);
    if (node === 1) {
      assert.ok(e.goals![node][1]);
      assert.ok(
        e.run!.report!.frames.every((f) => f.slot === 0),
        'reserve profession counts without actual fighting',
      );
    }
    assert.doesNotThrow(() => parseSave(JSON.stringify(s)));
  }
  assert.equal(expeditionUnlocked(s), 10);
  assert.ok(startExpedition(s, 1, 10));
  assert.equal(e.cleared, 1);
  assert.ok(expeditionStars(s) >= 20);
  const gold = s.meta.gold,
    medals = s.meta.medals;
  assert.equal(claimExpeditionStars(s, 10), null);
  assert.equal(s.meta.gold, gold + 80);
  assert.equal(s.meta.medals, medals + 10);
  assert.ok(claimExpeditionStars(s, 10));
  const old = [...e.goals![1]];
  retreatExpedition(s);
  setExpeditionTeam(s, s.meta.heroes[1].id);
  startExpedition(s, 1, 1);
  clearBattle(g);
  assert.deepEqual(e.goals![1], old);
  assert.equal(e.run!.gold, stageReward(1, false).gold);
});

test('legacy three-fight progress and an active replay migrate without lost rewards', () => {
  const g = expeditionFixture(1),
    s = g.state;
  strong(g);
  setExpeditionTeam(s, s.meta.heroes[0].id);
  startExpedition(s, 1);
  const e = expeditionState(s);
  delete e.version;
  delete e.goals;
  delete e.claimedStars;
  delete e.run!.format;
  const restored = parseSave(JSON.stringify(s));
  assert.equal(restored.meta.expedition!.run!.format, 'legacy');
  const legacy = new Game(restored),
    gold = legacy.state.meta.gold;
  for (let n = 0; n < 3; n++) clearBattle(legacy);
  assert.equal(legacy.state.meta.gold, gold + 80);
  assert.equal(expeditionUnlocked(legacy.state), 4);
  assert.doesNotThrow(() => parseSave(JSON.stringify(legacy.state)));
});

test('exploration counts real offline time, reserves its heroes and pays only on manual claim', () => {
  const g = expeditionFixture(2),
    s = g.state,
    e = expeditionState(s),
    now = 1700000000000;
  e.cleared = 1;
  setExpeditionTeam(s, s.meta.heroes[0].id);
  assert.equal(startDispatch(s, 1, now), null);
  assert.ok(startExpedition(s, 1));
  assert.ok(startDispatch(s, 1, now));
  assert.ok(claimDispatch(s, now + DISPATCH_MS - 1));
  const restored = parseSave(JSON.stringify(s)),
    job = restored.meta.expedition!.dispatch!,
    gold = restored.meta.gold;
  assert.equal(claimDispatch(restored, now + DISPATCH_MS), null);
  assert.equal(restored.meta.gold, gold + job.gold);
  assert.equal(restored.meta.expedition!.dispatch, null);
  assert.ok(claimDispatch(restored, now + DISPATCH_MS));
  assert.equal(restored.meta.gold, gold + job.gold);
});

test('old saves gain empty expedition state; failed/withdrawn expeditions cannot damage the real hero', () => {
  const g = expeditionFixture(1),
    s = g.state;
  delete s.meta.expedition;
  const restored = parseSave(JSON.stringify(s));
  assert.equal(restored.meta.expedition!.cleared, 0);
  const h = s.meta.heroes[0];
  h.stats.hp = 1;
  const before = JSON.stringify(h),
    gold = s.meta.gold;
  setExpeditionTeam(s, h.id);
  startExpedition(s, 1);
  clearBattle(g);
  assert.equal(expeditionState(s).run!.outcome, 'lost');
  assert.equal(s.meta.gold, gold);
  assert.equal(JSON.stringify(h), before);
  assert.equal(retreatExpedition(s), null);
  assert.equal(JSON.stringify(h), before);
});

test('real UI exposes guild entry, empty guidance, selection, ordering and battle skip/continue', () => {
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  w.document.body.innerHTML = '<div id="app"></div>';
  try {
    const g = expeditionFixture(2);
    strong(g);
    const ui = new UI(g, () => {});
    const tap = (q: string) => {
      const el = w.document.querySelector(q);
      assert.ok(el, q);
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    };
    tap('[data-action="expedition"]');
    assert.equal(w.document.querySelectorAll('.exp-map-node').length, 10);
    tap('[data-action="exp-stage-0"]');
    assert.ok(w.document.querySelector('.exp-stage-sheet .exp-goals'));
    tap('[data-action="exp-team-open"]');
    assert.equal(w.document.querySelectorAll('.exp-team-empty').length, 3);
    tap('[data-action="exp-team-hero-1"]');
    tap('[data-action="exp-team-hero-2"]');
    tap('[data-action="exp-order-1-up"]');
    assert.equal(expeditionState(g.state).team[0], 'hero-2');
    tap('[data-action="exp-start"]');
    assert.ok(w.document.querySelector('.exp-battle'));
    assert.ok(w.document.querySelector('.enemy-portrait'));
    assert.equal(w.document.querySelectorAll('.exp-relay-portraits .battle-portrait').length, 2);
    assert.ok(w.document.querySelector('.exp-pack'));
    assert.ok(w.document.querySelector('.exp-battle .enemy-health > .enemy-portrait'));
    assert.equal(w.document.querySelectorAll('.exp-pack .pack-cell').length, 42);
    assert.equal(w.document.querySelectorAll('.exp-shared-board .resonance-slot').length, 4);
    assert.equal(
      w.document.querySelector('.exp-shared-board [aria-label="攻击"] b')!.textContent,
      '2000',
    );
    tap('[data-status-side="enemy"]');
    assert.ok((w.document.querySelector('#modal') as any).open);
    assert.match(w.document.querySelector('#modal-body')!.textContent!, /林地灰狼/);
    tap('[data-action="close"]');
    tap('[data-action="exp-skip"]');
    assert.equal((w.document.querySelector('[data-action="exp-next"]') as any).hidden, false);
    tap('[data-action="exp-next"]');
    assert.equal(expeditionState(g.state).run!.outcome, 'won');
    assert.equal(w.document.querySelectorAll('.exp-result-page .actor-art').length, 0);
    tap('[data-action="exp-next-stage"]');
    assert.equal(expeditionState(g.state).run!.node, 1);
    assert.equal(expeditionState(g.state).run!.outcome, 'battle');
    ui.render();
  } finally {
    w.happyDOM.close();
  }
});

test('graduate view uses its own real loadout, stats and contributions without changing training or the archive', () => {
  const g = expeditionFixture(2),
    s = g.state;
  setExpeditionTeam(s, s.meta.heroes[0].id);
  setExpeditionTeam(s, s.meta.heroes[1].id);
  startExpedition(s, 1);
  beginExpeditionBattle(s);
  const run = expeditionState(s).run!,
    report = run.report!;
  const before = JSON.stringify(s),
    view = expeditionBattleState(s)!;
  const h = expeditionHero(s, run.team[report.frames[report.cursor].slot])!;
  assert.equal(view.player.hp, report.frames[report.cursor].hp);
  assert.equal(view.run.realm, h.realm);
  assert.deepEqual(view.inventory, h.loadout!.equipment);
  assert.deepEqual(view.placements, h.loadout!.placements);
  assert.deepEqual(view.run.resonances, h.resonances);
  const html = expeditionBuildPanel(h, view);
  assert.ok(html.includes(combatHud(view, h.stats)));
  assert.ok(html.includes(combatResonances(view, false, 'data-exp-resonance')));
  const key = h.resonances[0],
    contribution = resonanceScore(view.inventory, view.placements, key);
  assert.match(
    html,
    new RegExp(`${contribution.score}/${contribution.next ?? contribution.thresholds[2]}`),
  );
  assert.equal(JSON.stringify(s), before);
});

test('relay changes the portrait, information bar and bound backpack together and keeps status touch targets stable', () => {
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    localStorage: w.localStorage,
    getComputedStyle: w.getComputedStyle.bind(w),
  });
  w.document.body.innerHTML = '<div id="app"></div>';
  try {
    const g = expeditionFixture(2),
      s = g.state;
    s.meta.heroes[0].stats.hp = 1;
    for (const h of s.meta.heroes) setExpeditionTeam(s, h.id);
    startExpedition(s, 1);
    beginExpeditionBattle(s);
    const report = expeditionState(s).run!.report!;
    const ui = new UI(g, () => {}),
      enemyStatus = w.document.querySelector('[data-status-side="enemy"]');
    const nextSlot = report.frames.findIndex((f) => f.slot === 1);
    assert.ok(nextSlot > 0);
    report.cursor = nextSlot;
    ui.render();
    assert.equal(w.document.querySelector('.exp-leader-portrait small')!.textContent, '2P');
    assert.equal(w.document.querySelector('.exp-hero-name')!.textContent, s.meta.heroes[1].name);
    assert.match(
      w.document.querySelector('.exp-shared-board .combat-hud')!.textContent!,
      new RegExp(s.meta.heroes[1].name),
    );
    assert.equal(
      w.document.querySelector('.exp-pack [data-owner]')!.getAttribute('data-owner'),
      s.meta.heroes[1].id,
    );
    assert.equal(w.document.querySelector('[data-status-side="enemy"]'), enemyStatus);
    assert.equal(w.document.querySelector('[data-exp-slot="1"]')!.hasAttribute('hidden'), true);
    assert.equal(w.document.querySelector('[data-exp-slot="0"]')!.hasAttribute('hidden'), false);
  } finally {
    w.happyDOM.close();
  }
});
