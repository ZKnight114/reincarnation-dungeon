import { weaponEffect, shieldMultiplier } from './combat-effects';
import { resonanceAvailable, itemResonanceTiers } from './resonances';
import { ENEMIES } from './data';
import {
  eventStory,
  STAGES,
  TRIALS,
  stageGrowth,
  trialGain,
  RUN_LENGTH,
  TRIAL_NODES,
  trialIndex,
  ROUTE_KINDS,
  GRADUATION_NODE,
  ENDING_NODE,
  EXTREME_START,
} from './journey';
import {
  analysis,
  openBagCells,
  bagCapacity,
  availableItems,
  BUFF_KEYS,
  BUFFS,
  definition,
  itemStats,
  LEVEL_POWER,
  occupiedCells,
  PROFESSION_KEYS,
  PROFESSIONS,
  planMove,
  RESONANCE_KEYS,
  RESONANCES,
  resonanceScore,
  validateLayout,
} from './backpack';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_POINTS,
  BASE_ATTRIBUTES,
  emptyAllocation,
  heroAttributes,
  pointsSpent,
  rollTalents,
} from './hero';
import type {
  Actor,
  Attribute,
  AdventureEvent,
  BuffKey,
  Contribution,
  Equipment,
  EventKind,
  GameState,
  HeroRecord,
  Outcome,
  Profession,
  Rating,
  ResonanceKey,
  Reward,
  TrialTier,
  JourneyEntry,
} from './types';
export const ENERGY_CAP = 60,
  RECRUIT_COST = 10,
  ENERGY_INTERVAL = 5 * 60 * 1000;
export const TARGET_RECRUIT_COST = 20,
  ACTION_SECONDS = 0.7,
  STORY_SECONDS = 3.2;
export function storyDuration(event: AdventureEvent) {
  return ['elite', 'graduation', 'ending'].includes(event.kind)
    ? STORY_SECONDS
    : Math.min(2.5, Math.max(1.2, eventStory(event.kind, event.variant).length * 0.065));
}
export const EVENT_NAMES: Record<EventKind, string> = {
  battle: '遭遇战',
  elite: '晋阶试炼',
  boss: '毕业试炼',
  treasure: '遗物宝箱',
  supply: '旅人补给',
  rest: '月泉营地',
  chance: '命运事件',
  choice: '旅途抉择',
  dig: '掘地挖宝',
  graduation: '结业抉择',
  mentor: '导师传授',
  ending: '极限毕业',
};
const emptyBuffs = () =>
  Object.fromEntries(BUFF_KEYS.map((k) => [k, 0])) as Record<BuffKey, number>;
const emptyCombat = (): GameState['combat'] => ({
  stamina: 20,
  mana: 12,
  timers: {},
  heals: {},
  seconds: 0,
  round: 0,
  elapsed: 0,
  order: [],
  actionIndex: 0,
  lastActor: null,
  bossTimer: 0,
  minions: 0,
  minionHp: 0,
  hits: {},
  contributions: {},
  counters: {},
});
export function createState(now = Date.now()): GameState {
  return {
    version: 14,
    phase: 'home',
    meta: {
      gold: 100,
      energy: { value: ENERGY_CAP, updatedAt: now },
      heroes: [],
      heroSerial: 0,
      highestChapter: 1,
      wins: 0,
      runs: 0,
      totalKills: 0,
    },
    run: {
      profession: 'warrior',
      chapter: 1,
      index: 0,
      events: [],
      points: 0,
      buffs: emptyBuffs(),
      rewards: [],
      kills: 0,
      seconds: 0,
      rounds: 0,
      highestItem: 1,
      summary: null,
      starterRound: 0,
      starterOffers: [],
      resonances: [],
      trainee: null,
      stages: 0,
      growth: { attack: 0, hp: 0, defense: 0 },
      lastLootIds: [],
      trials: [null, null, null],
      journey: [],
      eventGrowth: { attack: 0, hp: 0, defense: 0, speed: 0 },
      extreme: false,
      storyElapsed: 0,
      autoExplore: false,
      dig: null,
    },
    awakening: null,
    player: { hp: 190, maxHp: 190, defense: 3, shield: 0 },
    inventory: [],
    placements: [],
    draft: [],
    itemSerial: 0,
    revision: 0,
    combat: emptyCombat(),
    skipCombat: false,
    enemy: null,
    lastReport: null,
    log: [],
    logSerial: 0,
    isRunning: true,
    speed: 1,
    lastSaveTime: now,
  };
}
export function generateEvents(random = Math.random): AdventureEvent[] {
  const events: AdventureEvent[] = ROUTE_KINDS.map((kind) => ({
    kind,
    completed: false,
    variant: Math.floor(random() * 5),
  }));
  // Preserve the observed order; vary choices within implemented event categories.
  events[1].variant = 0;
  events[10].variant = 4;
  events[15].variant = 1;
  events[19].variant = Math.floor(random() * 2);
  events[21].variant = 2;
  events[25].variant = 3;
  return events;
}

