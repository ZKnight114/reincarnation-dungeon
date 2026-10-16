import type { Attribute, Attributes, Profession, TalentKey, Trainee } from './types';

export const ATTRIBUTE_POINTS = 12;
export const allocationLimit = (t: Trainee | null) => t?.attributePoints ?? ATTRIBUTE_POINTS;
export const ATTRIBUTE_KEYS: Attribute[] = ['attack', 'hp', 'defense', 'speed'];
export const ATTRIBUTES: Record<Attribute, { name: string; step: number; description: string }> = {
  attack: {
    name: '攻击',
    step: 2,
    description: '每点 +2 基础攻击；物品、共鸣和典籍技能读取人物最终攻击',
  },
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
export { TALENTS, TALENT_KEYS, rollTalents } from './talents';
import { TALENTS } from './talents';
export const emptyAllocation = (): Attributes => ({ attack: 0, hp: 0, defense: 0, speed: 0 });
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
      if (talent.attribute) stats[talent.attribute] += talent.value;
    }
    if (allocated)
      for (const key of ATTRIBUTE_KEYS) stats[key] += t.allocation[key] * ATTRIBUTES[key].step;
  }
  return stats;
}
