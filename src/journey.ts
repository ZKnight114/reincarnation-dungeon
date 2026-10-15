// Opening gifts and initial resonance are configured before this numbered route.
// Video years 1–4 and 41 are omitted (opening, pet, initial resonance, mentor).
export const VIDEO_YEARS = [...Array.from({ length: 36 }, (_, n) => n + 5), 42];
export const RUN_LENGTH = VIDEO_YEARS.length,
  TRIAL_NODES = [8, 16, 24] as const;
export const GRADUATION_NODE = 31,
  ENDING_NODE = RUN_LENGTH - 1,
  EXTREME_START = GRADUATION_NODE + 1;
export const trialIndex = (index: number, chapter = 4) =>
  chapterRoute(chapter).trials.indexOf(index);
export const routeStage = (index: number, chapter = 4) =>
  chapterRoute(chapter).trials.filter((n) => n < index).length;
export const ROUTE_KINDS: EventKind[] = [
  'battle',
  'choice',
  'supply',
  'battle',
  'dig',
  'rest',
  'battle',
  'choice',
  'elite',
  'battle',
  'choice',
  'treasure',
  'battle',
  'rest',
  'battle',
  'choice',
  'elite',
  'rest',
  'battle',
  'chance',
  'battle',
  'choice',
  'rest',
  'battle',
  'elite',
  'choice',
  'battle',
  'dig',
  'battle',
  'dig',
  'battle',
  'graduation',
  'battle',
  'battle',
  'battle',
  'battle',
  'ending',
];
export function chapterRoute(chapter: number) {
  const normal = chapter === 1 ? 18 : chapter === 2 ? 24 : chapter === 3 ? 28 : 32;
  const trials =
    chapter === 1
      ? [4, 9, 13]
      : chapter === 2
        ? [5, 11, 17]
        : chapter === 3
          ? [6, 13, 20]
          : [8, 16, 24];
  const length = chapter <= 2 ? normal : chapter === 3 ? 31 : 37;
  const kinds: EventKind[] =
    chapter >= 4
      ? [...ROUTE_KINDS]
      : Array.from({ length }, (_, n) => {
          if (n === normal - 1) return 'graduation';
          if (n === length - 1 && length > normal) return 'ending';
          if (n >= normal) return 'boss';
          if (trials.includes(n)) return 'boss';
          if (n === 2) return 'supply';
          if (n % 7 === 5) return 'rest';
          if (n % 8 === 7) return 'choice';
          if (n === normal - 3) return 'dig';
          if (n === normal - 5 && chapter > 1) return 'chance';
          return 'battle';
        });
  for (const n of trials) kinds[n] = 'boss';
  if (chapter >= 4) for (let n = normal; n < length - 1; n++) kinds[n] = 'boss';
  return {
    normal,
    length,
    trials,
    kinds,
    graduation: normal - 1,
    ending: length - 1,
    extremeStart: normal,
    hasExtreme: length > normal,
  };
}
export function runRoute(s: import('./types').GameState) {
  return s.run.legacyRoute
    ? { ...chapterRoute(4), trials: [8, 16, 24], kinds: s.run.events.map((e) => e.kind) }
    : chapterRoute(s.run.chapter);
}
import { PROFESSIONS } from './backpack';
import type { EventKind, Profession, TrialTier } from './types';

export const STAGES = ['启程', '淬炼', '觉醒'];
export const TRIALS = [
  { name: '守望试炼', hp: 1, attack: 1, growth: 1, description: '迎战守关Boss，稳步晋阶。' },
  {
    name: '勇气试炼',
    hp: 1.2,
    attack: 1.12,
    growth: 1.35,
    description: '更强的守门者，换取更多成长。',
  },
  {
    name: '英雄试炼',
    hp: 1.45,
    attack: 1.28,
    growth: 1.8,
    description: '挑战守门者的全力，争取最高成长。',
  },
] as const;

export function stageGrowth(profession: Profession, trials: (TrialTier | null)[], stages: number) {
  const base = PROFESSIONS[profession].growth;
  return trials.slice(0, stages).reduce(
    (total, t) => {
      const scale = TRIALS[t ?? 0].growth;
      return {
        attack: total.attack + base.attack * scale,
        hp: total.hp + Math.round(base.hp * scale),
        defense: +(total.defense + +(base.defense * scale).toFixed(2)).toFixed(2),
      };
    },
    { attack: 0, hp: 0, defense: 0 },
  );
}
export function trialGain(profession: Profession, tier: TrialTier) {
  const d = PROFESSIONS[profession].growth,
    factor = TRIALS[tier].growth;
  return `攻击 +${+(d.attack * factor * 100).toFixed(1)}% · 生命上限 +${Math.round(d.hp * factor)} · 防御 +${+(d.defense * factor).toFixed(2)}`;
}
export function eventStory(kind: EventKind, variant = 0, hasExtreme = true) {
  switch (kind) {
    case 'treasure':
      return '破损的石门后藏着一只古老宝箱，封印间透出微光。';
    case 'supply':
      return '一名远行商旅在岔路停下，把备用的装备留给了你。';
    case 'rest':
      return '林间月泉映出银色光芒。饮下泉水能疗伤，凝聚泉华能强健体魄。';
    case 'chance':
      return variant === 0
        ? '遗迹中，一座命运轮盘仍在缓缓转动。它会赠予什么？'
        : '鲜血祭坛在黑暗中苏醒，索取生命，许诺力量。';
    case 'elite':
      return '守门者拦住去路。跨越试炼，勇者才能踏入下一阶段。';
    case 'dig':
      return '废弃矿道埋着前人的装备。挥动铲子，循着露出的轮廓寻找遗物。';
    case 'choice':
      return [
        '古老祭像压住一块刻满符文的铁锭。搬开它或许能换来力量。',
        '矿壁中嵌着一柄完整武器，取出它需要付出生命。',
        '泉水映出你的身影：现在疗伤，或积累更强的体魄？',
        '战损铜甲藏着护身符文。解开它的封印会耗损生命。',
        '流浪占卜师愿以一道符文赐福交换鲜血。你会接受这份未知的力量吗？',
      ][variant % 5];
    case 'graduation':
      return hasExtreme
        ? '勇者已通过三次试炼。现在可以返回公会结业，也可以挑战自身极限。'
        : '勇者已通过三次试炼，可以带着最终构筑返回公会结业。';
    case 'mentor':
      return '公会导师在归途等待，将一份经验传授给即将毕业的勇者。';
    case 'ending':
      return '地牢的出口透出晨光。最后整理行囊，将这段冒险留在勇者的档案中。';
    case 'boss':
      return '地牢深处的王座缓缓亮起。最后的试炼，将决定勇者的毕业之路。';
    default:
      return [
        '脚步声惊动了暗处的魔物，一场战斗即将开始。',
        '石桥尽头传来低吼。勇者握紧武器，准备迎战。',
        '火光照亮遗迹中的身影，魔物拦住了去路。',
        '沉睡的守卫被惊醒，战斗已无法避免。',
        '前方出现魔物留下的足迹。勇者小心踏入它的领地。',
      ][variant % 5];
  }
}