export class Game {
  feedback: {
    serial: number;
    id: string;
    kind: 'damage' | 'healing' | 'shield' | 'resource' | 'hurt' | 'blocked' | 'trigger';
    amount: number;
  }[] = [];
  private feedbackSerial = 0;
  constructor(
    public state = createState(),
    private random = Math.random,
    private clock = () => Date.now(),
  ) {
    this.recoverEnergy();
  }
  recoverEnergy(now = this.clock()) {
    const e = this.state.meta.energy;
    if (!Number.isFinite(now) || now < e.updatedAt) return false;
    if (e.value >= ENERGY_CAP) {
      e.updatedAt = now;
      return false;
    }
    const recovered = Math.floor((now - e.updatedAt) / ENERGY_INTERVAL);
    if (!recovered) return false;
    e.value = Math.min(ENERGY_CAP, e.value + recovered);
    e.updatedAt = e.value === ENERGY_CAP ? now : e.updatedAt + recovered * ENERGY_INTERVAL;
    this.state.revision++;
    return true;
  }
  energyWait(now = this.clock()) {
    this.recoverEnergy(now);
    return this.state.meta.energy.value >= ENERGY_CAP
      ? 0
      : Math.max(0, this.state.meta.energy.updatedAt + ENERGY_INTERVAL - now);
  }
  log(text: string, kind: GameState['log'][number]['kind'] = 'system') {
    const s = this.state;
    s.log.push({ id: ++s.logSerial, text, kind });
    if (s.log.length > 50) s.log.shift();
  }
  chronicle(
    title: string,
    text: string,
    kind: JourneyEntry['kind'] = 'story',
    event = this.state.run.index + 1,
  ) {
    this.state.run.journey.push({ event, title, text, kind });
  }
  editable() {
    return ['opening', 'initial', 'camp', 'event', 'reward'].includes(this.state.phase);
  }
  currentEvent() {
    return this.state.run.events[this.state.run.index] ?? null;
  }
  completed() {
    return this.state.run.events.filter((e) => e.completed).length;
  }
  packAnalysis(draft = false) {
    return analysis(this.state, draft);
  }
  looseItems() {
    return this.state.inventory.filter((i) => !this.state.draft.some((p) => p.id === i.id));
  }
  findItem(id: string) {
    return (
      this.state.inventory.find((i) => i.id === id) ??
      this.state.run.starterOffers.find((i) => i.id === id) ??
      null
    );
  }
  returnToSelection() {
    if (this.state.phase !== 'summary') return false;
    this.state.run.trainee = null;
    this.state.phase = 'home';
    this.state.revision++;
    return true;
  }
  enterChapters() {
    const s = this.state;
    if (!['home', 'chapter', 'configure'].includes(s.phase)) return false;
    if (s.phase === 'home' && !s.run.trainee) s.run.chapter = s.meta.highestChapter;
    s.phase = 'chapter';
    s.revision++;
    return true;
  }
  chooseChapter(chapter: number) {
    const s = this.state;
    if (
      s.phase !== 'chapter' ||
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      chapter > s.meta.highestChapter
    )
      return false;
    s.run.chapter = chapter;
    s.revision++;
    return true;
  }
  backHome() {
    if (!['chapter', 'configure'].includes(this.state.phase)) return false;
    this.state.phase = 'home';
    this.state.revision++;
    return true;
  }
  resumeRecruit() {
    const s = this.state;
    if (s.phase !== 'chapter' || !s.run.trainee) return false;
    s.phase = 'configure';
    s.revision++;
    return true;
  }
  recruit(target?: Profession): string | null {
    const s = this.state;
    this.recoverEnergy();
    if (s.phase !== 'chapter' || s.run.trainee) return '已有见习勇者，请继续配置';
    if (target !== undefined && !PROFESSION_KEYS.includes(target)) return '请选择开放的职业';
    if (s.meta.heroes.length >= 500) return '公会名册已满';
    const cost = target ? TARGET_RECRUIT_COST : RECRUIT_COST;
    if (s.meta.energy.value < cost) return `招募需要 ${cost} 点体力，体力会随时间恢复`;
    const profession =
        target ?? PROFESSION_KEYS[Math.floor(this.random() * PROFESSION_KEYS.length)],
      chapter = s.run.chapter;
    s.meta.energy.value -= cost;
    s.run = createState(this.clock()).run;
    s.run.chapter = chapter;
    s.lastReport = null;
    s.combat = emptyCombat();
    const names = [
      '艾琳',
      '罗兰',
      '莉娅',
      '凯恩',
      '米拉',
      '洛克',
      '薇拉',
      '伊诺',
      '希尔',
      '诺亚',
      '露娜',
      '雷恩',
    ];
    s.run.trainee = {
      id: `hero-${++s.meta.heroSerial}`,
      name: names[Math.floor(this.random() * names.length)],
      createdAt: this.clock(),
      profession,
      recruitment: target ? 'targeted' : 'random',
      talents: rollTalents(this.random),
      allocation: emptyAllocation(),
    };
    s.run.profession = profession;
    const base = heroAttributes(s.run.trainee, profession);
    s.player = { hp: base.hp, maxHp: base.hp, defense: base.defense, shield: 0 };
    s.phase = 'configure';
    s.revision++;
    return null;
  }
  allocate(attribute: Attribute, delta: number): string | null {
    const s = this.state,
      t = s.run.trainee;
    if (
      s.phase !== 'configure' ||
      !t ||
      !ATTRIBUTE_KEYS.includes(attribute) ||
      ![1, -1].includes(delta)
    )
      return '当前无法分配属性';
    if (delta > 0 && pointsSpent(t) >= ATTRIBUTE_POINTS) return '属性点已用完';
    if (t.allocation[attribute] + delta < 0) return '该属性尚未加点';
    t.allocation[attribute] += delta;
    s.revision++;
    return null;
  }
  resetAllocation() {
    if (this.state.phase !== 'configure' || !this.state.run.trainee) return false;
    this.state.run.trainee.allocation = emptyAllocation();
    this.state.revision++;
    return true;
  }
  balanceAllocation() {
    if (!this.resetAllocation()) return false;
    this.state.run.trainee!.allocation = { attack: 3, hp: 3, defense: 3, speed: 3 };
    return true;
  }
  startRun(
    profession: Profession = this.state.run.profession,
    chapter = this.state.run.chapter,
  ): string | null {
    const old = this.state;
    if (old.phase !== 'configure' || !old.run.trainee) return '先消耗体力招募见习勇者';
    if (profession !== old.run.trainee.profession) return '职业在招募时确定，定向招募可指定职业';
    if (pointsSpent(old.run.trainee) !== ATTRIBUTE_POINTS) return '请分配全部 12 点属性';
    if (
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      chapter > old.meta.highestChapter ||
      chapter > 20
    )
      return '该地牢尚未解锁';
    const s = createState(this.clock());
    s.meta = structuredClone(old.meta);
    s.meta.runs++;
    s.speed = old.speed;
    s.revision = old.revision + 1;
    s.run.trainee = structuredClone(old.run.trainee);
    s.run.profession = profession;
    s.run.chapter = chapter;
    s.run.events = generateEvents(this.random);
    const base = heroAttributes(s.run.trainee, profession);
    s.player.hp = s.player.maxHp = base.hp;
    s.player.defense = base.defense;
    s.phase = 'opening';
    this.state = s;
    this.feedback = [];
    s.run.starterOffers = this.starterRoundItems(0);
    this.log(
      `${s.run.trainee.name}成为见习${PROFESSIONS[profession].name}，前往第 ${chapter} 座地牢。`,
    );
    this.chronicle(
      '公会启程',
      `${s.run.trainee.name}携带公会补给，踏上第 ${chapter} 关的旅程。`,
      'story',
      0,
    );
    return null;
  }
  private starterRoundItems(round: number) {
    return PROFESSIONS[this.state.run.profession].starter[round].map((id) => this.makeItem(id));
  }
  private advanceStarter() {
    const s = this.state;
    s.run.starterRound++;
    s.run.starterOffers = s.run.starterRound < 2 ? this.starterRoundItems(s.run.starterRound) : [];
    s.revision++;
  }
  claimStarterRound(): string | null {
    const s = this.state;
    if (s.phase !== 'opening' || s.run.starterRound >= 2) return '起始物品已领取';
    s.inventory.push(...s.run.starterOffers);
    s.run.starterOffers = [];
    this.advanceStarter();
    return null;
  }
  private takeStarter(id: string) {
    const s = this.state,
      item = s.run.starterOffers.find((i) => i.id === id);
    if (!item) return false;
    s.inventory.push(item);
    s.run.starterOffers = s.run.starterOffers.filter((i) => i.id !== id);
    if (!s.run.starterOffers.length) this.advanceStarter();
    return true;
  }
  private clearLooseEquipment(event = this.state.run.index + 1) {
    const s = this.state,
      stale = this.looseItems().map((i) => i.id);
    for (const id of stale) this.removeItem(id);
    s.run.points += stale.length;
    s.run.lastLootIds = [];
    if (stale.length)
      this.chronicle(
        '回收未入包装备',
        `未入包的 ${stale.length} 件装备转为 ${stale.length} 点。`,
        'loot',
        event,
      );
  }
  finishOpening(): string | null {
    const s = this.state;
    if (s.phase !== 'opening' || s.run.starterRound !== 2) return '先领取全部两轮起始物品';
    if (
      validateLayout(s.inventory, s.draft, openBagCells(s.run.kills)) ||
      !this.packAnalysis(true).hasWeapon
    )
      return '先摆放至少一件武器';
    this.clearLooseEquipment(0);
    s.placements = structuredClone(s.draft);
    this.recalculate();
    s.player.hp = s.player.maxHp;
    s.run.rewards = [this.resonanceReward(true)];
    s.phase = 'initial';
    s.revision++;
    return null;
  }
  resonanceChoices(initial = false) {
    return RESONANCE_KEYS.filter((k) =>
      resonanceAvailable(k, this.state.run.profession, this.state.run.resonances, initial),
    );
  }
  chooseResonance(key: ResonanceKey): string | null {
    const s = this.state,
      r = s.run.rewards[0];
    if (
      !['initial', 'reward'].includes(s.phase) ||
      r?.kind !== 'resonance' ||
      !r.resonances.includes(key) ||
      s.run.resonances.includes(key) ||
      s.run.resonances.length >= 4 ||
      !resonanceAvailable(key, s.run.profession, s.run.resonances, s.phase === 'initial')
    )
      return '请选择当前奖励中的共鸣';
    s.run.resonances.push(key);
    s.run.rewards.shift();
    s.phase = s.run.rewards.length ? 'reward' : 'camp';
    s.revision++;
    this.log(`获得共鸣 ${s.run.resonances.length}/4 · ${RESONANCES[key].name}`, 'reward');
    this.chronicle(
      '共鸣觉醒',
      `获得「${RESONANCES[key].name}」。${RESONANCES[key].description}`,
      'growth',
      s.run.resonances.length === 1 ? 0 : s.run.index + 1,
    );
    return null;
  }
  makeItem(templateId: string, level = 1): Equipment {
    const s = this.state,
      d = definition({ templateId });
    if (!d.available) throw new Error('5 格物品暂未投放');
    if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error('装备等级无效');
    const stats = itemStats(templateId, level, s.run.profession);
    return {
      id: `item-${++s.itemSerial}`,
      templateId,
      profession: s.run.profession,
      name: d.name,
      artKind: d.art,
      slot: d.slot,
      branch: d.branch,
      quality: (['white', 'green', 'blue', 'purple', 'orange'] as const)[level - 1],
      level,
      ...stats,
      damageType: d.damageType,
    };
  }
  recalculate() {
    const s = this.state,
      a = this.packAnalysis(),
      p = heroAttributes(s.run.trainee, s.run.profession);
    s.player.maxHp =
      (p.hp + s.run.growth.hp + s.run.eventGrowth.hp + a.active.reduce((n, i) => n + i.hp, 0)) *
      (1 + s.run.buffs.vitality * 0.12);
    s.player.defense =
      p.defense +
      s.run.growth.defense +
      s.run.eventGrowth.defense +
      a.active.reduce((n, i) => n + i.defense, 0) +
      s.run.buffs.defense * 3;
    s.player.hp = Math.min(s.player.hp, s.player.maxHp);
  }
  placeItem(id: string, x: number, y: number, rotation = 0): string | null {
    const s = this.state;
    if (!this.editable()) return '战斗中不能调整背包';
    const next = [...s.draft.filter((p) => p.id !== id), { id, x, y, rotation }],
      error = validateLayout(s.inventory, next, openBagCells(s.run.kills));
    if (error) return error;
    s.draft = next;
    s.revision++;
    return null;
  }
  continueCamp(): string | null {
    const s = this.state;
    if (s.phase !== 'camp') return '先处理当前事件或共鸣';
    const error = validateLayout(s.inventory, s.draft, openBagCells(s.run.kills));
    if (error) return error;
    if (!this.packAnalysis(true).hasWeapon) return '至少放入一件武器';
    this.clearLooseEquipment();
    s.placements = structuredClone(s.draft);
    this.recalculate();
    if (
      this.currentEvent()?.completed &&
      (s.run.index === ENDING_NODE || (s.run.index === GRADUATION_NODE && !s.run.extreme))
    ) {
      this.finish('win', s.run.extreme ? '极限挑战完成，勇者毕业' : '三次晋阶完成，勇者正常结业');
      return null;
    }
    if (s.player.hp <= 0) {
      this.finish('death', '生命已耗尽');
      return null;
    }
    if (this.currentEvent()?.completed) s.run.index++;
    s.revision++;
    s.isRunning = true;
    this.beginEvent();
    return null;
  }
  private beginEvent() {
    const s = this.state,
      event = this.currentEvent()!;
    s.enemy = null;
    s.run.lastLootIds = [];
    s.run.dig = null;
    s.run.storyElapsed = 0;
    s.phase = 'journey';
    this.chronicle(EVENT_NAMES[event.kind], eventStory(event.kind, event.variant));
  }
  continueJourney() {
    const s = this.state;
    if (s.phase !== 'journey') return false;
    s.run.storyElapsed = STORY_SECONDS;
    const event = this.currentEvent()!;
    if (event.kind === 'dig') this.prepareDig();
    if (['elite', 'boss'].includes(event.kind) && s.run.trials[trialIndex(s.run.index)] === null) {
      s.phase = 'event';
    } else if (['battle', 'elite', 'boss'].includes(event.kind)) {
      s.phase = 'combat';
      this.spawnEnemy();
    } else if (['supply', 'treasure'].includes(event.kind)) {
      this.grantLoot(event.kind === 'supply' ? '获得旅人补给' : '开启遗物宝箱');
      this.resolved();
    } else {
      s.phase = 'event';
      this.log(`事件 ${s.run.index + 1} · ${EVENT_NAMES[event.kind]}`);
    }
    s.revision++;
    return true;
  }
  chooseTrial(tier: TrialTier): string | null {
    const s = this.state,
      e = this.currentEvent(),
      stage = trialIndex(s.run.index);
    if (
      s.phase !== 'event' ||
      !e ||
      e.completed ||
      !['elite', 'boss'].includes(e.kind) ||
      ![0, 1, 2].includes(tier) ||
      s.run.trials[stage] !== null
    )
      return '当前无法选择试炼';
    const error = validateLayout(s.inventory, s.draft, openBagCells(s.run.kills));
    if (error) return error;
    if (!this.packAnalysis(true).hasWeapon) return '至少放入一件武器';
    s.placements = structuredClone(s.draft);
    this.recalculate();
    s.run.trials[stage] = tier;
    this.chronicle(
      TRIALS[tier].name,
      `选择${TRIALS[tier].name}。胜利后：${trialGain(s.run.profession, tier)}。`,
      'danger',
    );
    s.phase = 'combat';
    s.isRunning = true;
    s.revision++;
    this.spawnEnemy();
    return null;
  }

