import catalogue from './enemy-catalogue.json';
import { runRoute } from './journey';
import type { Enemy, GameState } from './types';

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
export const growthMultiplier = (ratio: number) =>
  Math.max(0.75, ratio <= 2 ? Math.sqrt(Math.max(0, ratio)) : Math.sqrt(2) * (ratio / 2) ** 0.25);
// Standard-build references rise with progress but are never selected by opposing class.
export const referenceStrength = (progress: number) => 120 + progress * 320;
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
  const c = s.run.chapter,
    stageHp = [2.8, 3.4, 4][Math.max(0, stage)],
    stageAttack = [1.1, 1.18, 1.25][Math.max(0, stage)];
  const extreme = s.run.index >= route.extremeStart;
  const newbieHp = c === 1 ? 0.85 : c === 2 ? 0.95 : 1,
    newbieAttack = c === 1 ? 0.8 : c === 2 ? 0.9 : 1;
  // Late loot strongly raises A through both item attributes and skill multipliers.
  // Give normal encounters more room to act, without copying that growth one for one.
  const pacingHp = boss ? 1 + 0.65 * p : 1 + 3 * p;
  const hp = Math.max(
    1,
    Math.round(
      200 *
        (1 + 1.4 * p) *
        (1 + 0.1 * (c - 1)) *
        g *
        (boss ? (extreme ? 4 * 1.25 : stageHp) : 1) *
        t.multipliers.hp *
        newbieHp *
        pacingHp,
    ),
  );
  return {
    templateId: id,
    profession: t.profession,
    name: t.name,
    species: species[id],
    hp,
    maxHp: hp,
    attack:
      12 *
      (1 + 0.65 * p) *
      (1 + 0.06 * (c - 1)) *
      g ** 0.7 *
      (boss ? (extreme ? 1.25 * 1.15 : stageAttack) : 1) *
      t.multipliers.attack *
      newbieAttack,
    defense: (4 + 4 * p + 1.5 * (c - 1)) * t.multipliers.defense,
    speed: Math.max(
      1,
      Math.round((10 + Math.floor(3 * p) + Math.floor((c - 1) / 3)) * t.multipliers.speed),
    ),
    isBoss: boss,
    isElite: false,
    effects: [],
  };
}
