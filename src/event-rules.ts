/** Reviewed v16 event rules. Rolls are stored on the run before any presentation. */
export const SUPPLY_SECONDS = 0.8;
export const WHEEL_SECONDS = 3.6;
export const SPRING_HEAL = 0.35;
export const SPRING_MAX_LIFE = 0.06;
export const SUPPLY_GRADES = [
  { low: [1, 1, 1], normal: [1, 1, 1], great: [1, 1, 2] },
  { low: [1, 1, 1], normal: [1, 1, 2], great: [1, 2, 2] },
  { low: [1, 1, 2], normal: [1, 2, 2], great: [2, 2, 3] },
] as const;
export type SupplyResult = 'low' | 'normal' | 'great';
export const supplyThreshold = (chapter: number, stages: number) => {
  const stage = Math.min(2, Math.max(0, stages));
  return [500, 1400, 2400][stage] + [70, 140, 210][stage] * (chapter - 1);
};
export const supplyChance = (power: number, threshold: number) =>
  power < threshold ? 0 : power < threshold * 1.5 ? 0.3 : 0.45;
export const WHEEL_SECTORS = [
  { attribute: 'hp', label: '最大生命', value: 0.1, icon: 'hp' },
  { attribute: 'attack', label: '攻击', value: 0.15, icon: 'attack' },
  { attribute: 'defense', label: '防御', value: 0.15, icon: 'defense' },
  { attribute: 'hp', label: '最大生命', value: 0.15, icon: 'hp' },
  { attribute: 'attack', label: '攻击', value: 0.1, icon: 'attack' },
  { attribute: 'defense', label: '防御', value: 0.1, icon: 'defense' },
] as const;
export const CHANCE_STORIES = [
  '古代命运盘在遗迹中苏醒。献出一缕生命，便能换取一次力量赐福。',
  '鲜血祭坛回应了勇者的脚步。它索取生命，也许诺更强的体魄与力量。',
  '流浪占卜师展开符文盘，提出以鲜血交换一次祝福。',
  '沉睡的石碑亮起六道符文，等待生命的献祭。',
  '古井深处浮起一枚命运之轮。生命可以唤醒它留下的祝福。',
];
export const chanceName = (variant: number) =>
  ['命运轮盘', '鲜血祭坛', '占卜馈赠', '符文石碑', '古井祝福'][variant % 5];
export const lifeAmount = (amount: number) =>
  amount > 0 && amount < 0.01
    ? '不足0.01'
    : amount > 0 && amount < 1
      ? amount.toFixed(2)
      : String(Math.round(amount));
export const enemyAttackMultiplier = (chapter: number, boss: boolean) =>
  chapter <= 3 ? 1.05 : chapter <= 6 ? (boss ? 1.5 : 1.35) : boss ? 1.75 : 1.8;
