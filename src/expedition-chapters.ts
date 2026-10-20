import type { Enemy, Profession } from './types';
import { ENEMY_TEMPLATES } from './enemies';

export const EXPEDITION_CHAPTERS = [
  {
    id: 1,
    name: '幽影森林',
    map: 'expedition/chapter-1-map',
    battle: 'expedition/chapter-1-battle',
  },
] as const;
export interface ExpeditionGoal {
  text: string;
  kind: 'victory' | 'profession' | 'variety' | 'members' | 'health' | 'survival';
  value?: number;
  profession?: Profession;
}
const opponents = [
  ['wolf', '林地灰狼', 11],
  ['slime', '苔绿史莱姆', 7],
  ['spider', '幽林巨蛛', 9],
  ['bat', '夜翼蝙蝠', 8],
  ['queen', '蛛巢女王', 19],
  ['ogre', '古林食人魔', 14],
  ['wraith', '苔影游魂', 0],
  ['spider', '腐枝巨蛛', 9],
  ['wolf', '暗林灰狼', 11],
  ['golem', '古林石卫', 10],
] as const;
export const expeditionGoals = (node: number): ExpeditionGoal[] => {
  const professions: Record<number, Profession> = {
    0: 'warrior',
    1: 'mage',
    2: 'rogue',
    5: 'warrior',
    6: 'mage',
    7: 'rogue',
  };
  const names = { warrior: '战士', mage: '法师', rogue: '刺客' };
  const profession = professions[node];
  const second: ExpeditionGoal = profession
    ? { kind: 'profession', profession, text: `队伍包含${names[profession]}` }
    : node === 4
      ? { kind: 'variety', value: 2, text: '队伍包含两种职业' }
      : { kind: 'members', value: 2, text: '上阵不超过2人' };
  const third: ExpeditionGoal =
    node === 4
      ? { kind: 'survival', text: '无冒险者战败' }
      : {
          kind: 'health',
          value: node === 9 ? 0.5 : node < 3 ? 0.7 : 0.6,
          text: `队伍剩余生命 ≥ ${node === 9 ? 50 : node < 3 ? 70 : 60}%`,
        };
  return [{ kind: 'victory', text: '战斗胜利' }, second, third];
};
export const expeditionRecommended = (node: number) =>
  [1200, 1500, 1800, 2200, 3000, 3400, 4000, 4600, 5400, 6500][node];
export function chapterEnemy(node: number): Enemy {
  const [id, name, species] = opponents[node],
    t = ENEMY_TEMPLATES.find((e) => e.id === id)!;
  const hp = [180, 240, 330, 430, 680, 780, 930, 1120, 1380, 1800][node];
  return {
    templateId: id,
    name,
    species,
    profession: t.profession,
    hp,
    maxHp: hp,
    attack: [10, 14, 18, 23, 33, 38, 44, 51, 59, 70][node],
    defense: [3, 4, 6, 8, 12, 14, 17, 20, 24, 28][node],
    speed: [8, 9, 11, 13, 14, 11, 15, 16, 17, 15][node],
    isBoss: node === 9,
    isElite: node === 4,
    effects: [],
  };
}
export const stageReward = (node: number, first: boolean) => ({
  gold: first ? 40 + node * 10 : 10 + node * 2,
  medals: first ? 2 + Math.floor(node / 2) : 1,
});
export const EXPEDITION_STAR_REWARDS = [
  { stars: 10, gold: 80, medals: 10 },
  { stars: 20, gold: 160, medals: 20 },
  { stars: 30, gold: 300, medals: 35 },
] as const;
