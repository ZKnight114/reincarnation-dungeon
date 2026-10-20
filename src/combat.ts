import type {
  BattleRuntime,
  Condition,
  Fighter,
  Skill,
  SkillAction,
  Source,
  StatusKind,
} from './skill-types';
import type { Attributes, DamageType, Profession } from './types';

export const COUNTERS: Record<Profession, Record<Profession, number>> = {
  warrior: { warrior: 1, mage: 0.9, rogue: 1.15 },
  mage: { warrior: 1.15, mage: 1, rogue: 0.9 },
  rogue: { warrior: 0.9, mage: 1.15, rogue: 1 },
};
export const enrageMultiplier = (round: number) =>
  round <= 15 ? 1 : Math.min(1.8, 1.2 + Math.floor((round - 16) / 2) * 0.2);
export const damageValue = (
  raw: number,
  type: DamageType,
  defense: number,
  attacker: Profession,
  defender: Profession,
  ignore = 0,
) =>
  raw *
  (type === 'true'
    ? 1
    : (60 / (60 + Math.max(0, defense) * (1 - ignore) * (type === 'magic' ? 0.7 : 1))) *
      COUNTERS[attacker][defender]);
export const statusValue = (f: Fighter, kind: StatusKind) =>
  Math.max(0, ...f.statuses.filter((s) => s.kind === kind).map((s) => s.value));
export const fighterSpeed = (f: Fighter) => f.speed * (1 - statusValue(f, 'chill'));
export interface BattleSignal {
  source: string;
  kind: 'damage' | 'healing' | 'shield' | 'hurt' | 'blocked' | 'trigger' | 'activation';
  amount: number;
}
type Emit = (signal: BattleSignal) => void;

export const isEnemySource = (id: string) => id.startsWith('enemy:') || id.startsWith('minion:');

function enemyPlan(id: string, n: number, guard: boolean, queenStrike: boolean) {
  const hit = (a = 1, type: DamageType = 'physical', ignore = 0): SkillAction => ({
    kind: 'damage',
    a,
    type,
    ignore,
  });
  const dot = (status: 'poison' | 'burn', a: number): SkillAction => ({
    kind: 'status',
    status,
    a,
    duration: 2,
  });
  let actions: SkillAction[] = [hit()],
    warning = '',
    summon = false;
  if (id === 'slime' && guard) actions.unshift({ kind: 'shield', h: 0.04 });
  if (id === 'skeleton' && n % 3 === 0)
    actions = [hit(1.1), { kind: 'status', status: 'break', a: 0.1, duration: 2 }];
  if (id === 'wolf' && n % 3 === 0) actions = [{ ...hit(0.65), hits: 2 }];
  if (id === 'spider') actions = [hit(0.8), dot('poison', 0.08)];
  if (id === 'wraith')
    actions = n % 3 === 0 ? [hit(0.7, 'magic'), dot('burn', 0.1)] : [hit(0.9, 'magic')];
  if (id === 'golem') {
    actions = n % 3 === 0 ? [hit(1.3), dot('burn', 0.08)] : [hit()];
    if (guard) actions.unshift({ kind: 'shield', h: 0.05 });
  }
  if (id === 'ogre') {
    if (n >= 3 && n % 3 === 0) {
      actions = [hit(0.5)];
      warning = '下次行动：粉碎重击';
    }
    if (n >= 4 && n % 3 === 1) actions = [hit(2, 'physical', 0.15)];
  }
  if (id === 'dragon') {
    actions = [hit(0.9)];
    if (n % 3 === 2) {
      actions = [hit(0.6)];
      warning = '下次行动：月焰吐息';
    }
    if (n % 3 === 0) actions = [hit(1.5, 'magic'), dot('burn', 0.1)];
  }
  if (id === 'bone_king') {
    if (n % 4 === 3) {
      actions = [hit(0.6), { kind: 'shield', h: 0.04 }];
      warning = '下次行动：白骨裁决';
    }
    if (n % 4 === 0) actions = [hit(1.9, 'physical', 0.2)];
  }
  if (id === 'queen') {
    actions = [hit(0.9 * (queenStrike ? 1.3 : 1)), dot('poison', 0.08)];
    if (n % 4 === 3) {
      actions = [];
      warning = '下次行动：孵化';
    } else if (n % 4 === 0) {
      actions = [hit(0.5)];
      summon = true;
    }
  }
  return { actions, warning, summon };
}

