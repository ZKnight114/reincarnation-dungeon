import {
  bagCells,
  BUFF_KEYS,
  buildSources,
  definition,
  finalAttributes,
  itemStats,
  occupiedCells,
  PROFESSION_KEYS,
  RESONANCE_KEYS,
  RESONANCES,
  resonanceScore,
  runBagCells,
  validateLayout,
} from './backpack';
import { battleRuntime, fighter } from './combat';
import { ENEMY_TEMPLATES } from './enemies';
import { ACTION_SECONDS, createState, ENERGY_CAP, STORY_SECONDS } from './game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_POINTS, pointsSpent, TALENT_KEYS, TALENTS } from './hero';
import { runRoute, stageGrowth } from './journey';
import { emptyTomes, heroRating, tome, tomeBranch, TOMES } from './progression';
import { resonanceAvailable, validResonanceOrder } from './resonances';
import { itemSkills } from './skills';
import type { Equipment, GameState, HeroRecord, Placement, Trainee } from './types';
export const SAVE_KEY = 'recursion-dungeon-save-v15';
export function cleanLegacyData(_storage: Storage = localStorage) {
  /* Keep previous saves and backups intact. */
}
function migrateV14(old: any) {
  const defaults = createState(old.lastSaveTime ?? Date.now());
  const s = {
    ...defaults,
    ...old,
    version: 15,
    meta: { ...defaults.meta, ...old.meta },
    run: { ...defaults.run, ...old.run },
    combat: { ...defaults.combat, ...old.combat, runtime: null },
  } as GameState;
  s.meta.staminaSpent = 0;
  s.meta.guildLevel = 1;
  s.meta.tomes = emptyTomes();
  s.meta.tomeGifts = [];
  s.meta.pendingPages = [];
  const upgrade = (i: Equipment) => {
    i.level = Math.min(4, i.level);
    Object.assign(i, itemStats(i.templateId, i.level, i.profession));
    i.quality = (['white', 'green', 'blue', 'purple'] as const)[i.level - 1];
  };
  [...s.inventory, ...s.run.starterOffers, ...(s.run.dig?.equipment ?? [])].forEach(upgrade);
  s.run.highestItem = Math.min(4, s.run.highestItem);
  s.combat.stamina = 0;
  s.combat.mana = 0;
  // Old cooldowns may survive between encounters; normalize in every phase.
  for (const id of Object.keys(s.combat.timers)) {
    const item = s.inventory.find((i) => i.id === id);
    if (!item) delete s.combat.timers[id];
    else
      s.combat.timers[id] = Math.min(
        s.combat.timers[id],
        itemSkills(item.templateId, item.level)[0]?.cooldown ?? 0,
      );
  }
  const own = (p: typeof s.run.profession) => {
    const id = TOMES.find((t) => t.profession === p)!.id;
    s.meta.tomes[id].level = 1;
    if (!s.meta.tomeGifts.includes(p)) s.meta.tomeGifts.push(p);
    return id;
  };
  for (const h of s.meta.heroes) {
    h.ratingVersion = 14;
    h.realmStart = 0;
    h.realm = h.stages;
    h.guildAtGraduation = 1;
    h.routeLength = 37;
    h.normalLength = 32;
    h.tomeId = null;
    h.tomeLevel = 0;
    h.loadout?.equipment.forEach(upgrade);
    h.resonanceTiers = Object.fromEntries(
      h.resonances.map((k) => [
        k,
        resonanceScore(h.loadout?.equipment ?? [], h.loadout?.placements ?? [], k).tier,
      ]),
    );
  }
  if (s.run.trainee) {
    s.run.trainee.realmStart = 0;
    s.run.trainee.tomeId = own(s.run.profession);
    s.run.trainee.tomeLevel = 1;
    s.run.realm = s.run.stages;
    s.run.boundTome = { id: s.run.trainee.tomeId, level: 1 };
  }
  s.run.legacyRoute = s.run.events.length === 37;
  if (s.run.summary) s.run.summary.highestItem = Math.min(4, s.run.summary.highestItem);
  if (s.phase === 'combat' && s.enemy) {
    const ids: Record<number, string> = {
      0: 'wraith',
      6: 'skeleton',
      7: 'slime',
      8: 'bat',
      9: 'spider',
      10: 'golem',
      11: 'wolf',
      14: 'ogre',
      17: 'dragon',
      18: 'bone_king',
      19: 'queen',
    };
    s.enemy.templateId = ids[s.enemy.species] ?? 'skeleton';
    s.enemy.profession = ['wraith', 'dragon'].includes(s.enemy.templateId)
      ? 'mage'
      : ['bat', 'wolf', 'spider', 'queen'].includes(s.enemy.templateId)
        ? 'rogue'
        : 'warrior';
    s.enemy.isBoss = s.enemy.isBoss || s.enemy.isElite;
    s.enemy.isElite = false;
    const stats = finalAttributes(s);
    s.player.maxHp = stats.hp;
    s.player.hp = Math.min(stats.hp, s.player.hp);
    s.player.defense = stats.defense;
    s.combat.runtime = battleRuntime(
      fighter(stats, s.run.profession, s.player.hp),
      fighter(
        {
          attack: s.enemy.attack,
          hp: s.enemy.maxHp,
          defense: s.enemy.defense,
          speed: s.enemy.speed,
        },
        s.enemy.profession,
        s.enemy.hp,
      ),
      buildSources(s as GameState),
      s.enemy.templateId,
    );
    s.combat.runtime.hero.shield = Math.min(stats.hp * 0.5, s.player.shield);
    s.combat.runtime.tiers = {
      ...Object.fromEntries(
        s.run.resonances.map((k) => [k, resonanceScore(s.inventory, s.placements, k).tier]),
      ),
    };
    s.player.shield = s.combat.runtime.hero.shield;
    for (const [id, timer] of Object.entries(s.combat.timers)) {
      const source = s.combat.runtime.sources.find((x) => x.id === id),
        value = Math.min(timer, source?.skills[0]?.cooldown ?? 0);
      s.combat.runtime.timers[id + ':0'] = value;
      s.combat.timers[id] = value;
    }
    s.combat.runtime.heroActions = Math.max(0, s.combat.round - 1);
    s.combat.runtime.enemyActions = Math.max(0, s.combat.round - 1);
    s.combat.bossTimer = s.combat.runtime.enemyActions;
    const runtime = s.combat.runtime;
    // Keep the saved action queue even when the new stats change initiative.
    if (s.combat.order.length) runtime.heroFirst = s.combat.order[0] === 'hero';
    runtime.enemy.statuses = s.enemy.effects.map((x) => ({
      kind: x.kind,
      value: x.damage,
      remaining: x.remaining,
      source: x.sourceId,
    }));
    for (const [id, used] of Object.entries(s.combat.heals)) {
      const source = runtime.sources.find((x) => x.id === id);
      source?.skills.forEach((skill, index) =>
        skill.actions.forEach((a, n) => {
          if (a.kind === 'heal') runtime.charges[id + ':heal:' + index + ':' + n] = used;
        }),
      );
    }
    for (const [id, hits] of Object.entries(s.combat.hits)) runtime.flags[id + ':hits'] = hits;
    const actors = Math.max(0, s.combat.round - 1);
    runtime.heroActions =
      actors + (s.combat.order.slice(0, s.combat.actionIndex).includes('hero') ? 1 : 0);
    runtime.enemyActions =
      actors + (s.combat.order.slice(0, s.combat.actionIndex).includes('enemy') ? 1 : 0);
    s.combat.bossTimer = runtime.enemyActions;
    if (s.combat.minions > 0 && s.combat.minionHp > 0) {
      const count = Math.min(2, s.combat.minions),
        hp = s.combat.minionHp / count;
      runtime.minions = Array.from({ length: count }, (_, n) => ({
        ...fighter(
          { attack: s.enemy!.attack, hp, defense: s.enemy!.defense, speed: s.enemy!.speed },
          s.enemy!.profession!,
        ),
        id: 'minion:' + (n + 1),
        activeAt: runtime.enemyActions + 1,
      }));
      runtime.summons = count;
      s.combat.minions = count;
    }
    s.run.encounter = structuredClone(s.enemy);
  }
  return s;
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
  check(integer(v.realmStart, 0, 17));
  check(
    (v.tomeId === null && v.tomeLevel === 0) ||
      (TOMES.some((t) => t.id === v.tomeId) && integer(v.tomeLevel, 1, 3)),
  );
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
  check(
    integer(h.routeLength, 18, 37) &&
      integer(h.normalLength, 18, h.routeLength) &&
      integer(h.guildAtGraduation, 1, 10) &&
      h.realm === Math.min(20, (h.realmStart ?? 0) + h.stages),
  );
  check(pointsSpent(v) === ATTRIBUTE_POINTS);
  check(
    PROFESSION_KEYS.includes(h.profession) &&
      integer(h.chapter, 1, 20) &&
      ['win', 'death', 'retreat'].includes(h.outcome) &&
      integer(h.completed, 0, h.routeLength) &&
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
  check([14, 15].includes(h.ratingVersion));
  check(h.rating === heroRating(h.power, h.outcome, h.ratingVersion));
  check(
    h.outcome !== 'win' ||
      ([h.normalLength, h.routeLength].includes(h.completed) && h.stages === 3),
  );
  trials(h.trials, h.stages);
  check(object(h.loadout));
  if (h.loadout !== null) {
    const b = h.loadout;
    check(object(b) && Array.isArray(b.equipment) && b.equipment.length <= 42);
    b.equipment.forEach(item);
    check(
      new Set(b.equipment.map((i: Equipment) => i.id)).size === b.equipment.length &&
        b.equipment.every((i: Equipment) => allowedEquipment(i, h.profession, h.tomeId)),
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
      integer(v.level, 1, 4),
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
  check(object(v) && Object.keys(v).length <= 100);
  for (const [id, x] of Object.entries(v)) {
    check(
      /^(item-\d+|resonance:[a-z_]+|tome:[a-z_]+)$/.test(id) &&
        object(x) &&
        text(x.name) &&
        number(x.damage) &&
        number(x.healing) &&
        number(x.shield) &&
        integer(x.triggers),
    );
  }
}
function allowedEquipment(i: Equipment, profession: string, tomeId?: string | null) {
  if (i.profession === profession) return true;
  const b = tomeId ? tome(tomeId) : null;
  return !!b && i.profession === b.profession && i.branch === tomeBranch(b.id);
}
export function parseSave(source: string): GameState {
  check(source.length < 6_000_000, '存档过大');
  const raw = JSON.parse(source);
  safeKeys(raw);
  const s = raw.version === 14 ? migrateV14(raw) : raw;
  safeKeys(s);
  if (object(s.meta) && object(s.meta.tomes) && s.meta.tomeGifts === undefined)
    s.meta.tomeGifts = PROFESSION_KEYS.filter((p) =>
      TOMES.some((t) => t.profession === p && s.meta.tomes[t.id]?.level > 0),
    );
  check(object(s) && s.version === 15, '支持 v15 或 v14 公会存档');
  check(
    [
      'home',
      'chapter',
      'configure',
      'tome',
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
  check(object(s.meta) && object(s.run));
  check(integer(s.meta.guildLevel, 1, 10) && integer(s.meta.staminaSpent) && object(s.meta.tomes));
  check(Object.keys(s.meta.tomes).length === TOMES.length);
  check(
    Array.isArray(s.meta.tomeGifts) &&
      s.meta.tomeGifts.length <= 3 &&
      new Set(s.meta.tomeGifts).size === s.meta.tomeGifts.length &&
      s.meta.tomeGifts.every((p: any) => PROFESSION_KEYS.includes(p)),
  );
  for (const t of TOMES) {
    const o = s.meta.tomes[t.id];
    check(object(o) && integer(o.level, 0, 3) && integer(o.pages));
  }
  check(Array.isArray(s.meta.pendingPages) && s.meta.pendingPages.length <= 500);
  for (const reward of s.meta.pendingPages)
    check(
      object(reward) &&
        text(reward.heroId) &&
        Array.isArray(reward.choices) &&
        reward.choices.length >= 1 &&
        reward.choices.length <= 3 &&
        new Set(reward.choices).size === reward.choices.length &&
        reward.choices.every((id: string) => TOMES.some((t) => t.id === id)) &&
        typeof reward.refreshed === 'boolean' &&
        typeof reward.extreme === 'boolean',
    );
  check(
    integer(s.run.realm, 0, 20) &&
      number(s.run.peakStrength) &&
      Array.isArray(s.run.enemyHistory) &&
      s.run.enemyHistory.length <= 2 &&
      s.run.enemyHistory.every((p: string) => PROFESSION_KEYS.includes(p as any)),
  );
  if (s.run.boundTome)
    check(TOMES.some((t) => t.id === s.run.boundTome.id) && integer(s.run.boundTome.level, 1, 3));
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
  check(new Set(m.pendingPages.map((r: any) => r.heroId)).size === m.pendingPages.length);
  for (const reward of m.pendingPages)
    check(m.heroes.some((h: HeroRecord) => h.id === reward.heroId && h.outcome === 'win'));
  check(
    new Set(m.heroes.map((h: HeroRecord) => h.id)).size === m.heroes.length &&
      m.heroes.every((h: HeroRecord) => Number(h.id.slice(5)) <= m.heroSerial),
  );
  const r = s.run;
  check(
    object(r) &&
      PROFESSION_KEYS.includes(r.profession) &&
      integer(r.chapter, 1, m.highestChapter) &&
      integer(r.index, 0, runRoute(s as GameState).length - 1) &&
      integer(r.points) &&
      integer(r.kills, 0, 42) &&
      number(r.seconds) &&
      integer(r.rounds) &&
      integer(r.highestItem, 1, 4) &&
      integer(r.starterRound, 0, 2) &&
      integer(r.stages, 0, 3),
  );
  if (r.trainee !== null) {
    trainee(r.trainee);
    check(Number(r.trainee.id.slice(5)) <= m.heroSerial && r.trainee.profession === r.profession);
    check(r.realm === Math.min(20, r.trainee.realmStart + r.stages));
    if (r.trainee.tomeId && !r.boundTome)
      check(m.tomes[r.trainee.tomeId].level > 0 || !m.tomeGifts.includes(r.profession));
    if (r.boundTome)
      check(
        r.boundTome.id === r.trainee.tomeId &&
          r.boundTome.level === r.trainee.tomeLevel &&
          m.tomes[r.boundTome.id].level >= r.boundTome.level,
      );
  }
  if (
    [
      'configure',
      'tome',
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
      'tome',
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
        integer(entry.event, 0, runRoute(s as GameState).length) &&
        text(entry.title, 80) &&
        text(entry.text, 500) &&
        ['story', 'loot', 'growth', 'danger', 'rest'].includes(entry.kind),
    );
  check(object(r.growth));
  const growth = stageGrowth(r.profession, r.trials, r.stages);
  for (const k of ['attack', 'hp', 'defense'] as const)
    check(number(r.growth[k]) && Math.abs(r.growth[k] - growth[k]) < 1e-7);
  check(
    Array.isArray(r.events) &&
      (r.events.length === 0 || r.events.length === runRoute(s as GameState).length),
  );
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
        (e: GameState['run']['events'][number], n: number) =>
          e.kind === runRoute(s as GameState).kinds[n],
      ),
    );
    for (let n = 0; n < runRoute(s as GameState).length; n++)
      check(n < r.index ? r.events[n].completed : n > r.index ? !r.events[n].completed : true);
    check(r.stages === runRoute(s as GameState).trials.filter((n) => r.events[n].completed).length);
  }

  check(Array.isArray(s.inventory) && s.inventory.length <= 500);
  s.inventory.forEach(item);
  const ids = new Set<string>(s.inventory.map((i: Equipment) => i.id));
  check(
    ids.size === s.inventory.length &&
      s.inventory.every((i: Equipment) => allowedEquipment(i, r.profession, r.boundTome?.id)),
  );
  layout(s.placements, s.inventory, runBagCells(s as GameState));
  layout(s.draft, s.inventory, runBagCells(s as GameState));
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
        r.events.length === runRoute(s as GameState).length &&
        r.summary === null &&
        s.inventory.length > 0 &&
        r.resonances.length <= 1 + r.stages,
    );
  if (s.phase === 'opening')
    check(
      r.events.length === runRoute(s as GameState).length &&
        r.summary === null &&
        r.resonances.length === 0 &&
        r.stages === 0 &&
        r.boundTome !== null &&
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
    check(d.equipment.every((i: Equipment) => allowedEquipment(i, r.profession, r.boundTome?.id)));
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
      integer(c.bossTimer, 0, 100000) &&
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
    check(
      integer(
        n,
        0,
        itemSkills(
          s.inventory.find((i: Equipment) => i.id === id)!.templateId,
          s.inventory.find((i: Equipment) => i.id === id)!.level,
        )[0]?.cooldown ?? 0,
      ),
    );
  numericMap(c.heals, ids, 3);
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
        e.effects.length <= 100,
    );
    for (const x of e.effects)
      check(
        object(x) &&
          ['poison', 'burn', 'chill'].includes(x.kind) &&
          number(x.damage) &&
          integer(x.remaining, 1, 3) &&
          x.timer === 0 &&
          typeof x.sourceId === 'string' &&
          (x.kind !== 'chill' || x.damage <= 0.3),
      );
  }
  if (s.combat.runtime !== null) {
    const r = s.combat.runtime;
    check(
      object(r) &&
        Array.isArray(r.sources) &&
        r.sources.length <= 60 &&
        object(r.flags) &&
        object(r.timers) &&
        object(r.charges) &&
        Array.isArray(r.minions) &&
        r.minions.length <= 2 &&
        integer(r.summons, 0, 3) &&
        integer(r.heroActions) &&
        integer(r.enemyActions) &&
        typeof r.phase === 'boolean' &&
        text(r.warning),
    );
    for (const f of [r.hero, r.enemy, ...r.minions]) {
      check(
        object(f) &&
          number(f.hp) &&
          number(f.maxHp) &&
          f.maxHp > 0 &&
          f.hp <= f.maxHp &&
          number(f.attack) &&
          number(f.defense) &&
          number(f.speed) &&
          number(f.shield) &&
          f.shield <= f.maxHp * 0.5 + 1e-7 &&
          PROFESSION_KEYS.includes(f.profession) &&
          Array.isArray(f.statuses) &&
          f.statuses.length <= 100,
      );
      for (const x of f.statuses)
        check(
          ['poison', 'burn', 'chill', 'break', 'mark'].includes(x.kind) &&
            number(x.value) &&
            integer(x.remaining, 1, 3) &&
            text(x.source),
        );
    }
    for (const map of [r.flags, r.timers, r.charges])
      check(Object.keys(map).length <= 1000 && Object.values(map).every((n) => number(n)));
    check(
      JSON.stringify(r.sources) === JSON.stringify(buildSources(s as GameState)),
      '战斗技能与构筑不一致',
    );
    check(
      ENEMY_TEMPLATES.some((e) => e.id === r.enemyId && e.profession === r.enemy.profession) &&
        typeof r.mixed === 'boolean' &&
        typeof r.heroFirst === 'boolean',
    );
    for (const source of r.sources)
      source.skills.forEach((skill: any, index: number) => {
        const timer = r.timers[source.id + ':' + index];
        if (timer !== undefined) check(integer(timer, 0, skill.cooldown));
      });
    for (const minion of r.minions)
      check(
        /^minion:[1-3]$/.test(minion.id) &&
          integer(minion.activeAt, 1) &&
          minion.profession === r.enemy.profession,
      );
    if (s.phase === 'combat')
      check(
        r.hero.hp === s.player.hp && r.enemy.hp === s.enemy.hp && r.hero.shield === s.player.shield,
      );
  }
  if (s.phase === 'combat') check(s.combat.runtime !== null);
  if (s.run.encounter !== null) {
    const e = s.run.encounter;
    check(
      object(e) &&
        ENEMY_TEMPLATES.some((t) => t.id === e.templateId && t.profession === e.profession) &&
        number(e.hp) &&
        number(e.maxHp) &&
        e.hp > 0 &&
        e.hp <= e.maxHp &&
        number(e.attack) &&
        number(e.defense) &&
        integer(e.speed, 1, 100) &&
        text(e.name) &&
        typeof e.isBoss === 'boolean' &&
        e.isElite === false &&
        integer(e.species, 0, 23),
    );
  }
  if (s.lastReport !== null) {
    const a = s.lastReport;
    check(
      object(a) &&
        integer(a.event, 1, runRoute(s as GameState).length) &&
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
        integer(a.completed, 0, runRoute(s as GameState).length) &&
        number(a.gold) &&
        integer(a.kills, 0, 42) &&
        number(a.seconds) &&
        integer(a.rounds) &&
        integer(a.highestItem, 1, 4) &&
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
    check(r.trials[runRoute(s as GameState).trials.indexOf(r.index)] !== null);
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
        (['elite', 'boss'].includes(current.kind) &&
          r.trials[runRoute(s as GameState).trials.indexOf(r.index)] === null)) &&
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
        runRoute(s as GameState).trials.includes(r.index) &&
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
  if (['summary', 'home', 'chapter', 'configure', 'tome'].includes(s.phase))
    check(
      s.inventory.length === 0 &&
        s.placements.length === 0 &&
        s.draft.length === 0 &&
        r.rewards.length === 0 &&
        r.resonances.length === 0,
    );
  if (s.phase === 'tome') check(r.boundTome === null && r.events.length === 0);
  if (s.phase === 'summary') check(r.summary !== null && r.summary.heroId === r.trainee.id);
  return s as GameState;
}
export function saveGame(state: GameState) {
  state.lastSaveTime = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
export function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) return parseSave(raw);
  const previous = localStorage.getItem('recursion-dungeon-save-v14');
  if (!previous) return null;
  // Back up exact bytes before migration; leave both old and backup keys in place.
  const key = 'recursion-dungeon-save-v14-backup';
  if (!localStorage.getItem(key)) localStorage.setItem(key, previous);
  return parseSave(previous);
}
