import catalogue from './item-catalogue.json';
import type { Equipment } from './types';
export const itemProposal = (id: string) => catalogue.items.find((i) => i.id === id)!;
export const itemStageText = (i: Equipment) => itemProposal(i.templateId).stageEffects[i.level - 1];
export const itemAdjacencyText = (i: Equipment) => itemProposal(i.templateId).adjacency.text;
export const LINK_EFFECT_NAMES = {
  damage: '直接伤害',
  shield: '技能护盾',
  heal: '技能治疗量',
  hp: '提供的生命属性',
  counter: '反击伤害',
};
export function readableEffect(text: string) {
  return text
    .replace(/%H敌/g, '%敌人最大生命')
    .replace(/%A/g, '%人物攻击')
    .replace(/%H/g, '%人物最大生命')
    .replace(/%D/g, '%人物防御')
    .replace(/\bA\b/g, '人物攻击')
    .replace(/\bH\b/g, '人物最大生命')
    .replace(/\bD\b/g, '人物防御');
}
export function adjacencyDescription(i: Equipment) {
  const rule = receivingLink(i);
  const labels: Record<string, string> = {
    blade: '剑',
    pole: '枪',
    guard: '盾',
    flame: '法杖',
    ice: '魔导书',
    ward: '法袍',
    assassin: '匕首',
    archer: '弓弩',
    leather: '皮甲',
  };
  const effects = {
    damage: '自身直接伤害',
    shield: '自身技能产生的护盾',
    heal: '自身技能恢复的生命',
    hp: '本物品提供的生命属性',
    counter: '自身反击伤害',
  };
  if (rule)
    return `每相邻1件${rule.branches.map((b) => labels[b]).join('或')}，${effects[rule.kind]}增加${Math.round(rule.amount * 100)}%，最多计算3件。同一物品接触多格只计算1次。`;
  if (i.branch === 'neutral') {
    const targets =
      i.profession === 'warrior'
        ? '剑、枪'
        : i.profession === 'mage'
          ? '法杖、魔导书'
          : '匕首、弓弩';
    const extra =
      i.level === 4 && i.profession === 'mage'
        ? '相邻法袍的护盾增加10%。'
        : i.level === 4 && i.profession === 'rogue'
          ? '相邻皮甲的治疗量增加10%。'
          : '';
    return `为相邻${targets}增加${[8, 12, 16, 20][i.level - 1]}%直接伤害。${extra}每个目标最多接受2件同职业单格物品的增幅；持续伤害、反击、典籍和共鸣不受此增幅。`;
  }
  if (i.slot === 'weapon')
    return '本物品没有专属相邻效果；相邻的同职业单格物品可增加本物品的直接伤害。';
  if (i.profession === 'mage')
    return '本物品没有专属相邻效果；相邻的四阶奥术水晶可增加本物品的技能护盾。';
  if (i.profession === 'rogue')
    return '本物品没有专属相邻效果；相邻的四阶暗影宝石可增加本物品的技能治疗量。';
  return '本物品没有专属相邻效果。';
}
export function receivingLink(i: Equipment) {
  const max = i.level === 4;
  const rules: Record<
    string,
    { branches: string[]; kind: 'damage' | 'shield' | 'heal' | 'hp' | 'counter'; amount: number }
  > = {
    warrior_blade_3: { branches: ['guard'], kind: 'damage', amount: max ? 0.12 : 0.08 },
    warrior_pole_4: { branches: ['pole'], kind: 'damage', amount: max ? 0.1 : 0.06 },
    warrior_guard_3: { branches: ['blade'], kind: 'counter', amount: max ? 0.12 : 0.08 },
    warrior_guard_4: { branches: ['guard'], kind: 'hp', amount: max ? 0.15 : 0.1 },
    mage_flame_3: { branches: ['flame'], kind: 'damage', amount: max ? 0.1 : 0.06 },
    mage_ice_3: { branches: ['ward'], kind: 'shield', amount: max ? 0.15 : 0.1 },
    mage_ward_3: { branches: ['ice'], kind: 'heal', amount: max ? 0.15 : 0.1 },
    mage_ward_4: { branches: ['flame', 'ice'], kind: 'hp', amount: max ? 0.12 : 0.08 },
    rogue_assassin_3: { branches: ['assassin'], kind: 'damage', amount: max ? 0.1 : 0.06 },
    rogue_archer_3: { branches: ['leather'], kind: 'damage', amount: max ? 0.1 : 0.06 },
    rogue_leather_3: { branches: ['assassin'], kind: 'heal', amount: max ? 0.15 : 0.1 },
    rogue_leather_4: { branches: ['assassin', 'archer'], kind: 'hp', amount: max ? 0.12 : 0.08 },
  };
  return rules[i.templateId];
}
