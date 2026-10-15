import { weaponEffect, shieldMultiplier } from './combat-effects';
import { CATALOGUE } from './catalogue';
import { RESONANCES, RESONANCE_KEYS, itemResonanceTiers } from './resonances';
import type {
  Branch,
  BuffKey,
  Equipment,
  GameState,
  Placement,
  Profession,
  ResonanceKey,
  Shape,
} from './types';
import { BASE_ATTRIBUTES, heroAttributes } from './hero';
export const PACK_COLS = 7,
  PACK_ROWS = 6,
  LEVEL_POWER = [0, 1, 1.5, 2.1, 2.8, 3.6];
export const PROFESSIONS: Record<
  Profession,
  {
    name: string;
    color: string;
    description: string;
    trait: string;
    hp: number;
    defense: number;
    growth: { attack: number; hp: number; defense: number };
    starter: string[][];
  }
> = {
  warrior: {
    name: '战士',
    color: '#c4aa77',
    description: '剑重击与长枪连击，盾牌守护。近战武器消耗耐力，可混合两条攻击路线。',
    trait: '剑 / 长枪 / 盾牌',
    hp: 190,
    defense: 3,
    growth: { attack: 0.1, hp: 24, defense: 2 },
    starter: [
      ['warrior_blade_2', 'warrior_pole_2', 'warrior_gem'],
      ['warrior_blade_3', 'warrior_guard_2', 'warrior_guard_3'],
    ],
  },
  mage: {
    name: '法师',
    color: '#9dafe0',
    description: '火焰爆发与冰霜控制，法袍和魔力辅助。法术消耗法力，选择共鸣解锁灼烧、减速等效果。',
    trait: '法杖 / 魔导书 / 法袍',
    hp: 150,
    defense: 0,
    growth: { attack: 0.12, hp: 18, defense: 1 },
    starter: [
      ['mage_flame_2', 'mage_ice_2', 'mage_gem'],
      ['mage_flame_3', 'mage_ward_2', 'mage_ward_3'],
    ],
  },
  rogue: {
    name: '盗贼',
    color: '#96b994',
    description: '匕首近战与弓弩远程，皮甲辅助。两条攻击路线消耗耐力，毒刃和连射依赖对应共鸣。',
    trait: '匕首 / 弓弩 / 皮甲',
    hp: 165,
    defense: 1,
    growth: { attack: 0.11, hp: 20, defense: 1.5 },
    starter: [
      ['rogue_assassin_2', 'rogue_archer_2', 'rogue_gem'],
      ['rogue_assassin_3', 'rogue_leather_2', 'rogue_leather_3'],
    ],
  },
};
export const PROFESSION_KEYS = Object.keys(PROFESSIONS) as Profession[];
export const BRANCHES: Record<Branch, { name: string; color: string }> = {
  neutral: { name: '无分支', color: '#c9c4b0' },
  blade: { name: '剑', color: '#d6b47e' },
  pole: { name: '长枪', color: '#b9c8ce' },
  guard: { name: '盾牌', color: '#b0a586' },
  flame: { name: '火焰', color: '#e4a17a' },
  ice: { name: '冰霜', color: '#9dcfe0' },
  ward: { name: '法袍', color: '#b0a1d3' },
  assassin: { name: '刀刃', color: '#c29eae' },
  archer: { name: '弓弩', color: '#a5bf86' },
  leather: { name: '皮甲', color: '#bfa985' },
};
export const BUFFS: Record<BuffKey, { name: string; description: string }> = {
  power: { name: '力量', description: '武器伤害 +12%' },
  tempo: { name: '敏捷', description: '基础速度 +2' },
  vitality: { name: '体魄', description: '生命上限 +12%（不恢复当前生命）' },
  defense: { name: '护甲', description: '防御 +3' },
};
export const BUFF_KEYS = Object.keys(BUFFS) as BuffKey[];
export const SHAPES: Record<Shape, readonly (readonly [number, number])[]> = {
  dot: [[0, 0]],
  domino: [
    [0, 0],
    [0, 1],
  ],
  I3: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  L3: [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  L4: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  O4: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  I4: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  Z5: [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 2],
  ],
};
export const SHAPE_NAMES: Record<Shape, string> = {
  dot: '1 格',
  domino: '2 格直形',
  I3: '3 格一形',
  L3: '3 格 L 形',
  L4: '4 格 L 形',
  O4: '4 格方形',
  I4: '4 格直形',
  Z5: '5 格 Z 形',
};
export type PackRole = 'weapon' | 'shield' | 'heal' | 'stamina' | 'mana' | 'support';
export interface PackItemDefinition {
  id: string;
  profession: Profession;
  branch: Branch;
  name: string;
  art: string;
  slot: Equipment['slot'];
  shape: Shape;
  role: PackRole;
  cooldown: number;
  cost: number;
  resource: 'stamina' | 'mana' | null;
  attack: number;
  hp: number;
  defense: number;
  description: string;
  damageType: Equipment['damageType'];
  style: 'melee' | 'ranged' | 'spell' | null;
  available: boolean;
}
type Series = {
  branch: Branch;
  names: string[];
  arts: string[];
  style: 'melee' | 'ranged' | 'spell';
  attack: number[];
  cooldown: number[];
  cost: number[];
};
const series: Record<Profession, Series[]> = {
  warrior: [
    {
      branch: 'blade',
      names: ['铁剑', '裂石战斧', '骑士大剑', '王庭巨剑'],
      arts: ['sword', 'axe', 'greatsword', 'greatsword'],
      style: 'melee',
      attack: [21, 32, 46, 65],
      cooldown: [2, 2, 3, 4],
      cost: [3, 4, 5, 6],
    },
    {
      branch: 'pole',
      names: ['短矛', '贯穿长枪', '军团战戟', '龙牙战枪'],
      arts: ['spear', 'spear', 'spear', 'spear'],
      style: 'melee',
      attack: [16, 25, 37, 53],
      cooldown: [1, 2, 2, 3],
      cost: [2, 3, 4, 5],
    },
  ],
  mage: [
    {
      branch: 'flame',
      names: ['火花短杖', '焰息法杖', '烈焰长杖', '陨火权杖'],
      arts: ['staff', 'staff', 'staff', 'staff'],
      style: 'spell',
      attack: [25, 38, 52, 74],
      cooldown: [2, 2, 3, 4],
      cost: [3, 4, 5, 6],
    },
    {
      branch: 'ice',
      names: ['霜晶法器', '寒冰宝珠', '极霜法典', '凛冬秘典'],
      arts: ['orb', 'orb', 'tome', 'tome'],
      style: 'spell',
      attack: [19, 29, 42, 58],
      cooldown: [1, 2, 2, 3],
      cost: [2, 3, 4, 5],
    },
  ],
  rogue: [
    {
      branch: 'assassin',
      names: ['刺客匕首', '双刃短刀', '影牙军刀', '夜幕双刃'],
      arts: ['dagger', 'dagger', 'sword', 'dagger'],
      style: 'melee',
      attack: [18, 28, 41, 57],
      cooldown: [1, 2, 2, 3],
      cost: [2, 3, 4, 5],
    },
    {
      branch: 'archer',
      names: ['轻弩', '猎手长弓', '游侠重弩', '月影巨弓'],
      arts: ['crossbow', 'bow', 'crossbow', 'bow'],
      style: 'ranged',
      attack: [22, 34, 48, 68],
      cooldown: [2, 2, 3, 4],
      cost: [3, 4, 5, 6],
    },
  ],
};
export const PACK_ITEMS: PackItemDefinition[] = [];
for (const profession of PROFESSION_KEYS) {
  const gem = { warrior: '勇气徽章', mage: '奥术核心', rogue: '暗影宝石' }[profession];
  PACK_ITEMS.push({
    id: `${profession}_gem`,
    profession,
    branch: 'neutral',
    name: gem,
    art: profession === 'warrior' ? 'rune' : 'crystal',
    slot: 'accessory',
    shape: 'dot',
    role: 'support',
    cooldown: 0,
    cost: 0,
    resource: null,
    attack: 0,
    hp: 0,
    defense: 0,
    description:
      '相邻武器伤害 +10% × 等级倍率；耐力与法力每回合额外恢复 0.5 × 等级倍率；提供本职业流派共鸣贡献。',
    damageType: 'magic',
    style: null,
    available: true,
  });
  for (const line of series[profession])
    for (let n = 0; n < 4; n++) {
      const size = n + 2,
        shape: Shape =
          size === 2
            ? 'domino'
            : size === 3
              ? line === series[profession][0]
                ? 'L3'
                : 'I3'
              : size === 4
                ? line === series[profession][0]
                  ? 'L4'
                  : 'O4'
                : 'Z5',
        resource = profession === 'mage' ? 'mana' : 'stamina';
      PACK_ITEMS.push({
        id: `${profession}_${line.branch}_${size}`,
        profession,
        branch: line.branch,
        name: line.names[n],
        art: line.arts[n],
        slot: 'weapon',
        shape,
        role: 'weapon',
        cooldown: line.cooldown[n],
        cost: line.cost[n],
        resource,
        attack: line.attack[n],
        hp: 0,
        defense: 0,
        description: `每 ${line.cooldown[n]} 回合${line.style === 'melee' ? '近战' : line.style === 'ranged' ? '远程' : '施法'}攻击，消耗 ${line.cost[n]} ${resource === 'mana' ? '法力' : '耐力'}。特殊效果需选择共鸣。`,
        damageType: profession === 'mage' ? 'magic' : 'physical',
        style: line.style,
        available: size < 5,
      });
    }
  const branch: Branch = { warrior: 'guard', mage: 'ward', rogue: 'leather' }[profession] as Branch,
    names = {
      warrior: ['圆盾', '行军护具', '重骑板甲', '王庭重铠'],
      mage: ['护身法袍', '回魔法袍', '星纹长袍', '大法师礼袍'],
      rogue: ['轻皮甲', '游猎皮甲', '暗影皮甲', '夜行披甲'],
    }[profession];
  for (let n = 0; n < 4; n++) {
    const size = n + 2,
      role: PackRole =
        n === 1
          ? profession === 'mage'
            ? 'mana'
            : profession === 'warrior'
              ? 'stamina'
              : 'heal'
          : 'shield';
    PACK_ITEMS.push({
      id: `${profession}_${branch}_${size}`,
      profession,
      branch,
      name: names[n],
      art:
        profession === 'warrior' && n === 0 ? 'shield' : profession === 'mage' ? 'robe' : 'armor',
      slot: 'armor',
      shape: size === 2 ? 'domino' : size === 3 ? 'L3' : size === 4 ? 'O4' : 'Z5',
      role,
      cooldown: 2,
      cost: 0,
      resource: null,
      attack: 0,
      hp: [15, 20, 35, 50][n],
      defense: [2, 2, 4, 6][n],
      description:
        role === 'shield'
          ? '每 2 回合产生护盾；提供生命与防御。'
          : role === 'mana'
            ? '每 2 回合恢复法力，无需相邻。'
            : role === 'stamina'
              ? '每 2 回合恢复耐力。'
              : '每场战斗最多治疗两次，满血时保留次数。',
      damageType: 'magic',
      style: null,
      available: size < 5,
    });
  }
}
// Names and occupied cells come from the approved pixel catalogue. Five-cell entries stay reserved.
for (const d of PACK_ITEMS) {
  const c = CATALOGUE[d.id as keyof typeof CATALOGUE];
  if (!c) continue;
  d.name = c.name;
  if (d.profession === 'warrior')
    d.art = d.branch === 'guard' ? 'shield' : d.branch === 'blade' ? 'sword' : d.art;
  if (d.profession === 'mage' && d.branch === 'ice') d.art = 'tome';
  if (d.branch === 'assassin') d.art = 'dagger';
  const w = Math.max(...c.cells.map((p) => p[0])) + 1,
    h = Math.max(...c.cells.map((p) => p[1])) + 1;
  d.shape =
    c.cells.length === 1
      ? 'dot'
      : c.cells.length === 2
        ? 'domino'
        : c.cells.length === 3
          ? w === 1 || h === 1
            ? 'I3'
            : 'L3'
          : w === 1 || h === 1
            ? 'I4'
            : w === 2 && h === 2
              ? 'O4'
              : 'L4';
}
export function spriteName(item: Pick<Equipment, 'templateId'>) {
  return CATALOGUE[item.templateId as keyof typeof CATALOGUE]?.sprite;
}
const BAG_ORDER: [number, number][] = [
  ...Array.from({ length: 15 }, (_, n) => [1 + (n % 5), 1 + Math.floor(n / 5)] as [number, number]),
  ...Array.from({ length: 5 }, (_, x) => [x + 1, 4] as [number, number]),
  ...Array.from({ length: 5 }, (_, x) => [x + 1, 0] as [number, number]),
  ...Array.from({ length: 5 }, (_, y) => [0, y] as [number, number]),
  ...Array.from({ length: 5 }, (_, y) => [6, y] as [number, number]),
  ...Array.from({ length: 7 }, (_, x) => [x, 5] as [number, number]),
];
export const bagCapacity = (kills: number) => Math.min(42, 15 + kills * 2);
export const bagCells = (capacity = 42) =>
  new Set(BAG_ORDER.slice(0, capacity).map((p) => p.join(',')));
