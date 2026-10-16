import catalogue from './talent-catalogue.json';
import type { Attribute, Equipment, Profession, TalentKey, TalentQuality } from './types';
import type { Source } from './skill-types';
import { equipmentFamily } from './categories';
import { LEGACY_TALENTS } from './legacy-talents';

export const TALENT_QUALITIES = catalogue.qualities;
type Definition = {
  name: string;
  category: string;
  quality?: TalentQuality;
  attribute?: Attribute;
  value: number;
  description: string;
  profession?: Profession;
  family?: string;
  rates: Record<string, number>;
};
const LABELS: Record<string, string> = {
  baseAttackFlat: '基础攻击',
  baseHpFlat: '基础生命',
  baseDefenseFlat: '基础防御',
  baseSpeedFlat: '基础速度',
  professionDamageRate: '同职业来源伤害',
  receivedHpReflectionRate: '受到直接生命伤害时反伤',
  professionShieldRate: '同职业来源护盾',
  professionDirectLifestealRate: '同职业直接伤害吸血',
  itemDirectDamageRate: '原生直接伤害',
  itemDirectLifestealRate: '原生直接伤害吸血',
  itemBreakStrengthRate: '原生破防强度',
  itemShieldRate: '原生护盾',
  itemCounterDamageRate: '原生反击',
  itemBurnDamageRate: '原生灼烧',
  itemHealingRate: '原生治疗',
  itemSmokeStrengthRate: '原生烟幕减伤强度',
  itemMarkStrengthRate: '原生标记强度',
};
const ATTR: Record<string, Attribute> = {
  baseAttackFlat: 'attack',
  baseHpFlat: 'hp',
  baseDefenseFlat: 'defense',
  baseSpeedFlat: 'speed',
};
export const TALENTS: Record<TalentKey, Definition> = Object.fromEntries(
  Object.entries(LEGACY_TALENTS).map(([k, v]) => [k, { ...v, category: 'legacy', rates: {} }]),
) as Record<TalentKey, Definition>;
for (const family of catalogue.talents) {
  for (const [n, quality] of (['blue', 'purple', 'gold'] as const).entries()) {
    const rates = Object.fromEntries(family.effects.map((e) => [e.kind, e.values[n]]));
    const base = family.effects.find((e) => ATTR[e.kind]);
    TALENTS[`${family.id}:${quality}`] = {
      name: family.name,
      category: family.category,
      quality,
      attribute: base ? ATTR[base.kind] : undefined,
      value: base?.values[n] ?? 0,
      profession: 'profession' in family ? (family.profession as Profession) : undefined,
      family: 'family' in family ? family.family : undefined,
      rates,
      description: family.effects
        .filter((e) => e.values[n])
        .map(
          (e) =>
            `${LABELS[e.kind]} +${e.kind.startsWith('base') ? e.values[n] : Math.round(e.values[n] * 100) + '%'}`,
        )
        .join('；'),
    };
  }
}
export const TALENT_KEYS = Object.keys(TALENTS) as TalentKey[];
const pick = <T>(pool: T[], random: () => number) =>
  pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
