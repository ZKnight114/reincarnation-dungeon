import { resonanceAvailable, validResonanceOrder } from './resonances';
import {
  BUFF_KEYS,
  definition,
  itemStats,
  PROFESSION_KEYS,
  PROFESSIONS,
  RESONANCE_KEYS,
  RESONANCES,
  resonanceScore,
  validateLayout,
  occupiedCells,
  openBagCells,
  bagCells,
  bagCapacity,
} from './backpack';
import { ACTION_SECONDS, STORY_SECONDS, ENERGY_CAP } from './game';
import {
  TRIAL_NODES,
  trialIndex,
  RUN_LENGTH,
  stageGrowth,
  ROUTE_KINDS,
  GRADUATION_NODE,
} from './journey';
import { ATTRIBUTE_KEYS, ATTRIBUTE_POINTS, pointsSpent, TALENT_KEYS, TALENTS } from './hero';
import type { Equipment, GameState, HeroRecord, Placement, Trainee } from './types';
export const SAVE_KEY = 'recursion-dungeon-save-v14';
const RESET_KEY = 'recursion-dungeon-reset-v14';
export function cleanLegacyData(storage: Storage = localStorage) {
  const first = storage.getItem(RESET_KEY) !== 'done';
  for (const key of Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (k): k is string => !!k,
  ))
    if (key.startsWith('recursion-dungeon-') && key !== RESET_KEY && (first || key !== SAVE_KEY))
      storage.removeItem(key);
  storage.setItem(RESET_KEY, 'done');
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, max = 1e12) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const integer = (v: unknown, min = 0, max = 1e9) =>
  number(v, max) && Number.isSafeInteger(v) && (v as number) >= min;
