import type { Actor } from './types';
import type { Fighter, Minion } from './skill-types';

export interface ExpeditionFrame {
  round: number;
  slot: number;
  actor: Actor;
  label: string;
  hp: number;
  maxHp: number;
  enemyHp: number;
  shield: number;
  enemyShield: number;
  damage: number;
  hurt: number;
  healed: number;
  enemyHealed: number;
  sourceId?: string;
  activatedSource?: string;
  triggeredSources?: string[];
  heroFighter?: Fighter;
  enemyFighter?: Fighter;
  timers?: Record<string, number>;
  firedAt?: Record<string, number>;
  flags?: Record<string, number>;
  charges?: Record<string, number>;
  phase?: boolean;
  heroActions?: number;
  enemyActions?: number;
  minions?: Minion[];
  warning?: string;
}
export interface ExpeditionReport {
  frames: ExpeditionFrame[];
  cursor: number;
  won: boolean;
  hp: number[];
  enemyHp: number;
  rounds: number;
}
export interface ExpeditionState {
  version?: 2;
  goals?: boolean[][];
  claimedStars?: number[];
  team: string[];
  cleared: number;
  run: {
    format?: 'chapter' | 'legacy';
    area: number;
    node: number;
    team: string[];
    hp: number[];
    outcome: 'ready' | 'battle' | 'won' | 'lost';
    report: ExpeditionReport | null;
    gold: number;
    medals: number;
    firstClear: boolean;
  } | null;
  dispatch: {
    area: number;
    team: string[];
    startedAt: number;
    readyAt: number;
    gold: number;
    medals: number;
  } | null;
}