export const openBagCells = (kills: number) => bagCells(bagCapacity(kills));
export const availableItems = (profession: Profession) =>
  PACK_ITEMS.filter((d) => d.profession === profession && d.available);
export function definition(item: Pick<Equipment, 'templateId'>) {
  const d = PACK_ITEMS.find((d) => d.id === item.templateId);
  if (!d) throw new Error('未知装备模板');
  return d;
}
export function itemStats(templateId: string, level: number, profession: Profession) {
  const d = definition({ templateId });
  if (d.profession !== profession) throw new Error('装备与职业不匹配');
  const scale = LEVEL_POWER[level];
  return { attack: d.attack * scale, hp: d.hp * scale, defense: d.defense * scale, potency: scale };
}
export function contributionPoints(i: Equipment) {
  return cells(i).length * 2 ** (i.level - 1);
}
export function cells(item: Pick<Equipment, 'templateId'>, _rotation = 0): [number, number][] {
  const c = CATALOGUE[item.templateId as keyof typeof CATALOGUE];
  return (c?.cells ?? SHAPES[definition(item).shape]).map(([x, y]) => [x, y]);
}
export function dimensions(item: Equipment, p: Pick<Placement, 'rotation'>) {
  const c = cells(item, p.rotation);
  return { w: Math.max(...c.map((c) => c[0])) + 1, h: Math.max(...c.map((c) => c[1])) + 1 };
}
export function occupiedCells(item: Equipment, p: Placement) {
  return cells(item, p.rotation).map(([x, y]) => [x + p.x, y + p.y] as [number, number]);
}
export function validateLayout(
  items: Equipment[],
  layout: Placement[],
  open = bagCells(),
): string | null {
  const used = new Set<string>(),
    ids = new Set<string>();
  if (layout.length > 42) return '背包物品数量超限';
  for (const p of layout) {
    const i = items.find((i) => i.id === p.id);
    if (!i || ids.has(p.id)) return '物品缺失或重复';
    ids.add(p.id);
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      !Number.isInteger(p.rotation) ||
      p.rotation !== 0
    )
      return '位置无效（物品朝向固定）';
    for (const [x, y] of occupiedCells(i, p)) {
      if (x < 0 || y < 0 || x >= PACK_COLS || y >= PACK_ROWS) return '超出背包边界';
      const k = `${x},${y}`;
      if (!open.has(k)) return '此格尚未开放';
      if (used.has(k)) return '与其他物品重叠';
      used.add(k);
    }
  }
  return null;
}
export function adjacent(a: Placement, ai: Equipment, b: Placement, bi: Equipment) {
  const other = new Set(occupiedCells(bi, b).map((p) => p.join(',')));
  return occupiedCells(ai, a).some(([x, y]) =>
    [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].some((p) => other.has(p.join(','))),
  );
}
export function firstFree(
  items: Equipment[],
  layout: Placement[],
  id: string,
  open = bagCells(),
): Placement | null {
  for (let y = 0; y < PACK_ROWS; y++)
    for (let x = 0; x < PACK_COLS; x++) {
      const p = { id, x, y, rotation: 0 };
      if (!validateLayout(items, [...layout.filter((p) => p.id !== id), p], open)) return p;
    }
  return null;
}
export interface MovePlan {
  kind: 'invalid' | 'place' | 'swap' | 'eject' | 'merge';
  layout: Placement[];
  ejected: string[];
  target?: string;
  error?: string;
}
export function planMove(
  items: Equipment[],
  layout: Placement[],
  candidate: Placement,
  targetHint?: string,
  open = bagCells(),
): MovePlan {
  const source = items.find((i) => i.id === candidate.id),
    invalid = (error: string): MovePlan => ({ kind: 'invalid', error, layout, ejected: [] });
  if (!source) return invalid('物品已不存在');
  const bounds = validateLayout(items, [candidate], open);
  if (bounds) return invalid(bounds);
  const matches = (target: Equipment | undefined | null) =>
    target &&
    source.level < 5 &&
    source.level === target.level &&
    source.profession === target.profession &&
    source.templateId === target.templateId;
  const pointed =
    targetHint && targetHint !== source.id && layout.some((p) => p.id === targetHint)
      ? items.find((i) => i.id === targetHint)
      : null;
  if (matches(pointed)) return { kind: 'merge', layout, ejected: [], target: pointed!.id };
  const used = new Set(occupiedCells(source, candidate).map((c) => c.join(','))),
    collisions = layout.filter(
      (p) =>
        p.id !== candidate.id &&
        occupiedCells(
          items.find((i) => i.id === p.id)!,
          p,
        ).some((c) => used.has(c.join(','))),
    );
  const target = collisions.length === 1 ? items.find((i) => i.id === collisions[0].id) : null;
  if (matches(target)) return { kind: 'merge', layout, ejected: [], target: target!.id };
  const next = [
      ...layout.filter((p) => p.id !== candidate.id && !collisions.some((c) => c.id === p.id)),
      candidate,
    ],
    old = layout.find((p) => p.id === candidate.id);
  if (old && collisions.length === 1) {
    const receiver = { ...collisions[0], x: old.x, y: old.y },
      swapped = [...next, receiver];
    if (!validateLayout(items, swapped, open))
      return { kind: 'swap', layout: swapped, ejected: [] };
  }
  return {
    kind: collisions.length ? 'eject' : 'place',
    layout: next,
    ejected: collisions.map((p) => p.id),
  };
}
export { RESONANCES, RESONANCE_KEYS, resonanceMatch, itemResonanceTiers } from './resonances';
export function resonanceScore(items: Equipment[], layout: Placement[], key: ResonanceKey | null) {
  const d = key ? RESONANCES[key] : null,
    score = d
      ? items
          .filter((i) => layout.some((p) => p.id === i.id) && d.matches(i))
          .reduce((n, i) => n + contributionPoints(i), 0)
      : 0;
  const thresholds = d?.kind === 'item' ? [2, 8, 24] : [12, 80, 200];
  return {
    score,
    tier: score >= thresholds[2] ? 3 : score >= thresholds[1] ? 2 : score >= thresholds[0] ? 1 : 0,
    next: thresholds.find((n) => n > score) ?? null,
    thresholds,
  };
}