export function rollTalents(random: () => number, profession: Profession = 'warrior'): TalentKey[] {
  const chosen: TalentKey[] = [];
  for (const category of [
    'profession',
    'item',
    'attribute',
    random() < 0.5 ? 'item' : 'attribute',
  ]) {
    const families = catalogue.talents.filter(
      (t) =>
        t.category === category &&
        (category !== 'profession' || ('profession' in t && t.profession === profession)),
    );
    // Select families uniformly, then normalize quality weights after excluding used instances.
    const family = pick(
      families.filter((t) =>
        ['blue', 'purple', 'gold'].some((q) => !chosen.includes(`${t.id}:${q}` as TalentKey)),
      ),
      random,
    );
    const qualities = (['blue', 'purple', 'gold'] as const).filter(
      (q) => !chosen.includes(`${family.id}:${q}`),
    );
    let draw = random() * qualities.reduce((n, q) => n + TALENT_QUALITIES[q].weight, 0);
    const quality =
      qualities.find((q) => (draw -= TALENT_QUALITIES[q].weight) < 0) ?? qualities.at(-1)!;
    chosen.push(`${family.id}:${quality}`);
  }
  return chosen;
}
export function validTalents(keys: unknown, profession: Profession): keys is TalentKey[] {
  if (
    !Array.isArray(keys) ||
    keys.length !== 4 ||
    new Set(keys).size !== 4 ||
    keys.some((k) => !TALENTS[k as TalentKey])
  )
    return false;
  const ts = keys.map((k) => TALENTS[k as TalentKey]);
  // Preserve old graduates exactly; new recruitment always uses the new guaranteed categories.
  if (ts.every((t) => t.category === 'legacy'))
    return ['attack', 'hp', 'defense', 'speed'].every(
      (a) => ts.filter((t) => t.attribute === a).length === 1,
    );
  return (
    ts.filter((t) => t.category === 'profession').length === 1 &&
    ts.some((t) => t.category === 'profession' && t.profession === profession) &&
    ts.some((t) => t.category === 'item') &&
    ts.some((t) => t.category === 'attribute') &&
    ts.every((t) => t.category !== 'legacy')
  );
}
export function talentMarkup(key: TalentKey, items?: Equipment[]) {
  const t = TALENTS[key];
  const q = t.quality;
  const inactive =
    t.category === 'item' && items && !items.some((i) => equipmentFamily(i) === t.family);
  return `<div class="talent-badge talent-${q ?? 'legacy'}"${q ? ` style="--talent-color:${TALENT_QUALITIES[q].color}"` : ''}><strong>${t.name}${q ? `<em>${TALENT_QUALITIES[q].name}</em>` : ''}</strong><small>${t.description}</small>${inactive ? '<small class="talent-inactive">尚未装备对应类别</small>' : ''}</div>`;
}
export function talentRates(
  source: Pick<Source, 'kind' | 'family' | 'profession'>,
  keys: TalentKey[],
) {
  const result: Record<string, number> = {};
  for (const key of keys) {
    const t = TALENTS[key];
    if (
      (t.category === 'item' && source.kind === 'item' && source.family === t.family) ||
      (t.category === 'profession' && source.profession === t.profession)
    )
      for (const [effect, value] of Object.entries(t.rates))
        result[effect] = (result[effect] ?? 0) + value;
  }
  return result;
}
export function applyTalentSources(sources: Source[], keys: TalentKey[]): Source[] {
  const reflection = keys.reduce((n, k) => n + (TALENTS[k].rates.receivedHpReflectionRate ?? 0), 0);
  return sources.map((s, n) => {
    const t = talentRates(s, keys);
    return {
      ...s,
      talentDamage: t.professionDamageRate ?? 0,
      talentDirect: t.itemDirectDamageRate ?? 0,
      lifesteal: (t.itemDirectLifestealRate ?? 0) + (t.professionDirectLifestealRate ?? 0),
      reflect: n === 0 ? reflection : 0,
      shieldBonus: (s.shieldBonus ?? 0) + (t.itemShieldRate ?? 0) + (t.professionShieldRate ?? 0),
      healBonus: (s.healBonus ?? 0) + (t.itemHealingRate ?? 0),
      counterBonus: (s.counterBonus ?? 0) + (t.itemCounterDamageRate ?? 0),
      smokeBonus: (s.smokeBonus ?? 0) + (t.itemSmokeStrengthRate ?? 0),
      statusBonus: {
        break: t.itemBreakStrengthRate ?? 0,
        burn: t.itemBurnDamageRate ?? 0,
        mark: t.itemMarkStrengthRate ?? 0,
      },
    };
  });
}
export function itemTalentText(i: Equipment, keys: TalentKey[]) {
  return (
    keys
      .filter((k) => {
        const t = TALENTS[k];
        return t.category === 'profession'
          ? t.profession === i.profession
          : t.category === 'item' && t.family === equipmentFamily(i);
      })
      .map((k) => `${TALENTS[k].name} · ${TALENTS[k].description}`)
      .join('；') || '无适用天赋'
  );
}