  spawnEnemy() {
    const s = this.state,
      event = this.currentEvent();
    if (!event || !['battle', 'elite', 'boss'].includes(event.kind)) return;
    const isBoss =
        event.kind === 'boss' || (event.kind === 'elite' && s.run.index === TRIAL_NODES[2]),
      isElite = event.kind === 'elite',
      species = isBoss
        ? s.run.chapter % 2
          ? 18
          : 19
        : [0, 6, 7, 8, 9, 11, 10, 12, 14, 15, 16, 17][Math.floor(this.random() * 12)],
      progress = 1.035 ** s.run.index,
      scale = 1 + (s.run.chapter - 1) * 0.035,
      armored = [10, 15].includes(species),
      swift = [8, 16].includes(species),
      hp = Math.round(
        210 * progress * scale * (isBoss ? 4.8 : isElite ? 3.2 : armored ? 1.15 : swift ? 0.85 : 1),
      );
    s.enemy = {
      name: `${isElite ? '精英 · ' : ''}${ENEMIES[species].name}`,
      species,
      hp,
      maxHp: hp,
      attack: (3.8 + s.run.index * 0.13) * scale * (isBoss ? 1.6 : isElite ? 1.3 : swift ? 0.8 : 1),
      defense: s.run.chapter * (armored ? 10 : 2),
      speed:
        8 +
        Math.floor(s.run.index / 5) +
        Math.floor((s.run.chapter - 1) / 4) +
        (swift ? 4 : isBoss ? 2 : 0),
      isBoss,
      isElite,
      effects: [],
    };
    if (isElite || isBoss) {
      const t = TRIALS[s.run.trials[trialIndex(s.run.index)] ?? 0];
      s.enemy.hp = s.enemy.maxHp = Math.round(s.enemy.maxHp * t.hp);
      s.enemy.attack *= t.attack;
    }
    if (s.run.extreme && s.run.index >= EXTREME_START) {
      s.enemy.hp = s.enemy.maxHp = Math.round(s.enemy.maxHp * 1.6);
      s.enemy.attack *= 1.35;
    }
    s.combat = emptyCombat();
    s.player.shield = 0;
    this.beginRound();
    this.log(`事件 ${s.run.index + 1} · ${s.enemy.name}`, 'battle');
  }
  private lootLevel() {
    const n = this.state.run.index,
      roll = this.random();
    if (n > TRIAL_NODES[2] && roll < 0.35) return 3;
    if (n > TRIAL_NODES[0] && roll < 0.18) return 3;
    if (n > TRIAL_NODES[0] && roll < 0.65) return 2;
    if (n >= 6 && roll < 0.35) return 2;
    return 1;
  }
  private lootItem() {
    const s = this.state,
      active = this.packAnalysis(true).active,
      pool = availableItems(s.run.profession),
      materials = active.filter((i) => i.level < 5),
      match = this.random() < (s.run.index > TRIAL_NODES[2] ? 0.8 : 0.6) && materials.length > 0;
    if (match) {
      const target = materials[Math.floor(this.random() * materials.length)],
        level =
          s.run.index > TRIAL_NODES[0] && this.random() < 0.65
            ? Math.min(3, target.level)
            : this.lootLevel();
      return this.makeItem(target.templateId, level);
    }
    return this.makeItem(pool[Math.floor(this.random() * pool.length)].id, this.lootLevel());
  }
  private grantLoot(title: string, level?: number) {
    const s = this.state,
      items = Array.from({ length: 3 }, () => {
        const i = this.lootItem();
        if (level) this.setItemLevel(i, level);
        return i;
      });
    s.run.autoExplore = false;
    s.inventory.push(...items);
    s.run.lastLootIds = items.map((i) => i.id);
    s.run.highestItem = Math.max(s.run.highestItem, ...items.map((i) => i.level));
    this.log(
      `${title}：全部获得 ${items.map((i) => `${i.name} Lv.${i.level}`).join('、')}`,
      'reward',
    );
    this.chronicle(
      title,
      `获得 ${items.map((i) => `${i.name} Lv.${i.level}`).join('、')}。`,
      'loot',
    );
  }
  private buffReward(): Reward {
    const choices = BUFF_KEYS.filter((k) => this.state.run.buffs[k] < 3);
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return {
      kind: 'buff',
      title: '鲜血祭坛 · 基础祝福',
      buffs: choices.slice(0, 3),
      resonances: [],
    };
  }
  private resonanceReward(initial = false): Reward {
    let choices = this.resonanceChoices(initial);
    if (initial) {
      const ready = choices.filter(
        (k) => resonanceScore(this.state.inventory, this.state.draft, k).tier > 0,
      );
      if (ready.length >= 3) choices = ready;
    }
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return {
      kind: 'resonance',
      title: initial ? '选择初始共鸣' : `阶段 ${this.state.run.stages} 完成 · 选择共鸣`,
      buffs: [],
      resonances: choices.slice(0, 3),
    };
  }
  private resolved(rewards: Reward[] = []) {
    const s = this.state,
      e = this.currentEvent();
    if (!e || e.completed) return;
    e.completed = true;
    if (TRIAL_NODES.some((n) => n === s.run.index)) {
      const previous = { ...s.run.growth },
        stage = trialIndex(s.run.index),
        tier = s.run.trials[stage] ?? 0;
      s.run.trials[stage] = tier;
      s.run.stages++;
      s.run.growth = stageGrowth(s.run.profession, s.run.trials, s.run.stages);
      this.recalculate();
      this.log(`阶段 ${s.run.stages}/3 培养完成：${trialGain(s.run.profession, tier)}`, 'reward');
      this.chronicle(
        `${STAGES[stage]} · 试炼通过`,
        `${TRIALS[tier].name}完成。${trialGain(s.run.profession, tier)}。`,
        'growth',
      );
      const healed = this.heal(s.player.maxHp * [0.25, 0.35, 0.45][tier]);
      this.chronicle('晋阶恢复', `恢复 ${Math.round(healed)} 生命。`, 'rest');
      s.awakening = {
        stage: stage + 1,
        tier,
        attack: s.run.growth.attack - previous.attack,
        hp: s.run.growth.hp - previous.hp,
        defense: s.run.growth.defense - previous.defense,
        healed: Math.round(healed),
      };
      rewards.push(this.resonanceReward());
    }
    s.run.rewards = rewards.filter((r) => r.buffs.length || r.resonances.length);
    s.run.autoExplore = false;
    s.phase = s.awakening ? 'awakening' : s.run.rewards.length ? 'reward' : 'camp';
    s.enemy = null;
    s.player.shield = 0;
    s.revision++;
  }
  finishAwakening() {
    const s = this.state;
    if (s.phase !== 'awakening' || !s.awakening) return false;
    s.awakening = null;
    s.phase = 'reward';
    s.revision++;
    return true;
  }
  chooseReward(index: number): string | null {
    const s = this.state,
      r = s.run.rewards[0];
    if (!['initial', 'reward'].includes(s.phase) || !r || !Number.isInteger(index) || index < 0)
      return '当前没有该奖励';
    if (r.kind === 'resonance') return this.chooseResonance(r.resonances[index]);
    const key = r.buffs[index];
    if (!key || s.run.buffs[key] >= 3) return '无效祝福';
    s.run.buffs[key]++;
    this.recalculate();
    this.chronicle('祭坛赐福', `${BUFFS[key].name}：${BUFFS[key].description}`, 'growth');
    s.run.rewards.shift();
    s.phase = s.run.rewards.length ? 'reward' : 'camp';
    s.revision++;
    return null;
  }
  skipReward() {
    const s = this.state;
    if (s.phase !== 'reward' || s.run.rewards[0]?.kind !== 'buff') return false;
    s.run.rewards.shift();
    s.phase = 'camp';
    s.revision++;
    return true;
  }
  chooseEvent(action: string): string | null {
    const s = this.state,
      e = this.currentEvent();
    if (s.phase !== 'event' || !e || e.completed) return '事件已结束';
    if (e.kind === 'dig') {
      if (action === 'dig-finish') {
        const count = s.run.dig!.claimed.length;
        this.chronicle('挖宝结束', `挖出 ${count} 件装备。`, 'loot');
        this.resolved();
        return null;
      }
      if (/^dig-\d+$/.test(action)) return this.digCell(Number(action.slice(4)));
      return '请选择挖掘位置';
    }
    if (e.kind === 'graduation') {
      if (!['graduate', 'extreme'].includes(action)) return '请选择结业或挑战极限';
      s.run.extreme = action === 'extreme';
      this.chronicle(
        s.run.extreme ? '挑战极限' : '正常结业',
        s.run.extreme ? '勇者选择继续，迎战更强的魔物。' : '勇者选择带着现有修为返回公会。',
        'growth',
      );
      this.resolved();
      return null;
    }
    if (e.kind === 'mentor') {
      if (action !== 'learn') return '接受导师传授';
      const k = (['attack', 'hp', 'defense', 'speed'] as const)[Math.floor(this.random() * 4)],
        value = { attack: 0.08, hp: 24, defense: 3, speed: 2 }[k];
      s.run.eventGrowth[k] += value;
      this.recalculate();
      this.chronicle(
        '导师传授',
        `${{ attack: '伤害', hp: '生命上限', defense: '防御', speed: '速度' }[k]} +${k === 'attack' ? value * 100 + '%' : value}。`,
        'growth',
      );
      this.resolved();
      return null;
    }
    if (e.kind === 'ending') {
      if (action !== 'finish') return '整理最终行囊后确认';
      if (
        validateLayout(s.inventory, s.draft, openBagCells(s.run.kills)) ||
        !this.packAnalysis(true).hasWeapon
      )
        return '最终背包至少装备一件武器';
      this.resolved();
      return null;
    }
    if (e.kind === 'choice') {
      if (action === 'skip') {
        this.chronicle('继续前行', '勇者选择离开，不承担额外风险。');
        this.resolved();
        return null;
      }
      if (e.variant === 2) {
        if (action === 'heal') {
          this.chronicle(
            '饮用泉水',
            `恢复 ${Math.round(this.heal(s.player.maxHp * 0.3))} 生命。`,
            'rest',
          );
        } else if (action === 'vigor') {
          s.run.eventGrowth.hp += 18;
          this.recalculate();
          this.chronicle('强健体魄', '生命上限 +18。', 'growth');
        } else return '请选择泉水效果';
      } else {
        if (action !== 'risk') return '请选择接受代价或离开';
        const cost = Math.ceil(s.player.hp * 0.15);
        if (s.player.hp <= cost) return '生命不足以承担代价';
        s.player.hp -= cost;
        this.chronicle('承担代价', `失去 ${cost} 当前生命。`, 'danger');
        if (e.variant === 1) this.grantLoot('取出遗物', this.lootLevel());
        else {
          if (e.variant === 4) {
            const k = (['attack', 'hp', 'defense', 'speed'] as const)[
                Math.floor(this.random() * 4)
              ],
              value = { attack: 0.05, hp: 16, defense: 1, speed: 1 }[k];
            s.run.eventGrowth[k] += value;
            this.chronicle(
              '占卜馈赠',
              `${{ attack: '伤害', hp: '生命上限', defense: '防御', speed: '速度' }[k]} +${k === 'attack' ? value * 100 + '%' : value}。`,
              'growth',
            );
          } else {
            if (e.variant === 3) s.run.eventGrowth.defense += 2;
            else s.run.eventGrowth.attack += 0.08;
            this.chronicle('符文馈赠', e.variant === 3 ? '防御 +2。' : '伤害 +8%。', 'growth');
          }
          this.recalculate();
        }
      }
      this.resolved();
      return null;
    }
    if (['elite', 'boss'].includes(e.kind) && /^trial-[012]$/.test(action))
      return this.chooseTrial(Number(action.slice(-1)) as TrialTier);
    if (
      (e.kind === 'treasure' && action === 'open') ||
      (e.kind === 'supply' && action === 'take')
    ) {
      this.grantLoot(e.kind === 'treasure' ? '开启遗物宝箱' : '获得旅人补给');
      this.resolved();
      return null;
    }
    if (e.kind === 'rest') {
      if (action === 'heal') {
        const n = this.heal(s.player.maxHp * 0.35);
        this.log(`月泉恢复 ${Math.round(n)} 生命`, 'reward');
        this.chronicle('饮下月泉', `恢复 ${Math.round(n)} 生命。`, 'rest');
      } else if (action === 'vigor') {
        if (s.run.buffs.vitality >= 3) return '生命祝福已达上限';
        const before = s.player.maxHp;
        s.run.buffs.vitality++;
        this.recalculate();
        this.chronicle('凝聚泉华', `生命上限 +${Math.round(s.player.maxHp - before)}。`, 'growth');
      } else if (action === 'points') {
        s.run.points += 2;
        this.chronicle('收集泉石', '获得 2 点。', 'loot');
      } else return '请选择月泉的馈赠';
      this.resolved();
      return null;
    }
    if (e.kind === 'chance') {
      if (action === 'skip') {
        this.chronicle('继续前行', '勇者离开了遗迹。');
        this.resolved();
        return null;
      }
      if (e.variant === 0 && action === 'spin') {
        const roll = this.random();
        if (roll < 0.5) {
          this.grantLoot('轮盘馈赠', 2);
        } else if (roll < 0.8) {
          s.run.points += 2;
          this.chronicle('轮盘馈赠', '获得 2 点。', 'loot');
        } else if (roll < 0.95) {
          const n = this.heal(s.player.maxHp * 0.2);
          this.chronicle('轮盘馈赠', `恢复 ${Math.round(n)} 生命。`, 'rest');
        } else {
          const before = s.player.hp;
          s.player.hp = Math.max(1, s.player.hp - s.player.maxHp * 0.1);
          this.chronicle('轮盘反噬', `失去 ${Math.round(before - s.player.hp)} 生命。`, 'danger');
        }
        this.resolved();
        return null;
      }
      if (e.variant === 1 && action === 'sacrifice') {
        const cost = Math.ceil(s.player.maxHp * 0.15);
        if (s.player.hp <= cost) return '生命不足以支付祭坛代价';
        s.player.hp -= cost;
        this.chronicle('鲜血献祭', `消耗 ${cost} 生命，获得一次基础赐福。`, 'danger');
        this.resolved([this.buffReward()]);
        return null;
      }
    }
    return '无效事件选项';
  }

