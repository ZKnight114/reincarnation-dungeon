import { analyzePack } from './backpack';
import { estimateBuild } from './combat';
import catalogue from './progression-catalogue.json';
import { applyTalentSources } from './talents';
import { equipmentFamily } from './categories';
import { DESIGN_RESONANCE_IDS, RESONANCES } from './resonances';
import { itemSkills, resonanceSkills, tomeSkills } from './skills';
import type {
  Attributes,
  Branch,
  GameState,
  HeroRecord,
  Outcome,
  Profession,
  Rating,
  GuildBonus,
} from './types';

export const REALMS = ['黑铁', '青铜', '白银', '黄金', '秘银', '精金', '传奇'];
export const realmName = (step: number) =>
  `${REALMS[Math.min(6, Math.floor(step / 3))]}${['初阶', '中阶', '高阶'][step % 3]}`;
export { startingRealm, guildConditions } from './guild';
import { applyGuild, emptyGuildBonus } from './guild';
export function heroRating(power: number, outcome: Outcome, version = 15): Rating {
  const [c, b, a, s] = version === 14 ? [450, 1100, 1900, 3000] : [500, 1800, 3500, 6500];
  const rank: Rating =
    power >= s ? 'S' : power >= a ? 'A' : power >= b ? 'B' : power >= c ? 'C' : 'D';
  return outcome !== 'win' && ['A', 'S'].includes(rank) ? 'B' : rank;
}
const profession = { 战士: 'warrior', 法师: 'mage', 刺客: 'rogue' } as const;
export const TOMES = catalogue.tomes.map((t) => ({
  ...t,
  profession: profession[t.profession as keyof typeof profession],
}));
export const tome = (id: string) => TOMES.find((t) => t.id === id);
export const professionTomes = (p: Profession) => TOMES.filter((t) => t.profession === p);
export const tomeBranch = (id: string): Branch | null => {
  return (
    (
      {
        warrior_sword_tome: 'blade',
        warrior_spear_tome: 'pole',
        warrior_shield_tome: 'guard',
        mage_flame_tome: 'flame',
        mage_ice_tome: 'ice',
        mage_arcane_tome: 'ward',
        rogue_poison_tome: 'assassin',
        rogue_ranged_tome: 'archer',
        rogue_shadow_tome: 'leather',
      } as Record<string, Branch>
    )[id] ?? null
  );
};
export const emptyTomes = () =>
  Object.fromEntries(TOMES.map((t) => [t.id, { level: 0, pages: 0 }]));
export const upgradeCost = (level: number) =>
  level === 1 ? { pages: 3, gold: 200 } : { pages: 6, gold: 600 };
export function currentHero(h: HeroRecord, bonus: GuildBonus): HeroRecord {
  const bound = h.guildBonus ?? emptyGuildBonus();
  const baseline = h.guildBaseline ?? {
    attack: h.stats.attack / (1 + bound.attackPercent) - bound.attack,
    hp: h.stats.hp / (1 + bound.hpPercent) - bound.hp,
    defense: h.stats.defense / (1 + bound.defensePercent) - bound.defense,
    speed: h.stats.speed,
  };
  if (JSON.stringify(bound) === JSON.stringify(bonus)) return structuredClone(h);
  const updated = applyGuild(baseline, bonus);
  const stats = {
    ...h.stats,
    attack: Math.round(updated.attack),
    hp: Math.round(updated.hp),
    defense: +updated.defense.toFixed(1),
  };
  const { sources: adjusted, mixed } = heroBattleBuild(h);
  const before = estimateBuild(h.stats, adjusted, mixed),
    after = estimateBuild(stats, adjusted, mixed);
  const baseValue = before.output * 2 + before.sustain * 3,
    nextValue = after.output * 2 + after.sustain * 3;
  const build = Math.max(0, h.score.build + Math.round(nextValue - baseValue));
  return {
    ...structuredClone(h),
    power: h.score.growth + build + h.score.performance,
    stats,
    score: { ...h.score, build },
  };
}
/** Graduate combat uses the same frozen equipment, links, talents and learned skills. */
export function heroBattleBuild(h: HeroRecord) {
  const a = analyzePack(h.loadout?.equipment ?? [], h.loadout?.placements ?? []);
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
  if (h.tomeId)
    sources.push({
      id: 'tome:' + h.tomeId,
      name: tome(h.tomeId)?.name ?? h.tomeId,
      kind: 'tome',
      skills: tomeSkills(h.tomeId, h.tomeLevel ?? 1),
      profession: tome(h.tomeId)!.profession,
    });
  for (const k of h.resonances)
    if (h.resonanceTiers[k])
      sources.push({
        id: 'resonance:' + k,
        name: RESONANCES[k].name,
        kind: 'resonance',
        skills: resonanceSkills(DESIGN_RESONANCE_IDS[k], h.resonanceTiers[k]!),
        profession: h.profession,
      });
  const mixed =
    a.active.some((i) => i.branch === 'assassin') && a.active.some((i) => i.branch === 'archer');
  const adjusted = applyTalentSources(sources, h.talents);
  return { sources: adjusted, mixed, tiers: { ...h.resonanceTiers } };
}
export function tomeAttributes(id: string | null, level: number): Partial<Attributes> {
  const t = id ? tome(id) : null,
    a = t?.attributes[level - 1];
  return a
    ? {
        attack: 1 + a.attackPercent / 100,
        hp: 1 + a.hpPercent / 100,
        defense: 1 + a.defensePercent / 100,
      }
    : {};
}
