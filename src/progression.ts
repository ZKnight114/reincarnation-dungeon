import { analyzePack } from './backpack';
import { estimateBuild } from './combat';
import catalogue from './progression-catalogue.json';
import { DESIGN_RESONANCE_IDS } from './resonances';
import { itemSkills, resonanceSkills, tomeSkills } from './skills';
import type {
  Attributes,
  Branch,
  GameState,
  HeroRecord,
  Outcome,
  Profession,
  Rating,
} from './types';

export const REALMS = ['黑铁', '青铜', '白银', '黄金', '秘银', '精金', '传奇'];
export const realmName = (step: number) =>
  `${REALMS[Math.min(6, Math.floor(step / 3))]}${['初阶', '中阶', '高阶'][step % 3]}`;
export const startingRealm = (guildLevel: number) =>
  Math.min(15, Math.floor((guildLevel - 1) / 3) * 3);
export const guildMultiplier = (level: number) => 1 + (level - 1) * 0.05;
export function heroRating(power: number, outcome: Outcome, version = 15): Rating {
  const [c, b, a, s] = version === 14 ? [450, 1100, 1900, 3000] : [500, 1800, 3500, 6500];
  const rank: Rating =
    power >= s ? 'S' : power >= a ? 'A' : power >= b ? 'B' : power >= c ? 'C' : 'D';
  return outcome !== 'win' && ['A', 'S'].includes(rank) ? 'B' : rank;
}
const profession = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue' } as const;
export const TOMES = catalogue.tomes.map((t) => ({
  ...t,
  profession: profession[t.profession as keyof typeof profession],
}));
export const tome = (id: string) => TOMES.find((t) => t.id === id);
export const professionTomes = (p: Profession) => TOMES.filter((t) => t.profession === p);
export const tomeBranch = (id: string): Branch | null => {
  const b = tome(id);
  const branches: Record<string, Branch> = {
    剑: 'blade',
    枪: 'pole',
    长枪: 'pole',
    盾: 'guard',
    盾牌: 'guard',
    法杖: 'flame',
    火焰: 'flame',
    魔导书: 'ice',
    冰霜: 'ice',
    法袍: 'ward',
    匕首: 'assassin',
    弓弩: 'archer',
    皮甲: 'leather',
  };
  return b ? (branches[b.series] ?? null) : null;
};
export const emptyTomes = () =>
  Object.fromEntries(TOMES.map((t) => [t.id, { level: 0, pages: 0 }]));
export const upgradeCost = (level: number) =>
  level === 1 ? { pages: 3, gold: 200 } : { pages: 6, gold: 600 };
export function guildConditions(s: GameState) {
  const next = s.meta.guildLevel + 1,
    heroes = s.meta.heroes;
  if (next > 10) return [];
  const target = next <= 3 ? next - 1 : next * 2;
  return [
    { label: `累计消耗体力 ${target * 20}`, value: s.meta.staminaSpent, target: target * 20 },
    { label: `培养 ${target} 名冒险者`, value: heroes.length, target },
    next <= 3
      ? { label: `成功结业 ${next - 1} 次`, value: s.meta.wins, target: next - 1 }
      : next <= 5
        ? {
            label: `通关第 ${next - 2} 关`,
            value: Math.max(0, s.meta.highestChapter - 1),
            target: next - 2,
          }
        : next <= 8
          ? {
              label: `培养 ${next - 5} 名 S 级冒险者`,
              value: heroes.filter((h) => h.rating === 'S').length,
              target: next - 5,
            }
          : {
              label: '三职业均完成极限毕业',
              value: new Set(
                heroes
                  .filter(
                    (h) =>
                      h.outcome === 'win' &&
                      h.completed === h.routeLength &&
                      h.routeLength > h.normalLength,
                  )
                  .map((h) => h.profession),
              ).size,
              target: 3,
            },
  ];
}
export function currentHero(h: HeroRecord, guildLevel: number): HeroRecord {
  const ratio = guildMultiplier(guildLevel) / guildMultiplier(h.guildAtGraduation);
  if (ratio === 1) return structuredClone(h);
  const stats = {
    ...h.stats,
    attack: Math.round(h.stats.attack * ratio),
    hp: Math.round(h.stats.hp * ratio),
    defense: +(h.stats.defense * ratio).toFixed(1),
  };
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
  }));
  if (h.tomeId)
    sources.push({
      id: 'tome:' + h.tomeId,
      name: h.tomeId,
      kind: 'tome',
      skills: tomeSkills(h.tomeId, h.tomeLevel ?? 1),
    });
  for (const k of h.resonances)
    if (h.resonanceTiers[k])
      sources.push({
        id: 'resonance:' + k,
        name: k,
        kind: 'resonance',
        skills: resonanceSkills(DESIGN_RESONANCE_IDS[k], h.resonanceTiers[k]!),
      });
  const mixed =
    a.active.some((i) => i.branch === 'assassin') && a.active.some((i) => i.branch === 'archer');
  const before = estimateBuild(h.stats, sources, mixed),
    after = estimateBuild(stats, sources, mixed);
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
