import catalogue from './progression-catalogue.json';
import { readableEffect } from './item-rules';
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
  if (i.branch === 'neutral') return 'accessory';
  return (
    {
      blade: 'sword',
      pole: 'spear',
      guard: 'shield',
      flame: 'staff',
      ice: 'focus',
      ward: 'robe',
      assassin: 'knife',
      archer: 'ranged',
      leather: 'leather',
    } as Record<string, string>
  )[i.branch];
}
// Stable keys preserve saved resonance identities; effects come from the reviewed catalogue.
export const DESIGN_RESONANCE_IDS: Record<string, string> = {
  cleave: 'warrior_heavy_1',
  warrior_mix: 'warrior_heavy_2',
  execution: 'warrior_heavy_3',
  flurry: 'warrior_flurry_1',
  second_wind: 'warrior_flurry_2',
  spear_storm: 'warrior_flurry_3',
  iron_guard: 'warrior_guard_1',
  bulwark: 'warrior_guard_2',
  fortress: 'warrior_guard_3',
  ignite: 'mage_flame_1',
  eruption: 'mage_flame_2',
  inferno: 'mage_flame_3',
  frost: 'mage_ice_1',
  mana_flow: 'mage_ice_2',
  blizzard: 'mage_ice_3',
  arcane_ward: 'mage_arcane_1',
  mage_mix: 'mage_arcane_2',
  archmage: 'mage_arcane_3',
  venom: 'rogue_poison_1',
  ambush: 'rogue_poison_2',
  toxic_master: 'rogue_poison_3',
  volley: 'rogue_volley_1',
  leech: 'rogue_volley_2',
  rain_arrows: 'rogue_volley_3',
  shadow_guard: 'rogue_shadow_1',
  rogue_mix: 'rogue_shadow_2',
  shadow_master: 'rogue_shadow_3',
  warrior_sword_base: 'warrior_sword_1',
  warrior_sword_edge: 'warrior_sword_2',
  warrior_sword_master: 'warrior_sword_3',
  warrior_spear_base: 'warrior_spear_1',
  warrior_spear_edge: 'warrior_spear_2',
  warrior_spear_master: 'warrior_spear_3',
  warrior_shield_base: 'warrior_shield_1',
  warrior_shield_edge: 'warrior_shield_2',
  warrior_shield_master: 'warrior_shield_3',
  mage_staff_base: 'mage_staff_1',
  mage_staff_edge: 'mage_staff_2',
  mage_staff_master: 'mage_staff_3',
  mage_focus_base: 'mage_book_1',
  mage_focus_edge: 'mage_book_2',
  mage_focus_master: 'mage_book_3',
  mage_robe_base: 'mage_robe_1',
  mage_robe_edge: 'mage_robe_2',
  mage_robe_master: 'mage_robe_3',
  rogue_knife_base: 'rogue_knife_1',
  rogue_knife_edge: 'rogue_knife_2',
  rogue_knife_master: 'rogue_knife_3',
  rogue_ranged_base: 'rogue_ranged_1',
  rogue_ranged_edge: 'rogue_ranged_2',
  rogue_ranged_master: 'rogue_ranged_3',
  rogue_leather_base: 'rogue_leather_1',
  rogue_leather_edge: 'rogue_leather_2',
  rogue_leather_master: 'rogue_leather_3',
};
const proposals = catalogue.resonances;
for (const r of proposals) {
  const key = Object.entries(DESIGN_RESONANCE_IDS).find(
    ([, id]) => id === r.id,
  )![0] as ResonanceKey;
  const profession = ({ 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue' } as const)[
    r.profession as '战士' | '法师' | '盗贼'
  ];
  const base = Object.entries(DESIGN_RESONANCE_IDS).find(([, id]) => id === r.requires[0])?.[0] as
    ResonanceKey | undefined;
  const family =
    r.kind === '物品'
      ? (
          {
            剑: 'sword',
            枪: 'spear',
            盾: 'shield',
            法杖: 'staff',
            魔导书: 'focus',
            法袍: 'robe',
            匕首: 'knife',
            弓弩: 'ranged',
            皮甲: 'leather',
          } as Record<string, string>
        )[r.series]
      : undefined;
  add(
    key,
    profession,
    r.name,
    'spark',
    r.series,
    r.rank as 1 | 2 | 3,
    base ? [base] : [],
    [],
    r.effects.map(readableEffect) as [string, string, string],
    family,
  );
}
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
