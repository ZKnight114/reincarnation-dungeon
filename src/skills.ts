import type { Condition, Skill, SkillAction } from './skill-types';

const at = (values: number[], level: number) => values[level - 1];
const hit = (
  a: number,
  type: 'physical' | 'magic' | 'true' = 'physical',
  extra: Partial<SkillAction> = {},
): SkillAction => ({ kind: 'damage', a: a / 100, type, ...extra });
const shield = (h: number, a = 0, d = 0): SkillAction => ({
  kind: 'shield',
  h: h / 100,
  a: a / 100,
  d: d / 100,
});
const heal = (h: number, a = 0, when?: Condition): SkillAction => ({
  kind: 'heal',
  h: h / 100,
  a: a / 100,
  limit: 3,
  when,
});
const status = (kind: SkillAction['status'], value: number, duration: number): SkillAction => ({
  kind: 'status',
  status: kind,
  a: value / 100,
  duration,
});
const smoke = (value: number, duration = 1): SkillAction => ({
  kind: 'smoke',
  a: value / 100,
  duration,
});
const periodic = (cooldown: number, ...actions: SkillAction[]): Skill => ({ cooldown, actions });
const reactive = (trigger: Skill['trigger'], ...actions: SkillAction[]): Skill => ({
  cooldown: 0,
  trigger,
  once: trigger !== 'shieldHit' && trigger !== 'tome' && trigger !== 'support',
  actions,
});

// First activation is separate from recurring cooldown. Defensive openers remain immediate.
export function itemSkills(id: string, level: number): Skill[] {
  const delay = id.endsWith('_4') ? 3 : id.endsWith('_3') ? 2 : 1;
  const defensive = id.includes('guard') || id.includes('ward') || id.includes('leather');
  return nativeItemSkills(id, level).map((skill) =>
    skill.cooldown
      ? {
          ...skill,
          initialDelay: defensive && !skill.actions.some((a) => a.kind === 'heal') ? 1 : delay,
        }
      : skill,
  );
}
// Values are executable counterparts of the reviewed four-stage item table.
function nativeItemSkills(id: string, level: number): Skill[] {
  const n = (v: number[]) => at(v, level),
    gold = level === 4;
  switch (id) {
    case 'warrior_gem':
      return gold ? [reactive(undefined, shield(4))] : [];
    case 'mage_gem':
    case 'rogue_gem':
      return [];
    case 'warrior_blade_2':
      return [
        periodic(
          2,
          hit(n([55, 70, 85, 100])),
          ...(gold ? [hit(20, 'physical', { when: 'targetLow' })] : []),
        ),
      ];
    case 'warrior_blade_3':
      return [periodic(n([3, 3, 2, 2]), hit(n([90, 110, 110, 130])), shield(n([2, 3, 3, 4])))];
    case 'warrior_blade_4':
      return [
        periodic(
          3,
          hit(n([150, 180, 210, 240]), 'physical', { ignore: n([15, 20, 25, 35]) / 100 }),
          ...(gold ? [hit(30, 'physical', { when: 'selfLow' })] : []),
        ),
      ];
    case 'warrior_pole_2':
      return [
        periodic(1, hit(n([25, 32, 39, 46]))),
        ...(gold ? [{ cooldown: 0, every: 3, actions: [hit(15)] }] : []),
      ];
    case 'warrior_pole_3':
      return [periodic(2, hit(n([65, 80, 95, 110])), status('break', n([8, 10, 12, 16]), 2))];
    case 'warrior_pole_4':
      return [
        periodic(n([3, 3, 2, 2]), hit(n([65, 80, 80, 65]), 'physical', { hits: gold ? 3 : 2 })),
      ];
    case 'warrior_guard_2':
      return [periodic(2, shield(n([3, 4, 5, 6]), 0, n([100, 120, 140, 160])))];
    case 'warrior_guard_3':
      return [
        periodic(n([3, 3, 2, 2]), shield(n([4, 5, 5, 6])), {
          kind: 'counter',
          a: n([30, 40, 40, 50]) / 100,
        }),
      ];
    case 'warrior_guard_4':
      return [
        periodic(3, shield(n([8, 10, 12, 14]), 0, n([100, 120, 140, 160]))),
        ...(gold ? [reactive('low30', shield(6))] : []),
      ];
    case 'mage_flame_2':
      return [
        periodic(
          2,
          hit(n([40, 50, 60, 70]), 'magic'),
          status('burn', n([5, 6, 7, 8]), gold ? 3 : 2),
        ),
      ];
    case 'mage_flame_3':
      return [
        periodic(
          n([3, 3, 2, 2]),
          hit(n([90, 110, 110, 125]), 'magic'),
          hit(n([25, 35, 35, 45]), 'magic', { when: 'burn' }),
        ),
      ];
    case 'mage_flame_4':
      return [
        periodic(3, hit(n([135, 160, 185, 210]), 'magic'), status('burn', n([8, 10, 12, 14]), 3)),
      ];
    case 'mage_ice_2':
      return [
        periodic(
          2,
          hit(n([45, 55, 65, 75]), 'magic'),
          status('chill', n([10, 12, 15, 18]), gold ? 3 : 2),
        ),
      ];
    case 'mage_ice_3':
      return [
        periodic(n([3, 3, 2, 2]), hit(n([90, 110, 110, 125]), 'magic'), shield(n([3, 4, 4, 5]))),
      ];
    case 'mage_ice_4':
      return [
        periodic(
          3,
          hit(n([145, 175, 205, 235]), 'magic', {
            ignore: n([20, 25, 30, 40]) / 100,
            ignoreWhen: 'chill',
          }),
        ),
      ];
    case 'mage_ward_2':
      return [periodic(2, shield(n([3, 4, 5, 6]), n([15, 18, 21, 24])))];
    case 'mage_ward_3':
      return [periodic(n([3, 3, 2, 2]), heal(n([2, 3, 3, 4]), n([8, 10, 10, 12])))];
    case 'mage_ward_4':
      return [
        periodic(3, shield(n([7, 9, 11, 13]), n([20, 25, 30, 35]))),
        ...(gold ? [reactive('low30', shield(6))] : []),
      ];
    case 'rogue_assassin_2':
      return [
        periodic(1, hit(n([20, 25, 30, 35])), status('poison', n([3, 4, 5, 6]), gold ? 3 : 2)),
      ];
    case 'rogue_assassin_3':
      return [
        periodic(
          2,
          hit(n([30, 38, 46, 54]), 'physical', { hits: 2 }),
          hit(n([10, 15, 20, 25]), 'true', { when: 'poison' }),
        ),
      ];
    case 'rogue_assassin_4':
      return [
        periodic(
          3,
          hit(n([135, 165, 195, 225]), 'physical', {
            ignore: n([20, 25, 30, 35]) / 100,
            ignoreWhen: 'poison',
          }),
          ...(gold ? [hit(30, 'physical', { when: 'targetLow' })] : []),
        ),
      ];
    case 'rogue_archer_2':
      return [
        periodic(2, hit(n([50, 60, 70, 80])), status('mark', n([6, 8, 10, 12]), gold ? 3 : 2)),
      ];
    case 'rogue_archer_3':
      return [periodic(2, hit(n([35, 43, 51, 42]), 'physical', { hits: gold ? 3 : 2 }))];
    case 'rogue_archer_4':
      return [
        periodic(
          3,
          hit(n([150, 180, 210, 240]), 'physical', {
            ignore: n([15, 20, 25, 35]) / 100,
            ignoreWhen: 'mark',
          }),
        ),
      ];
    case 'rogue_leather_2':
      return [periodic(2, smoke(n([10, 13, 16, 20])))];
    case 'rogue_leather_3':
      return [periodic(n([3, 3, 2, 2]), smoke(n([14, 18, 22, 26])))];
    case 'rogue_leather_4':
      return [periodic(3, smoke(n([18, 22, 26, 30]), 2))];
    default:
      throw new Error('未定义物品技能：' + id);
  }
}

