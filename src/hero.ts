import type { Attribute, Attributes, Profession, TalentKey, Trainee } from './types';

export const ATTRIBUTE_POINTS = 12;
export const ATTRIBUTE_KEYS: Attribute[] = ['attack', 'hp', 'defense', 'speed'];
export const ATTRIBUTES: Record<Attribute, { name: string; step: number; description: string }> = {
  attack: { name: '攻击', step: 2, description: '每点 +2 攻击，按比例提高所有武器伤害' },
  hp: { name: '生命', step: 8, description: '每点 +8 基础生命上限' },
  defense: { name: '防御', step: 1, description: '每点 +1 基础防御，减少受到的伤害' },
  speed: {
    name: '速度',
    step: 1,
    description: '每点 +1 速度，每回合速度较高者先行动；同速勇者先手',
  },
};
export const BASE_ATTRIBUTES: Record<Profession, Attributes> = {
  warrior: { attack: 30, hp: 190, defense: 3, speed: 10 },
  mage: { attack: 30, hp: 150, defense: 0, speed: 9 },
  rogue: { attack: 28, hp: 165, defense: 1, speed: 12 },
};
export const TALENTS: Record<
  TalentKey,
  { name: string; attribute: Attribute; value: number; description: string }
> = {
  born_fighter: { name: '天生斗士', attribute: 'attack', value: 3, description: '基础攻击 +3' },
  keen_focus: { name: '专注之心', attribute: 'attack', value: 2, description: '基础攻击 +2' },
  battle_instinct: { name: '战斗直觉', attribute: 'attack', value: 4, description: '基础攻击 +4' },
  hardy: { name: '坚韧体魄', attribute: 'hp', value: 16, description: '基础生命 +16' },
  enduring: { name: '不屈意志', attribute: 'hp', value: 12, description: '基础生命 +12' },
  robust: { name: '旺盛生机', attribute: 'hp', value: 20, description: '基础生命 +20' },
  iron_skin: { name: '钢铁之肤', attribute: 'defense', value: 2, description: '基础防御 +2' },
  steady_guard: { name: '稳健防守', attribute: 'defense', value: 1, description: '基础防御 +1' },
  tough_hide: { name: '坚实骨骼', attribute: 'defense', value: 3, description: '基础防御 +3' },
  swift: { name: '迅捷反应', attribute: 'speed', value: 2, description: '基础速度 +2' },
  alert: { name: '敏锐警觉', attribute: 'speed', value: 1, description: '基础速度 +1' },
  light_step: { name: '轻盈步伐', attribute: 'speed', value: 3, description: '基础速度 +3' },
};
export const TALENT_KEYS = Object.keys(TALENTS) as TalentKey[];
export const emptyAllocation = (): Attributes => ({ attack: 0, hp: 0, defense: 0, speed: 0 });
export function rollTalents(random: () => number): TalentKey[] {
  return ATTRIBUTE_KEYS.map((attribute) => {
    const pool = TALENT_KEYS.filter((k) => TALENTS[k].attribute === attribute);
    return pool[Math.floor(random() * pool.length)];
  });
}
export function pointsSpent(t: Trainee) {
  return ATTRIBUTE_KEYS.reduce((n, k) => n + t.allocation[k], 0);
}
export function heroAttributes(
  t: Trainee | null,
  profession: Profession,
  allocated = true,
): Attributes {
  const stats = { ...BASE_ATTRIBUTES[profession] };
  if (t) {
    for (const key of t.talents) {
      const talent = TALENTS[key];
      stats[talent.attribute] += talent.value;
    }
    if (allocated)
      for (const key of ATTRIBUTE_KEYS) stats[key] += t.allocation[key] * ATTRIBUTES[key].step;
  }
  return stats;
}