  private prepareDig() {
    const s = this.state,
      open = new Set(Array.from({ length: 16 }, (_, n) => `${n % 4},${Math.floor(n / 4)}`));
    let equipment: Equipment[] = [],
      placements: GameState['placements'] | null = null;
    const fit = (
      items: Equipment[],
      n = 0,
      layout: GameState['placements'] = [],
    ): GameState['placements'] | null => {
      if (n === items.length) return layout;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const next = [...layout, { id: items[n].id, x, y, rotation: 0 }];
          if (!validateLayout(items, next, open)) {
            const found = fit(items, n + 1, next);
            if (found) return found;
          }
        }
      return null;
    };
    for (let attempt = 0; attempt < 20 && !placements; attempt++) {
      equipment = Array.from({ length: 3 }, () => this.lootItem());
      placements = fit(equipment);
    }
    if (!placements) {
      equipment = Array.from({ length: 3 }, () =>
        this.makeItem(s.run.profession + '_gem', this.lootLevel()),
      );
      placements = fit(equipment)!;
    }
    s.run.dig = { shovels: 12, revealed: [], equipment, placements, claimed: [] };
  }
  digCell(index: number): string | null {
    const s = this.state,
      d = s.run.dig;
    if (
      s.phase !== 'event' ||
      this.currentEvent()?.kind !== 'dig' ||
      !d ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= 16 ||
      d.revealed.includes(index) ||
      d.shovels <= 0
    )
      return '此处无法继续挖掘';
    d.revealed.push(index);
    d.shovels--;
    for (const p of d.placements) {
      const item = d.equipment.find((i) => i.id === p.id)!;
      if (
        !d.claimed.includes(item.id) &&
        occupiedCells(item, p).every(([x, y]) => d.revealed.includes(y * 4 + x))
      ) {
        d.claimed.push(item.id);
        s.inventory.push(structuredClone(item));
        s.run.lastLootIds.push(item.id);
        s.run.highestItem = Math.max(s.run.highestItem, item.level);
        this.chronicle('挖出遗物', `获得 ${item.name} Lv.${item.level}。`, 'loot');
      }
    }
    s.revision++;
    return null;
  }
  private removeItem(id: string) {
    const s = this.state;
    s.inventory = s.inventory.filter((i) => i.id !== id);
    s.draft = s.draft.filter((p) => p.id !== id);
    s.placements = s.placements.filter((p) => p.id !== id);
    s.run.lastLootIds = s.run.lastLootIds.filter((i) => i !== id);
    delete s.combat.timers[id];
    delete s.combat.heals[id];
    delete s.combat.hits[id];
    s.revision++;
    this.recalculate();
  }
  recycleItem(id: string) {
    const s = this.state,
      item = s.inventory.find((i) => i.id === id);
    if (
      !this.editable() ||
      !item ||
      (item.slot === 'weapon' && s.inventory.filter((i) => i.slot === 'weapon').length === 1)
    )
      return false;
    s.run.points++;
    this.removeItem(id);
    return true;
  }
  redeemEquipment(): string | null {
    const s = this.state;
    if (!this.editable()) return '战斗中无法兑换';
    if (s.run.points < 6) return '需要 6 点弃用点数';
    s.run.points -= 6;
    const pool = availableItems(s.run.profession),
      item = this.makeItem(pool[Math.floor(this.random() * pool.length)].id, this.lootLevel());
    s.inventory.push(item);
    s.run.highestItem = Math.max(s.run.highestItem, item.level);
    s.revision++;
    this.log(`6 点兑换：${item.name} Lv.${item.level}`, 'reward');
    return null;
  }
  previewMove(id: string, x: number, y: number, rotation = 0, cell?: [number, number]) {
    const item = this.findItem(id),
      hint =
        cell &&
        cell.every(Number.isInteger) &&
        cell[0] >= 0 &&
        cell[0] < 7 &&
        cell[1] >= 0 &&
        cell[1] < 6
          ? this.state.draft.find(
              (p) =>
                p.id !== id &&
                occupiedCells(this.findItem(p.id)!, p).some(
                  ([cx, cy]) => cx === cell[0] && cy === cell[1],
                ),
            )?.id
          : undefined;
    return item
      ? planMove(
          [...this.state.inventory.filter((i) => i.id !== id), item],
          this.state.draft,
          { id, x, y, rotation },
          hint,
          openBagCells(this.state.run.kills),
        )
      : { kind: 'invalid' as const, error: '物品已不存在', layout: this.state.draft, ejected: [] };
  }
  moveItem(id: string, x: number, y: number, rotation = 0, cell?: [number, number]): string | null {
    if (!this.editable()) return '战斗中不能调整背包';
    const plan = this.previewMove(id, x, y, rotation, cell);
    if (plan.kind === 'invalid') return plan.error!;
    const s = this.state;
    if (!s.inventory.some((i) => i.id === id)) {
      if (!s.run.starterOffers.some((i) => i.id === id)) return '物品不可拾取';
      if (!this.takeStarter(id)) return '物品不可拾取';
    }
    if (plan.kind === 'merge') return this.mergeItems(id, plan.target!);
    s.draft = plan.layout;
    s.revision++;
    return null;
  }
  moveToUpper(id: string) {
    if (!this.editable() || !this.state.draft.some((p) => p.id === id)) return false;
    this.state.draft = this.state.draft.filter((p) => p.id !== id);
    this.state.revision++;
    return true;
  }
  mergePartner(id: string) {
    const i = this.findItem(id);
    return i && i.level < 5
      ? ([...this.state.inventory, ...this.state.run.starterOffers].find(
          (o) =>
            o.id !== id &&
            o.templateId === i.templateId &&
            o.profession === i.profession &&
            o.level === i.level,
        ) ?? null)
      : null;
  }
  private setItemLevel(i: Equipment, level: number) {
    i.level = level;
    i.quality = (['white', 'green', 'blue', 'purple', 'orange'] as const)[level - 1];
    Object.assign(i, itemStats(i.templateId, level, i.profession));
  }
  canMerge(sourceId: string, targetId: string) {
    const a = this.findItem(sourceId),
      b = this.findItem(targetId);
    return (
      !!a &&
      !!b &&
      a.id !== b.id &&
      a.templateId === b.templateId &&
      a.profession === b.profession &&
      a.level === b.level &&
      b.level < 5
    );
  }
  mergeItems(sourceId: string, targetId: string): string | null {
    const s = this.state,
      source = this.findItem(sourceId),
      target = this.findItem(targetId);
    if (!this.editable()) return '战斗或历程播放中不能合并';
    if (!source || !target || sourceId === targetId) return '请选择两件不同物品';
    if (
      source.templateId !== target.templateId ||
      source.profession !== target.profession ||
      source.level !== target.level
    )
      return '只有同职业、同类别、同等级物品可以合并';
    if (target.level >= 5) return '装备已达到 5 级';
    if (!s.inventory.some((i) => i.id === sourceId)) this.takeStarter(sourceId);
    if (!s.inventory.some((i) => i.id === targetId)) this.takeStarter(targetId);
    this.setItemLevel(target, target.level + 1);
    this.removeItem(sourceId);
    s.run.highestItem = Math.max(s.run.highestItem, target.level);
    s.revision++;
    this.recalculate();
    return null;
  }

  private heal(amount: number) {
    const s = this.state,
      actual = Math.max(0, Math.min(amount, s.player.maxHp - s.player.hp));
    s.player.hp += actual;
    return actual;
  }
  private signalFeedback(
    id: string,
    kind: 'damage' | 'healing' | 'shield' | 'resource' | 'hurt' | 'blocked' | 'trigger',
    amount: number,
  ) {
    if (amount <= 0) return;
    this.feedback.push({ serial: ++this.feedbackSerial, id, kind, amount });
    if (this.feedback.length > 16) this.feedback.shift();
  }
  private contribute(id: string, key: 'damage' | 'healing' | 'shield', amount: number) {
    const rows = this.state.combat.contributions,
      row: Contribution = (rows[id] ??= {
        name: this.findItem(id)?.name ?? '流派联动',
        damage: 0,
        healing: 0,
        shield: 0,
        triggers: 0,
      });
    row[key] += amount;
    row.triggers++;
    if (key !== 'shield') this.signalFeedback(id, key, amount);
  }
  private damageEnemy(amount: number, source: string, splash = false) {
    const s = this.state,
      e = s.enemy;
    if (!e) return 0;
    let dealt = 0;
    if (s.combat.minions > 0) {
      const hit = Math.min(amount, s.combat.minionHp);
      s.combat.minionHp -= hit;
      dealt = hit;
      s.combat.minions = Math.ceil(s.combat.minionHp / (e.maxHp * 0.025));
      if (splash) {
        const hit = Math.min(amount * 0.65, e.hp);
        e.hp -= hit;
        dealt += hit;
      }
    } else {
      dealt = Math.min(amount, e.hp);
      e.hp -= dealt;
    }
    this.contribute(source, 'damage', dealt);
    return dealt;
  }
  private hurtPlayer(amount: number) {
    const s = this.state,
      a = this.packAnalysis(),
      c = s.combat;
    amount *= 1 - [0, 0.08, 0.15, 0.22][a.tiers.shadow_master];
    const shieldBefore = s.player.shield,
      hpBefore = s.player.hp,
      absorbed = Math.min(shieldBefore, amount);
    s.player.shield -= absorbed;
    s.player.hp = Math.max(0, s.player.hp - (amount - absorbed));
    this.signalFeedback('hero', 'blocked', absorbed);
    this.signalFeedback('hero', 'hurt', hpBefore - s.player.hp);
    const shields = a.active.filter((i) => definition(i).role === 'shield'),
      source = shields[0] ?? a.active.find((i) => definition(i).role === 'weapon');
    for (const item of shields)
      if (absorbed) this.contribute(item.id, 'shield', absorbed / shields.length);
    if (
      source &&
      s.player.hp > 0 &&
      a.tiers.iron_guard > 0 &&
      c.counters.counterRound !== c.round
    ) {
      c.counters.counterRound = c.round;
      this.damageEnemy(
        amount *
          [0, 0.2, 0.4, 0.7][a.tiers.iron_guard] *
          (1 + [0, 0.1, 0.2, 0.35][a.tiers.fortress]),
        source.id,
      );
    }
    if (shieldBefore > 0 && s.player.shield === 0 && s.player.hp > 0) {
      if (a.tiers.fortress && !c.counters.fortress) {
        c.counters.fortress = 1;
        s.player.shield = [0, 10, 20, 30][a.tiers.fortress];
        this.signalFeedback(source!.id, 'shield', s.player.shield);
      }
      for (const item of shields) {
        const tier = itemResonanceTiers(item, a.tiers).master,
          key = 'rescue-' + item.id;
        if (tier && (c.counters[key] ?? 0) < tier) {
          c.counters[key] = (c.counters[key] ?? 0) + 1;
          this.contribute(
            item.id,
            'healing',
            this.heal(s.player.maxHp * [0, 0.02, 0.03, 0.04][tier]),
          );
        }
      }
    }
  }

  private effect(kind: 'poison' | 'burn' | 'chill', damage: number, id: string) {
    const e = this.state.enemy;
    if (!e) return;
    const old = e.effects.find((x) => x.kind === kind);
    if (old) {
      if (damage >= old.damage) {
        old.damage = damage;
        old.sourceId = id;
      }
      old.remaining = 3;
    } else e.effects.push({ kind, damage, remaining: 3, timer: 0, sourceId: id });
  }
  playerSpeed() {
    const s = this.state;
    return (
      heroAttributes(s.run.trainee, s.run.profession).speed +
      s.run.buffs.tempo * 2 +
      s.run.eventGrowth.speed
    );
  }
  enemySpeed() {
    const e = this.state.enemy;
    return e
      ? +(e.speed * (1 - (e.effects.find((x) => x.kind === 'chill')?.damage ?? 0))).toFixed(1)
      : 0;
  }
  nextActor(): Actor {
    const c = this.state.combat;
    return c.order[c.actionIndex] ?? (this.playerSpeed() >= this.enemySpeed() ? 'hero' : 'enemy');
  }
  private beginRound() {
    const s = this.state,
      c = s.combat;
    c.round++;
    s.run.rounds++;
    c.order = this.playerSpeed() >= this.enemySpeed() ? ['hero', 'enemy'] : ['enemy', 'hero'];
    c.actionIndex = 0;
  }
  private heroTurn() {
    const s = this.state,
      e = s.enemy;
    if (!e) return;
    const a = this.packAnalysis(),
      c = s.combat,
      b = s.run.buffs;
    c.stamina = Math.min(20, c.stamina + 3 + a.neutralRegen);
    c.mana = Math.min(12, c.mana + 2 + a.neutralRegen);
    // Support equipment acts first; weapons then act in stable backpack order.
    const items = [...a.active].sort(
      (x, y) => Number(definition(x).role === 'weapon') - Number(definition(y).role === 'weapon'),
    );
    for (const item of items) {
      const d = definition(item),
        bonus = a.bonuses[item.id],
        scale = LEVEL_POWER[item.level],
        cooldown = d.cooldown;
      if (!cooldown) continue;
      c.timers[item.id] = Math.max(0, (c.timers[item.id] ?? 0) - 1);
      if (c.timers[item.id] > 0) continue;
      if (d.resource && c[d.resource] + 1e-8 < d.cost) continue;
      if (d.role === 'mana' && !bonus.mana) continue;
      if (d.role === 'heal' && (c.heals[item.id] ?? 0) >= 2) continue;
      // A full health herb keeps its charge until there is damage to restore.
      if (d.role === 'heal' && s.player.hp >= s.player.maxHp) continue;
      this.signalFeedback(item.id, 'trigger', 1);
      c.timers[item.id] = cooldown;
      if (d.resource) c[d.resource] = Math.max(0, c[d.resource] - d.cost);
      if (d.role === 'weapon') {
        const t = a.tiers;
        c.hits[item.id] = (c.hits[item.id] ?? 0) + 1;
        const strike = weaponEffect(
            item,
            t,
            c.hits[item.id],
            {
              burn: e.effects.some((x) => x.kind === 'burn'),
              chill: e.effects.some((x) => x.kind === 'chill'),
              poison: e.effects.some((x) => x.kind === 'poison'),
            },
            item.attack * bonus.power * (1 + b.power * 0.12),
            e.defense,
          ),
          power = strike.power;
        if (c.hits[item.id] % 3 === 0 && item.branch === 'pole' && t.spear_storm) {
          const old = c.stamina;
          c.stamina = Math.min(20, c.stamina + t.spear_storm);
          this.signalFeedback(item.id, 'resource', c.stamina - old);
        }
        if (item.profession === 'mage' && t.archmage) {
          c.counters.spells = (c.counters.spells ?? 0) + 1;
          if (c.counters.spells % 3 === 0) {
            c.mana = Math.min(12, c.mana + t.archmage);
            s.player.shield = Math.min(
              s.player.maxHp * 0.5,
              s.player.shield + [0, 4, 8, 12][t.archmage],
            );
          }
        }
        const actual = this.damageEnemy(strike.damage, item.id, strike.splash);
        if (item.branch === 'assassin' && t.venom)
          this.effect('poison', power * [0, 0.1, 0.18, 0.28][t.venom] * bonus.potency, item.id);
        if (item.branch === 'flame' && t.ignite)
          this.effect('burn', power * [0, 0.1, 0.18, 0.28][t.ignite] * bonus.potency, item.id);
        if (item.branch === 'ice' && t.frost)
          this.effect('chill', [0, 0.1, 0.2, 0.3][t.frost], item.id);
        const drain =
          item.branch === 'pole'
            ? [0, 0.02, 0.04, 0.06][t.second_wind]
            : item.branch === 'archer'
              ? [0, 0.03, 0.06, 0.1][t.leech]
              : 0;
        if (drain) this.contribute(item.id, 'healing', this.heal(actual * drain));
        const shield = item.branch === 'blade' ? [0, 2, 4, 6][t.iron_guard] : 0;
        if (shield) {
          const old = s.player.shield;
          s.player.shield = Math.min(s.player.maxHp * 0.5, old + shield * bonus.potency);
          this.signalFeedback(item.id, 'shield', s.player.shield - old);
        }
        if (item.branch === 'ice' && t.mana_flow) {
          const old = c.mana;
          c.mana = Math.min(12, c.mana + t.mana_flow);
          this.signalFeedback(item.id, 'resource', c.mana - old);
        }
      } else if (d.role === 'shield') {
        const gained = (12 * scale + item.defense) * shieldMultiplier(item, a.tiers),
          old = s.player.shield;
        s.player.shield = Math.min(s.player.maxHp * 0.5, s.player.shield + gained);
        this.signalFeedback(item.id, 'shield', s.player.shield - old);
      } else if (d.role === 'heal') {
        c.heals[item.id] = (c.heals[item.id] ?? 0) + 1;
        this.contribute(item.id, 'healing', this.heal(8 * scale));
      } else if (d.role === 'stamina') {
        const old = c.stamina;
        c.stamina = Math.min(20, c.stamina + 6 * scale);
        this.signalFeedback(item.id, 'resource', c.stamina - old);
      } else if (d.role === 'mana') {
        const old = c.mana;
        c.mana = Math.min(12, c.mana + 7 * scale);
        this.signalFeedback(item.id, 'resource', c.mana - old);
      }
      if (d.role !== 'weapon') {
        const tier = itemResonanceTiers(item, a.tiers).advanced,
          key = 'resource-' + item.id;
        if (tier && c.counters[key] !== c.round) {
          c.counters[key] = c.round;
          const resource = item.profession === 'mage' ? 'mana' : 'stamina',
            before = c[resource];
          c[resource] = Math.min(resource === 'mana' ? 12 : 20, before + tier);
          this.signalFeedback(item.id, 'resource', c[resource] - before);
        }
      }
      if (e.hp <= 0) {
        this.defeatEnemy();
        return;
      }
    }
  }
  private enemyTurn() {
    const s = this.state,
      e = s.enemy,
      c = s.combat;
    if (!e) return;
    for (const effect of e.effects) {
      if (effect.kind !== 'chill') {
        const actual = Math.min(e.hp, effect.damage);
        e.hp -= actual;
        this.contribute(effect.sourceId, 'damage', actual);
      }
      effect.remaining--;
    }
    e.effects = e.effects.filter((x) => x.remaining > 0);
    if (e.hp <= 0) {
      this.defeatEnemy();
      return;
    }
    const enrage = 1 + Math.max(0, c.round - 30) / 15;
    let amount =
      ((e.attack * 60) / (60 + s.player.defense)) * enrage + (c.minions > 0 ? c.minions * 1.2 : 0);
    if (e.isBoss) {
      c.bossTimer++;
      if (e.species === 18 && c.bossTimer >= 4) {
        c.bossTimer = 0;
        amount *= 3;
        this.log('白骨王释放蓄力重击！', 'battle');
      } else if (e.species === 19 && c.bossTimer >= 5) {
        c.bossTimer = 0;
        if (c.minions < 3) {
          c.minions++;
          c.minionHp += e.maxHp * 0.025;
        }
        this.log(`蛛后召唤幼蛛，当前 ${c.minions} 只`, 'battle');
      }
    }
    this.hurtPlayer(amount);
  }
  private ended() {
    const s = this.state;
    if (s.player.hp <= 0) {
      this.finishCombat(false, '生命耗尽');
      this.chronicle('探险终止', '勇者力竭，带着已有的成长返回公会。', 'danger');
      this.finish('death', '生命耗尽');
      return true;
    }
    if (s.enemy && s.enemy.hp <= 0) {
      this.defeatEnemy();
      return true;
    }
    return s.phase !== 'combat';
  }
  advanceTurn() {
    const s = this.state;
    if (s.phase !== 'combat' || !s.enemy) return false;
    if (this.ended()) return false;
    const c = s.combat;
    if (c.actionIndex === 2) this.beginRound();
    const actor = c.order[c.actionIndex];
    c.lastActor = actor;
    c.actionIndex++;
    this.log(`第 ${c.round} 回合 · ${actor === 'hero' ? '勇者' : '敌人'}行动`, 'battle');
    if (actor === 'hero') this.heroTurn();
    else this.enemyTurn();
    if (s.phase === 'combat') this.ended();
    s.revision++;
    return true;
  }
  update(delta: number) {
    const s = this.state;
    if (!Number.isFinite(delta) || delta <= 0) return;
    if (s.phase === 'journey') {
      const duration = storyDuration(this.currentEvent()!);
      s.run.storyElapsed = Math.min(duration, s.run.storyElapsed + delta);
      if (s.run.storyElapsed >= duration) this.continueJourney();
      return;
    }
    if (s.phase !== 'combat' || !s.isRunning) return;
    if (this.ended()) return;
    let remaining = Math.min(delta * (s.skipCombat ? 30 : 1), 60);
    while (remaining > 1e-8 && s.phase === 'combat') {
      const c = s.combat,
        dt = Math.min(remaining, ACTION_SECONDS - c.elapsed);
      c.seconds += dt;
      s.run.seconds += dt;
      c.elapsed += dt;
      remaining -= dt;
      if (c.elapsed + 1e-8 >= ACTION_SECONDS) {
        c.elapsed = 0;
        this.advanceTurn();
      }
    }
  }
  private finishCombat(won: boolean, reason: string) {
    const s = this.state;
    s.lastReport = {
      event: s.run.index + 1,
      seconds: s.combat.seconds,
      rounds: s.combat.round,
      won,
      reason,
      items: structuredClone(s.combat.contributions),
    };
  }
  private defeatEnemy() {
    const s = this.state,
      e = s.enemy;
    if (!e) return;
    this.finishCombat(true, '战斗胜利');
    this.chronicle(
      '战斗胜利',
      `${s.run.trainee?.name}击败了${e.name}，历经 ${s.combat.round} 回合。`,
      'story',
    );
    s.run.kills++;
    s.meta.totalKills++;
    this.grantLoot(e.isBoss ? '最终战利品' : e.isElite ? '精英战利品' : '战利品');
    this.resolved();
  }
  heroPreview(outcome: Outcome = 'win'): HeroRecord | null {
    const s = this.state,
      trainee = s.run.trainee;
    if (!trainee) return null;
    const a = this.packAnalysis(true),
      p = heroAttributes(trainee, s.run.profession),
      completed = this.completed(),
      growth =
        60 +
        completed * 14 +
        s.run.trials
          .slice(0, s.run.stages)
          .reduce<number>((n, t) => n + Math.round(TRIALS[t ?? 0].growth * 100), 0) +
        s.run.chapter * 8,
      build = Math.round(
        a.dps * a.efficiency * 2 +
          a.active.reduce((n, i) => n + i.hp * 0.15 + i.defense * 4, 0) +
          a.sustain * 3 +
          a.links.length * 10 +
          s.run.resonances.reduce((n, k) => n + a.tiers[k] * 25, 0) +
          this.playerSpeed() * 2,
      ),
      performance = (outcome === 'win' ? (s.run.extreme ? 240 : 120) : 0) + s.run.kills * 4,
      power = growth + build + performance;
    let rating: Rating =
      power >= 3000 ? 'S' : power >= 1900 ? 'A' : power >= 1100 ? 'B' : power >= 450 ? 'C' : 'D';
    if (outcome !== 'win' && ['A', 'S'].includes(rating)) rating = 'B';
    return {
      ...structuredClone(trainee),
      chapter: s.run.chapter,
      outcome,
      completed,
      stages: s.run.stages,
      power,
      rating,
      resonances: [...s.run.resonances],
      resonanceTiers: Object.fromEntries(s.run.resonances.map((k) => [k, a.tiers[k]])),
      stats: {
        attack: Math.round(a.dps * a.efficiency),
        hp: Math.round(
          (p.hp + s.run.growth.hp + s.run.eventGrowth.hp + a.active.reduce((n, i) => n + i.hp, 0)) *
            (1 + s.run.buffs.vitality * 0.12),
        ),
        defense: +(
          p.defense +
          s.run.growth.defense +
          s.run.eventGrowth.defense +
          a.active.reduce((n, i) => n + i.defense, 0) +
          s.run.buffs.defense * 3
        ).toFixed(1),
        speed: this.playerSpeed(),
        sustain: +a.sustain.toFixed(1),
      },
      score: { growth, build, performance },
      loadout: {
        equipment: structuredClone(a.active),
        placements: structuredClone(s.draft),
        capacity: bagCapacity(s.run.kills),
      },
      trials: [...s.run.trials],
      graduatedAt: Math.max(trainee.createdAt, this.clock()),
    };
  }
  retreat() {
    if (!['opening', 'initial', 'camp', 'journey', 'event', 'reward'].includes(this.state.phase))
      return false;
    this.finish(
      this.currentEvent()?.completed && safelyGraduated(this.state) ? 'win' : 'retreat',
      '提前结束培养',
    );
    return true;
  }
  private finish(outcome: Outcome, reason: string) {
    const s = this.state;
    if (['summary', 'home', 'chapter', 'configure'].includes(s.phase)) return;
    const hero = this.heroPreview(outcome);
    if (!hero) return;
    const gold = outcome === 'win' ? (100 + s.run.chapter * 15) * (s.run.extreme ? 2 : 1) : 0;
    s.meta.heroes.push(hero);
    s.meta.gold += gold;
    s.run.summary = {
      outcome,
      chapter: s.run.chapter,
      profession: s.run.profession,
      completed: this.completed(),
      gold,
      kills: s.run.kills,
      seconds: s.run.seconds,
      rounds: s.run.rounds,
      highestItem: s.run.highestItem,
      links: this.packAnalysis(true).links.length,
      reason,
      heroId: hero.id,
    };
    if (outcome === 'win') {
      s.meta.wins++;
      s.meta.highestChapter = Math.min(20, Math.max(s.meta.highestChapter, s.run.chapter + 1));
    }
    s.awakening = null;
    s.inventory = [];
    s.placements = [];
    s.draft = [];
    s.enemy = null;
    s.run.autoExplore = false;
    s.run.dig = null;
    s.run.points = 0;
    s.run.buffs = emptyBuffs();
    s.run.rewards = [];
    s.run.resonances = [];
    s.run.starterOffers = [];
    s.run.lastLootIds = [];
    s.combat = emptyCombat();
    s.player.shield = 0;
    s.phase = 'summary';
    s.revision++;
    this.log(hero.name + '加入公会 · ' + hero.rating + '级 · 战力 ' + hero.power, 'reward');
  }
  offline() {
    return '地牢在离线时暂停，招募体力按真实时间恢复。';
  }
}

export const safelyGraduated = (s: GameState) =>
  s.run.index === ENDING_NODE || (s.run.index === GRADUATION_NODE && !s.run.extreme);
