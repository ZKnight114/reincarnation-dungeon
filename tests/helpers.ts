import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { TRIAL_NODES, stageGrowth, chapterRoute } from '../src/journey';
import { firstFree, openBagCells, validateLayout } from '../src/backpack';
import type { EventKind, Profession } from '../src/types';
export const seed = (initial: number) => {
  let n = initial;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
};
export function placeFree(g: Game, id: string) {
  const p = firstFree(g.state.inventory, g.state.draft, id, openBagCells(g.state.run.kills));
  return p ? g.placeItem(id, p.x, p.y, p.rotation) : '无空位';
}
export function fitStarters(g: Game) {
  const items = g.state.inventory,
    open = openBagCells(g.state.run.kills);
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
  assert.ok(result, 'starter shapes fit initial bag');
  g.state.draft = result;
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
  for (let n = 0; n < 2; n++) assert.equal(g.claimStarterRound(), null);
  fitStarters(g);
  assert.equal(g.finishOpening(), null);
  assert.equal(g.chooseResonance(g.state.run.rewards[0].resonances[0]), null);
  return g;
}
export function start(profession: Profession = 'warrior', random = seed(19)) {
  const g = new Game(undefined, random);
  g.state.meta.highestChapter = 4;
  recruitToConfigure(g, 4, profession);
  assert.equal(g.startRun(profession), null);
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
    (s.run.trainee?.realmStart ?? 0) +
    chapterRoute(s.run.chapter).trials.filter((i) => i < index!).length;
  s.run.stages = chapterRoute(s.run.chapter).trials.filter((i) => i < index!).length;
  s.run.trials = Array.from({ length: 3 }, (_, i) => (i < s.run.stages ? 0 : null));
  s.run.growth = stageGrowth(s.run.profession, s.run.trials, s.run.stages);
  while (s.run.resonances.length < 1 + s.run.stages) s.run.resonances.push(g.resonanceChoices()[0]);
  s.phase = 'camp';
  s.run.rewards = [];
  s.run.dig = null;
  assert.equal(advanceCamp(g), null);
  if (g.state.phase === 'event' && chapterRoute(s.run.chapter).trials.includes(s.run.index))
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
  });
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