export function tomeSkills(id: string, level: number): Skill[] {
  const n = (v: number[]) => at(v, level);
  switch (id) {
    case 'warrior_sword_tome':
      return [
        periodic(
          3,
          hit(n([90, 110, 130]), 'physical', {
            ignore: n([15, 25, 35]) / 100,
            ignoreWhen: 'break',
          }),
          hit(n([20, 30, 40]), 'physical', { when: 'targetLow' }),
        ),
      ];
    case 'warrior_spear_tome':
      return [
        periodic(
          3,
          hit(n([25, 32, 40]), 'physical', {
            hits: 3,
            ignore: n([10, 20, 30]) / 100,
            ignoreWhen: 'break',
          }),
        ),
      ];
    case 'warrior_shield_tome':
      return [
        periodic(
          3,
          shield(n([5, 7, 9])),
          { kind: 'consume', h: 0.2 },
          hit(n([35, 50, 65]), 'physical', { consumed: 1, cap: n([50, 70, 90]) / 100 }),
        ),
      ];
    case 'mage_flame_tome':
      return [
        periodic(
          3,
          hit(n([80, 100, 120]), 'magic', {
            dot: 'burn',
            dotScale: n([100, 150, 200]) / 100,
            cap: n([30, 45, 60]) / 100,
          }),
          status('burn', n([4, 6, 8]), 2),
        ),
      ];
    case 'mage_ice_tome':
      return [
        periodic(
          3,
          hit(n([75, 95, 115]), 'magic', { ignore: n([20, 30, 40]) / 100, ignoreWhen: 'chill' }),
          status('chill', n([10, 14, 18]), 2),
        ),
      ];
    case 'mage_arcane_tome':
      return [
        periodic(
          3,
          shield(n([5, 7, 9])),
          hit(n([40, 55, 70]), 'magic'),
          hit(n([15, 25, 35]), 'magic', { when: 'icefire' }),
        ),
      ];
    case 'rogue_poison_tome':
      return [
        periodic(
          3,
          hit(n([65, 85, 105])),
          hit(0, 'true', {
            dot: 'poison',
            dotScale: n([100, 150, 200]) / 100,
            cap: n([20, 30, 40]) / 100,
          }),
          status('poison', n([3, 4, 5]), 2),
        ),
      ];
    case 'rogue_ranged_tome':
      return [
        periodic(
          3,
          hit(n([22, 28, 34]), 'physical', {
            hits: 3,
            bonusWhen: 'mark',
            bonus: n([15, 25, 35]) / 100,
          }),
          status('mark', n([6, 8, 10]), 2),
        ),
      ];
    case 'rogue_shadow_tome':
      return [
        periodic(
          4,
          hit(n([25, 35, 45]), 'physical', { when: 'smoke' }),
          shield(n([5, 7, 9])),
          heal(n([2, 3, 4])),
        ),
      ];
    default:
      throw new Error('未定义典籍技能：' + id);
  }
}

