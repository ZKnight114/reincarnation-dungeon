import type { Equipment, Profession } from './types';
export const CATEGORY_NAMES: Record<string, string> = {
  sword: '剑',
  spear: '枪',
  shield: '防御',
  staff: '法杖',
  focus: '法球',
  ranged: '弩',
  support: '辅助',
  accessory: '单格物品',
};
export const PROFESSION_CATEGORIES: Record<Profession, string[]> = {
  warrior: ['sword', 'spear', 'shield'],
  mage: ['staff', 'focus', 'support'],
  rogue: ['sword', 'ranged', 'support'],
};
export function equipmentFamily(i: Pick<Equipment, 'branch'>): string {
  return {
    neutral: 'accessory',
    blade: 'sword',
    pole: 'spear',
    guard: 'shield',
    flame: 'staff',
    ice: 'focus',
    ward: 'support',
    assassin: 'sword',
    archer: 'ranged',
    leather: 'support',
  }[i.branch];
}
