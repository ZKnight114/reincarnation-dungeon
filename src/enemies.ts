import catalogue from './enemy-catalogue.json';
import { runRoute } from './journey';
import type { Enemy, GameState } from './types';
import { nonGuildAttributes, buildSources } from './backpack';
import { estimatePressure } from './combat';

const professions = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue' } as const;
export const ENEMY_TEMPLATES = catalogue.enemies.map((e) => ({
  ...e,
  profession: professions[e.profession as keyof typeof professions],
}));
const species: Record<string, number> = {
  wraith: 0,
  skeleton: 6,
  slime: 7,
  bat: 8,
  spider: 9,
  golem: 10,
  wolf: 11,
  ogre: 14,
  dragon: 17,
  bone_king: 18,
  queen: 19,
};
// Limited adaptation cannot erase improved equipment or purchased guild attributes.
export const growthMultiplier = (ratio: number) =>
  ratio <= 1 ? Math.max(0.8, 1 + 0.25 * (ratio - 1)) : 1 + 0.5 * Math.log(ratio);
export const referenceStrength = (progress: number) =>
  140 + 420 * progress + 700 * progress * progress;
export function generateEnemy(s: GameState, strength: number, random: () => number): Enemy {
  const route = runRoute(s),
    p = Math.min(1, s.run.index / (route.normal - 1)),
    stage = route.trials.indexOf(s.run.index);
  const boss = stage >= 0 || s.run.index >= route.extremeStart;
  let id: string;
  if (boss) {
    const pool = ['golem', 'queen', 'dragon', 'bone_king', 'ogre'];
    id =
      pool[
        (s.run.chapter + Math.max(0, stage) + Math.max(0, s.run.index - route.extremeStart)) %
          pool.length
      ];
  } else if (s.run.chapter === 1 && s.run.kills < 3)
    id = ['skeleton', 'slime', 'wraith'][s.run.kills];
  else {
    const last = s.run.enemyHistory.slice(-2),
      exclude = last.length === 2 && last[0] === last[1] ? last[0] : null;
    const pool = ENEMY_TEMPLATES.filter((e) => e.kind === '小怪' && e.profession !== exclude);
    const weight = (e: (typeof pool)[number]) =>
      e.profession === 'warrior' ? 1 : e.profession === 'rogue' ? 2 / 3 : 2;
    let roll = random() * pool.reduce((n, e) => n + weight(e), 0);
    id = pool.at(-1)!.id;
    for (const e of pool) {
      roll -= weight(e);
      if (roll <= 0) {
        id = e.id;
        break;
      }
    }
  }
  const t = ENEMY_TEMPLATES.find((e) => e.id === id)!,
    g = growthMultiplier(Math.max(strength, 0.85 * s.run.peakStrength) / referenceStrength(p));
  const c = Math.min(10, s.run.chapter),
    extreme = s.run.index >= route.extremeStart;
  const chapterHp = (1 + 0.13 * (c - 1)) ** 1.3;
  const stageHp = (c <= 3 ? [1.8, 2, 2.2] : [1.35, 1.5, 1.65])[Math.max(0, stage)];
  const baseHp = Math.max(
    1,
    Math.round(
      (180 + 450 * p + 2100 * p * p) *
        chapterHp *
        Math.sqrt(g) *
        (boss ? (extreme ? 2.2 : stageHp) : 1.35) *
        t.multipliers.hp *
        (c === 1 ? 0.9 : 1),
    ),
  );
  const stats = nonGuildAttributes(s),
    sources = buildSources(s);
  const budget = estimatePressure(
    stats,
    sources,
    s.placements.some((p) => s.inventory.find((i) => i.id === p.id)?.branch === 'assassin') &&
      s.placements.some((p) => s.inventory.find((i) => i.id === p.id)?.branch === 'archer'),
  );
  // Partly follow a neutral build, rather than its score or current life. Guild bonuses stay advantageous.
  const targetRounds = boss ? (extreme ? 11 : 6.5 + Math.max(0, stage) * 1.5) : 3.6 + p * 1.1;
  const follow = c <= 3 ? 0.12 : 0.58;
  const hp = Math.round(
    baseHp * (1 - follow) + Math.max(baseHp * 0.7, budget.output * targetRounds) * follow,
  );
  const baseAttack = (9 + 12 * p + 5 * p * p) * (1 + 0.08 * (c - 1)) * g ** 0.65;
  const pressureAttack =
    stats.hp * (boss ? 0.095 : 0.055) + budget.protection * (boss ? 0.75 : 0.55);
  const attackFollow = c <= 3 ? 0 : c === 4 ? 0.16 : 0.55;
  const attack =
    baseAttack * (1 - attackFollow) + Math.max(baseAttack, pressureAttack) * attackFollow;
  return {
    templateId: id,
    profession: t.profession,
    name: t.name,
    species: species[id],
    hp,
    maxHp: hp,
    attack:
      attack *
      (boss ? (extreme ? 1.5 : 1.18 + 0.08 * Math.max(0, stage)) : 1) *
      t.multipliers.attack *
      (c === 1 ? 0.85 : 1),
    defense: (4 + 6 * p + 2.2 * (c - 1)) * t.multipliers.defense,
    speed: Math.max(
      1,
      Math.round((10 + Math.floor(3 * p) + Math.floor((c - 1) / 3)) * t.multipliers.speed),
    ),
    isBoss: boss,
    isElite: false,
    effects: [],
  };
}
