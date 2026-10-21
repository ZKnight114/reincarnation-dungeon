import catalogue from './enemy-catalogue.json';
import { runRoute } from './journey';
import type { Enemy, GameState } from './types';

const professions = { 战士: 'warrior', 法师: 'mage', 刺客: 'rogue' } as const;
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
/** Fixed chapter/node budgets. Player stats, equipment, tomes and guild purchases are never inputs. */
export function generateEnemy(s: GameState, random: () => number): Enemy {
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
    c = Math.min(catalogue.fixedGrowth.chapters.length, Math.max(1, s.run.chapter)),
    budget = catalogue.fixedGrowth.chapters[c - 1],
    extra = s.run.index - route.extremeStart,
    guardian = stage >= 0 ? catalogue.encounters.stageGuardians[stage] : null;
  const curve = (coefficients: number[]) =>
    coefficients[0] + coefficients[1] * p + coefficients[2] * p * p;
  const hpMultiplier =
    extra >= 0
      ? catalogue.encounters.extraTrial.hpMultiplier + extra * catalogue.fixedGrowth.extremeHpStep
      : (guardian?.hpMultiplier ?? 1);
  const attackMultiplier =
    extra >= 0
      ? catalogue.encounters.extraTrial.attackMultiplier +
        extra * catalogue.fixedGrowth.extremeAttackStep
      : (guardian?.attackMultiplier ?? 1);
  const hp = Math.max(1, Math.round(curve(budget.hp) * hpMultiplier * t.multipliers.hp));
  return {
    templateId: id,
    profession: t.profession,
    name: t.name,
    species: species[id],
    hp,
    maxHp: hp,
    attack: +(curve(budget.attack) * attackMultiplier * t.multipliers.attack).toFixed(2),
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