export function resonanceSkills(id: string, tier: number): Skill[] {
  const n = (v: number[]) => at(v, tier);
  const family = id.slice(0, -2),
    rank = Number(id.at(-1));
  const basicHit = (values: number[], cd = 3, type: 'physical' | 'magic' | 'true' = 'physical') => [
    periodic(cd, hit(n(values), type)),
  ];
  const conditional = (
    base: number[],
    bonus: number[],
    when: Condition,
    type: 'physical' | 'magic' | 'true' = 'physical',
    cd = 3,
    bonusType = type,
  ) => [periodic(cd, hit(n(base), type), hit(n(bonus), bonusType, { when }))];
  const burst = (
    base: number[],
    state: 'burn' | 'poison',
    scale: number[],
    cap: number[],
    type: 'magic' | 'true',
    cd = 3,
  ) => [
    periodic(cd, hit(n(base), type, { dot: state, dotScale: n(scale) / 100, cap: n(cap) / 100 })),
  ];
  const piercing = (
    base: number[],
    condition: Condition,
    ignore: number[],
    type: 'physical' | 'magic',
    cd = 4,
    hits = 1,
  ) => [periodic(cd, hit(n(base), type, { hits, ignore: n(ignore) / 100, ignoreWhen: condition }))];
  switch (family) {
    case 'warrior_heavy':
      return rank === 1
        ? basicHit([30, 45, 60])
        : rank === 2
          ? conditional([25, 40, 55], [15, 25, 35], 'break')
          : conditional([70, 100, 130], [25, 40, 55], 'targetLow', 'physical', 4);
    case 'warrior_flurry':
      return rank === 1
        ? [periodic(2, hit(n([10, 15, 20]), 'physical', { hits: 2 }))]
        : rank === 2
          ? [periodic(3, hit(n([20, 30, 40])), heal(n([1, 2, 3]), 0, 'first'))]
          : piercing([20, 28, 36], 'break', [10, 20, 30], 'physical', 4, 3);
    case 'warrior_guard':
      return rank === 1
        ? [periodic(3, shield(n([4, 6, 8])))]
        : rank === 2
          ? [
              reactive(
                'shieldHit',
                hit(0, 'physical', { received: n([10, 15, 20]) / 100, cap: n([20, 30, 40]) / 100 }),
              ),
            ]
          : [reactive('shieldBreak', shield(n([8, 12, 16])), hit(n([30, 50, 70])))];
    case 'mage_flame':
      return rank === 1
        ? conditional([25, 40, 55], [10, 20, 30], 'burn', 'magic')
        : rank === 2
          ? burst([25, 40, 55], 'burn', [75, 100, 125], [20, 30, 40], 'magic')
          : piercing([70, 100, 130], 'burn', [15, 25, 35], 'magic');
    case 'mage_ice':
      return rank === 1
        ? conditional([25, 40, 55], [10, 20, 30], 'chill', 'magic')
        : rank === 2
          ? [periodic(3, shield(n([3, 4, 5])), hit(n([20, 30, 40]), 'magic', { when: 'first' }))]
          : piercing([70, 100, 130], 'chill', [15, 25, 35], 'magic');
    case 'mage_arcane':
      return rank === 1
        ? [periodic(3, shield(n([4, 6, 8])))]
        : rank === 2
          ? conditional([25, 40, 55], [20, 35, 50], 'icefire', 'magic')
          : [reactive('tome', hit(n([25, 40, 55]), 'magic'), shield(n([2, 3, 4])))];
    case 'rogue_poison':
      return rank === 1
        ? conditional([25, 40, 55], [8, 14, 20], 'poison', 'physical', 3, 'true')
        : rank === 2
          ? [periodic(3, hit(n([25, 40, 55])), heal(0, n([5, 8, 11]), 'poison'))]
          : burst([25, 40, 55], 'poison', [75, 100, 125], [20, 30, 40], 'true', 4);
    case 'rogue_volley':
      return rank === 1
        ? [periodic(3, hit(n([15, 22, 30]), 'physical', { hits: 2 }))]
        : rank === 2
          ? [periodic(3, hit(n([20, 30, 40])), heal(n([1, 2, 3]), 0, 'mark'))]
          : piercing([20, 28, 36], 'mark', [10, 20, 30], 'physical', 4, 3);
    case 'rogue_shadow':
      return rank === 1
        ? [periodic(3, shield(n([3, 5, 7])))]
        : rank === 2
          ? conditional([25, 40, 55], [15, 25, 35], 'smoke')
          : [reactive('low50', heal(n([3, 5, 7])), shield(n([4, 6, 8])))];
    case 'warrior_sword':
      return rank === 1
        ? basicHit([25, 40, 55])
        : rank === 2
          ? [periodic(3, hit(n([20, 30, 40])), hit(n([15, 25, 35])))]
          : [
              periodic(
                4,
                hit(n([65, 95, 125]), 'physical', { ignore: n([10, 20, 30]) / 100 }),
                hit(n([15, 25, 35]), 'physical', { when: 'targetLow' }),
              ),
            ];
    case 'warrior_spear':
      return rank === 1
        ? [periodic(2, hit(n([8, 12, 16]), 'physical', { hits: 2 }))]
        : rank === 2
          ? conditional([25, 40, 55], [10, 20, 30], 'break')
          : [
              periodic(
                4,
                hit(n([18, 25, 32]), 'physical', { hits: 3, ignore: n([10, 20, 30]) / 100 }),
              ),
            ];
    case 'warrior_shield':
      return rank === 1
        ? [periodic(3, shield(n([3, 5, 7])))]
        : rank === 2
          ? [
              reactive(
                'shieldHit',
                hit(0, 'physical', { received: n([8, 12, 16]) / 100, cap: n([15, 25, 35]) / 100 }),
              ),
            ]
          : [reactive('shieldBreak', shield(n([4, 6, 8])), heal(n([2, 3, 4])))];
    case 'mage_staff':
      return rank === 1
        ? basicHit([25, 40, 55], 3, 'magic')
        : rank === 2
          ? burst([20, 30, 40], 'burn', [50, 75, 100], [15, 25, 35], 'magic')
          : piercing([65, 95, 125], 'burn', [15, 25, 35], 'magic');
    case 'mage_book':
      return rank === 1
        ? basicHit([25, 40, 55], 3, 'magic')
        : rank === 2
          ? conditional([20, 30, 40], [10, 18, 26], 'chill', 'magic', 3, 'true')
          : piercing([65, 95, 125], 'chill', [15, 25, 35], 'magic');
    case 'mage_robe':
      return rank === 1
        ? [periodic(3, shield(n([3, 5, 7])))]
        : rank === 2
          ? [periodic(4, heal(n([1, 2, 3]), n([5, 8, 11])))]
          : [reactive('support', hit(n([20, 35, 50]), 'magic'), shield(n([2, 3, 4])))];
    case 'rogue_knife':
      return rank === 1
        ? basicHit([15, 22, 29], 2)
        : rank === 2
          ? conditional([10, 18, 26], [8, 14, 20], 'poison', 'true')
          : conditional([65, 95, 125], [15, 25, 35], 'targetLow', 'physical', 4, 'true');
    case 'rogue_ranged':
      return rank === 1
        ? [periodic(3, hit(n([12, 18, 24]), 'physical', { hits: 2 }))]
        : rank === 2
          ? conditional([20, 30, 40], [10, 20, 30], 'mark')
          : [
              periodic(
                4,
                hit(n([18, 25, 32]), 'physical', { hits: 3, ignore: n([10, 20, 30]) / 100 }),
              ),
            ];
    case 'rogue_leather':
      return rank === 1
        ? [periodic(4, heal(n([2, 3, 4])))]
        : rank === 2
          ? [periodic(3, shield(n([3, 4, 5])))]
          : [reactive('low50', heal(n([3, 5, 7])), hit(n([25, 40, 55])))];
    default:
      throw new Error('未定义共鸣技能：' + id);
  }
}
