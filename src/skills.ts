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

function coreTomeSkills(id: string, level: number): Skill[] {
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

/** Passives use native battle events, never another automatic attack timer. */
export function resonanceSkills(id: string, tier: number): Skill[] {
  return [{ cooldown: 0, actions: [], passive: { id, tier } }];
}
export function tomeSkills(id: string, level: number): Skill[] {
  const skills = coreTomeSkills(id, level),
    skill = skills[0];
  skill.tome = { id, level };
  const protect = (a: number, when?: Condition): SkillAction => ({
    kind: 'guard',
    a: a / 100,
    duration: 1,
    when,
  });
  if (id === 'warrior_sword_tome' && level >= 2) skill.actions.push(status('break', 10, 1));
  if (id === 'warrior_spear_tome' && level === 3)
    skill.actions.push(hit(25, 'physical', { when: 'break' }));
  if (id === 'warrior_shield_tome' && level >= 2) skill.actions.push(protect(level === 3 ? 8 : 5));
  if (id === 'mage_flame_tome') {
    if (level >= 2)
      Object.assign(skill.actions[0], { ignore: level === 3 ? 0.15 : 0.1, ignoreWhen: 'burn' });
    if (level === 3) skill.actions[1].duration = 3;
  }
  if (id === 'mage_ice_tome' && level >= 2) {
    skill.actions.push({ ...shield(0, 10), when: 'chill' });
    if (level === 3) skill.actions.push(protect(8, 'chill'));
  }
  if (id === 'mage_arcane_tome') skill.actions.pop();
  if (id === 'rogue_poison_tome') {
    if (level >= 2) skill.actions.push({ ...shield(0, 10), when: 'poison' });
    if (level === 3) skill.actions[2].duration = 3;
  }
  if (id === 'rogue_ranged_tome' && level === 3)
    skill.actions.push(hit(20, 'physical', { when: 'mark' }));
  if (id === 'rogue_shadow_tome') {
    skill.actions.find((a) => a.kind === 'heal')!.unlimited = true;
    skill.actions.push({ kind: 'regen', h: [0.005, 0.0075, 0.01][level - 1], duration: 2 });
    if (level >= 2) skill.actions.push(smoke(level === 3 ? 15 : 10));
  }
  return skills;
}
