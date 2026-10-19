import assert from 'node:assert/strict';
import { Game, generateEvents } from '../src/game';
import { TRIAL_NODES, stageGrowth, chapterRoute, runRoute } from '../src/journey';
import { firstFree, runBagCells, validateLayout, PROFESSIONS } from '../src/backpack';
import type { EventKind, Profession } from '../src/types';
import type { UI } from '../src/ui';

/** Let the UI finish result narration before assertions about the loot view. */
export async function settleJourneyUI(ui: UI) {
  for (let n = 0; n < 40; n++) {
    ui.render();
    const next = document.querySelector<HTMLButtonElement>('[data-action="continue"]');
    if (!document.querySelector('.journey-pending') && !next?.disabled) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail('Result narration did not finish');
}
export const seed = (initial: number) => {
  let n = initial;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
};
export function placeFree(g: Game, id: string) {
  const p = firstFree(g.state.inventory, g.state.draft, id, runBagCells(g.state));
  return p ? g.placeItem(id, p.x, p.y, p.rotation) : '无空位';
}
export function fitStarters(g: Game) {
  const items = g.state.inventory,
    open = runBagCells(g.state);
  function fit(n: number, layout: Game['state']['draft']): Game['state']['draft'] | null {
    if (n === items.length) return layout;
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 7; x++) {
        const next = [...layout, { id: items[n].id, x, y, rotation: 0 }];
        if (!validateLayout(items, next, open)) {
          const found = fit(n + 1, next);
          if (found) return found;
        }
      }
    return null;
  }
  const result = fit(0, []);
  // Random gifts may exceed the opening bag. Keeping a usable subset is intentional.
  g.state.draft = result ?? [];
  if (!result) {
    for (const i of [...items].sort(
      (a, b) => Number(b.slot === 'weapon') - Number(a.slot === 'weapon'),
    )) {
      const p = firstFree(items, g.state.draft, i.id, open);
      if (p) g.state.draft.push(p);
    }
  }
  if (g.state.run.starterRound === 2)
    assert.ok(g.state.draft.some((p) => items.find((i) => i.id === p.id)?.slot === 'weapon'));
  g.state.revision++;
}
export function recruitToConfigure(g: Game, chapter = 1, profession: Profession = 'warrior') {
  g.enterChapters();
  g.chooseChapter(chapter);
  assert.equal(g.recruit(profession), null);
  g.balanceAllocation();
  g.confirmAllocation();
  g.selectTome(
    (
      {
        warrior: 'warrior_sword_tome',
        mage: 'mage_flame_tome',
        rogue: 'rogue_poison_tome',
      } as const
    )[profession],
  );
  return g;
}
export function prepare(g: Game) {
  if (g.state.run.prologue === 'departure') g.continueJourney();
  for (let n = 0; n < 2; n++) assert.equal(g.claimStarterRound(), null);
  fitStarters(g);
  assert.equal(g.finishOpening(), null);
  assert.equal(g.chooseResonance(g.state.run.rewards[0].resonances[0]), null);
  if (g.state.run.prologue === 'ready') g.continueJourney();
  return g;
}
export function start(profession: Profession = 'warrior', random = seed(19)) {
  const g = new Game(undefined, random);
  g.state.meta.highestChapter = 4;
  recruitToConfigure(g, 4, profession);
  assert.equal(g.startRun(profession), null);
  // Mechanics fixtures retain the historical rectangle for tests with explicit coordinates.
  // Fresh-run layout, randomized loot and real playthroughs are tested independently.
  delete g.state.run.routeRevision;
  delete g.state.run.prologue;
  g.state.phase = 'opening';
  g.state.run.events = generateEvents(random, 4, true);
  g.state.run.packLayout = 'legacy';
  // A known build fixture isolates downstream mechanics from opening loot randomness.
  // Opening random generation itself is tested using startRun directly.
  g.state.run.starterPlan = structuredClone(PROFESSIONS[profession].starter);
  g.state.itemSerial = 0;
  g.state.run.starterOffers = g.state.run.starterPlan[0].map((id) => g.makeItem(id));
  return prepare(g);
}
export function positionEvent(g: Game, kind: EventKind, index?: number) {
  const s = g.state;
  const target = kind === 'elite' ? 'boss' : kind;
  if (index === undefined)
    index = kind === 'boss' ? TRIAL_NODES[2] : s.run.events.findIndex((e) => e.kind === target);
  if (index < 0) throw new Error('Missing event');
  s.run.index = index;
  s.run.events.forEach((e, i) => (e.completed = i < index!));
  s.run.realm =
    (s.run.trainee?.realmStart ?? 0) + runRoute(s).trials.filter((i) => i < index!).length;
  s.run.stages = runRoute(s).trials.filter((i) => i < index!).length;
  s.run.trials = Array.from({ length: 3 }, (_, i) => (i < s.run.stages ? 0 : null));
  s.run.growth = stageGrowth(s.run.profession, s.run.trials, s.run.stages);
  while (s.run.resonances.length < 1 + s.run.stages) s.run.resonances.push(g.resonanceChoices()[0]);
  s.phase = 'camp';
  s.run.rewards = [];
  s.run.dig = null;
  assert.equal(advanceCamp(g), null);
  if (g.state.phase === 'event' && runRoute(s).trials.includes(s.run.index))
    assert.equal(g.chooseTrial(0), null);
  return index;
}
export function add(g: Game, id: string, level = 1) {
  const i = g.makeItem(id, level);
  g.state.inventory.push(i);
  g.state.revision++;
  return i;
}

// Bypass presentation only in tests of downstream event mechanics.
export function advanceCamp(g: Game) {
  const error = g.continueCamp();
  if (!error && g.state.phase === 'journey') g.continueJourney();
  return error;
}

export function setEnemy(g: Game, values: Partial<NonNullable<Game['state']['enemy']>>) {
  Object.assign(g.state.enemy!, values);
  const e = g.state.enemy!,
    r = g.state.combat.runtime;
  if (!r) return;
  Object.assign(r.enemy, {
    hp: e.hp,
    maxHp: e.maxHp,
    attack: e.attack,
    defense: e.defense,
    speed: e.speed,
    profession: e.profession,
  });
  if (values.templateId) r.enemyId = values.templateId;
  if (values.effects)
    r.enemy.statuses = values.effects.map((x) => ({
      kind: x.kind,
      value: x.damage,
      remaining: x.remaining,
      source: x.sourceId,
    }));
}
export function setPlayer(g: Game, values: Partial<Game['state']['player']>) {
  Object.assign(g.state.player, values);
  const p = g.state.player,
    r = g.state.combat.runtime;
  if (r) Object.assign(r.hero, { hp: p.hp, maxHp: p.maxHp, defense: p.defense, shield: p.shield });
}