type EnemyStep = { actions: SkillAction[]; minion?: string; summon?: boolean };
/** Rebuild a frozen template recipe instead of saving arbitrary executable skills. */
export function enemySteps(r: BattleRuntime): EnemyStep[] {
  const cursor = r.enemyTurn;
  if (!cursor) return [];
  const plan = enemyPlan(r.enemyId, r.enemyActions, cursor.guard, cursor.queenStrike);
  const steps: EnemyStep[] = [];
  for (const action of plan.actions) {
    if (action.kind === 'damage') {
      for (let hit = 0; hit < (action.hits ?? 1); hit++)
        steps.push({ actions: [{ ...action, hits: 1 }] });
    } else if (steps.length) steps[steps.length - 1].actions.push(action);
    else steps.push({ actions: [action] });
  }
  if (plan.summon) steps.push({ actions: [], summon: true });
  for (const minion of cursor.minions) steps.push({ actions: [], minion });
  return steps;
}

export function orderedHeroSources(sources: Source[]) {
  const priority = (s: Source) =>
    s.kind === 'tome'
      ? 2
      : s.kind === 'resonance'
        ? 3
        : s.skills.some((k) => k.actions.some((a) => a.kind === 'damage'))
          ? 1
          : 0;
  return [...sources].sort((a, b) => priority(a) - priority(b));
}
export function fighter(stats: Attributes, p: Profession, hp = stats.hp): Fighter {
  return {
    hp,
    maxHp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    profession: p,
    shield: 0,
    statuses: [],
  };
}
export function battleRuntime(
  hero: Fighter,
  enemy: Fighter,
  sources: Source[],
  enemyId: string,
  mixed = false,
): BattleRuntime {
  return {
    hero,
    enemy,
    sources,
    enemyId,
    heroActions: 0,
    enemyActions: 0,
    timers: {},
    charges: {},
    flags: {},
    minions: [],
    summons: 0,
    phase: false,
    warning: '',
    tiers: {},
    mixed,
    heroFirst: fighterSpeed(hero) >= fighterSpeed(enemy),
  };
}

