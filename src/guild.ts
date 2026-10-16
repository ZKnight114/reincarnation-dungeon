import type { Attributes, GameState, GuildBonus, Outcome } from './types';

export const CHAPTER_CAP = 10;
export const GUILD_CAP = 30;
type Benefit =
  'attack' | 'hp' | 'defense' | 'attackPercent' | 'hpPercent' | 'defensePercent' | 'points';
export interface GuildNode {
  id: number;
  level: number;
  benefit: Benefit;
  name: string;
  value: number;
  cost: number;
  critical: boolean;
}
const cycle: Benefit[][] = [
  ['hp', 'attack', 'defense'],
  ['attackPercent', 'hp', 'defensePercent'],
  ['defense', 'hpPercent', 'attack'],
  ['hpPercent', 'defensePercent', 'attackPercent'],
  ['attack', 'defense', 'hp'],
  ['defensePercent', 'hpPercent', 'attackPercent'],
  ['hp', 'attackPercent', 'defense'],
  ['defensePercent', 'attack', 'hpPercent'],
  ['defense', 'hp', 'attack'],
  ['attackPercent', 'defensePercent', 'hpPercent'],
];
const values = {
  attack: 2,
  hp: 20,
  defense: 1,
  attackPercent: 0.02,
  hpPercent: 0.02,
  defensePercent: 0.02,
  points: 1,
};
const names = {
  attack: '攻击训练',
  hp: '生命训练',
  defense: '防御训练',
  attackPercent: '攻击强化',
  hpPercent: '生命强化',
  defensePercent: '防御强化',
  points: '培养课程',
};
const critical: Record<number, number> = { 5: 20, 10: 50, 20: 100, 30: 180 };
export const guildNodeCost = (level: number) =>
  level <= 5
    ? 4 + 2 * (level - 1)
    : level <= 10
      ? 16 + 3 * (level - 6)
      : level <= 15
        ? 32 + 4 * (level - 11)
        : level <= 20
          ? 54 + 5 * (level - 16)
          : level <= 25
            ? 80 + 6 * (level - 21)
            : 112 + 7 * (level - 26);
export const GUILD_NODES: GuildNode[] = [];
for (let level = 1; level <= GUILD_CAP; level++) {
  for (const benefit of cycle[(level - 1) % 10])
    GUILD_NODES.push({
      id: GUILD_NODES.length,
      level,
      benefit,
      name: names[benefit],
      value: values[benefit],
      cost: guildNodeCost(level),
      critical: false,
    });
  if (critical[level])
    GUILD_NODES.push({
      id: GUILD_NODES.length,
      level,
      benefit: 'points',
      name: names.points,
      value: 1,
      cost: critical[level],
      critical: true,
    });
}
export const emptyGuildBonus = (): GuildBonus => ({
  attack: 0,
  hp: 0,
  defense: 0,
  attackPercent: 0,
  hpPercent: 0,
  defensePercent: 0,
  points: 0,
});
export function guildBenefits(purchased: number): GuildBonus {
  const result = emptyGuildBonus();
  for (const node of GUILD_NODES.slice(0, purchased)) result[node.benefit] += node.value;
  for (const key of ['attackPercent', 'hpPercent', 'defensePercent'] as const)
    result[key] = +result[key].toFixed(2);
  return result;
}
export function applyGuild<T extends Attributes>(stats: T, bonus: GuildBonus): T {
  return {
    ...stats,
    attack: (stats.attack + bonus.attack) * (1 + bonus.attackPercent),
    hp: (stats.hp + bonus.hp) * (1 + bonus.hpPercent),
    defense: (stats.defense + bonus.defense) * (1 + bonus.defensePercent),
  };
}
export const guildNodeEffect = (node: GuildNode) =>
  node.benefit === 'points'
    ? '初始属性点＋1'
    : `${{ attack: '攻击', hp: '生命', defense: '防御' }[node.benefit.replace('Percent', '') as 'attack' | 'hp' | 'defense']}＋${node.benefit.endsWith('Percent') ? Math.round(node.value * 100) + '%' : node.value}`;
const trained = [
  0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 20, 23, 26, 29, 32, 36, 40, 44, 48, 52, 57, 62,
  67, 72, 77,
];
const achievements: ['wins' | 'trials' | 'aRated' | 'sRated', number][] = [
  ['wins', 0],
  ['wins', 1],
  ['trials', 3],
  ['wins', 2],
  ['trials', 6],
  ['wins', 3],
  ['wins', 4],
  ['wins', 5],
  ['wins', 6],
  ['aRated', 1],
  ['wins', 7],
  ['wins', 8],
  ['wins', 9],
  ['wins', 10],
  ['aRated', 3],
  ['wins', 12],
  ['wins', 14],
  ['wins', 16],
  ['wins', 18],
  ['aRated', 5],
  ['wins', 20],
  ['wins', 23],
  ['wins', 26],
  ['wins', 29],
  ['aRated', 8],
  ['wins', 32],
  ['wins', 36],
  ['wins', 40],
  ['wins', 44],
  ['sRated', 3],
];
export function guildConditions(s: GameState) {
  const level = s.meta.guildLevel + 1;
  if (level > GUILD_CAP) return [];
  const n = trained[level - 1],
    [key, target] = achievements[level - 1];
  const label =
    key === 'wins'
      ? `成功结业 ${target} 次`
      : key === 'trials'
        ? `累计通过 ${target} 次试炼`
        : `培养 ${target} 名${key === 'aRated' ? 'A级及以上' : 'S级'}勇者`;
  return [
    { label: `累计消耗体力 ${5 * n}`, value: s.meta.staminaSpent, target: 5 * n },
    { label: `累计培养 ${n} 名勇者`, value: s.meta.guildHistory.trained, target: n },
    { label, value: key === 'wins' ? s.meta.wins : s.meta.guildHistory[key], target },
  ];
}
export const startingRealm = (chapter: number) => Math.max(0, Math.min(CHAPTER_CAP, chapter) - 1);
export const MEDAL_BASE = [24, 28, 32, 36, 42, 48, 54, 60, 68, 76];
export function medalReward(s: GameState, outcome: Outcome) {
  const trial = s.run.trials
    .slice(0, s.run.stages)
    .reduce<number>((n, tier) => n + (tier === null ? 0 : 2 + tier * 2), 0);
  const base = MEDAL_BASE[Math.min(CHAPTER_CAP, s.run.chapter) - 1];
  // Entering the optional extension preserves the already completed normal route.
  if (outcome === 'win' || s.run.extreme)
    return base + trial + (outcome === 'win' && s.run.extreme ? Math.floor(base / 2) : 0);
  return outcome === 'retreat' ? Math.floor(trial / 2) : trial;
}
