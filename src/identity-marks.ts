import type { Profession } from './types';

/** Short, legible identity marks for HUDs and item corners. */
export const PROFESSION_MARKS: Record<Profession, { name: string; letter: string }> = {
  warrior: { name: '战士', letter: '战' },
  mage: { name: '法师', letter: '法' },
  rogue: { name: '刺客', letter: '刺' },
};
export const CATEGORY_MARKS: Record<string, string> = {
  sword: '剑',
  spear: '枪',
  shield: '防',
  staff: '杖',
  focus: '球',
  ranged: '弩',
  support: '辅',
};