export function analyzePack(
  items: Equipment[],
  layout: Placement[],
  growthAttack = 0,
  buffs: Partial<Record<BuffKey, number>> = {},
  resonances: ResonanceKey[] = [],
) {
  const active = layout
      .map((p) => items.find((i) => i.id === p.id))
      .filter((i): i is Equipment => !!i),
    bonuses: Record<string, { power: number; potency: number; mana: boolean }> = {},
    links: { source: string; target: string; label: string }[] = [];
  for (const i of active)
    bonuses[i.id] = { power: 1 + growthAttack, potency: i.potency, mana: true };
  for (const a of layout) {
    const ai = active.find((i) => i.id === a.id)!;
    for (const b of layout) {
      const bi = active.find((i) => i.id === b.id)!;
      if (a.id === b.id || !adjacent(a, ai, b, bi)) continue;
      if (definition(ai).role === 'support' && definition(bi).role === 'weapon') {
        bonuses[bi.id].power += 0.1 * LEVEL_POWER[ai.level];
        links.push({
          source: ai.id,
          target: bi.id,
          label: `武器伤害 +${Math.round(10 * LEVEL_POWER[ai.level])}%`,
        });
      }
    }
  }
  const tiers = Object.fromEntries(
    RESONANCE_KEYS.map((k) => [
      k,
      resonances.includes(k) ? resonanceScore(items, layout, k).tier : 0,
    ]),
  ) as Record<ResonanceKey, number>;
  for (const i of active)
    if (i.profession === 'warrior')
      bonuses[i.id].power *= 1 + [0, 0.1, 0.2, 0.35][tiers.warrior_mix];
  let dps = 0,
    staminaUse = 0,
    manaUse = 0,
    staminaRegen = 3,
    manaRegen = 2,
    sustain = 0;
  const power = 1 + (buffs.power ?? 0) * 0.12;
  const effects = {
      burn: !!tiers.ignite && active.some((i) => i.branch === 'flame'),
      chill: !!tiers.frost && active.some((i) => i.branch === 'ice'),
      poison: !!tiers.venom && active.some((i) => i.branch === 'assassin'),
    },
    dots = { burn: 0, poison: 0 };
  // Twelve-hit sustained estimate against a 30-defense reference target; one strongest DOT per type.
  for (const i of active) {
    const d = definition(i),
      scale = LEVEL_POWER[i.level];
    if (d.role === 'weapon') {
      const strikes = Array.from({ length: 12 }, (_, n) =>
        weaponEffect(i, tiers, n + 1, effects, i.attack * bonuses[i.id].power * power, 30),
      );
      const perRound = strikes.reduce((n, x) => n + x.damage, 0) / 12 / d.cooldown;
      dps += perRound;
      const dotTier =
        i.branch === 'flame' ? tiers.ignite : i.branch === 'assassin' ? tiers.venom : 0;
      if (dotTier) {
        const kind = i.branch === 'flame' ? 'burn' : 'poison';
        dots[kind] = Math.max(
          dots[kind],
          strikes[0].power *
            [0, 0.1, 0.18, 0.28][dotTier] *
            i.potency *
            Math.min(1, 3 / d.cooldown),
        );
      }
      if (d.resource === 'stamina') staminaUse += d.cost / d.cooldown;
      else manaUse += d.cost / d.cooldown;
      if (i.branch === 'pole') staminaRegen += tiers.spear_storm / (3 * d.cooldown);
      if (i.branch === 'ice') manaRegen += tiers.mana_flow / d.cooldown;
      if (i.profession === 'mage') manaRegen += tiers.archmage / (3 * d.cooldown);
      const drain =
        i.branch === 'pole'
          ? [0, 0.02, 0.04, 0.06][tiers.second_wind]
          : i.branch === 'archer'
            ? [0, 0.03, 0.06, 0.1][tiers.leech]
            : 0;
      sustain += perRound * drain;
      if (i.branch === 'blade')
        sustain += ([0, 2, 4, 6][tiers.iron_guard] * i.potency) / d.cooldown;
    } else {
      if (d.role === 'stamina') staminaRegen += (6 * scale) / d.cooldown;
      if (d.role === 'mana') manaRegen += (7 * scale) / d.cooldown;
      if (d.role === 'heal') sustain += (8 * scale * 2) / 12;
      if (d.role === 'shield')
        sustain += ((12 * scale + i.defense) * shieldMultiplier(i, tiers)) / d.cooldown;
      const resource = d.cooldown ? itemResonanceTiers(i, tiers).advanced / d.cooldown : 0;
      if (i.profession === 'mage') manaRegen += resource;
      else staminaRegen += resource;
    }
  }
  dps += dots.burn + dots.poison;
  const neutralRegen = active
    .filter((i) => i.branch === 'neutral')
    .reduce((n, i) => n + 0.5 * LEVEL_POWER[i.level], 0);
  staminaRegen += neutralRegen;
  manaRegen += neutralRegen;
  const efficiency = Math.min(
    1,
    staminaUse ? staminaRegen / staminaUse : 1,
    manaUse ? manaRegen / manaUse : 1,
  );
  return {
    active,
    bonuses,
    links,
    tiers,
    dps,
    staminaUse,
    manaUse,
    staminaRegen,
    manaRegen,
    sustain,
    efficiency,
    neutralRegen,
    occupied: active.reduce((n, i) => n + cells(i).length, 0),
    hasWeapon: active.some((i) => definition(i).role === 'weapon'),
  };
}
export function analysis(state: GameState, draft = false) {
  const base = heroAttributes(state.run.trainee, state.run.profession),
    attackScale = base.attack / BASE_ATTRIBUTES[state.run.profession].attack;
  return analyzePack(
    state.inventory,
    draft ? state.draft : state.placements,
    (1 + state.run.growth.attack + state.run.eventGrowth.attack) * attackScale - 1,
    state.run.buffs,
    state.run.resonances,
  );
}
