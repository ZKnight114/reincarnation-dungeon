import type { Attribute, TalentKey } from './types';
export const LEGACY_TALENTS: Record<
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