const text = (v: unknown, max = 160) => typeof v === 'string' && v.length <= max;
function check(ok: unknown, message = '公会存档数据无效'): asserts ok {
  if (!ok) throw new Error(message);
}
function safeKeys(v: unknown) {
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(k), '存档包含无效字段');
    safeKeys(x);
  }
}
function trainee(v: any): asserts v is Trainee {
  check(
    object(v) &&
      /^hero-\d+$/.test(v.id) &&
      text(v.name, 40) &&
      number(v.createdAt, 8.64e15) &&
      PROFESSION_KEYS.includes(v.profession) &&
      ['random', 'targeted'].includes(v.recruitment) &&
      Array.isArray(v.talents) &&
      v.talents.length === 4 &&
      new Set(v.talents).size === 4 &&
      v.talents.every((k: any) => TALENT_KEYS.includes(k)),
  );
  for (const a of ATTRIBUTE_KEYS)
    check(v.talents.filter((k: keyof typeof TALENTS) => TALENTS[k].attribute === a).length === 1);
  check(object(v.allocation) && Object.keys(v.allocation).length === 4);
  for (const a of ATTRIBUTE_KEYS) check(integer(v.allocation[a], 0, ATTRIBUTE_POINTS));
  check(pointsSpent(v as Trainee) <= ATTRIBUTE_POINTS);
}
function resonanceList(raw: any, profession: any) {
  check(Array.isArray(raw) && raw.length <= 4 && new Set(raw).size === raw.length);
  check(validResonanceOrder(raw, profession));
  for (const k of raw)
    check(
      RESONANCE_KEYS.includes(k) &&
        RESONANCES[k as keyof typeof RESONANCES].profession === profession,
    );
}
function trials(v: any, stages: number) {
  check(Array.isArray(v) && v.length === 3 && v.every((t: any) => t === null || integer(t, 0, 2)));
  for (let i = 0; i < stages; i++) check(v[i] !== null);
}
function hero(v: any): asserts v is HeroRecord {
  trainee(v);
  const h = v as any;
  check(pointsSpent(v) === ATTRIBUTE_POINTS);
  check(
    PROFESSION_KEYS.includes(h.profession) &&
      integer(h.chapter, 1, 20) &&
      ['win', 'death', 'retreat'].includes(h.outcome) &&
      integer(h.completed, 0, RUN_LENGTH) &&
      integer(h.stages, 0, 3) &&
      integer(h.power) &&
      ['D', 'C', 'B', 'A', 'S'].includes(h.rating) &&
      number(h.graduatedAt, 8.64e15),
  );
  resonanceList(h.resonances, h.profession);
  check(object(h.resonanceTiers) && Object.keys(h.resonanceTiers).length === h.resonances.length);
  for (const k of h.resonances) check(integer(h.resonanceTiers[k], 0, 3));
  check(h.resonances.length <= 1 + h.stages);
  check(
    object(h.stats) &&
      number(h.stats.attack) &&
      number(h.stats.hp) &&
      h.stats.hp > 0 &&
      number(h.stats.defense) &&
      number(h.stats.sustain) &&
      integer(h.stats.speed, 1, 100),
  );
  check(
    object(h.score) &&
      integer(h.score.growth) &&
      integer(h.score.build) &&
      integer(h.score.performance) &&
      h.power === h.score.growth + h.score.build + h.score.performance,
  );
  const rating =
    h.power >= 3000
      ? 'S'
      : h.power >= 1900
        ? 'A'
        : h.power >= 1100
          ? 'B'
          : h.power >= 450
            ? 'C'
            : 'D';
  check(h.rating === (h.outcome !== 'win' && ['A', 'S'].includes(rating) ? 'B' : rating));
  check(
    h.outcome !== 'win' ||
      ([GRADUATION_NODE + 1, RUN_LENGTH].includes(h.completed) && h.stages === 3),
  );
  trials(h.trials, h.stages);
  check(object(h.loadout));
  if (h.loadout !== null) {
    const b = h.loadout;
    check(object(b) && Array.isArray(b.equipment) && b.equipment.length <= 42);
    b.equipment.forEach(item);
    check(
      new Set(b.equipment.map((i: Equipment) => i.id)).size === b.equipment.length &&
        b.equipment.every((i: Equipment) => i.profession === h.profession),
    );
    check(integer(b.capacity, 15, 42));
    layout(b.placements, b.equipment, bagCells(b.capacity));
    check(b.placements.length === b.equipment.length);
    for (const k of h.resonances)
      check(resonanceScore(b.equipment, b.placements, k).tier === h.resonanceTiers[k]);
  }
}
function item(v: any): asserts v is Equipment {
  check(
    object(v) &&
      /^item-\d+$/.test(v.id) &&
      PROFESSION_KEYS.includes(v.profession) &&
      integer(v.level, 1, 5),
  );
  const d = definition(v as Equipment);
  check(
    d.available &&
      d.profession === v.profession &&
      d.branch === v.branch &&
      d.slot === v.slot &&
      d.damageType === v.damageType &&
      v.quality === ['white', 'green', 'blue', 'purple', 'orange'][v.level - 1] &&
      text(v.name, 80) &&
      text(v.artKind, 40),
  );
  const stats = itemStats(v.templateId, v.level, v.profession);
  for (const key of ['attack', 'hp', 'defense', 'potency'] as const)
    check(number(v[key]) && Math.abs(v[key] - stats[key]) < 1e-7);
}
function layout(v: any, items: Equipment[], open = bagCells()): asserts v is Placement[] {
  check(Array.isArray(v) && v.length <= 42);
  for (const p of v)
    check(object(p) && text(p.id) && integer(p.x, 0, 6) && integer(p.y, 0, 5) && p.rotation === 0);
  check(!validateLayout(items, v, open));
}
function numericMap(v: any, ids: Set<string>, max: number) {
  check(object(v) && Object.keys(v).length <= 42);
  for (const [k, x] of Object.entries(v)) check(ids.has(k) && number(x, max));
}
function contributions(v: any) {
  check(object(v) && Object.keys(v).length <= 42);
  for (const [id, x] of Object.entries(v)) {
    check(
      /^item-\d+$/.test(id) &&
        object(x) &&
        text(x.name) &&
        number(x.damage) &&
        number(x.healing) &&
        number(x.shield) &&
        integer(x.triggers),
    );
  }
}
export function parseSave(source: string): GameState {
  check(source.length < 6_000_000, '存档过大');
  const s = JSON.parse(source);
  safeKeys(s);
  check(object(s) && s.version === 14, '仅支持公会新版 v14 存档，旧版数据已停用');
  check(
    [
      'home',
      'chapter',
      'configure',
      'opening',
      'initial',
      'camp',
      'journey',
      'combat',
      'event',
      'awakening',
      'reward',
      'summary',
    ].includes(s.phase),
  );
  const m = s.meta;
  check(
    object(m) &&
      number(m.gold) &&
      object(m.energy) &&
      integer(m.energy.value, 0, ENERGY_CAP) &&
      number(m.energy.updatedAt, 8.64e15) &&
      Array.isArray(m.heroes) &&
      m.heroes.length <= 500 &&
      integer(m.heroSerial) &&
      integer(m.highestChapter, 1, 20) &&
      integer(m.wins) &&
      integer(m.runs) &&
      integer(m.totalKills),
  );
  m.heroes.forEach(hero);
  check(
    new Set(m.heroes.map((h: HeroRecord) => h.id)).size === m.heroes.length &&
      m.heroes.every((h: HeroRecord) => Number(h.id.slice(5)) <= m.heroSerial),
  );
  const r = s.run;
  check(
    object(r) &&
      PROFESSION_KEYS.includes(r.profession) &&
      integer(r.chapter, 1, m.highestChapter) &&
      integer(r.index, 0, RUN_LENGTH - 1) &&
      integer(r.points) &&
      integer(r.kills, 0, 42) &&
      number(r.seconds) &&
      integer(r.rounds) &&
      integer(r.highestItem, 1, 5) &&
      integer(r.starterRound, 0, 2) &&
      integer(r.stages, 0, 3),
  );
  if (r.trainee !== null) {
    trainee(r.trainee);
    check(Number(r.trainee.id.slice(5)) <= m.heroSerial && r.trainee.profession === r.profession);
  }
  if (
    [
      'configure',
      'opening',
      'initial',
      'camp',
      'journey',
      'combat',
      'event',
      'awakening',
      'reward',
      'summary',
    ].includes(s.phase)
  )
    check(r.trainee !== null);
  if (
    [
      'opening',
      'initial',
      'camp',
      'journey',
      'combat',
      'event',
      'awakening',
      'reward',
      'summary',
    ].includes(s.phase)
  )
    check(pointsSpent(r.trainee) === ATTRIBUTE_POINTS);
  check(object(r.buffs) && Object.keys(r.buffs).length === BUFF_KEYS.length);
  for (const k of BUFF_KEYS) check(integer(r.buffs[k], 0, 3));
  trials(r.trials, r.stages);
  check(Array.isArray(r.journey) && r.journey.length <= 10000);
  for (const entry of r.journey)
    check(
      object(entry) &&
        integer(entry.event, 0, RUN_LENGTH) &&
        text(entry.title, 80) &&
        text(entry.text, 500) &&
        ['story', 'loot', 'growth', 'danger', 'rest'].includes(entry.kind),
    );
  check(object(r.growth));
  const growth = stageGrowth(r.profession, r.trials, r.stages);
  for (const k of ['attack', 'hp', 'defense'] as const)
    check(number(r.growth[k]) && Math.abs(r.growth[k] - growth[k]) < 1e-7);
  check(Array.isArray(r.events) && (r.events.length === 0 || r.events.length === RUN_LENGTH));
  for (const e of r.events)
    check(
      object(e) &&
        [
          'battle',
          'elite',
          'boss',
          'treasure',
          'supply',
          'rest',
          'chance',
          'choice',
          'dig',
          'graduation',
          'mentor',
          'ending',
        ].includes(e.kind) &&
        typeof e.completed === 'boolean' &&
        integer(e.variant, 0, 4),
    );
  if (r.events.length) {
    check(
      r.events.every(
        (e: GameState['run']['events'][number], n: number) => e.kind === ROUTE_KINDS[n],
      ),
    );
    for (let n = 0; n < RUN_LENGTH; n++)
      check(n < r.index ? r.events[n].completed : n > r.index ? !r.events[n].completed : true);
    check(r.stages === TRIAL_NODES.filter((n) => r.events[n].completed).length);
  }

  check(Array.isArray(s.inventory) && s.inventory.length <= 500);
  s.inventory.forEach(item);
  const ids = new Set<string>(s.inventory.map((i: Equipment) => i.id));
  check(
    ids.size === s.inventory.length &&
      s.inventory.every((i: Equipment) => i.profession === r.profession),
  );
  layout(s.placements, s.inventory, openBagCells(r.kills));
  layout(s.draft, s.inventory, openBagCells(r.kills));
  check(Array.isArray(r.starterOffers) && r.starterOffers.length <= 3);
  r.starterOffers.forEach(item);
  const hidden = r.dig?.equipment.filter((i: Equipment) => !r.dig.claimed.includes(i.id)) ?? [];
  const known = [
    ...ids,
    ...hidden.map((i: Equipment) => i.id),
    ...r.starterOffers.map((i: Equipment) => i.id),
  ];
  check(
    r.starterOffers.every((i: Equipment) => i.profession === r.profession) &&
      new Set(known).size === known.length,
  );
  check(integer(s.itemSerial) && known.every((id) => Number(id.slice(5)) <= s.itemSerial));
  check(
    Array.isArray(r.lastLootIds) &&
      r.lastLootIds.length <= 3 &&
      new Set(r.lastLootIds).size === r.lastLootIds.length &&
      r.lastLootIds.every((id: string) => ids.has(id)),
  );
  resonanceList(r.resonances, r.profession);
  const active = ['initial', 'camp', 'journey', 'combat', 'event', 'awakening', 'reward'].includes(
    s.phase,
  );
  if (active)
    check(
      r.starterRound === 2 &&
        r.events.length === RUN_LENGTH &&
        r.summary === null &&
        s.inventory.length > 0 &&
        r.resonances.length <= 1 + r.stages,
    );
  if (s.phase === 'opening')
    check(
      r.events.length === RUN_LENGTH &&
        r.summary === null &&
        r.resonances.length === 0 &&
        r.stages === 0 &&
        s.placements.length === 0 &&
        (r.starterRound < 2
          ? r.starterOffers.length >= 1 && r.starterOffers.length <= 3
          : r.starterOffers.length === 0),
    );
  else check(r.starterOffers.length === 0);
  check(Array.isArray(r.rewards) && r.rewards.length <= 1);
  const current = r.events[r.index];
  for (const a of r.rewards) {
    check(
      object(a) &&
        ['buff', 'resonance'].includes(a.kind) &&
        text(a.title) &&
        Array.isArray(a.buffs) &&
        Array.isArray(a.resonances),
    );
    if (a.kind === 'buff') {
      check(
        a.resonances.length === 0 &&
          a.buffs.length > 0 &&
          a.buffs.length <= 3 &&
          new Set(a.buffs).size === a.buffs.length &&
          a.buffs.every((k: any) => BUFF_KEYS.includes(k)) &&
          current?.kind === 'chance' &&
          current.variant === 1,
      );
    } else {
      check(
        a.buffs.length === 0 &&
          a.resonances.length === 3 &&
          new Set(a.resonances).size === a.resonances.length,
      );
      for (const k of a.resonances)
        check(
          RESONANCE_KEYS.includes(k) &&
            RESONANCES[k as keyof typeof RESONANCES].profession === r.profession &&
            !r.resonances.includes(k) &&
            resonanceAvailable(k, r.profession, r.resonances, s.phase === 'initial'),
        );
      check(
        s.phase === 'initial' || (['elite', 'boss'].includes(current?.kind) && current.completed),
      );
    }
  }
  check(
    object(r.eventGrowth) &&
      number(r.eventGrowth.attack, 2) &&
      number(r.eventGrowth.hp, 1000) &&
      number(r.eventGrowth.defense, 100) &&
      integer(r.eventGrowth.speed, 0, 20) &&
      number(r.storyElapsed, STORY_SECONDS) &&
      typeof r.extreme === 'boolean' &&
      typeof r.autoExplore === 'boolean',
  );
  if (r.dig !== null) {
    const d = r.dig;
    check(
      object(d) &&
        current?.kind === 'dig' &&
        integer(d.shovels, 0, 12) &&
        Array.isArray(d.revealed) &&
        d.revealed.length === 12 - d.shovels &&
        new Set(d.revealed).size === d.revealed.length &&
        d.revealed.every((n: any) => integer(n, 0, 15)) &&
        Array.isArray(d.equipment) &&
        d.equipment.length === 3 &&
        Array.isArray(d.claimed) &&
        d.claimed.length <= 3,
    );
    d.equipment.forEach(item);
    check(new Set(d.equipment.map((i: Equipment) => i.id)).size === 3);
    check(d.equipment.every((i: Equipment) => i.profession === r.profession));
    layout(d.placements, d.equipment);
    check(
      d.placements.length === 3 &&
        d.placements.every((p: Placement) =>
          occupiedCells(
            d.equipment.find((i: Equipment) => i.id === p.id),
            p,
          ).every(([x, y]) => x < 4 && y < 4),
        ),
    );
    check(
      new Set(d.claimed).size === d.claimed.length &&
        d.claimed.every((id: string) => d.equipment.some((i: Equipment) => i.id === id)),
    );
  }
  const p = s.player;
  check(
    object(p) &&
      number(p.hp) &&
      number(p.maxHp) &&
      p.maxHp > 0 &&
      p.hp <= p.maxHp &&
      number(p.defense) &&
      number(p.shield),
  );
  if (active) check(p.hp > 0);
  const c = s.combat;
  check(
    object(c) &&
      number(c.stamina, 20) &&
      number(c.mana, 12) &&
      number(c.seconds) &&
      integer(c.bossTimer, 0, 4) &&
      integer(c.round) &&
      number(c.elapsed, ACTION_SECONDS) &&
      c.elapsed < ACTION_SECONDS &&
      Array.isArray(c.order) &&
      (c.round === 0
        ? c.order.length === 0
        : c.order.length === 2 &&
          new Set(c.order).size === 2 &&
          c.order.every((a: any) => ['hero', 'enemy'].includes(a))) &&
      integer(c.actionIndex, 0, 2) &&
      (c.lastActor === null || ['hero', 'enemy'].includes(c.lastActor)) &&
      r.rounds >= c.round &&
      integer(c.minions, 0, 3) &&
      number(c.minionHp),
  );
  numericMap(c.timers, ids, 4);
  for (const [id, n] of Object.entries(c.timers))
    check(integer(n, 0, definition(s.inventory.find((i: Equipment) => i.id === id)).cooldown));
  numericMap(c.heals, ids, 2);
  for (const n of Object.values(c.heals)) check(integer(n, 0, 2));
  numericMap(c.hits, ids, 1e9);
  contributions(c.contributions);
  check(
    object(c.counters) &&
      Object.keys(c.counters).length <= 50 &&
      Object.values(c.counters).every((v) => integer(v)),
  );
  if (s.enemy !== null) {
    const e = s.enemy;
    check(
      object(e) &&
        text(e.name) &&
        integer(e.species, 0, 23) &&
        number(e.hp) &&
        number(e.maxHp) &&
        e.maxHp > 0 &&
        e.hp <= e.maxHp &&
        number(e.attack) &&
        number(e.defense) &&
        integer(e.speed, 1, 100) &&
        typeof e.isBoss === 'boolean' &&
        typeof e.isElite === 'boolean' &&
        Array.isArray(e.effects) &&
        e.effects.length <= 3,
    );
    for (const x of e.effects)
      check(
        object(x) &&
          ['poison', 'burn', 'chill'].includes(x.kind) &&
          number(x.damage) &&
          integer(x.remaining, 1, 3) &&
          x.timer === 0 &&
          ids.has(x.sourceId) &&
          (x.kind !== 'chill' || x.damage <= 0.3),
      );
  }
  if (s.lastReport !== null) {
    const a = s.lastReport;
    check(
      object(a) &&
        integer(a.event, 1, RUN_LENGTH) &&
        number(a.seconds) &&
        integer(a.rounds) &&
        typeof a.won === 'boolean' &&
        text(a.reason),
    );
    contributions(a.items);
  }
  if (r.summary !== null) {
    const a = r.summary;
    check(
      object(a) &&
        ['win', 'death', 'retreat'].includes(a.outcome) &&
        integer(a.chapter, 1, 20) &&
        PROFESSION_KEYS.includes(a.profession) &&
        integer(a.completed, 0, RUN_LENGTH) &&
        number(a.gold) &&
        integer(a.kills, 0, 42) &&
        number(a.seconds) &&
        integer(a.rounds) &&
        integer(a.highestItem, 1, 5) &&
        integer(a.links, 0, 200) &&
        text(a.reason) &&
        m.heroes.some(
          (h: HeroRecord) =>
            h.id === a.heroId && h.profession === a.profession && h.outcome === a.outcome,
        ),
    );
    check(a.gold === (a.outcome === 'win' ? (100 + a.chapter * 15) * (r.extreme ? 2 : 1) : 0));
  }
  check(
    integer(s.revision) &&
      integer(s.logSerial) &&
      number(s.lastSaveTime, 8.64e15) &&
      Array.isArray(s.log) &&
      s.log.length <= 50,
  );
  for (const l of s.log)
    check(
      object(l) &&
        integer(l.id, 1) &&
        text(l.text, 500) &&
        ['system', 'battle', 'reward'].includes(l.kind),
    );
  check(
    typeof s.skipCombat === 'boolean' &&
      typeof s.isRunning === 'boolean' &&
      [1, 2, 4].includes(s.speed),
  );
  if (s.phase === 'combat' && ['elite', 'boss'].includes(current?.kind))
    check(r.trials[trialIndex(r.index)] !== null);
  if (s.phase === 'combat')
    check(
      c.round >= 1 &&
        s.enemy !== null &&
        ['battle', 'elite', 'boss'].includes(current.kind) &&
        !current.completed &&
        r.rewards.length === 0 &&
        JSON.stringify(s.draft) === JSON.stringify(s.placements),
    );
  else check(s.enemy === null);
  if (s.phase === 'event')
    check(
      ([
        'rest',
        'supply',
        'treasure',
        'chance',
        'choice',
        'dig',
        'graduation',
        'mentor',
        'ending',
      ].includes(current.kind) ||
        (['elite', 'boss'].includes(current.kind) && r.trials[trialIndex(r.index)] === null)) &&
        !current.completed &&
        r.rewards.length === 0,
    );
  if (s.awakening !== null) {
    const a = s.awakening;
    check(
      object(a) &&
        s.phase === 'awakening' &&
        integer(a.stage, 1, 3) &&
        a.stage === r.stages &&
        integer(a.tier, 0, 2) &&
        a.tier === r.trials[a.stage - 1] &&
        number(a.attack) &&
        number(a.hp) &&
        number(a.defense) &&
        integer(a.healed) &&
        current?.completed &&
        TRIAL_NODES.includes(r.index) &&
        r.rewards.length === 1,
    );
  } else check(s.phase !== 'awakening');
  if (s.phase === 'reward') check(current.completed && r.rewards.length === 1);
  if (s.phase === 'initial')
    check(
      r.resonances.length === 0 &&
        r.stages === 0 &&
        r.index === 0 &&
        r.rewards[0]?.kind === 'resonance',
    );
  if (s.phase === 'journey')
    check(
      !current.completed &&
        r.rewards.length === 0 &&
        r.resonances.length === 1 + r.stages &&
        r.dig === null &&
        r.lastLootIds.length === 0,
    );
  if (s.phase === 'camp') check(r.rewards.length === 0 && r.resonances.length === 1 + r.stages);
  if (['summary', 'home', 'chapter', 'configure'].includes(s.phase))
    check(
      s.inventory.length === 0 &&
        s.placements.length === 0 &&
        s.draft.length === 0 &&
        r.rewards.length === 0 &&
        r.resonances.length === 0,
    );
  if (s.phase === 'summary') check(r.summary !== null && r.summary.heroId === r.trainee.id);
  return s as GameState;
}
export function saveGame(state: GameState) {
  state.lastSaveTime = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
export function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? parseSave(raw) : null;
}
