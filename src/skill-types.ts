import type { DamageType } from './types';

export type StatusKind = 'poison' | 'burn' | 'chill' | 'break' | 'mark';
export type Condition =
  | 'poison'
  | 'burn'
  | 'chill'
  | 'break'
  | 'mark'
  | 'shield'
  | 'first'
  | 'mixed'
  | 'icefire'
  | 'targetLow'
  | 'selfLow';
export interface SkillAction {
  kind: 'damage' | 'shield' | 'heal' | 'status' | 'counter' | 'consume';
  a?: number;
  h?: number;
  d?: number;
  type?: DamageType;
  hits?: number;
  ignore?: number;
  ignoreWhen?: Condition;
  when?: Condition;
  status?: StatusKind;
  duration?: number;
  limit?: number;
  dot?: 'poison' | 'burn';
  dotScale?: number;
  cap?: number;
  received?: number;
  consumed?: number;
  bonusWhen?: Condition;
  bonus?: number;
}
export interface Skill {
  cooldown: number;
  actions: SkillAction[];
  trigger?: 'shieldHit' | 'shieldBreak' | 'low30' | 'low50' | 'tome';
  once?: boolean;
  every?: number;
}
export interface Source {
  id: string;
  name: string;
  kind: 'item' | 'tome' | 'resonance' | 'enemy';
  skills: Skill[];
  damageBonus?: number;
  shieldBonus?: number;
  healBonus?: number;
  counterBonus?: number;
  ranged?: boolean;
}
export interface BattleStatus {
  kind: StatusKind;
  value: number;
  remaining: number;
  source: string;
}
export interface Fighter {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  shield: number;
  profession: import('./types').Profession;
  statuses: BattleStatus[];
}
export interface Minion extends Fighter {
  id: string;
  activeAt: number;
}
export interface BattleRuntime {
  hero: Fighter;
  enemy: Fighter;
  sources: Source[];
  enemyId: string;
  enemyActions: number;
  heroActions: number;
  timers: Record<string, number>;
  charges: Record<string, number>;
  flags: Record<string, number>;
  minions: Minion[];
  summons: number;
  phase: boolean;
  warning: string;
  tiers: Partial<Record<import('./types').ResonanceKey, number>>;
  mixed: boolean;
  heroFirst: boolean;
}