export class BattleEngine {
  private lastSourceWorked = false;
  constructor(
    public r: BattleRuntime,
    public round: number,
    private emit: Emit = () => {},
    private neutral = false,
  ) {}
  private target(side: 'hero' | 'enemy'): Fighter {
    return side === 'enemy' ? this.r.hero : (this.r.minions.find((m) => m.hp > 0) ?? this.r.enemy);
  }
  private actor(side: 'hero' | 'enemy'): Fighter {
    return this.r[side];
  }
  private alive() {
    return this.r.hero.hp > 0 && this.r.enemy.hp > 0;
  }
  private has(f: Fighter, k: StatusKind) {
    return statusValue(f, k) > 0;
  }
  private condition(c: Condition | undefined, self: Fighter, target: Fighter) {
    if (!c) return true;
    if (['poison', 'burn', 'chill', 'break', 'mark'].includes(c))
      return this.has(target, c as StatusKind);
    if (c === 'shield') return self.shield > 0;
    if (c === 'smoke') return this.has(self, 'smoke');
    if (c === 'first') return this.r.heroFirst;
    if (c === 'mixed') return this.r.mixed;
    if (c === 'icefire') return this.has(target, 'burn') && this.has(target, 'chill');
    if (c === 'targetLow') return target.hp <= target.maxHp * 0.3;
    return self.hp <= self.maxHp * 0.5;
  }
  private dot(f: Fighter, k: 'poison' | 'burn', attack: number) {
    return Math.min(
      attack * 0.4,
      f.statuses.filter((s) => s.kind === k).reduce((n, s) => n + s.value, 0),
    );
  }
  private enemyScale() {
    return (
      1 +
      (enrageMultiplier(this.round) - 1) +
      (this.r.phase && this.r.enemyId === 'bone_king' ? 0.1 : 0)
    );
  }
  private phase() {
    const e = this.r.enemy,
      id = this.r.enemyId;
    if (e.hp <= 0) return;
    if (id === 'ogre' && e.hp <= e.maxHp * 0.4 && !this.r.flags.ogreHeal) {
      this.r.flags.ogreHeal = 1;
      const before = e.hp;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06);
      this.emit({ source: 'enemy:ogre', kind: 'healing', amount: e.hp - before });
    }
    if (['bone_king', 'queen'].includes(id) && e.hp <= e.maxHp * 0.5 && !this.r.phase) {
      this.r.phase = true;
      if (id === 'bone_king') e.shield = Math.min(e.maxHp * 0.5, e.shield + e.maxHp * 0.05);
      else this.r.flags.queenStrike = 1;
    }
  }
  private damage(
    target: Fighter,
    raw: number,
    type: DamageType,
    side: 'hero' | 'enemy',
    source: string,
    ignore = 0,
    direct = true,
  ) {
    const self = this.actor(side),
      before = target.hp,
      shield = target.shield;
    const defense = target.defense * (1 - statusValue(target, 'break'));
    const amount = this.neutral
      ? raw *
        (type === 'true' ? 1 : 60 / (60 + defense * (1 - ignore) * (type === 'magic' ? 0.7 : 1)))
      : damageValue(raw, type, defense, self.profession, target.profession, ignore) *
        (side === 'enemy' ? this.enemyScale() : 1);
    const protectedAmount = direct
      ? amount * (1 - Math.min(0.45, statusValue(target, 'smoke')))
      : amount;
    const absorbed = Math.min(shield, protectedAmount);
    target.shield -= absorbed;
    target.hp = Math.max(0, target.hp - (protectedAmount - absorbed));
    if (side === 'hero')
      this.emit({ source, kind: 'damage', amount: absorbed + before - target.hp });
    else {
      this.emit({ source: 'hero', kind: 'blocked', amount: absorbed });
      this.emit({ source: 'hero', kind: 'hurt', amount: before - target.hp });
    }
    this.phase();
    if (side === 'hero' && direct && before > target.hp && this.r.hero.hp > 0) {
      const src = this.r.sources.find((s) => s.id === source);
      const key = 'talentLifesteal:' + this.round;
      const healed = Math.max(
        0,
        Math.min(
          (before - target.hp) * (src?.lifesteal ?? 0),
          self.maxHp * 0.02 - (this.r.flags[key] ?? 0),
          self.maxHp - self.hp,
        ),
      );
      self.hp += healed;
      this.r.flags[key] = (this.r.flags[key] ?? 0) + healed;
      if (healed) this.emit({ source, kind: 'healing', amount: healed });
    }
    if (side === 'enemy' && direct && target.hp > 0 && this.alive()) {
      const rate = this.r.sources.reduce((n, s) => n + (s.reflect ?? 0), 0);
      const key = 'talentReflect:' + this.round;
      const reflected = Math.max(
        0,
        Math.min((before - target.hp) * rate, target.attack * 0.1 - (this.r.flags[key] ?? 0)),
      );
      this.r.flags[key] = (this.r.flags[key] ?? 0) + reflected;
      if (reflected) this.damage(self, reflected, 'true', 'hero', this.r.sources[0].id, 0, false);
    }
    if (side === 'enemy' && target.hp > 0 && this.alive())
      this.respond(
        shield > 0,
        shield > 0 && target.shield === 0,
        before,
        target.hp,
        protectedAmount,
        direct,
        this.r.minions.find((m) => m.id === source) ?? self,
      );
    return before - target.hp;
  }
  private respond(
    hadShield: boolean,
    broke: boolean,
    before: number,
    after: number,
    received: number,
    direct: boolean,
    enemy: Fighter,
  ) {
    // Freeze every eligibility before any response adds a shield or heals.
    const queue: { source: Source; skill: Skill; index: number }[] = [];
    for (const source of this.r.sources)
      source.skills.forEach((skill, index) => {
        const t = skill.trigger;
        const low = (fraction: number) =>
          after <= this.r.hero.maxHp * fraction &&
          (before > this.r.hero.maxHp * fraction || !this.r.flags.heroReceived);
        if (
          (t === 'shieldHit' && direct && hadShield) ||
          (t === 'shieldBreak' && broke) ||
          (t === 'low30' && low(0.3)) ||
          (t === 'low50' && low(0.5))
        )
          queue.push({ source, skill, index });
      });
    this.r.flags.heroReceived = 1;
    if (direct)
      for (const source of this.r.sources) {
        const key = source.id + ':counter',
          roundKey = key + ':round';
        if ((this.r.charges[key] ?? 0) > 0 && this.r.flags[roundKey] !== this.round) {
          this.r.flags[roundKey] = this.round;
          this.r.charges[key] = 0;
          this.damage(
            enemy,
            (this.r.flags[key] ?? 0) * (1 + (source.counterBonus ?? 0)),
            'physical',
            'hero',
            source.id,
            0,
            false,
          );
        }
      }
    for (const q of queue) {
      const key = q.source.id + ':reaction:' + q.index;
      if (
        (q.skill.once && this.r.flags[key]) ||
        (!q.skill.once && this.r.flags[key] === this.round)
      )
        continue;
      this.r.flags[key] = q.skill.once ? 1 : this.round;
      this.execute(q.source, q.skill, 'hero', q.index, received, enemy, false);
    }
  }
  private applyStatus(
    target: Fighter,
    action: SkillAction,
    self: Fighter,
    source: string,
    bonus = 0,
  ) {
    const kind = action.status!,
      value = Math.min(
        ['poison', 'burn'].includes(kind) ? Infinity : kind === 'smoke' ? 0.45 : 0.3,
        (action.a ?? 0) * (1 + bonus) * (['poison', 'burn'].includes(kind) ? self.attack : 1),
      ),
      remaining = action.duration ?? 2;
    const old = target.statuses.find((s) => s.kind === kind && s.source === source);
    if (old) {
      old.value = value;
      old.remaining = remaining;
    } else target.statuses.push({ kind, value, remaining, source });
  }
  execute(
    source: Source,
    skill: Skill,
    side: 'hero' | 'enemy',
    index = 0,
    received = 0,
    forcedTarget?: Fighter,
    direct = true,
  ) {
    const self = this.actor(side),
      target = forcedTarget ?? this.target(side),
      snapshot = structuredClone(target),
      selfSnapshot = structuredClone(self);
    let consumed = 0,
      worked = false,
      lastTarget = target;
    for (const [actionIndex, action] of skill.actions.entries()) {
      if (!this.alive()) break;
      if (!this.condition(action.when, selfSnapshot, snapshot)) continue;
      const charge = source.id + ':heal:' + index + ':' + actionIndex;
      if (
        action.kind === 'heal' &&
        ((this.r.charges[charge] ?? 0) >= (action.limit ?? 3) || self.hp >= self.maxHp)
      )
        continue;
      worked = true;
      let raw =
        (action.a ?? 0) * self.attack +
        (action.h ?? 0) * self.maxHp +
        (action.d ?? 0) * self.defense;
      if (action.kind === 'damage') {
        const bonus = action.dot
          ? Math.min(
              this.dot(snapshot, action.dot, self.attack) * (action.dotScale ?? 1),
              self.attack * (action.cap ?? 1),
            )
          : action.received
            ? Math.min(received * action.received, self.attack * (action.cap ?? 1))
            : action.consumed
              ? Math.min(consumed * action.consumed, self.attack * (action.cap ?? 1))
              : 0;
        raw += bonus;
        if (action.bonusWhen && this.condition(action.bonusWhen, selfSnapshot, snapshot))
          raw *= 1 + (action.bonus ?? 0);
        if (source.kind === 'item' && action.type !== 'true' && direct)
          raw *=
            1 + (source.damageBonus ?? 0) + (source.ranged ? statusValue(snapshot, 'mark') : 0);
        raw *= 1 + (source.talentDamage ?? 0) + (direct ? (source.talentDirect ?? 0) : 0);
        for (let n = 0; n < (action.hits ?? 1) && this.alive(); n++) {
          const victim = forcedTarget ?? this.target(side);
          lastTarget = victim;
          const ignore =
            !action.ignoreWhen || this.condition(action.ignoreWhen, selfSnapshot, victim)
              ? (action.ignore ?? 0)
              : 0;
          const hpDamage = this.damage(
            victim,
            raw,
            action.type ?? 'physical',
            side,
            source.id,
            ignore,
            direct,
          );
          if (
            side === 'enemy' &&
            this.r.enemyId === 'bat' &&
            hpDamage > 0 &&
            self.hp > 0 &&
            self.hp < self.maxHp &&
            (this.r.charges.batHeal ?? 0) < 3
          ) {
            const beforeHeal = self.hp;
            self.hp = Math.min(self.maxHp, self.hp + hpDamage * 0.2);
            this.r.charges.batHeal = (this.r.charges.batHeal ?? 0) + 1;
            this.emit({ source: source.id, kind: 'healing', amount: self.hp - beforeHeal });
          }
        }
      } else if (action.kind === 'shield') {
        const before = self.shield;
        self.shield = Math.min(
          self.maxHp * 0.5,
          self.shield + raw * (1 + (source.shieldBonus ?? 0)),
        );
        if (side === 'hero')
          this.emit({ source: source.id, kind: 'shield', amount: self.shield - before });
      } else if (action.kind === 'heal') {
        const restored = Math.min(self.maxHp - self.hp, raw * (1 + (source.healBonus ?? 0)));
        self.hp += restored;
        if (restored > 0) {
          this.r.charges[charge] = (this.r.charges[charge] ?? 0) + 1;
          this.emit({ source: source.id, kind: 'healing', amount: restored });
        }
      } else if (action.kind === 'status') {
        if (lastTarget.hp > 0)
          this.applyStatus(
            lastTarget,
            action,
            self,
            source.id,
            (source.statusBonus?.[action.status!] ?? 0) +
              (['poison', 'burn'].includes(action.status!) ? (source.talentDamage ?? 0) : 0),
          );
      } else if (action.kind === 'smoke') {
        this.applyStatus(
          self,
          { ...action, status: 'smoke' },
          self,
          source.id,
          source.smokeBonus ?? 0,
        );
      } else if (action.kind === 'counter') {
        this.r.charges[source.id + ':counter'] = 1;
        this.r.flags[source.id + ':counter'] = raw * (1 + (source.talentDamage ?? 0));
      } else if (action.kind === 'consume') {
        consumed = self.shield * (action.h ?? 0.2);
        self.shield -= consumed;
      }
    }
    if (worked && side === 'hero') {
      this.lastSourceWorked = true;
      this.emit({ source: source.id, kind: 'trigger', amount: 1 });
    }
    return worked;
  }
  opening(initializeEnemy = true) {
    for (const source of this.r.sources)
      source.skills.forEach((s, i) => {
        if (!s.trigger && !s.cooldown && !s.every) this.execute(source, s, 'hero', i);
      });
    const id = this.r.enemyId,
      e = this.r.enemy;
    if (initializeEnemy)
      e.shield = id === 'golem' ? e.maxHp * 0.08 : id === 'dragon' ? e.maxHp * 0.05 : 0;
  }
  private statuses(side: 'hero' | 'enemy') {
    const targets =
      side === 'hero' ? [this.r.hero] : [this.r.enemy, ...this.r.minions.filter((m) => m.hp > 0)];
    const attacker = this.actor(side === 'hero' ? 'enemy' : 'hero'),
      opposite = side === 'hero' ? 'enemy' : 'hero';
    for (const target of targets)
      for (const kind of ['poison', 'burn'] as const) {
        const statuses = target.statuses.filter((s) => s.kind === kind),
          sum = statuses.reduce((n, s) => n + s.value, 0),
          factor = sum > attacker.attack * 0.4 ? (attacker.attack * 0.4) / sum : 1;
        for (const s of statuses) {
          if (target.hp <= 0) break;
          this.damage(
            target,
            s.value * factor,
            kind === 'poison' ? 'true' : 'magic',
            opposite,
            s.source,
            0,
            false,
          );
        }
      }
    this.r.minions = this.r.minions.filter((m) => m.hp > 0);
  }
  private expire(side: 'hero' | 'enemy') {
    for (const target of side === 'hero' ? [this.r.hero] : [this.r.enemy, ...this.r.minions]) {
      for (const s of target.statuses) if (s.kind !== 'smoke') s.remaining--;
      target.statuses = target.statuses.filter((s) => s.remaining > 0);
    }
    if (side === 'enemy')
      for (const f of [this.r.hero, this.r.enemy]) {
        for (const s of f.statuses) if (s.kind === 'smoke') s.remaining--;
        f.statuses = f.statuses.filter((s) => s.remaining > 0);
      }
  }
  beginHeroTurn() {
    if (this.r.heroTurn) return;
    this.statuses('hero');
    if (!this.alive()) return;
    this.r.heroActions++;
    this.r.heroTurn = { index: 0, tomeFired: false, supportFired: false };
  }
  private heroSources() {
    return orderedHeroSources(this.r.sources);
  }
  /** Apply one source now, including its immediate reactions; never precompute later damage. */
  nextHeroSource(): boolean {
    this.lastSourceWorked = false;
    const cursor = this.r.heroTurn;
    if (!cursor) return false;
    const sources = this.heroSources();
    if (this.alive() && cursor.index < sources.length) {
      const source = sources[cursor.index++];
      source.skills.forEach((skill, index) => {
        if (skill.trigger === 'tome' && cursor.tomeFired && this.alive()) {
          this.execute(source, skill, 'hero', index);
          return;
        }
        if (skill.trigger === 'support' && cursor.supportFired && this.alive()) {
          const roundKey = `${source.id}:${index}:supportRound`;
          if (this.r.flags[roundKey] !== this.round && this.execute(source, skill, 'hero', index))
            this.r.flags[roundKey] = this.round;
          return;
        }
        if (skill.trigger || !skill.cooldown || !this.alive()) return;
        const key = source.id + ':' + index;
        this.r.timers[key] = Math.max(0, (this.r.timers[key] ?? skill.initialDelay ?? 1) - 1);
        if (this.r.timers[key]) return;
        const fired = this.execute(source, skill, 'hero', index);
        if (fired) {
          this.r.timers[key] = skill.cooldown;
          this.r.flags[key + ':firedAt'] = this.r.heroActions;
          this.emit({ source: source.id, kind: 'activation', amount: 1 });
          if (source.kind === 'tome') cursor.tomeFired = true;
          if (source.kind === 'item' && source.family === 'support') cursor.supportFired = true;
          const itemKey = source.id;
          if (source.kind === 'item') {
            this.r.flags[itemKey + ':hits'] = (this.r.flags[itemKey + ':hits'] ?? 0) + 1;
            source.skills.forEach((extra, n) => {
              if (extra.every && this.r.flags[itemKey + ':hits'] % extra.every === 0)
                this.execute(source, extra, 'hero', n);
            });
          }
        }
      });
    }
    if (!this.alive() || cursor.index >= sources.length) {
      this.expire('hero');
      this.r.heroTurn = null;
    }
    return !!this.r.heroTurn;
  }
  /** Cooling/ineligible sources still tick exactly once, without consuming an animation beat. */
  nextHeroBeat() {
    do {
      this.nextHeroSource();
    } while (this.r.heroTurn && !this.lastSourceWorked);
  }
  /** Synchronous drain for estimates and internal tests, using exactly the same steps. */
  heroTurn() {
    this.beginHeroTurn();
    while (this.r.heroTurn) this.nextHeroSource();
  }
  beginEnemyTurn() {
    if (this.r.enemyTurn) return;
    this.statuses('enemy');
    if (!this.alive()) return;
    const n = ++this.r.enemyActions,
      id = this.r.enemyId,
      guard =
        (id === 'slime' && n % 3 === 0 && (this.r.charges.slimeShield ?? 0) < 3) ||
        (id === 'golem' && n % 4 === 0 && (this.r.charges.golemShield ?? 0) < 2);
    this.r.enemyTurn = {
      index: 0,
      guard,
      queenStrike: !!this.r.flags.queenStrike,
      minions: this.r.minions.filter((m) => m.hp > 0 && m.activeAt <= n).map((m) => m.id),
    };
    if (guard && id === 'slime') this.r.charges.slimeShield = (this.r.charges.slimeShield ?? 0) + 1;
    if (guard && id === 'golem') this.r.charges.golemShield = (this.r.charges.golemShield ?? 0) + 1;
    this.r.warning = enemyPlan(id, n, guard, this.r.enemyTurn.queenStrike).warning;
    if (id === 'queen' && n % 4 !== 3 && n % 4 !== 0) this.r.flags.queenStrike = 0;
  }
  nextEnemyStep() {
    const cursor = this.r.enemyTurn;
    if (!cursor) return;
    const steps = enemySteps(this.r),
      step = steps[cursor.index++];
    const e = this.r.enemy,
      n = this.r.enemyActions;
    if (step && this.alive()) {
      if (step.minion) {
        const minion = this.r.minions.find((m) => m.id === step.minion && m.hp > 0);
        if (minion) {
          this.emit({ source: minion.id, kind: 'activation', amount: 1 });
          this.damage(this.r.hero, e.attack * 0.3, 'physical', 'enemy', minion.id);
        }
      } else if (!step.summon) {
        const source = {
          id: 'enemy:' + this.r.enemyId,
          name: this.r.enemyId,
          kind: 'enemy' as const,
          skills: [],
        };
        if (step.actions.some((a) => a.kind === 'damage'))
          this.emit({ source: source.id, kind: 'activation', amount: 1 });
        this.execute(source, { cooldown: 0, actions: step.actions }, 'enemy');
      }
    }
    if (
      step?.summon &&
      this.alive() &&
      this.r.minions.filter((m) => m.hp > 0).length < 2 &&
      this.r.summons < 3
    ) {
      const serial = ++this.r.summons;
      this.r.minions.push({
        ...fighter(
          { attack: e.attack, hp: e.maxHp * 0.05, defense: e.defense, speed: e.speed },
          e.profession,
        ),
        id: 'minion:' + serial,
        activeAt: n + 1,
      });
    }
    if (!this.alive() || cursor.index >= steps.length) {
      this.r.minions = this.r.minions.filter((m) => m.hp > 0);
      this.expire('enemy');
      this.r.enemyTurn = null;
    }
  }
  enemyTurn() {
    this.beginEnemyTurn();
    while (this.r.enemyTurn) this.nextEnemyStep();
  }
}

