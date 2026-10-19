import {
  analysis,
  availableItems,
  BUFF_KEYS,
  BUFFS,
  buildSources,
  definition,
  finalAttributes,
  nonGuildAttributes,
  itemStats,
  occupiedCells,
  planMove,
  PROFESSION_KEYS,
  PROFESSIONS,
  RESONANCE_KEYS,
  RESONANCES,
  resonanceScore,
  runBagCapacity,
  runBagCells,
  validateLayout,
} from './backpack';
import { BattleEngine, battleRuntime, fighter, fighterSpeed, isEnemySource } from './combat';
import { generateEnemy } from './enemies';
import {
  ATTRIBUTE_KEYS,
  allocationLimit,
  emptyAllocation,
  heroAttributes,
  pointsSpent,
  rollTalents,
} from './hero';
import {
  chapterRoute,
  legacyChapterRoute,
  eventStory,
  runRoute,
  stageGrowth,
  trialGain,
  TRIALS,
} from './journey';
import {
  SUPPLY_SECONDS,
  WHEEL_SECONDS,
  SUPPLY_GRADES,
  WHEEL_SECTORS,
  supplyThreshold,
  supplyChance,
  lifeAmount,
} from './event-rules';
import { recruitAppearance } from './character-parts';
import {
  emptyTomes,
  guildConditions,
  heroRating,
  realmName,
  startingRealm,
  tome,
  tomeBranch,
  TOMES,
  upgradeCost,
} from './progression';
import { PROFESSION_CATEGORIES, equipmentFamily } from './categories';
import { resonanceAvailable } from './resonances';
import { CHAPTER_CAP, GUILD_NODES, guildBenefits, medalReward } from './guild';
import { normalizeActiveFootprints } from './footprints';
import { COMBAT_PACING } from './combat-pacing';
import { rollAptitude } from './aptitude';
import type {
  Actor,
  AdventureEvent,
  Attribute,
  BuffKey,
  Contribution,
  Equipment,
  EventKind,
  GameState,
  HeroRecord,
  JourneyEntry,
  Outcome,
  Profession,
  ResonanceKey,
  Reward,
  TrialTier,
} from './types';
export const ENERGY_CAP = 60,
  RECRUIT_COST = 5,
  ENERGY_INTERVAL = 5 * 60 * 1000;
export const TARGET_RECRUIT_COST = 20,
  ACTION_SECONDS = 0.7,
  STORY_SECONDS = 3.2;
export function storyDuration(event: AdventureEvent) {
  return ['boss', 'elite', 'promotion', 'graduation', 'ending'].includes(event.kind)
    ? STORY_SECONDS
    : Math.min(2.5, Math.max(1.2, eventStory(event.kind, event.variant).length * 0.065));
}
export const EVENT_NAMES: Record<EventKind, string> = {
  battle: '遭遇战',
  elite: '晋阶试炼',
  boss: '守关试炼',
  treasure: '遗物宝箱',
  supply: '旅人补给',
  rest: '月泉营地',
  chance: '命运事件',
  choice: '旅途抉择',
  dig: '掘地挖宝',
  graduation: '结业抉择',
  promotion: '境界晋升',
  mentor: '导师传授',
  ending: '极限毕业',
};
const emptyBuffs = () =>
  Object.fromEntries(BUFF_KEYS.map((k) => [k, 0])) as Record<BuffKey, number>;
