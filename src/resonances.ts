import { definition } from './backpack';
import type { Branch, Equipment, Profession, ResonanceKey } from './types';
export interface Resonance {
  profession: Profession;
  name: string;
  icon: string;
  kind: 'profession' | 'item';
  series: string;
  rank: 1 | 2 | 3;
  requires: ResonanceKey[];
  branches: Branch[];
  description: string;
  effects: [string, string, string];
  matches: (i: Equipment) => boolean;
}
export const RESONANCES = {} as Record<ResonanceKey, Resonance>;
function add(
  key: ResonanceKey,
  profession: Profession,
  name: string,
  icon: string,
  series: string,
  rank: 1 | 2 | 3,
  requires: ResonanceKey[],
  branches: Branch[],
  effects: [string, string, string],
  family?: string,
) {
  RESONANCES[key] = {
    profession,
    name,
    icon,
    series,
    rank,
    requires,
    branches,
    effects,
    kind: family ? 'item' : 'profession',
    description: effects.join(' / '),
    matches: (i) => i.profession === profession && (!family || equipmentFamily(i) === family),
  };
}
export function equipmentFamily(i: Equipment) {
  const d = definition(i);
  if (i.branch === 'neutral') return 'accessory';
  if (i.profession === 'warrior')
    return i.branch === 'pole' ? 'spear' : i.branch === 'blade' ? 'sword' : 'shield';
  if (i.profession === 'mage')
    return i.branch === 'flame' ? 'staff' : i.branch === 'ice' ? 'focus' : 'robe';
  return i.branch === 'assassin' ? 'knife' : i.branch === 'archer' ? 'ranged' : 'leather';
}
add(
  'cleave',
  'warrior',
  '裂地重击',
  'hammer',
  '重击',
  1,
  [],
  ['blade'],
  ['剑每3次命中追加25%伤害', '追加50%伤害', '追加80%伤害，并溅射'],
);
add(
  'warrior_mix',
  'warrior',
  '武艺贯通',
  'spark',
  '重击',
  2,
  ['cleave'],
  ['blade'],
  ['武器伤害+10%', '武器伤害+20%', '武器伤害+35%'],
);
add(
  'execution',
  'warrior',
  '王庭裁决',
  'sword',
  '重击',
  3,
  ['cleave'],
  ['blade'],
  ['剑每3次命中再追加25%伤害', '再追加40%伤害', '再追加60%伤害'],
);
add(
  'flurry',
  'warrior',
  '枪阵连击',
  'sword',
  '连击',
  1,
  [],
  ['pole'],
  ['长枪每3次命中追加25%伤害', '追加50%伤害', '追加80%伤害'],
);
add(
  'second_wind',
  'warrior',
  '战意回生',
  'heart',
  '连击',
  2,
  ['flurry'],
  ['pole'],
  ['长枪命中恢复实际伤害2%生命', '恢复4%生命', '恢复6%生命'],
);
add(
  'spear_storm',
  'warrior',
  '万枪破阵',
  'sword',
  '连击',
  3,
  ['flurry'],
  ['pole'],
  ['长枪每3次命中返还1耐力并追击20%', '返还2耐力并追击35%', '返还3耐力并追击50%，溅射'],
);
add(
  'iron_guard',
  'warrior',
  '铁壁反击',
  'shield',
  '守势',
  1,
  [],
  ['guard'],
  ['剑命中生盾2；受击反击20%承伤，每回合1次', '生盾4；反击40%', '生盾6；反击70%'],
);
add(
  'bulwark',
  'warrior',
  '坚城守护',
  'shield',
  '守势',
  2,
  ['iron_guard'],
  ['guard'],
  ['盾牌护盾+25%', '盾牌护盾+50%', '盾牌护盾+80%'],
);
add(
  'fortress',
  'warrior',
  '不落壁垒',
  'shield',
  '守势',
  3,
  ['iron_guard'],
  ['guard'],
  ['首次破盾恢复10护盾；反击额外增强10%', '恢复20护盾；增强20%', '恢复30护盾；增强35%'],
);
add(
  'ignite',
  'mage',
  '焰息灼烧',
  'spark',
  '火焰',
  1,
  [],
  ['flame'],
  ['火焰命中附加10%灼烧，持续3行动', '附加18%灼烧', '附加28%灼烧'],
);
add(
  'eruption',
  'mage',
  '陨火爆裂',
  'hammer',
  '火焰',
  2,
  ['ignite'],
  ['flame'],
  ['火焰每3次命中追加25%伤害', '追加50%伤害', '追加80%伤害并溅射'],
);
add(
  'inferno',
  'mage',
  '燎原天火',
  'spark',
  '火焰',
  3,
  ['ignite'],
  ['flame'],
  ['攻击灼烧目标伤害+12%', '伤害+24%', '伤害+40%'],
);
add(
  'frost',
  'mage',
  '霜寒凝滞',
  'gem',
  '冰霜',
  1,
  [],
  ['ice'],
  ['冰霜命中使敌人减速10%，持续3行动', '减速20%', '减速30%'],
);
add(
  'mana_flow',
  'mage',
  '寒流回魔',
  'gem',
  '冰霜',
  2,
  ['frost'],
  ['ice'],
  ['冰霜命中返还1法力', '返还2法力', '返还3法力'],
);
add(
  'blizzard',
  'mage',
  '极寒风暴',
  'gem',
  '冰霜',
  3,
  ['frost'],
  ['ice'],
  ['攻击减速目标伤害+12%', '伤害+24%', '伤害+40%'],
);
add(
  'arcane_ward',
  'mage',
  '奥术屏障',
  'shield',
  '奥术',
  1,
  [],
  ['ward'],
  ['法袍护盾+25%', '法袍护盾+50%', '法袍护盾+80%'],
);
add(
  'mage_mix',
  'mage',
  '冰火交织',
  'spark',
  '奥术',
  2,
  ['arcane_ward'],
  ['ward'],
  ['法术攻击灼烧目标追加12%伤害', '追加24%伤害', '追加40%伤害'],
);
add(
  'archmage',
  'mage',
  '星界回响',
  'spark',
  '奥术',
  3,
  ['arcane_ward'],
  ['ward'],
  ['累计3次施法返还1法力并生盾4', '返还2法力并生盾8', '返还3法力并生盾12'],
);
add(
  'venom',
  'rogue',
  '淬毒刀刃',
  'soul',
  '毒刃',
  1,
  [],
  ['assassin'],
  ['刀刃命中附加10%毒伤，持续3行动', '附加18%毒伤', '附加28%毒伤'],
);
add(
  'ambush',
  'rogue',
  '伏击要害',
  'sword',
  '毒刃',
  2,
  ['venom'],
  ['assassin'],
  ['刀刃每3次命中追加25%伤害', '追加50%伤害', '追加80%伤害'],
);
add(
  'toxic_master',
  'rogue',
  '蚀骨毒雾',
  'soul',
  '毒刃',
  3,
  ['venom'],
  ['assassin'],
  ['攻击中毒目标伤害+15%', '伤害+30%', '伤害+50%'],
);
add(
  'volley',
  'rogue',
  '穿透连射',
  'sword',
  '连射',
  1,
  [],
  ['archer'],
  ['弓弩每3次命中追加25%伤害', '追加50%伤害', '追加80%伤害并溅射'],
);
add(
  'leech',
  'rogue',
  '猎手汲取',
  'heart',
  '连射',
  2,
  ['volley'],
  ['archer'],
  ['弓弩命中恢复实际伤害3%生命', '恢复6%生命', '恢复10%生命'],
);
add(
  'rain_arrows',
  'rogue',
  '箭雨追猎',
  'sword',
  '连射',
  3,
  ['volley'],
  ['archer'],
  ['弓弩每3次命中再追加20%伤害', '再追加35%伤害', '再追加50%伤害并溅射'],
);
add(
  'shadow_guard',
  'rogue',
  '暗影庇护',
  'shield',
  '暗影',
  1,
  [],
  ['leather'],
  ['皮甲护盾+25%', '皮甲护盾+50%', '皮甲护盾+80%'],
);
add(
  'rogue_mix',
  'rogue',
  '远近协同',
  'spark',
  '暗影',
  2,
  ['shadow_guard'],
  ['leather'],
  ['武器忽略敌人15%防御', '忽略30%防御', '忽略45%防御'],
);
add(
  'shadow_master',
  'rogue',
  '夜幕潜行',
  'shield',
  '暗影',
  3,
  ['shadow_guard'],
  ['leather'],
  ['受到伤害降低8%', '受到伤害降低15%', '受到伤害降低22%'],
);
add(
  'warrior_sword_base',
  'warrior',
  '剑共鸣',
  'sword',
  '剑',
  1,
  [],
  ['blade'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'sword',
);
add(
  'warrior_sword_edge',
  'warrior',
  '剑协律',
  'sword',
  '剑',
  2,
  ['warrior_sword_base'],
  ['blade'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'sword',
);
add(
  'warrior_sword_master',
  'warrior',
  '剑极意',
  'sword',
  '剑',
  3,
  ['warrior_sword_base'],
  ['blade'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'sword',
);
add(
  'warrior_spear_base',
  'warrior',
  '枪共鸣',
  'sword',
  '枪',
  1,
  [],
  ['pole'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'spear',
);
add(
  'warrior_spear_edge',
  'warrior',
  '枪协律',
  'sword',
  '枪',
  2,
  ['warrior_spear_base'],
  ['pole'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'spear',
);
add(
  'warrior_spear_master',
  'warrior',
  '枪极意',
  'sword',
  '枪',
  3,
  ['warrior_spear_base'],
  ['pole'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'spear',
);
add(
  'warrior_shield_base',
  'warrior',
  '盾牌共鸣',
  'shield',
  '盾牌',
  1,
  [],
  ['guard'],
  ['护盾生成量+15%', '护盾生成量+30%', '护盾生成量+50%'],
  'shield',
);
add(
  'warrior_shield_edge',
  'warrior',
  '盾牌协律',
  'shield',
  '盾牌',
  2,
  ['warrior_shield_base'],
  ['guard'],
  ['功能装备每回合首次发动返还1资源', '返还2资源', '返还3资源'],
  'shield',
);
add(
  'warrior_shield_master',
  'warrior',
  '盾牌极意',
  'shield',
  '盾牌',
  3,
  ['warrior_shield_base'],
  ['guard'],
  ['破盾后恢复2%生命，每场最多1次', '恢复3%生命，最多2次', '恢复4%生命，最多3次'],
  'shield',
);
add(
  'mage_staff_base',
  'mage',
  '法杖共鸣',
  'sword',
  '法杖',
  1,
  [],
  ['flame'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'staff',
);
add(
  'mage_staff_edge',
  'mage',
  '法杖协律',
  'sword',
  '法杖',
  2,
  ['mage_staff_base'],
  ['flame'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'staff',
);
add(
  'mage_staff_master',
  'mage',
  '法杖极意',
  'sword',
  '法杖',
  3,
  ['mage_staff_base'],
  ['flame'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'staff',
);
add(
  'mage_focus_base',
  'mage',
  '魔导书共鸣',
  'sword',
  '魔导书',
  1,
  [],
  ['ice'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'focus',
);
add(
  'mage_focus_edge',
  'mage',
  '魔导书协律',
  'sword',
  '魔导书',
  2,
  ['mage_focus_base'],
  ['ice'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'focus',
);
add(
  'mage_focus_master',
  'mage',
  '魔导书极意',
  'sword',
  '魔导书',
  3,
  ['mage_focus_base'],
  ['ice'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'focus',
);
add(
  'mage_robe_base',
  'mage',
  '法袍共鸣',
  'shield',
  '法袍',
  1,
  [],
  ['ward'],
  ['护盾生成量+15%', '护盾生成量+30%', '护盾生成量+50%'],
  'robe',
);
add(
  'mage_robe_edge',
  'mage',
  '法袍协律',
  'shield',
  '法袍',
  2,
  ['mage_robe_base'],
  ['ward'],
  ['功能装备每回合首次发动返还1资源', '返还2资源', '返还3资源'],
  'robe',
);
add(
  'mage_robe_master',
  'mage',
  '法袍极意',
  'shield',
  '法袍',
  3,
  ['mage_robe_base'],
  ['ward'],
  ['破盾后恢复2%生命，每场最多1次', '恢复3%生命，最多2次', '恢复4%生命，最多3次'],
  'robe',
);
add(
  'rogue_knife_base',
  'rogue',
  '刀刃共鸣',
  'sword',
  '刀刃',
  1,
  [],
  ['assassin'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'knife',
);
add(
  'rogue_knife_edge',
  'rogue',
  '刀刃协律',
  'sword',
  '刀刃',
  2,
  ['rogue_knife_base'],
  ['assassin'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'knife',
);
add(
  'rogue_knife_master',
  'rogue',
  '刀刃极意',
  'sword',
  '刀刃',
  3,
  ['rogue_knife_base'],
  ['assassin'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'knife',
);
add(
  'rogue_ranged_base',
  'rogue',
  '弓弩共鸣',
  'sword',
  '弓弩',
  1,
  [],
  ['archer'],
  ['对应武器伤害+8%', '对应武器伤害+15%', '对应武器伤害+25%'],
  'ranged',
);
add(
  'rogue_ranged_edge',
  'rogue',
  '弓弩协律',
  'sword',
  '弓弩',
  2,
  ['rogue_ranged_base'],
  ['archer'],
  ['对应武器每3次命中追击20%伤害', '追击35%伤害', '追击55%伤害'],
  'ranged',
);
add(
  'rogue_ranged_master',
  'rogue',
  '弓弩极意',
  'sword',
  '弓弩',
  3,
  ['rogue_ranged_base'],
  ['archer'],
  ['对应武器忽略10%防御', '忽略20%防御', '忽略30%防御'],
  'ranged',
);
add(
  'rogue_leather_base',
  'rogue',
  '皮甲共鸣',
  'shield',
  '皮甲',
  1,
  [],
  ['leather'],
  ['护盾生成量+15%', '护盾生成量+30%', '护盾生成量+50%'],
  'leather',
);
add(
  'rogue_leather_edge',
  'rogue',
  '皮甲协律',
  'shield',
  '皮甲',
  2,
  ['rogue_leather_base'],
  ['leather'],
  ['功能装备每回合首次发动返还1资源', '返还2资源', '返还3资源'],
  'leather',
);
add(
  'rogue_leather_master',
  'rogue',
  '皮甲极意',
  'shield',
  '皮甲',
  3,
  ['rogue_leather_base'],
  ['leather'],
  ['破盾后恢复2%生命，每场最多1次', '恢复3%生命，最多2次', '恢复4%生命，最多3次'],
  'leather',
);
export const RESONANCE_KEYS = Object.keys(RESONANCES) as ResonanceKey[];
export const resonanceMatch = (key: ResonanceKey, item: Equipment) => RESONANCES[key].matches(item);
export function resonanceAvailable(
  key: ResonanceKey,
  profession: Profession,
  chosen: ResonanceKey[],
  initial = false,
) {
  const d = RESONANCES[key];
  return (
    d.profession === profession &&
    !chosen.includes(key) &&
    (!initial || d.rank === 1) &&
    (!d.requires.length || d.requires.some((k) => chosen.includes(k)))
  );
}
export function validResonanceOrder(keys: ResonanceKey[], profession: Profession) {
  return keys.every(
    (k, n) => !!RESONANCES[k] && resonanceAvailable(k, profession, keys.slice(0, n), n === 0),
  );
}
export function itemResonanceTiers(item: Equipment, tiers: Record<ResonanceKey, number>) {
  const result = { basic: 0, advanced: 0, master: 0 };
  for (const k of RESONANCE_KEYS) {
    const d = RESONANCES[k];
    if (d.kind === 'item' && d.matches(item)) {
      result[d.rank === 1 ? 'basic' : d.rank === 2 ? 'advanced' : 'master'] = Math.max(
        result[d.rank === 1 ? 'basic' : d.rank === 2 ? 'advanced' : 'master'],
        tiers[k] ?? 0,
      );
    }
  }
  return result;
}
