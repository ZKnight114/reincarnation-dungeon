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
export function legacyChapterRoute(chapter: number) {
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
    promotions: trials,
    kinds,
    graduation: normal - 1,
    ending: length - 1,
    extremeStart: normal,
    hasExtreme: length > normal,
  };
}
const REVIEWED_ROUTES = [
  'B S M K C P B M K C P M K C P D B G',
  'B B S D M K C P B W M K C P B S M K C P B D B G',
  'B B S D B M K C P B W S M K C P B Q B M K C P B D B D G',
  'B Q S B D Q B M K C P B S B W M K C P B S B Q M K C P B D B D G',
];
const NODE_KINDS: Record<string, EventKind> = {
  B: 'battle',
  S: 'supply',
  M: 'rest',
  K: 'boss',
  C: 'treasure',
  P: 'promotion',
  D: 'dig',
  W: 'chance',
  Q: 'choice',
  G: 'graduation',
};
export function chapterRoute(chapter: number) {
  const kinds = REVIEWED_ROUTES[Math.min(3, chapter - 1)].split(' ').map((k) => NODE_KINDS[k]);
  const normal = kinds.length;
  if (chapter >= 3) {
    kinds.push(...Array.from({ length: chapter === 3 ? 2 : 4 }, () => 'boss' as const), 'ending');
  }
  const trials = kinds.flatMap((kind, n) => (kind === 'boss' && n < normal ? [n] : []));
  return {
    normal,
    length: kinds.length,
    trials,
    promotions: kinds.flatMap((kind, n) => (kind === 'promotion' ? [n] : [])),
    kinds,
    graduation: normal - 1,
    ending: kinds.length - 1,
    extremeStart: normal,
    hasExtreme: kinds.length > normal,
  };
}
export function runRoute(s: import('./types').GameState) {
  if (s.run.routeRevision === 16) return chapterRoute(s.run.chapter);
  return s.run.legacyRoute
    ? { ...legacyChapterRoute(4), trials: [8, 16, 24], kinds: s.run.events.map((e) => e.kind) }
    : legacyChapterRoute(s.run.chapter);
}
import { CHANCE_STORIES } from './event-rules';
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
  return `攻击 +${+(d.attack * factor * 100).toFixed(1)}% · 最大生命 +${Math.round(d.hp * factor)} · 防御 +${+(d.defense * factor).toFixed(2)}`;
}
export function eventStory(kind: EventKind, variant = 0, hasExtreme = true) {
  switch (kind) {
    case 'treasure':
      return '守关者身后的宝箱仍被血色封印笼罩。付出一缕生命，便能取走其中的装备。';
    case 'supply':
      return '一名远行商旅在岔路停下，把备用的装备留给了你。';
    case 'rest':
      return '林间月泉映出银色光芒。饮下泉水能疗伤，凝聚泉华能强健体魄。';
    case 'chance':
      return CHANCE_STORIES[variant % CHANCE_STORIES.length];
    case 'promotion':
      return '勇者走入觉醒祭坛，试炼留下的力量正在体内汇聚。新的境界即将开启。';
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
      return '地牢深处的祭坛缓缓亮起。击败守关者，通过本次试炼，勇者将晋升一小阶境界。';
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