const cache = new Map<string, { output: number; sustain: number; strength: number }>();
const pressureCache = new Map<string, { output: number; protection: number }>();
/** Neutral 12-round pressure sample, separate from the immutable graduation score. */
export function estimatePressure(stats: Attributes, sources: Source[], mixed = false) {
  const key = JSON.stringify([stats, sources, mixed]);
  const cached = pressureCache.get(key);
  if (cached) return cached;
  let output = 0,
    protection = 0;
  for (const wounded of [false, true]) {
    const hero = fighter(stats, 'warrior', stats.hp * (wounded ? 0.45 : 1));
    const enemy = fighter(
      { attack: stats.hp * 0.16 + stats.defense * 0.65, hp: 1e9, defense: 12, speed: 10 },
      'warrior',
    );
    const r = battleRuntime(hero, enemy, structuredClone(sources), 'reference', mixed);
    const engine = new BattleEngine(
      r,
      1,
      (s) => {
        if (s.kind === 'damage') output += s.amount;
        if ((s.kind === 'shield' || s.kind === 'healing') && !isEnemySource(s.source))
          protection += s.amount;
      },
      true,
    );
    engine.opening();
    for (let round = 1; round <= 12; round++) {
      engine.round = round;
      hero.hp = Math.max(hero.hp, stats.hp * 0.25);
      enemy.hp = wounded ? 2e8 : 1e9;
      engine.heroTurn();
      engine.enemyTurn();
    }
  }
  const result = { output: output / 24, protection: Math.min(stats.hp * 0.3, protection / 24) };
  if (pressureCache.size > 500) pressureCache.clear();
  pressureCache.set(key, result);
  return result;
}
export function estimateBuild(stats: Attributes, sources: Source[], mixed = false) {
  const key = JSON.stringify([stats, sources, mixed]);
  const found = cache.get(key);
  if (found) return found;
  let output = 0,
    restored = 0;
  // Fixed neutral scripts include healthy and wounded scenarios; never use the next monster's class.
  for (const wounded of [false, true]) {
    const hero = fighter(stats, 'warrior', stats.hp * (wounded ? 0.45 : 1));
    // An inexhaustible evaluation target prevents high damage being clipped to 200.
    const enemy = fighter(
      { attack: 12, hp: 1e9, defense: 4, speed: 10 },
      'warrior',
      wounded ? 2e8 : 1e9,
    );
    const runtime = battleRuntime(hero, enemy, structuredClone(sources), 'reference', mixed);
    const engine = new BattleEngine(
      runtime,
      1,
      (s) => {
        if (s.kind === 'damage') output += s.amount;
        if (s.kind === 'shield' || s.kind === 'healing') restored += s.amount;
      },
      true,
    );
    engine.opening();
    for (let round = 1; round <= 6; round++) {
      engine.round = round;
      enemy.hp = wounded ? 2e8 : 1e9;
      engine.heroTurn();
      enemy.hp = wounded ? 2e8 : 1e9;
      hero.hp = Math.max(hero.hp, stats.hp * 0.15);
      engine.enemyTurn();
    }
  }
  output /= 12;
  const sustain = restored / 12;
  const survival = stats.hp * (1 + stats.defense / 60) + Math.min(stats.hp, restored / 2);
  const result = { output, sustain, strength: Math.sqrt(Math.max(0.01, output) * survival) };
  if (cache.size > 500) cache.clear();
  cache.set(key, result);
  return result;
}