const emptyCombat = (): GameState['combat'] => ({
  skip: false,
  stamina: 0,
  runtime: null,
  mana: 0,
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
    version: 15,
    layoutRevision: 1,
    rulesRevision: 2,
    footprintRevision: 1,
    phase: 'home',
    meta: {
      gold: 100,
      guildLevel: 1,
      medals: 0,
      guildPurchased: 0,
      guildHistory: { trained: 0, trials: 0, aRated: 0, sRated: 0 },
      staminaSpent: 0,
      tomes: emptyTomes(),
      tomeGifts: [],
      pendingPages: [],
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
      pendingPromotion: false,
      resonanceAtNode: false,
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
      realm: 0,
      peakStrength: 0,
      encounter: null,
      enemyHistory: [],
      boundTome: null,
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
export function generateEvents(
  random = Math.random,
  chapter = 4,
  legacy = false,
): AdventureEvent[] {
  const events: AdventureEvent[] = (
    legacy ? legacyChapterRoute(chapter) : chapterRoute(chapter)
  ).kinds.map((kind) => ({
    kind,
    completed: false,
    variant: Math.floor(random() * 5),
  }));
  events.forEach((e, n) => {
    if (e.kind === 'chance' && legacy) e.variant = Math.floor(random() * 2);
    if (e.kind === 'choice') e.variant = n % 5;
  });
  return events;
}

export class Game {
  feedback: {
    serial: number;
    id: string;
    kind:
      'damage' | 'healing' | 'shield' | 'resource' | 'hurt' | 'blocked' | 'trigger' | 'activation';
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
    if (!['home', 'chapter', 'configure', 'tome'].includes(s.phase)) return false;
    if (s.phase === 'home' && !s.run.trainee)
      s.run.chapter = Math.min(CHAPTER_CAP, s.meta.highestChapter);
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
      chapter > s.meta.highestChapter ||
      chapter > CHAPTER_CAP
    )
      return false;
    s.run.chapter = chapter;
    if (s.run.trainee) {
      s.run.trainee.realmStart = startingRealm(chapter);
      s.run.realm = startingRealm(chapter);
    }
    s.revision++;
    return true;
  }
  backHome() {
    if (!['chapter', 'configure', 'tome'].includes(this.state.phase)) return false;
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
    s.meta.staminaSpent += cost;
    s.run = createState(this.clock()).run;
    s.run.chapter = chapter;
    s.lastReport = null;
    s.combat = emptyCombat();
    const createdAt = this.clock(),
      appearance = recruitAppearance(`${s.meta.heroSerial + 1}|${createdAt}|${profession}`),
      names =
        appearance.gender === 'female'
          ? ['艾琳', '莉娅', '米拉', '薇拉', '希尔', '露娜']
          : ['罗兰', '凯恩', '洛克', '伊诺', '诺亚', '雷恩'];
    const aptitude = rollAptitude(this.random);
    s.run.trainee = {
      id: `hero-${++s.meta.heroSerial}`,
      name: names[Math.floor(this.random() * names.length)],
      createdAt,
      profession,
      recruitment: target ? 'targeted' : 'random',
      aptitude,
      talents: rollTalents(this.random, profession, aptitude),
      appearance,
      allocation: emptyAllocation(),
      realmStart: startingRealm(chapter),
      guildBonus: guildBenefits(s.meta.guildPurchased),
      attributePoints: 12 + guildBenefits(s.meta.guildPurchased).points,
      tomeId: null,
      tomeLevel: 0,
    };
    s.run.profession = profession;
    s.run.realm = s.run.trainee.realmStart ?? 0;
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
    if (delta > 0 && pointsSpent(t) >= allocationLimit(t)) return '属性点已用完';
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
    const trainee = this.state.run.trainee!;
    const count = allocationLimit(trainee);
    ATTRIBUTE_KEYS.forEach((key, index) => {
      trainee.allocation[key] = Math.floor(count / 4) + (index < count % 4 ? 1 : 0);
    });
    return true;
  }
  startRun(
    profession: Profession = this.state.run.profession,
    chapter = this.state.run.chapter,
  ): string | null {
    const old = this.state;
    if (!['configure', 'tome'].includes(old.phase) || !old.run.trainee)
      return '先消耗体力招募见习勇者';
    if (profession !== old.run.trainee.profession) return '职业在招募时确定，定向招募可指定职业';
    if (pointsSpent(old.run.trainee) !== allocationLimit(old.run.trainee))
      return `请分配全部 ${allocationLimit(old.run.trainee)} 点属性`;
    if (
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      chapter !== old.run.chapter ||
      chapter > old.meta.highestChapter ||
      chapter > CHAPTER_CAP
    )
      return '该地牢尚未解锁';
    if (old.phase !== 'tome') return '加点完成后请选择典籍';
    const book = old.run.trainee.tomeId ? tome(old.run.trainee.tomeId) : null;
    if (!book) return '请选择起始典籍';
    const owned = old.meta.tomes[book.id];
    if (!owned.level && old.meta.tomeGifts.includes(profession)) return '尚未收集这本典籍';
    const s = createState(this.clock());
    s.meta = structuredClone(old.meta);
    if (!owned.level) s.meta.tomes[book.id].level = 1;
    if (!s.meta.tomeGifts.includes(profession)) s.meta.tomeGifts.push(profession);
    s.meta.runs++;
    s.speed = old.speed;
    s.revision = old.revision + 1;
    s.run.trainee = structuredClone(old.run.trainee);
    s.run.profession = profession;
    s.run.chapter = chapter;
    s.run.routeRevision = 16;
    s.run.events = generateEvents(this.random, chapter);
    s.run.realm = s.run.trainee.realmStart ?? 0;
    s.run.boundTome = {
      id: s.run.trainee.tomeId!,
      level: s.meta.tomes[s.run.trainee.tomeId!].level,
    };
    s.run.trainee.tomeLevel = s.run.boundTome.level;
    const base = finalAttributes(s);
    s.player.hp = s.player.maxHp = base.hp;
    s.player.defense = base.defense;
    s.phase = 'journey';
    s.run.prologue = 'departure';
    this.state = s;
    this.feedback = [];
    this.log(
      `${s.run.trainee.name}成为见习${PROFESSIONS[profession].name}，前往第 ${chapter} 座地牢。`,
    );
    this.chronicle(
      '公会启程',
      `${s.run.trainee.name}离开公会，向第 ${chapter} 座地牢进发。公会为这次冒险准备了两批装备补给。`,
      'story',
      0,
    );
    return null;
  }
  private starterRoundItems(round: number) {
    const r = this.state.run;
    if (!r.starterPlan) {
      const own = availableItems(r.profession),
        weapon = own.filter((d) => d.slot === 'weapon' && d.shape === 'domino'),
        book = r.boundTome ? tome(r.boundTome.id) : null,
        directed = book
          ? availableItems(book.profession).filter((d) => d.branch === tomeBranch(book.id))
          : [];
      const pick = (pool: typeof own) => pool[Math.floor(this.random() * pool.length)].id;
      const plan = [pick(weapon)];
      // One or two own-class tome items; a foreign tome contributes at most one of six.
      const count = directed.length
        ? book!.profession !== r.profession
          ? 1
          : 1 + Math.floor(this.random() * 2)
        : 0;
      for (let n = 0; n < count; n++) plan.push(pick(directed));
      while (plan.length < 6) plan.push(pick(own));
      for (let n = plan.length - 1; n > 0; n--) {
        const j = Math.floor(this.random() * (n + 1));
        [plan[n], plan[j]] = [plan[j], plan[n]];
      }
      r.starterPlan = [plan.slice(0, 3), plan.slice(3)];
    }
    return r.starterPlan[round].map((id) => this.makeItem(id));
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
    if (validateLayout(s.inventory, s.draft, runBagCells(s)) || !this.packAnalysis(true).hasWeapon)
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
  resonanceFamilies() {
    return [
      ...new Set([
        ...PROFESSION_CATEGORIES[this.state.run.profession],
        ...this.state.inventory
          .filter((i) => this.state.draft.some((p) => p.id === i.id))
          .map(equipmentFamily),
      ]),
    ];
  }
  resonanceChoices(initial = false) {
    return RESONANCE_KEYS.filter((k) =>
      resonanceAvailable(
        k,
        this.state.run.profession,
        this.state.run.resonances,
        initial,
        this.resonanceFamilies(),
      ),
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
      !resonanceAvailable(key, s.run.profession, s.run.resonances, s.phase === 'initial', [
        'sword',
        'spear',
        'shield',
        'staff',
        'focus',
        'ranged',
        'support',
      ])
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
    if (s.run.routeRevision === 16 && s.run.resonances.length === 1) {
      s.run.prologue = 'ready';
      s.run.storyElapsed = 0;
      s.phase = 'journey';
      this.chronicle(
        '整备完成',
        `${s.run.trainee?.name}整好行囊，踏入地牢。冒险从这里开始。`,
        'story',
        0,
      );
    }
    if (s.run.resonanceAtNode && !s.run.rewards.length) {
      s.run.resonanceAtNode = false;
      s.isRunning = true;
      s.run.peakStrength = Math.max(s.run.peakStrength, analysis(s, false, false).strength);
      this.beginEvent();
    }
    return null;
  }
  makeItem(templateId: string, level = 1): Equipment {
    const s = this.state,
      d = definition({ templateId });
    if (!d.available) throw new Error('5 格物品暂未投放');
    if (!Number.isInteger(level) || level < 1 || level > 4) throw new Error('装备等级无效');
    const stats = itemStats(templateId, level, d.profession);
    return {
      id: `item-${++s.itemSerial}`,
      templateId,
      profession: d.profession,
      name: d.name,
      artKind: d.art,
      slot: d.slot,
      branch: d.branch,
      quality: (['white', 'blue', 'purple', 'orange'] as const)[level - 1],
      level,
      ...stats,
      damageType: d.damageType,
    };
  }
  recalculate() {
    const s = this.state,
      stats = finalAttributes(s, this.editable());
    s.player.maxHp = stats.hp;
    s.player.defense = stats.defense;
    s.player.hp = Math.min(s.player.hp, s.player.maxHp);
  }
  placeItem(id: string, x: number, y: number, rotation = 0): string | null {
    const s = this.state;
    if (!this.editable()) return '战斗中不能调整背包';
    const next = [...s.draft.filter((p) => p.id !== id), { id, x, y, rotation }],
      error = validateLayout(s.inventory, next, runBagCells(s));
    if (error) return error;
    s.draft = next;
    s.revision++;
    return null;
  }
  continueCamp(): string | null {
    const s = this.state;
    if (s.phase !== 'camp') return '先处理当前事件或共鸣';
    const error = validateLayout(s.inventory, s.draft, runBagCells(s));
    if (error) return error;
    if (!this.packAnalysis(true).hasWeapon) return '至少放入一件武器';
    s.placements = structuredClone(s.draft);
    this.recalculate();
    if (s.run.pendingPromotion && s.run.routeRevision !== 16) {
      this.promoteTrial();
      return null;
    }
    this.clearLooseEquipment();
    if (
      this.currentEvent()?.completed &&
      (s.run.index === runRoute(s).ending ||
        (s.run.index === runRoute(s).graduation && !s.run.extreme))
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
    s.run.peakStrength = Math.max(s.run.peakStrength, analysis(s, false, false).strength);
    this.beginEvent();
    return null;
  }
  private beginEvent() {
    const s = this.state,
      event = this.currentEvent()!;
    s.enemy = null;
    s.run.lastLootIds = [];
    s.run.dig = null;
    delete s.run.supply;
    s.run.storyElapsed = 0;
    s.phase = 'journey';
    this.chronicle(
      EVENT_NAMES[event.kind],
      event.kind === 'boss' && s.run.index >= runRoute(s).extremeStart
        ? '更强的守关者堵住了归途。勇者以完整的构筑迎接这场极限挑战。'
        : eventStory(event.kind, event.variant, runRoute(s).hasExtreme),
    );
    if (['battle', 'boss', 'elite'].includes(event.kind) && !s.run.encounter)
      s.run.encounter = generateEnemy(s, analysis(s, false, false).strength, this.random);
  }
  continueJourney() {
    const s = this.state;
    if (s.phase !== 'journey') return false;
    if (s.run.prologue) {
      const departure = s.run.prologue === 'departure';
      delete s.run.prologue;
      s.run.storyElapsed = 0;
      s.phase = departure ? 'opening' : 'camp';
      if (departure) s.run.starterOffers = this.starterRoundItems(0);
      s.revision++;
      return true;
    }
    s.run.storyElapsed = STORY_SECONDS;
    const event = this.currentEvent()!;
    if (event.kind === 'promotion') {
      this.promoteTrial();
      return true;
    }
    if (event.kind === 'supply' && s.run.routeRevision === 16) {
      this.prepareSupply();
      return true;
    }
    if (event.kind === 'dig') this.prepareDig();
    if (
      ['elite', 'boss'].includes(event.kind) &&
      s.run.trials[runRoute(s).trials.indexOf(s.run.index)] === null
    ) {
      s.phase = 'event';
    } else if (['battle', 'elite', 'boss'].includes(event.kind)) {
      s.phase = 'combat';
      this.spawnEnemy();
    } else if (
      event.kind === 'supply' ||
      (event.kind === 'treasure' && s.run.routeRevision !== 16)
    ) {
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
      stage = runRoute(s).trials.indexOf(s.run.index);
    if (
      s.phase !== 'event' ||
      !e ||
      e.completed ||
      !['elite', 'boss'].includes(e.kind) ||
      ![0, 1, 2].includes(tier) ||
      stage < 0 ||
      s.run.trials[stage] !== null
    )
      return '当前无法选择试炼';
    const error = validateLayout(s.inventory, s.draft, runBagCells(s));
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
    if (!event || !['battle', 'boss', 'elite'].includes(event.kind)) return;
    // The encounter is already frozen before the trial choice or battle presentation.
    const base =
      s.run.encounter ?? generateEnemy(s, analysis(s, false, false).strength, this.random);
    s.enemy = structuredClone(base);
    const stage = runRoute(s).trials.indexOf(s.run.index);
    if (stage >= 0) {
      const tier = s.run.trials[stage] ?? 0;
      s.enemy.hp = s.enemy.maxHp = Math.round(base.maxHp * [1, 1.2, 1.45][tier]);
      s.enemy.attack = base.attack * [1, 1.12, 1.28][tier];
    }
    s.run.enemyHistory.push(s.enemy.profession!);
    s.run.enemyHistory = s.run.enemyHistory.slice(-2);
    s.combat = emptyCombat();
    s.player.shield = 0;
    const stats = finalAttributes(s);
    const runtime = battleRuntime(
      fighter(stats, s.run.profession, s.player.hp),
      fighter(
        {
          attack: s.enemy.attack,
          hp: s.enemy.maxHp,
          defense: s.enemy.defense,
          speed: s.enemy.speed,
        },
        s.enemy.profession!,
      ),
      buildSources(s),
      s.enemy.templateId!,
      this.packAnalysis().active.some((i) => i.branch === 'assassin') &&
        this.packAnalysis().active.some((i) => i.branch === 'archer'),
    );
    runtime.tiers = { ...this.packAnalysis().tiers };
    s.combat.runtime = runtime;
    this.engine().opening();
    this.syncCombat();
    this.beginRound();
    this.log(
      `第 ${s.run.index + 1} 步 · ${s.enemy.name} · ${PROFESSIONS[s.enemy.profession!].name}${s.enemy.isBoss ? ' · Boss' : ''}`,
      'battle',
    );
  }
  private engine() {
    return new BattleEngine(this.state.combat.runtime!, this.state.combat.round, (signal) => {
      if (['damage', 'healing', 'shield'].includes(signal.kind) && !isEnemySource(signal.source))
        this.contribute(
          signal.source,
          signal.kind as 'damage' | 'healing' | 'shield',
          signal.amount,
        );
      else if (signal.kind === 'trigger') {
        this.contribute(signal.source, 'shield', 0);
        this.state.combat.contributions[signal.source].triggers++;
        this.signalFeedback(signal.source, 'trigger', 1);
      } else this.signalFeedback(signal.source, signal.kind, signal.amount);
    });
  }
  private syncCombat() {
    const s = this.state,
      r = s.combat.runtime;
    if (!r || !s.enemy) return;
    s.player.hp = r.hero.hp;
    s.player.maxHp = r.hero.maxHp;
    s.player.shield = r.hero.shield;
    s.enemy.hp = r.enemy.hp;
    s.enemy.effects = r.enemy.statuses
      .filter((x) => ['poison', 'burn', 'chill'].includes(x.kind))
      .map((x) => ({
        kind: x.kind as 'poison' | 'burn' | 'chill',
        damage: x.value,
        remaining: x.remaining,
        timer: 0,
        sourceId: x.source,
      }));
    s.combat.minions = r.minions.length;
    s.combat.minionHp = r.minions.reduce((n, m) => n + m.hp, 0);
    s.combat.bossTimer = r.enemyActions;
    for (const i of s.placements) {
      s.combat.timers[i.id] = r.timers[i.id + ':0'] ?? 0;
      s.combat.hits[i.id] = r.flags[i.id + ':hits'] ?? 0;
    }
  }
  private lootLevel() {
    const n = this.state.run.index,
      roll = this.random();
    if (n > runRoute(this.state).trials[2] && roll < 0.35) return 3;
    if (n > runRoute(this.state).trials[0] && roll < 0.18) return 3;
    if (n > runRoute(this.state).trials[0] && roll < 0.65) return 2;
    if (n >= 6 && roll < 0.35) return 2;
    return 1;
  }
  private lootItem() {
    const s = this.state,
      active = this.packAnalysis(true).active,
      pool = this.dropPool(),
      materials = active.filter((i) => i.level < 4 && pool.some((d) => d.id === i.templateId)),
      match =
        this.random() < (s.run.index > runRoute(this.state).trials[2] ? 0.8 : 0.6) &&
        materials.length > 0;
    if (match) {
      const target = materials[Math.floor(this.random() * materials.length)],
        level =
          s.run.index > runRoute(this.state).trials[0] && this.random() < 0.65
            ? Math.min(3, target.level)
            : this.lootLevel();
      return this.makeItem(target.templateId, level);
    }
    return this.makeItem(pool[Math.floor(this.random() * pool.length)].id, this.lootLevel());
  }
  private dropPool() {
    const s = this.state,
      b = s.run.boundTome ? tome(s.run.boundTome.id) : null;
    if (b && b.profession !== s.run.profession && this.random() < 0.15) {
      const related = availableItems(b.profession).filter((i) => i.branch === tomeBranch(b.id));
      if (related.length) return related;
    }
    return availableItems(s.run.profession);
  }
  private grantLoot(title: string, level?: number, levels?: number[]) {
    const s = this.state,
      items = Array.from({ length: 3 }, (_, n) => {
        const i = this.lootItem();
        if (levels) this.setItemLevel(i, levels[n]);
        else if (level) this.setItemLevel(i, level);
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
    const s = this.state,
      pool = this.resonanceChoices(initial),
      choices: ResonanceKey[] = [];
    const take = (candidates: ResonanceKey[]) => {
      const weight = (k: ResonanceKey) =>
        resonanceScore(s.inventory, s.draft, k).tier > 0 ? 3 : 1;
      let roll = this.random() * candidates.reduce((n, k) => n + weight(k), 0),
        key = candidates.at(-1)!;
      for (const k of candidates) {
        roll -= weight(k);
        if (roll <= 0) {
          key = k;
          break;
        }
      }
      choices.push(key);
    };
    const preferred = pool.filter((k) =>
      initial ? resonanceScore(s.inventory, s.draft, k).tier > 0 : RESONANCES[k].rank > 1,
    );
    if (preferred.length) take(preferred);
    while (choices.length < 3) {
      const next = pool.filter((k) => !choices.includes(k));
      if (!next.length) break;
      take(next);
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
    if (runRoute(s).trials.includes(s.run.index)) s.run.pendingPromotion = true;
    s.run.rewards = rewards.filter((r) => r.buffs.length || r.resonances.length);
    s.run.autoExplore = false;
    s.phase = s.run.rewards.length ? 'reward' : 'camp';
    s.enemy = null;
    s.run.encounter = null;
    s.combat.runtime = null;
    s.player.shield = 0;
    s.revision++;
  }
  private promoteTrial() {
    const s = this.state;
    if (!s.run.pendingPromotion) return;
    // Clear before applying growth: saving the ritual cannot apply it a second time.
    s.run.pendingPromotion = false;
    const previous = { ...s.run.growth },
      stage = runRoute(s).promotions.indexOf(s.run.index),
      tier = s.run.trials[stage] ?? 0;
    s.run.trials[stage] = tier;
    s.run.stages++;
    s.run.realm = Math.min(20, s.run.realm + 1);
    const oldMax = s.player.maxHp,
      oldLife = s.player.hp;
    s.run.growth = stageGrowth(s.run.profession, s.run.trials, s.run.stages);
    this.recalculate();
    if (s.run.routeRevision === 16) {
      s.player.hp = Math.min(s.player.maxHp, (oldLife * s.player.maxHp) / oldMax);
      this.currentEvent()!.completed = true;
    }
    this.log(`试炼 ${s.run.stages}/3 完成：${trialGain(s.run.profession, tier)}`, 'reward');
    this.chronicle(
      `${realmName(s.run.realm)} · 试炼通过`,
      `${TRIALS[tier].name}完成。境界：${realmName(s.run.realm - 1)} → ${realmName(s.run.realm)}。${trialGain(s.run.profession, tier)}。`,
      'growth',
    );
    const healed =
      s.run.routeRevision === 16 ? 0 : this.heal(s.player.maxHp * [0.25, 0.35, 0.45][tier]);
    if (healed > 0) this.chronicle('晋阶恢复', `恢复 ${lifeAmount(healed)} 生命。`, 'rest');
    s.awakening = {
      stage: stage + 1,
      tier,
      attack: s.run.growth.attack - previous.attack,
      hp: s.run.growth.hp - previous.hp,
      defense: s.run.growth.defense - previous.defense,
      healed: Math.round(healed),
    };
    s.run.rewards = [this.resonanceReward()];
    s.phase = 'awakening';
    s.revision++;
  }
  finishAwakening() {
    const s = this.state;
    if (s.phase !== 'awakening' || !s.awakening) return false;
    // Recycle exactly when crossing the small-node boundary, before resonance selection.
    this.clearLooseEquipment();
    s.run.index++;
    s.run.lastLootIds = [];
    s.run.encounter = null;
    s.run.dig = null;
    s.run.storyElapsed = 0;
    s.enemy = null;
    s.run.resonanceAtNode = true;
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
    if (s.run.wheel) return '请等待轮盘停稳后领取祝福';
    if (e.kind === 'chance' && s.run.routeRevision === 16) {
      if (action === 'skip') {
        this.chronicle('继续前行', '勇者离开遗迹，保留了自己的生命。');
        this.resolved();
        return null;
      }
      if (!['spin', 'sacrifice'].includes(action) || s.player.hp <= 0) return '请选择献祭或离开';
      const paid = s.player.hp * 0.15;
      s.player.hp -= paid;
      s.run.wheel = { sector: Math.min(5, Math.floor(this.random() * 6)), paid, elapsed: 0 };
      s.revision++;
      return null;
    }
    if (e.kind === 'treasure' && s.run.routeRevision === 16) {
      if (action === 'skip') this.chronicle('宝箱封存', '勇者放弃开启宝箱，继续前行。');
      else if (action === 'open' && s.player.hp > 0) {
        const paid = s.player.hp * 0.1;
        s.player.hp -= paid;
        this.chronicle('解除血封', `消耗 ${lifeAmount(paid)} 生命，取走宝箱中的装备。`, 'danger');
        this.grantLoot('遗物宝箱');
      } else return '请选择开启宝箱或离开';
      this.resolved();
      return null;
    }
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
      if (action === 'extreme' && !runRoute(s).hasExtreme) return '本关暂未开放极限挑战';
      if (action === 'graduate') {
        const error = validateLayout(s.inventory, s.draft, runBagCells(s));
        if (error) return error;
        if (!this.packAnalysis(true).hasWeapon) return '最终背包至少装备一件武器';
      }
      s.run.extreme = action === 'extreme';
      this.chronicle(
        s.run.extreme ? '挑战极限' : '正常结业',
        s.run.extreme ? '勇者选择继续，迎战更强的魔物。' : '勇者带着最终构筑返回公会。',
        'growth',
      );
      this.resolved();
      return s.run.extreme ? null : this.continueCamp();
    }
    if (e.kind === 'mentor') {
      if (action !== 'learn') return '接受导师传授';
      const k = (['attack', 'hp', 'defense', 'speed'] as const)[Math.floor(this.random() * 4)],
        value = { attack: 0.08, hp: 24, defense: 3, speed: 2 }[k];
      s.run.eventGrowth[k] += value;
      this.recalculate();
      this.chronicle(
        '导师传授',
        `${{ attack: '攻击', hp: '最大生命', defense: '防御', speed: '速度' }[k]} +${k === 'attack' ? value * 100 + '%' : value}。`,
        'growth',
      );
      this.resolved();
      return null;
    }
    if (e.kind === 'ending') {
      if (action !== 'finish') return '整理最终行囊后确认';
      if (
        validateLayout(s.inventory, s.draft, runBagCells(s)) ||
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
          this.growLife(() => {
            s.run.eventGrowth.hp += 18;
          });
          this.chronicle('强健体魄', '最大生命 +18。', 'growth');
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
            this.growLife(() => {
              s.run.eventGrowth[k] += value;
            });
            this.chronicle(
              '占卜馈赠',
              `${{ attack: '攻击', hp: '最大生命', defense: '防御', speed: '速度' }[k]} +${k === 'attack' ? value * 100 + '%' : value}。`,
              'growth',
            );
          } else {
            if (e.variant === 3) s.run.eventGrowth.defense += 2;
            else s.run.eventGrowth.attack += 0.08;
            this.chronicle('符文馈赠', e.variant === 3 ? '防御 +2。' : '攻击 +8%。', 'growth');
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
      } else if (action === 'vigor' && s.run.routeRevision === 16) {
        this.growLife(() => {
          s.run.eventGrowth.hpPercent = (s.run.eventGrowth.hpPercent ?? 0) + 0.12;
        });
        this.chronicle('凝聚泉华', '最大生命 +12%。', 'growth');
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

  private growLife(change: () => void) {
    const s = this.state,
      oldMax = s.player.maxHp,
      oldLife = s.player.hp;
    change();
    this.recalculate();
    if (s.run.routeRevision === 16 && oldMax > 0)
      s.player.hp = Math.min(s.player.maxHp, (oldLife * s.player.maxHp) / oldMax);
  }
  private prepareSupply() {
    const s = this.state,
      power = this.heroPreview('retreat')!.power,
      threshold = supplyThreshold(s.run.chapter, s.run.stages),
      chance = supplyChance(power, threshold),
      result = power < threshold ? 'low' : this.random() < chance ? 'great' : 'normal',
      levels = [...SUPPLY_GRADES[Math.min(2, s.run.stages)][result]];
    for (let n = levels.length - 1; n > 0; n--) {
      const j = Math.floor(this.random() * (n + 1));
      [levels[n], levels[j]] = [levels[j], levels[n]];
    }
    s.run.supply = { power, threshold, result, levels, elapsed: 0 };
    s.phase = 'event';
    s.revision++;
  }
  finishWheel() {
    const s = this.state,
      wheel = s.run.wheel;
    if (
      s.phase !== 'event' ||
      !wheel ||
      wheel.elapsed < WHEEL_SECONDS ||
      this.currentEvent()?.completed
    )
      return false;
    const sector = WHEEL_SECTORS[wheel.sector];
    this.growLife(() => {
      if (sector.attribute === 'attack') s.run.eventGrowth.attack += sector.value;
      else if (sector.attribute === 'hp')
        s.run.eventGrowth.hpPercent = (s.run.eventGrowth.hpPercent ?? 0) + sector.value;
      else
        s.run.eventGrowth.defensePercent = (s.run.eventGrowth.defensePercent ?? 0) + sector.value;
    });
    this.chronicle(
      '献祭祝福',
      `消耗 ${lifeAmount(wheel.paid)} 生命，${sector.label} +${sector.value * 100}%。`,
      'growth',
    );
    delete s.run.wheel;
    this.resolved();
    return true;
  }
  private prepareDig() {
    const s = this.state,
      count = 2 + Math.floor(this.random() * 3),
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
      equipment = Array.from({ length: count }, () => this.lootItem());
      placements = fit(equipment);
    }
    if (!placements) {
      equipment = Array.from({ length: count }, () =>
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
      d.claimed.length === d.equipment.length ||
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
        const claimed = structuredClone(item);
        if (claimed.templateId === 'warrior_pole_4') delete claimed.legacyCells;
        s.inventory.push(claimed);
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
      item = this.findItem(id),
      weapons = [...s.inventory, ...s.run.starterOffers].filter((i) => i.slot === 'weapon');
    if (!this.editable() || !item || (item.slot === 'weapon' && weapons.length === 1)) return false;
    s.run.points++;
    const starter = s.run.starterOffers.some((i) => i.id === id);
    s.run.starterOffers = s.run.starterOffers.filter((i) => i.id !== id);
    this.removeItem(id);
    if (starter && !s.run.starterOffers.length) this.advanceStarter();
    this.chronicle(
      '主动重铸',
      `${item.name} Lv.${item.level} 转为 1 点。`,
      'loot',
      s.phase === 'opening' ? 0 : s.run.index + 1,
    );
    return true;
  }
  redeemEquipment(): string | null {
    const s = this.state;
    if (!this.editable()) return '战斗中无法兑换';
    if (s.run.points < 6) return '需要 6 点弃用点数';
    s.run.points -= 6;
    const pool = this.dropPool(),
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
          runBagCells(this.state),
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
    return i && i.level < 4
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
    i.quality = (['white', 'blue', 'purple', 'orange'] as const)[level - 1];
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
      b.level < 4
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
    if (target.level >= 4) return '装备已达到 4 级';
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
    kind:
      'damage' | 'healing' | 'shield' | 'resource' | 'hurt' | 'blocked' | 'trigger' | 'activation',
    amount: number,
  ) {
    if (amount <= 0) return;
    this.feedback.push({ serial: ++this.feedbackSerial, id, kind, amount });
    // A full backpack can fire many skills per turn; retain the actual source signals.
    if (this.feedback.length > 128) this.feedback.shift();
  }
  private contribute(id: string, key: 'damage' | 'healing' | 'shield', amount: number) {
    const rows = this.state.combat.contributions,
      row: Contribution = (rows[id] ??= {
        name:
          this.findItem(id)?.name ??
          (id.startsWith('resonance:')
            ? RESONANCES[id.slice(10) as ResonanceKey]?.name
            : id.startsWith('tome:')
              ? tome(id.slice(5))?.name
              : null) ??
          '战斗技能',
        damage: 0,
        healing: 0,
        shield: 0,
        triggers: 0,
      });
    row[key] += amount;
    this.signalFeedback(id, key, amount);
  }
  playerSpeed() {
    const r = this.state.combat.runtime;
    return this.state.phase === 'combat' && r
      ? +fighterSpeed(r.hero).toFixed(1)
      : finalAttributes(this.state).speed;
  }
  enemySpeed() {
    const r = this.state.combat.runtime;
    return r ? +fighterSpeed(r.enemy).toFixed(1) : (this.state.enemy?.speed ?? 0);
  }
  nextActor(): Actor {
    if (this.state.combat.runtime?.heroTurn) return 'hero';
    if (this.state.combat.runtime?.enemyTurn) return 'enemy';
    const c = this.state.combat;
    return c.order[c.actionIndex] ?? (this.playerSpeed() >= this.enemySpeed() ? 'hero' : 'enemy');
  }
  private beginRound() {
    const s = this.state,
      c = s.combat;
    c.round++;
    if (c.round === 14) this.log('敌人即将在第16回合狂暴', 'battle');
    if (c.round === 16) this.log('敌人进入狂暴，伤害提高20%', 'battle');
    s.run.rounds++;
    c.order = this.playerSpeed() >= this.enemySpeed() ? ['hero', 'enemy'] : ['enemy', 'hero'];
    if (c.runtime) c.runtime.heroFirst = c.order[0] === 'hero';
    c.actionIndex = 0;
  }
  private heroTurn() {
    this.engine().heroTurn();
    this.syncCombat();
  }
  private enemyTurn() {
    this.engine().enemyTurn();
    this.syncCombat();
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
    if (c.runtime?.heroTurn) {
      this.heroTurn();
      this.ended();
      s.revision++;
      return true;
    }
    if (c.runtime?.enemyTurn) {
      this.enemyTurn();
      this.ended();
      s.revision++;
      return true;
    }
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
  private advanceCombatStep() {
    const s = this.state,
      c = s.combat;
    const serial = this.feedbackSerial;
    if (c.runtime?.heroTurn) {
      this.engine().nextHeroBeat();
      this.syncCombat();
    } else if (c.runtime?.enemyTurn) {
      this.engine().nextEnemyStep();
      this.syncCombat();
    } else {
      if (c.actionIndex === 2) this.beginRound();
      const actor = c.order[c.actionIndex++];
      c.lastActor = actor;
      this.log(`第 ${c.round} 回合 · ${actor === 'hero' ? '勇者' : '敌人'}行动`, 'battle');
      if (actor === 'hero') {
        const engine = this.engine();
        engine.beginHeroTurn();
        engine.nextHeroBeat();
        this.syncCombat();
      } else {
        const engine = this.engine();
        engine.beginEnemyTurn();
        engine.nextEnemyStep();
        this.syncCombat();
      }
    }
    if (c.runtime)
      c.runtime.flags.presentationBeat = this.feedback.some(
        (f) => f.serial > serial && ['damage', 'hurt', 'blocked'].includes(f.kind) && f.amount > 0,
      )
        ? COMBAT_PACING.attack
        : COMBAT_PACING.support;
    this.ended();
    s.revision++;
  }
  skippingCombat() {
    return this.state.skipCombat || !!this.state.combat.skip;
  }
  update(delta: number, maxCombatSteps = Infinity) {
    const s = this.state;
    if (!Number.isFinite(delta) || delta <= 0) return;
    if (s.phase === 'journey') {
      const duration = s.run.prologue ? 1.8 : storyDuration(this.currentEvent()!);
      s.run.storyElapsed = Math.min(duration, s.run.storyElapsed + delta);
      if (s.run.storyElapsed >= duration) this.continueJourney();
      return;
    }
    if (s.phase === 'event' && s.run.wheel) {
      s.run.wheel.elapsed = Math.min(WHEEL_SECONDS, s.run.wheel.elapsed + delta);
      return;
    }
    if (s.phase === 'event' && this.currentEvent()?.kind === 'supply' && s.run.supply) {
      const offer = s.run.supply;
      offer.elapsed = Math.min(SUPPLY_SECONDS, offer.elapsed + delta);
      if (offer.elapsed >= SUPPLY_SECONDS) {
        this.chronicle(
          offer.result === 'great' ? '大吉' : '旅人补给',
          offer.result === 'great'
            ? '符文亮起，旅人为勇者留下了一批更珍贵的装备。'
            : '旅人留下备用装备，愿勇者平安归来。',
          'story',
        );
        this.grantLoot(offer.result === 'great' ? '大吉补给' : '旅人补给', undefined, offer.levels);
        this.resolved();
      }
      return;
    }
    if (s.phase !== 'combat' || !s.isRunning) return;
    if (this.ended()) return;
    let remaining = Math.min(delta * (this.skippingCombat() ? 30 : 1), 60);
    let steps = 0;
    while (remaining > 1e-8 && s.phase === 'combat') {
      const c = s.combat,
        interval =
          c.runtime?.heroTurn || c.runtime?.enemyTurn
            ? c.runtime.flags.presentationBeat === COMBAT_PACING.support
              ? COMBAT_PACING.support
              : COMBAT_PACING.attack
            : c.lastActor
              ? COMBAT_PACING.handoff
              : ACTION_SECONDS,
        dt = Math.min(remaining, Math.max(0, interval - c.elapsed));
      c.seconds += dt;
      s.run.seconds += dt;
      c.elapsed += dt;
      remaining -= dt;
      if (c.elapsed + 1e-8 >= interval) {
        c.elapsed = 0;
        this.advanceCombatStep();
        if (++steps >= maxCombatSteps) break;
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
      lifeAtEnd: s.player.hp,
      recovery: 0,
    };
  }
  private defeatEnemy() {
    const s = this.state,
      e = s.enemy;
    if (!e || this.currentEvent()?.completed || s.player.hp <= 0) return;
    this.finishCombat(true, '战斗胜利');
    let recovery = '';
    if (s.run.routeRevision === 16) {
      const fraction = e.isBoss || e.isElite ? 0.3 : 0.1;
      const healed = this.heal(s.player.maxHp * fraction);
      s.lastReport!.recovery = healed;
      recovery = `恢复最大生命的${fraction * 100}%（实际 ${lifeAmount(healed)} 生命）。`;
    }
    this.chronicle(
      '战斗胜利',
      `${s.run.trainee?.name}击败了${e.name}，历经 ${s.combat.round} 回合。${recovery}获得战利品，准备整理行囊。`,
      'story',
    );
    s.run.kills++;
    s.meta.totalKills++;
    this.grantLoot(e.isBoss || e.isElite ? '试炼战利品' : '战利品');
    this.resolved();
    normalizeActiveFootprints(s);
  }
  selectTome(id: string): string | null {
    const s = this.state,
      t = s.run.trainee,
      book = tome(id);
    if (s.phase !== 'tome' || !t || !book) return '当前无法配置典籍';
    const owned = s.meta.tomes[id];
    if (!owned.level) {
      if (s.meta.tomeGifts.includes(t.profession)) return '尚未收集这本典籍';
    }
    t.tomeId = id;
    t.tomeLevel = owned.level || 1;
    s.revision++;
    return null;
  }
  confirmAllocation(): string | null {
    const s = this.state;
    if (s.phase !== 'configure' || !s.run.trainee) return '当前无法确认加点';
    if (pointsSpent(s.run.trainee) !== allocationLimit(s.run.trainee))
      return `请分配全部 ${allocationLimit(s.run.trainee)} 点属性`;
    s.run.boundTome = null;
    s.phase = 'tome';
    s.revision++;
    return null;
  }
  backToAllocation() {
    if (this.state.phase !== 'tome') return false;
    this.state.phase = 'configure';
    this.state.revision++;
    return true;
  }
  upgradeTome(id: string): string | null {
    const s = this.state,
      owned = s.meta.tomes[id];
    if (s.phase !== 'home' || !owned || !owned.level || owned.level >= 3) return '当前无法升阶';
    const cost = upgradeCost(owned.level);
    if (owned.pages < cost.pages || s.meta.gold < cost.gold) return '残页或金币不足';
    owned.pages -= cost.pages;
    s.meta.gold -= cost.gold;
    owned.level++;
    s.revision++;
    return null;
  }
  upgradeGuild(): string | null {
    const s = this.state,
      c = guildConditions(s);
    if (s.phase !== 'home' || !c.length || c.some((c) => c.value < c.target))
      return '尚未满足三项升级条件';
    s.meta.guildLevel++;
    s.revision++;
    return null;
  }
  buyGuildNode(id: number): string | null {
    const s = this.state,
      node = GUILD_NODES[id];
    if (s.phase !== 'home') return '请返回公会升级增益';
    if (!node || id !== s.meta.guildPurchased) return '请按路线顺序升级';
    if (node.level > s.meta.guildLevel) return `公会达到${node.level}级后开放`;
    if (s.meta.medals < node.cost) return '公会勋章不足';
    s.meta.medals -= node.cost;
    s.meta.guildPurchased++;
    s.revision++;
    return null;
  }
  upgradeGuildAvailable(): string | null {
    let changed = false;
    while (
      guildConditions(this.state).length &&
      guildConditions(this.state).every((c) => c.value >= c.target)
    ) {
      const error = this.upgradeGuild();
      if (error) return error;
      changed = true;
    }
    return changed ? null : '尚未满足三项升级条件';
  }
  private pageCandidates(p: Profession) {
    const eligible = TOMES.filter((t) => {
      const o = this.state.meta.tomes[t.id];
      return o.level < 3 && o.pages < (o.level === 2 ? 6 : 9);
    });
    const shuffle = (list: typeof eligible) => {
      const a = [...list];
      for (let n = a.length - 1; n > 0; n--) {
        const j = Math.floor(this.random() * (n + 1));
        [a[n], a[j]] = [a[j], a[n]];
      }
      return a;
    };
    const own = shuffle(eligible.filter((t) => t.profession === p)).slice(0, 2),
      other = shuffle(eligible.filter((t) => t.profession !== p));
    const candidates = [...own, ...other.slice(0, 3 - own.length)];
    for (const t of shuffle(eligible))
      if (candidates.length < 3 && !candidates.includes(t)) candidates.push(t);
    return candidates.map((t) => t.id);
  }
  claimPage(heroId: string, id: string): string | null {
    const s = this.state,
      reward = s.meta.pendingPages.find((r) => r.heroId === heroId);
    if (!['home', 'summary'].includes(s.phase) || !reward || !reward.choices.includes(id))
      return '没有这份结算奖励';
    const book = s.meta.tomes[id];
    if (!book.level) book.level = 1;
    else book.pages++;
    s.meta.pendingPages = s.meta.pendingPages.filter((r) => r !== reward);
    s.revision++;
    return null;
  }
  refreshPages(heroId: string): string | null {
    const reward = this.state.meta.pendingPages.find((r) => r.heroId === heroId),
      hero = this.state.meta.heroes.find((h) => h.id === heroId);
    if (!reward || !hero || !reward.extreme || reward.refreshed) return '不能再次刷新';
    const choices = this.pageCandidates(hero.profession);
    if (!choices.length) {
      this.state.meta.pendingPages = this.state.meta.pendingPages.filter((r) => r !== reward);
      this.state.revision++;
      return null;
    }
    reward.choices = choices;
    reward.refreshed = true;
    this.state.revision++;
    return null;
  }
  heroPreview(outcome: Outcome = 'win'): HeroRecord | null {
    const s = this.state,
      trainee = s.run.trainee;
    if (!trainee) return null;
    const a = this.packAnalysis(true),
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
    const rating = heroRating(power, outcome);
    return {
      ...structuredClone(trainee),
      ratingVersion: 15,
      chapter: s.run.chapter,
      realm: s.run.realm,
      guildAtGraduation: s.meta.guildLevel,
      guildBaseline: nonGuildAttributes(s, true),
      routeLength: s.run.events.length,
      normalLength: runRoute(s).normal,
      outcome,
      completed,
      stages: s.run.stages,
      power,
      rating,
      resonances: [...s.run.resonances],
      resonanceTiers: Object.fromEntries(s.run.resonances.map((k) => [k, a.tiers[k]])),
      stats: {
        attack: Math.round(finalAttributes(s, true).attack),
        hp: Math.round(finalAttributes(s, true).hp),
        defense: +finalAttributes(s, true).defense.toFixed(1),
        speed: this.playerSpeed(),
        sustain: +a.sustain.toFixed(1),
      },
      score: { growth, build, performance },
      loadout: {
        equipment: structuredClone(a.active),
        placements: structuredClone(s.draft),
        capacity: runBagCapacity(s),
        ...(s.run.packLayout ? { packLayout: s.run.packLayout } : {}),
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
    // A won trial is earned even if the player retires on its loot screen.
    if (s.run.pendingPromotion && s.run.routeRevision !== 16) this.promoteTrial();
    const hero = this.heroPreview(outcome);
    if (!hero) return;
    const gold = outcome === 'win' ? (100 + s.run.chapter * 15) * (s.run.extreme ? 2 : 1) : 0;
    const medals = medalReward(s, outcome);
    s.meta.heroes.push(hero);
    s.meta.medals += medals;
    s.meta.guildHistory.trained++;
    s.meta.guildHistory.trials += hero.stages;
    if (['A', 'S'].includes(hero.rating)) s.meta.guildHistory.aRated++;
    if (hero.rating === 'S') s.meta.guildHistory.sRated++;
    // Tome drops are deferred until their acquisition system is designed.
    // Previously earned pages and pending rewards remain in the saved library.
    s.meta.gold += gold;
    s.run.summary = {
      outcome,
      chapter: s.run.chapter,
      profession: s.run.profession,
      completed: this.completed(),
      gold,
      medals,
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
      s.meta.highestChapter = Math.min(
        CHAPTER_CAP,
        Math.max(s.meta.highestChapter, s.run.chapter + 1),
      );
    }
    s.awakening = null;
    s.run.pendingPromotion = false;
    delete s.run.prologue;
    delete s.run.wheel;
    delete s.run.supply;
    s.run.resonanceAtNode = false;
    s.inventory = [];
    s.placements = [];
    s.draft = [];
    s.enemy = null;
    s.run.encounter = null;
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
  s.run.index === runRoute(s).ending || (s.run.index === runRoute(s).graduation && !s.run.extreme);
