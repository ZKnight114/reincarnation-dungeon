import { CATALOGUE } from './catalogue';
import { estimateBuild } from './combat';
import { applyTalentSources } from './talents';
import { heroAttributes } from './hero';
import { itemProposal, receivingLink, LINK_EFFECT_NAMES } from './item-rules';
import { runRoute } from './journey';
import { tome } from './progression';
import { equipmentFamily } from './categories';
import { tomeAttributes } from './progression';
import { applyGuild, emptyGuildBonus } from './guild';
import { DESIGN_RESONANCE_IDS, RESONANCES, RESONANCE_KEYS } from './resonances';
import { itemSkills, resonanceSkills, tomeSkills } from './skills';
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
export const PACK_COLS = 7,
  PACK_ROWS = 6,
  LEVEL_POWER = [0, 1, 1.5, 2, 3];
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
    description: '剑重击与长枪连击，防具守护。可混合两条攻击路线。',
    trait: '剑 / 枪 / 防御',
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
    description: '火焰爆发与冰霜控制，魔法书辅助。物品自带灼烧、减速等回合技能。',
    trait: '法杖 / 法球 / 辅助',
    hp: 150,
    defense: 0,
    growth: { attack: 0.12, hp: 18, defense: 1 },
    starter: [
      ['mage_flame_2', 'mage_ice_2', 'mage_gem'],
      ['mage_flame_3', 'mage_ward_2', 'mage_ward_3'],
    ],
  },
  rogue: {
    name: '刺客',
    color: '#96b994',
    description: '短剑双剑近战与手弩远程，烟幕辅助。物品自带毒伤和标记，可选择专精或混搭。',
    trait: '剑 / 弩 / 辅助',
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
  guard: { name: '防御', color: '#b0a586' },
  flame: { name: '火焰', color: '#e4a17a' },
  ice: { name: '冰霜', color: '#9dcfe0' },
  ward: { name: '魔法书', color: '#b0a1d3' },
  assassin: { name: '短剑 / 双剑', color: '#c29eae' },
  archer: { name: '手弩', color: '#a5bf86' },
  leather: { name: '炼金工具', color: '#bfa985' },
};
export const BUFFS: Record<BuffKey, { name: string; description: string }> = {
  power: { name: '力量', description: '人物攻击 +12%' },
  tempo: { name: '敏捷', description: '基础速度 +2' },
  vitality: { name: '体魄', description: '最大生命 +12%' },
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
// Active definitions use reviewed attributes, skills, art and fixed footprints.
export const PACK_ITEMS: PackItemDefinition[] = Object.entries(CATALOGUE).map(([id, c]) => {
  const profession = id.split('_')[0] as Profession,
    raw = id.split('_')[1],
    branch = (raw === 'gem' ? 'neutral' : raw) as Branch;
  const p = itemProposal(id),
    functional = ['guard', 'ward', 'leather'].includes(branch),
    neutral = branch === 'neutral';
  return {
    id,
    profession,
    branch,
    name: c.name,
    art: neutral
      ? profession === 'warrior'
        ? 'rune'
        : 'crystal'
      : (
          {
            blade: 'sword',
            pole: 'spear',
            guard: 'shield',
            flame: 'staff',
            ice: 'orb',
            ward: 'tome',
            assassin: 'sword',
            archer: 'crossbow',
            leather: 'smoke',
          } as Record<string, string>
        )[branch],
    slot: neutral ? 'accessory' : functional ? 'armor' : 'weapon',
    shape: 'dot',
    role:
      neutral || branch === 'leather'
        ? 'support'
        : functional
          ? id === 'mage_ward_3'
            ? 'heal'
            : 'shield'
          : 'weapon',
    cooldown: itemSkills(id, 1).find((k) => k.cooldown > 0)?.cooldown ?? 0,
    cost: 0,
    resource: null,
    ...p.attributes[0],
    description: p.stageEffects[0],
    damageType: profession === 'mage' ? 'magic' : 'physical',
    style:
      neutral || functional
        ? null
        : profession === 'mage'
          ? 'spell'
          : branch === 'archer'
            ? 'ranged'
            : 'melee',
    available: true,
  };
});
// Five-cell definitions stay reserved and never enter a loot pool.
for (const profession of PROFESSION_KEYS)
  for (const branch of (
    {
      warrior: ['blade', 'pole', 'guard'],
      mage: ['flame', 'ice', 'ward'],
      rogue: ['assassin', 'archer', 'leather'],
    } as const
  )[profession]) {
    const functional = ['guard', 'ward', 'leather'].includes(branch);
    PACK_ITEMS.push({
      id: `${profession}_${branch}_5`,
      profession,
      branch,
      name: '五格保留物品',
      art: 'reserved',
      slot: functional ? 'armor' : 'weapon',
      shape: 'Z5',
      role: functional ? 'shield' : 'weapon',
      cooldown: 0,
      cost: 0,
      resource: null,
      attack: 0,
      hp: 0,
      defense: 0,
      description: '后续扩展，暂不投放',
      damageType: profession === 'mage' ? 'magic' : 'physical',
      style: null,
      available: false,
    });
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
const LEGACY_BAG_ORDER: [number, number][] = [
  ...Array.from({ length: 15 }, (_, n) => [1 + (n % 5), 1 + Math.floor(n / 5)] as [number, number]),
  ...Array.from({ length: 5 }, (_, x) => [x + 1, 4] as [number, number]),
  ...Array.from({ length: 5 }, (_, x) => [x + 1, 0] as [number, number]),
  ...Array.from({ length: 5 }, (_, y) => [0, y] as [number, number]),
  ...Array.from({ length: 5 }, (_, y) => [6, y] as [number, number]),
  ...Array.from({ length: 7 }, (_, x) => [x, 5] as [number, number]),
];
const INITIAL_BAG: [number, number][] = [
  ...Array.from({ length: 12 }, (_, n) => [2 + (n % 3), 1 + Math.floor(n / 3)] as [number, number]),
  [1, 2],
  [1, 3],
  [1, 4],
];
// Add adjoining strips; every expansion remains connected and the final extent is 7×6.
const EXPANSION: [number, number][] = [
  [1, 1],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0],
  [5, 1],
  [5, 2],
  [5, 3],
  [5, 4],
  [0, 4],
  [0, 3],
  [0, 2],
  [0, 1],
  [0, 0],
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  ...Array.from({ length: 7 }, (_, x) => [x, 5] as [number, number]),
];
const BAG_ORDER = [...INITIAL_BAG, ...EXPANSION];
export const bagCapacity = (kills: number) => Math.min(42, 15 + kills * 2);
export const bagCells = (capacity = 42, legacy = false) =>
  new Set((legacy ? LEGACY_BAG_ORDER : BAG_ORDER).slice(0, capacity).map((p) => p.join(',')));
export const openBagCells = (kills: number) => bagCells(bagCapacity(kills));
export function runBagCapacity(s: GameState) {
  if (s.run.legacyRoute) return bagCapacity(s.run.kills);
  const r = runRoute(s),
    battles = r.kinds.slice(0, r.normal).filter((k) => k === 'battle' || k === 'boss').length;
  return Math.min(42, 15 + Math.ceil((27 * s.run.kills) / Math.max(1, battles)));
}
export const runBagCells = (s: GameState) =>
  bagCells(runBagCapacity(s), s.run.packLayout === 'legacy');
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
  if (!Number.isInteger(level) || level < 1 || level > 4) throw new Error('常规装备最高四阶');
  const attributes = itemProposal(templateId).attributes[level - 1];
  return { ...attributes, potency: LEVEL_POWER[level] };
}
export function contributionPoints(i: Equipment) {
  return cells(i).length * 2 ** (i.level - 1);
}
export function cells(
  item: Pick<Equipment, 'templateId' | 'legacyCells'>,
  _rotation = 0,
): [number, number][] {
  const c = CATALOGUE[item.templateId as keyof typeof CATALOGUE];
  return (item.legacyCells ?? c?.cells ?? SHAPES[definition(item).shape]).map(([x, y]) => [x, y]);
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
    source.level < 4 &&
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
export { RESONANCES, RESONANCE_KEYS, itemResonanceTiers, resonanceMatch } from './resonances';
export function resonanceScore(items: Equipment[], layout: Placement[], key: ResonanceKey | null) {
  const d = key ? RESONANCES[key] : null,
    score = d
      ? items
          .filter((i) => layout.some((p) => p.id === i.id) && d.matches(i))
          .reduce((n, i) => n + contributionPoints(i), 0)
      : 0;
  const thresholds = d?.thresholds ?? [12, 48, 96];
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
  _growthAttack = 0,
  _buffs: Partial<Record<BuffKey, number>> = {},
  resonances: ResonanceKey[] = [],
) {
  const active = layout
    .map((p) => items.find((i) => i.id === p.id))
    .filter((i): i is Equipment => !!i);
  const bonuses: Record<
    string,
    {
      power: number;
      potency: number;
      mana: boolean;
      damage: number;
      shield: number;
      heal: number;
      hp: number;
      counter: number;
      smoke: number;
    }
  > = {};
  const links: { source: string; target: string; label: string }[] = [];
  for (const i of active)
    bonuses[i.id] = {
      power: 1,
      potency: i.potency,
      mana: true,
      damage: 0,
      shield: 0,
      heal: 0,
      hp: 0,
      counter: 0,
      smoke: 0,
    };
  for (const target of active) {
    const p = layout.find((p) => p.id === target.id)!;
    const neighbors = active.filter(
      (i) =>
        i.id !== target.id &&
        adjacent(
          p,
          target,
          layout.find((p) => p.id === i.id)!,
          i,
        ),
    );
    const gems = neighbors
      .filter((i) => i.branch === 'neutral' && i.profession === target.profession)
      .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
      .slice(0, 2);
    for (const g of gems) {
      const kind =
        target.slot === 'weapon'
          ? 'damage'
          : g.level === 4 && g.profession === 'mage'
            ? 'shield'
            : g.level === 4 && g.profession === 'rogue'
              ? 'smoke'
              : null;
      if (!kind) continue;
      const amount = kind === 'damage' ? [0.08, 0.12, 0.16, 0.2][g.level - 1] : 0.1;
      bonuses[target.id][kind] += amount;
      links.push({
        source: g.id,
        target: target.id,
        label: LINK_EFFECT_NAMES[kind] + ' +' + Math.round(amount * 100) + '%',
      });
    }
    const rule = receivingLink(target);
    if (rule)
      for (const i of neighbors.filter((i) => rule.branches.includes(i.branch)).slice(0, 3)) {
        bonuses[target.id][rule.kind] += rule.amount;
        links.push({
          source: i.id,
          target: target.id,
          label: LINK_EFFECT_NAMES[rule.kind] + ' +' + Math.round(rule.amount * 100) + '%',
        });
      }
  }
  const tiers = Object.fromEntries(
    [...new Set([...RESONANCE_KEYS, ...resonances])].map((k) => [
      k,
      resonances.includes(k) ? resonanceScore(items, layout, k).tier : 0,
    ]),
  ) as Record<ResonanceKey, number>;
  const attributes = {
    attack: active.reduce((v, i) => v + i.attack, 0),
    hp: active.reduce((v, i) => v + i.hp * (1 + bonuses[i.id].hp), 0),
    defense: active.reduce((v, i) => v + i.defense, 0),
  };
  return {
    active,
    bonuses,
    links,
    tiers,
    attributes,
    dps: 0,
    sustain: 0,
    efficiency: 1,
    staminaUse: 0,
    manaUse: 0,
    staminaRegen: 0,
    manaRegen: 0,
    neutralRegen: 0,
    occupied: active.reduce((n, i) => n + cells(i).length, 0),
    hasWeapon: active.some((i) => i.slot === 'weapon'),
  };
}
export function nonGuildAttributes(state: GameState, draft = false) {
  const a = analyzePack(
      state.inventory,
      draft ? state.draft : state.placements,
      0,
      state.run.buffs,
      state.run.resonances,
    ),
    base = heroAttributes(state.run.trainee, state.run.profession);
  const bound =
    state.run.boundTome ??
    (state.run.trainee?.tomeId
      ? { id: state.run.trainee.tomeId, level: state.run.trainee.tomeLevel ?? 1 }
      : null);
  const t = tomeAttributes(bound?.id ?? null, bound?.level ?? 0);
  return {
    attack:
      (base.attack + a.attributes.attack) *
      (1 + state.run.growth.attack + state.run.eventGrowth.attack) *
      (1 + state.run.buffs.power * 0.12) *
      (t.attack ?? 1),
    hp:
      (base.hp + state.run.growth.hp + state.run.eventGrowth.hp + a.attributes.hp) *
      (1 + state.run.buffs.vitality * 0.12 + (state.run.eventGrowth.hpPercent ?? 0)) *
      (t.hp ?? 1),
    defense:
      (base.defense +
        state.run.growth.defense +
        state.run.eventGrowth.defense +
        a.attributes.defense +
        state.run.buffs.defense * 3) *
      (t.defense ?? 1) *
      (1 + (state.run.eventGrowth.defensePercent ?? 0)),
    speed: base.speed + state.run.buffs.tempo * 2 + state.run.eventGrowth.speed,
  };
}
export function finalAttributes(state: GameState, draft = false) {
  return applyGuild(
    nonGuildAttributes(state, draft),
    state.run.trainee?.guildBonus ?? emptyGuildBonus(),
  );
}
export function buildSources(state: GameState, draft = false) {
  const a = analyzePack(
    state.inventory,
    draft ? state.draft : state.placements,
    0,
    state.run.buffs,
    state.run.resonances,
  );
  const sources: import('./skill-types').Source[] = a.active.map((i) => ({
    id: i.id,
    name: i.name,
    kind: 'item',
    skills: itemSkills(i.templateId, i.level),
    damageBonus: a.bonuses[i.id].damage,
    shieldBonus: a.bonuses[i.id].shield,
    healBonus: a.bonuses[i.id].heal,
    counterBonus: a.bonuses[i.id].counter,
    ranged: i.branch === 'archer',
    family: equipmentFamily(i),
    profession: i.profession,
    smokeBonus: a.bonuses[i.id].smoke,
  }));
  const bound = state.run.boundTome;
  if (bound)
    sources.push({
      id: 'tome:' + bound.id,
      name: bound.id,
      kind: 'tome',
      skills: tomeSkills(bound.id, bound.level),
      profession: tome(bound.id)!.profession,
    });
  for (const key of state.run.resonances)
    if (a.tiers[key])
      sources.push({
        id: 'resonance:' + key,
        name: RESONANCES[key].name,
        kind: 'resonance',
        skills: resonanceSkills(DESIGN_RESONANCE_IDS[key], a.tiers[key]),
        profession:
          RESONANCES[key].kind === 'profession' ? RESONANCES[key].profession : state.run.profession,
      });
  return applyTalentSources(sources, state.run.trainee?.talents ?? []);
}
export function analysis(state: GameState, draft = false, includeGuild = true) {
  const a = analyzePack(
    state.inventory,
    draft ? state.draft : state.placements,
    0,
    state.run.buffs,
    state.run.resonances,
  );
  const estimate = estimateBuild(
    includeGuild ? finalAttributes(state, draft) : nonGuildAttributes(state, draft),
    buildSources(state, draft),
    a.active.some((i) => i.branch === 'assassin') && a.active.some((i) => i.branch === 'archer'),
  );
  return { ...a, dps: estimate.output, sustain: estimate.sustain, strength: estimate.strength };
}
