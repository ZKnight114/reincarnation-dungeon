import { Game } from '../src/game';
import { firstFree, runBagCells, cells } from '../src/backpack';
import { seed, recruitToConfigure, prepare } from './helpers';
import { parseSave } from '../src/save';
import { GUILD_NODES } from '../src/guild';
import type { Profession } from '../src/types';
export function manage(g: Game, attempts = 25, merge = true) {
  let pair = merge;
  while (pair) {
    pair = false;
    for (const a of [...g.state.inventory]) {
      const b = g.mergePartner(a.id);
      if (b && g.mergeItems(a.id, b.id) === null) {
        pair = true;
        break;
      }
    }
  }
  const items = [...g.state.inventory],
    rnd = seed(g.state.run.index + 17);
  let best = g.state.draft,
    bestScore = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    g.state.draft = [];
    const sorted = [...items].sort((a, b) => {
      const value = (i: typeof a) =>
        i.level * 2 +
        Math.log(1 + i.attack + i.hp * 0.04 + i.defense * 0.5) +
        (i.branch === 'neutral' ? 1 : 0);
      return attempt === 0
        ? cells(b).length - cells(a).length
        : value(b) - value(a) + (rnd() - 0.5) * 4;
    });
    for (const i of sorted) {
      const p = firstFree(items, g.state.draft, i.id, runBagCells(g.state));
      if (p) g.state.draft.push(p);
    }
    const a = g.packAnalysis(true),
      score = a.strength;
    if (score > bestScore && a.hasWeapon) {
      bestScore = score;
      best = structuredClone(g.state.draft);
    }
  }
  g.state.draft = best;
  g.recalculate();
}
export function play(
  p: Profession,
  chapter: number,
  n: number,
  extreme = false,
  verbose = false,
  auxiliaryTome?: string,
  options: {
    guildLevel?: number;
    trialTier?: 0 | 1 | 2;
    fights?: FightSample[];
    packingAttempts?: number;
    merge?: boolean;
  } = {},
) {
  const g = new Game(undefined, seed(n), () => 1700000000000);
  g.state.meta.highestChapter = chapter;
  g.state.meta.guildLevel = options.guildLevel ?? 1;
  g.state.meta.guildPurchased = options.guildLevel
    ? GUILD_NODES.filter((n) => n.level <= options.guildLevel!).length
    : 0;
  recruitToConfigure(g, chapter, p);
  if (auxiliaryTome) {
    const error = g.selectTome(auxiliaryTome);
    if (error) throw new Error(error);
  }
  g.startRun();
  prepare(g);
  let fight: Omit<
    FightSample,
    'rounds' | 'survived' | 'enemyActions' | 'lifeAfter' | 'lifeAtEnd' | 'recovery'
  > | null = null;
  let loops = 0,
    previousPhase = g.state.phase;
  while (g.state.phase !== 'summary' && loops++ < 1200) {
    if (g.state.phase !== previousPhase) {
      parseSave(JSON.stringify(g.state));
      previousPhase = g.state.phase;
    }
    const s = g.state;
    switch (s.phase) {
      case 'camp':
        manage(g, options.packingAttempts, options.merge);
        g.continueCamp();
        break;
      case 'journey':
        g.continueJourney();
        break;
      case 'combat': {
        const r = g.state.combat.round,
          boss = !!s.enemy?.isBoss;
        if (!fight)
          fight = {
            index: s.run.index + 1,
            boss,
            heroMaxHp: s.player.maxHp,
            lifeBefore: s.player.hp,
            enemyMaxHp: s.enemy!.maxHp,
            enemyAttack: s.enemy!.attack,
          };
        const enemyActions = s.combat.runtime!.enemyActions;
        g.advanceTurn();
        if (s.phase !== 'combat') {
          options.fights?.push({
            ...fight,
            rounds: r,
            survived: s.phase !== 'summary',
            lifeAfter: s.player.hp,
            lifeAtEnd: s.lastReport!.lifeAtEnd ?? s.player.hp,
            recovery: s.lastReport!.recovery ?? 0,
            enemyActions: s.combat.runtime?.enemyActions ?? enemyActions,
          });
          fight = null;
        }
        if (verbose && s.phase !== 'combat')
          console.log(
            'fight',
            s.run.index + 1,
            r,
            Math.round(s.player.hp),
            Math.round(g.packAnalysis(true).dps),
          );
        break;
      }
      case 'awakening':
        g.finishAwakening();
        break;
      case 'reward': {
        if (s.run.rewards[0].kind === 'buff') {
          g.chooseReward(0);
          break;
        }
        const keys = s.run.rewards[0].resonances;
        let best = keys[0],
          score = -1;
        for (const k of keys) {
          s.run.resonances.push(k);
          const a = g.packAnalysis(true).strength;
          s.run.resonances.pop();
          if (a > score) {
            score = a;
            best = k;
          }
        }
        g.chooseResonance(best);
        break;
      }
      case 'event': {
        const e = g.currentEvent()!;
        if (e.kind === 'supply' && s.run.supply) {
          g.update(1);
          g.chooseEvent('take');
          break;
        }
        if (e.kind === 'chance' && s.run.routeRevision === 16) {
          g.chooseEvent('spin');
          g.update(4);
          g.finishWheel();
          break;
        }
        g.chooseEvent(
          e.kind === 'boss'
            ? `trial-${options.trialTier ?? 0}`
            : e.kind === 'treasure'
              ? 'open'
              : e.kind === 'rest'
                ? 'heal'
                : e.kind === 'dig'
                  ? 'dig-finish'
                  : e.kind === 'graduation'
                    ? extreme
                      ? 'extreme'
                      : 'graduate'
                    : e.kind === 'ending'
                      ? 'finish'
                      : 'skip',
        );
        break;
      }
      default:
        throw new Error(s.phase);
    }
  }
  parseSave(JSON.stringify(g.state));
  return g;
}

export interface FightSample {
  index: number;
  boss: boolean;
  rounds: number;
  survived: boolean;
  heroMaxHp: number;
  lifeBefore: number;
  lifeAfter: number;
  lifeAtEnd: number;
  recovery: number;
  enemyMaxHp: number;
  enemyAttack: number;
  enemyActions: number;
}
