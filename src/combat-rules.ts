import type { BattleRuntime, Fighter, Source, StatusKind } from './skill-types';
import type { DamageType } from './types';

export interface RulesPort {
  damage(source: Source, target: Fighter, raw: number, type: DamageType): void;
  shield(source: Source, raw: number): void;
  heal(source: Source, raw: number): number;
  trigger(source: Source): void;
}
export interface SkillContext {
  source: Source;
  target: Fighter;
  before: Fighter;
  selfBefore: Fighter;
  tome: string;
  level: number;
  hits: number;
  physicalHits: number;
  hpDamage: number;
  worked: boolean;
  support: boolean;
  extra: { source: Source; raw: number; type: DamageType }[];
  ignore: number;
  bonus: number;
  energy: number;
}
export const TOME_STREAM: Record<string, string> = {
  warrior_sword_tome: 'warrior_heavy',
  warrior_spear_tome: 'warrior_flurry',
  warrior_shield_tome: 'warrior_guard',
  mage_flame_tome: 'mage_flame',
  mage_ice_tome: 'mage_ice',
  mage_arcane_tome: 'mage_arcane',
  rogue_poison_tome: 'rogue_poison',
  rogue_ranged_tome: 'rogue_volley',
  rogue_shadow_tome: 'rogue_shadow',
};
const has = (f: Fighter, kind: StatusKind) =>
  f.statuses.some((s) => s.kind === kind && s.value > 0);
const native = (s: Source) => s.kind === 'item' || s.kind === 'tome';

/** Only native events enter these rules. Extra effects never dispatch native events. */
export class CombatRules {
  constructor(
    private r: BattleRuntime,
    private round: number,
    private port: RulesPort,
  ) {}
  private selected(id: string) {
    return this.r.sources.find((s) => s.skills.some((k) => k.passive?.id === id));
  }
  private value(s: Source, values: number[]) {
    return values[s.skills.find((k) => k.passive)?.passive!.tier! - 1];
  }
  private key(s: Source, event: string) {
    return `v3:${s.id}:${event}`;
  }
  private once(s: Source, event: string, battle = false) {
    const key = this.key(s, event),
      value = battle ? 1 : this.round;
    if (this.r.flags[key] === value) return false;
    this.r.flags[key] = value;
    this.port.trigger(s);
    return true;
  }
  private each(id: string, fn: (s: Source, n: (v: number[]) => number) => void) {
    const s = this.selected(id);
    if (s) fn(s, (v) => this.value(s, v));
  }
  private add(s: Source, target: Fighter, a: number, type: DamageType = 'physical') {
    if (target.hp > 0 && this.r.hero.hp > 0)
      this.port.damage(s, target, (this.r.hero.attack * a) / 100, type);
  }
  private shield(s: Source, amount: number) {
    if (this.r.hero.hp > 0) this.port.shield(s, amount);
  }
  private state(s: Source, target: Fighter, kind: StatusKind, value: number, remaining: number) {
    if (target.hp <= 0) return;
    const old = target.statuses.find((x) => x.source === s.id && x.kind === kind);
    if (old) {
      old.value = Math.max(old.value, value);
      old.remaining = remaining;
    } else target.statuses.push({ kind, source: s.id, value, remaining });
  }
  private budget(event: string) {
    if (this.r.flags[`v3:${event}:round`] !== this.round) {
      this.r.flags[`v3:${event}:round`] = this.round;
      this.r.flags[`v3:${event}:used`] = 0;
    }
    return `v3:${event}:used`;
  }
  private count(event: string, amount = 1) {
    const key = this.budget(event);
    return (this.r.flags[key] += amount);
  }
  private steal(s: Source, damage: number, rate: number, cap: number) {
    const key = this.budget('lifesteal'),
      own = this.budget(s.id + ':lifesteal');
    const raw = Math.max(
      0,
      Math.min(
        (damage * rate) / 100,
        (this.r.hero.maxHp * cap) / 100 - this.r.flags[own],
        this.r.hero.maxHp * 0.02 - this.r.flags[key],
      ),
    );
    const healed = this.port.heal(s, raw);
    this.r.flags[key] += healed;
    this.r.flags[own] += healed;
    if (healed) this.port.trigger(s);
  }
  opening() {
    this.each('warrior_guard_1', (s, n) =>
      this.shield(s, (this.r.hero.maxHp * n([3, 5, 7])) / 100),
    );
    this.each('warrior_shield_1', (s, n) =>
      this.shield(s, (this.r.hero.maxHp * n([2, 3, 4])) / 100),
    );
  }
  beforeSkill(source: Source, target: Fighter): SkillContext {
    const book = source.skills.find((s) => s.tome)?.tome;
    const c: SkillContext = {
      source,
      target,
      before: structuredClone(target),
      selfBefore: structuredClone(this.r.hero),
      tome: book?.id ?? '',
      level: book?.level ?? 0,
      hits: 0,
      physicalHits: 0,
      hpDamage: 0,
      worked: false,
      support: false,
      extra: [],
      ignore: 0,
      bonus: 0,
      energy: 0,
    };
    if (!native(source)) return c;
    const take = (id: string, condition: boolean, multiplier = 1) =>
      this.each(id, (s) => {
        const key = this.key(s, 'pending');
        if (condition && (this.r.charges[key] ?? 0) > 0) {
          c.extra.push({
            source: s,
            raw: this.r.charges[key] * multiplier,
            type: id.startsWith('mage_') ? 'magic' : id === 'rogue_poison_3' ? 'true' : 'physical',
          });
          this.r.charges[key] = 0;
        }
      });
    take('warrior_flurry_1', c.tome === 'warrior_spear_tome');
    take('warrior_guard_2', c.tome === 'warrior_shield_tome');
    take('mage_arcane_2', c.tome === 'mage_arcane_tome');
    take('rogue_volley_2', c.tome === 'rogue_ranged_tome');
    take(
      'rogue_shadow_2',
      source.skills.some((k) =>
        k.actions.some(
          (a) =>
            a.kind === 'damage' &&
            (a.type ?? 'physical') === 'physical' &&
            (a.when !== 'smoke' || has(c.selfBefore, 'smoke')),
        ),
      ),
      c.tome === 'rogue_shadow_tome' ? 2 : 1,
    );
    take(
      'mage_staff_3',
      source.skills.some((k) => k.actions.some((a) => a.kind === 'damage' && a.type === 'magic')),
    );
    this.each('mage_robe_3', (s) => {
      const key = this.key(s, 'pending');
      if ((this.r.flags[this.key(s, 'expires')] ?? 0) < this.round) this.r.charges[key] = 0;
    });
    take(
      'mage_robe_3',
      source.skills.some((k) => k.actions.some((a) => a.kind === 'damage')),
    );
    this.each('warrior_flurry_2', (s, n) => {
      const layers = this.r.charges[this.key(s, 'layers')] ?? 0;
      if (!layers) return;
      if (c.tome === 'warrior_spear_tome') c.ignore += (layers * n([3, 4, 5])) / 100;
      else if (
        !this.r.sources.some((x) => x.skills.some((k) => k.tome?.id === 'warrior_spear_tome')) &&
        (this.r.flags[this.key(s, 'intentAt')] ?? this.round) < this.round &&
        source.skills.some((k) =>
          k.actions.some((a) => a.kind === 'damage' && (a.type ?? 'physical') === 'physical'),
        )
      ) {
        c.extra.push({
          source: s,
          raw: (layers * n([4, 6, 8]) * this.r.hero.attack) / 100,
          type: 'physical',
        });
      } else return;
      this.r.charges[this.key(s, 'layers')] = 0;
    });
    this.each('warrior_flurry_3', (s, n) => {
      const key = this.key(s, 'layers');
      if (
        (this.r.flags[this.key(s, 'builtAt')] ?? this.round) >= this.round ||
        !(this.r.charges[key] ?? 0)
      )
        return;
      if (
        !source.skills.some((k) =>
          k.actions.some((a) => a.kind === 'damage' && (a.type ?? 'physical') === 'physical'),
        )
      )
        return;
      c.extra.push({
        source: s,
        raw: (this.r.charges[key] * n([5, 8, 11]) * this.r.hero.attack) / 100,
        type: 'physical',
      });
      this.r.charges[key] = 0;
      if (c.tome === 'warrior_spear_tome') c.bonus += n([15, 20, 25]) / 100;
    });
    for (const [id, kind, normal, paired, tome] of [
      ['mage_flame_2', 'magic', [4, 6, 8], [7, 10, 13], 'mage_flame_tome'],
      ['rogue_poison_3', 'physical', [15, 25, 35], [25, 40, 55], 'rogue_poison_tome'],
    ] as const)
      this.each(id, (s, n) => {
        const key = this.key(s, 'layers'),
          layers = this.r.charges[key] ?? 0;
        if (
          layers &&
          source.skills.some((k) =>
            k.actions.some((a) => a.kind === 'damage' && (a.type ?? 'physical') === kind),
          )
        ) {
          c.extra.push({
            source: s,
            raw:
              (layers * n(c.tome === tome ? [...paired] : [...normal]) * this.r.hero.attack) / 100,
            type: id.startsWith('mage') ? 'magic' : 'true',
          });
          this.r.charges[key] = 0;
          if (id === 'rogue_poison_3')
            for (const key of Object.keys(this.r.flags))
              if (key.startsWith(this.key(s, 'poison:'))) delete this.r.flags[key];
        }
      });
    if (c.tome === 'mage_arcane_tome') {
      c.energy = this.r.charges['v3:star'] ?? 0;
      this.r.charges['v3:star'] = 0;
    }
    if (c.tome === 'mage_flame_tome' && this.round >= 4)
      this.each('mage_flame_3', (_, n) => (c.bonus += n([15, 25, 35]) / 100));
    if (c.tome === 'mage_ice_tome' && this.round <= 3)
      this.each('mage_ice_3', (_, n) => (c.bonus += n([20, 30, 40]) / 100));
    c.bonus = Math.min(0.6, c.bonus);
    return c;
  }
  modifiers(c: SkillContext, victim: Fighter, type: DamageType) {
    let ignore = c.ignore;
    if (!native(c.source)) return { ignore: 0, bonus: 0 };
    if (c.tome === 'warrior_sword_tome' && has(c.before, 'break'))
      this.each('warrior_heavy_1', (_, n) => (ignore += n([5, 10, 15]) / 100));
    if (c.tome === 'mage_ice_tome' && has(c.before, 'chill'))
      this.each('mage_ice_1', (_, n) => (ignore += n([5, 10, 15]) / 100));
    if (c.tome === 'rogue_ranged_tome' && has(c.before, 'mark'))
      this.each('rogue_volley_1', (_, n) => (ignore += n([5, 10, 15]) / 100));
    if (type === 'physical')
      this.each('warrior_sword_3', (s, n) => {
        if (this.r.flags[this.key(s, 'hit')] !== this.round)
          ignore += (this.round <= 3 ? n([10, 15, 20]) : 5) / 100;
      });
    return { ignore, bonus: c.bonus };
  }
  hit(
    c: SkillContext,
    victim: Fighter,
    before: Fighter,
    type: DamageType,
    hpDamage: number,
    total: number,
  ) {
    if (!native(c.source) || total <= 0) return;
    c.hits++;
    c.hpDamage += hpDamage;
    c.worked = true;
    c.target = victim;
    const A = this.r.hero.attack,
      H = this.r.hero.maxHp;
    const proc = (
      id: string,
      event: string,
      fn: (s: Source, n: (v: number[]) => number) => void,
      battle = false,
    ) =>
      this.each(id, (s, n) => {
        if (this.once(s, event, battle)) fn(s, n);
      });
    const pending = (s: Source, raw: number) => {
      this.r.charges[this.key(s, 'pending')] = raw;
    };
    const marked = has(before, 'mark'),
      poisoned = has(before, 'poison'),
      burned = has(before, 'burn'),
      chilled = has(before, 'chill');
    if (type === 'physical') {
      c.physicalHits++;
      const hits = this.count('physical');
      this.r.charges['v3:physicalTotal'] = (this.r.charges['v3:physicalTotal'] ?? 0) + 1;
      proc('warrior_sword_1', 'hit', (s, n) => this.add(s, victim, n([5, 8, 11])));
      proc('warrior_sword_3', 'hit', () => {});
      proc('warrior_heavy_1', 'hit', (s, n) =>
        this.state(s, victim, 'break', n([8, 12, 16]) / 100, 2),
      );
      if (has(before, 'break'))
        proc('warrior_heavy_2', 'hit', (s, n) =>
          this.add(s, victim, n(c.tome === 'warrior_sword_tome' ? [15, 22, 30] : [8, 12, 16])),
        );
      if (before.hp <= before.maxHp * 0.3) {
        proc('warrior_heavy_3', 'execute', (s, n) => this.add(s, victim, n([30, 45, 60])), true);
        if (c.tome === 'warrior_sword_tome')
          proc(
            'warrior_heavy_3',
            'tomeShield',
            (s, n) => this.shield(s, (H * n([3, 4, 5])) / 100),
            true,
          );
      }
      if (before.hp <= before.maxHp * 0.5)
        proc('warrior_sword_2', 'execute', (s, n) => this.add(s, victim, n([20, 30, 40])), true);
      if (this.r.charges['v3:physicalTotal'] % 4 === 0)
        proc('warrior_flurry_1', 'four', (s, n) => {
          this.shield(s, (H * n([1, 1.5, 2])) / 100);
          pending(s, (A * n([10, 15, 20])) / 100);
        });
      if (hits >= 4)
        proc('warrior_flurry_2', 'four', (s) => {
          const key = this.key(s, 'layers');
          this.r.charges[key] = Math.min(3, (this.r.charges[key] ?? 0) + 1);
          this.r.flags[this.key(s, 'stealAt')] = this.r.heroActions + 1;
          this.r.flags[this.key(s, 'intentAt')] = this.round;
        });
      this.each('warrior_flurry_2', (s, n) => {
        if (this.r.flags[this.key(s, 'stealAt')] === this.r.heroActions)
          this.steal(s, hpDamage, n([3, 4, 5]), n([0.5, 0.75, 1]));
      });
      if (hits <= 3)
        this.each('warrior_flurry_3', (s) => {
          const key = this.key(s, 'layers');
          this.r.charges[key] = Math.min(3, (this.r.charges[key] ?? 0) + 1);
          this.r.flags[this.key(s, 'builtAt')] = this.round;
        });
      if (poisoned) {
        proc('rogue_poison_2', 'hit', (s, n) => this.add(s, victim, n([6, 10, 14]), 'true'));
        if (c.tome === 'rogue_poison_tome' && has(c.before, 'poison'))
          this.each('rogue_poison_2', (s, n) =>
            this.steal(s, hpDamage, n([5, 8, 10]), n([1, 1.5, 2])),
          );
      }
    } else if (type === 'magic') {
      proc('mage_staff_1', 'hit', (s, n) => this.add(s, victim, n([5, 8, 11]), 'magic'));
      proc('mage_book_1', 'hit', (s, n) => this.shield(s, (A * n([6, 10, 14])) / 100));
      proc('mage_book_2', 'hit', (s, n) =>
        this.state(s, this.r.hero, 'guard', n([3, 5, 7]) / 100, 1),
      );
      if (c.selfBefore.shield > 0)
        proc('mage_book_3', 'hit', (s, n) => this.add(s, victim, n([10, 15, 20]), 'magic'));
      if (chilled) {
        proc('mage_ice_3', 'hit', (s, n) =>
          this.add(s, victim, n(this.round <= 3 ? [15, 22, 30] : [5, 8, 11]), 'magic'),
        );
      }
      if (burned && this.round >= 4)
        proc('mage_flame_3', 'hit', (s, n) => this.add(s, victim, n([8, 12, 16]), 'magic'));
    } else if (c.tome === 'rogue_poison_tome' && has(c.before, 'poison'))
      this.each('rogue_poison_2', (s, n) => this.steal(s, hpDamage, n([5, 8, 10]), n([1, 1.5, 2])));
    if (chilled) proc('mage_ice_1', 'hit', (s, n) => this.shield(s, (A * n([6, 10, 14])) / 100));
    const hits = this.count('direct');
    if (hits >= 3) {
      proc('warrior_spear_1', 'three', (s, n) => this.add(s, victim, n([5, 8, 11])));
      proc('warrior_spear_2', 'three', (s, n) => this.shield(s, (A * n([10, 15, 20])) / 100));
    }
    if (c.hits === 3)
      proc('warrior_spear_3', 'third', (s, n) => this.add(s, victim, n([12, 18, 24])));
    proc('rogue_ranged_1', 'first', (s, n) => {
      if (marked) this.add(s, victim, n([5, 8, 11]));
      else this.state(s, victim, 'mark', 0.000001, 1);
    });
    if (marked) {
      const count = this.count('marked');
      proc('rogue_volley_1', 'hit', (s, n) => this.add(s, victim, n([6, 10, 14])));
      proc('rogue_volley_3', 'hit', (s, n) =>
        this.add(s, victim, n(this.round <= 3 ? [15, 22, 30] : [5, 8, 11])),
      );
      proc('rogue_ranged_2', 'hit', (s, n) => this.shield(s, (A * n([6, 10, 14])) / 100));
      this.each('rogue_volley_2', (s, n) =>
        this.steal(s, hpDamage, n([3, 5, 7]), n([0.5, 0.75, 1])),
      );
      if (count >= 3) {
        proc('rogue_volley_2', 'three', (s, n) => pending(s, (A * n([10, 15, 20])) / 100));
        proc('rogue_ranged_3', 'three', (s, n) => this.add(s, victim, n([12, 18, 24])));
      }
    }
  }
  dotScale(kind: 'burn' | 'poison', c: SkillContext) {
    let scale = 1;
    if (c.tome === 'mage_flame_tome' && kind === 'burn')
      this.each('mage_flame_1', (_, n) => (scale += n([10, 20, 30]) / 100));
    if (c.tome === 'rogue_poison_tome' && kind === 'poison')
      this.each('rogue_poison_1', (_, n) => (scale += n([10, 20, 30]) / 100));
    return scale;
  }
  shieldScale(c: SkillContext) {
    let scale = 1;
    if (c.tome === 'warrior_shield_tome')
      this.each('warrior_guard_1', (_, n) => (scale += n([10, 15, 20]) / 100));
    if (c.tome === 'rogue_shadow_tome' && has(c.selfBefore, 'smoke'))
      this.each('rogue_shadow_1', (_, n) => (scale += n([10, 15, 20]) / 100));
    return scale;
  }
  afterSkill(c: SkillContext, consumed: number) {
    if (!native(c.source) || !c.worked) return;
    const A = this.r.hero.attack,
      H = this.r.hero.maxHp;
    for (const x of c.extra) if (c.hits) this.port.damage(x.source, c.target, x.raw, x.type);
    if (c.tome === 'mage_arcane_tome') {
      if (c.energy && c.level >= 2) this.shield(c.source, c.energy * 0.05 * A);
      if (c.energy === 3 && c.level === 3)
        this.r.charges['v3:star'] = Math.min(3, (this.r.charges['v3:star'] ?? 0) + 1);
    }
    if (c.tome) {
      this.each('mage_arcane_3', (s, n) => {
        if (this.once(s, 'tome')) this.shield(s, (H * n([1, 2, 3])) / 100);
        if (c.tome === 'mage_arcane_tome' && c.energy === 3) {
          this.add(s, c.target, n([20, 30, 40]), 'magic');
          this.r.charges['v3:star'] = Math.min(3, (this.r.charges['v3:star'] ?? 0) + 1);
        }
      });
      this.each('mage_staff_3', (s, n) => {
        if (this.once(s, 'tome'))
          this.r.charges[this.key(s, 'pending')] = (A * n([15, 22, 30])) / 100;
      });
      if (c.tome === 'warrior_sword_tome' && c.level >= 3 && has(c.before, 'break'))
        this.shield(c.source, 0.1 * A);
      if (c.tome === 'warrior_spear_tome' && c.level >= 2 && c.physicalHits >= 3)
        this.shield(c.source, 0.1 * A);
      if (c.tome === 'rogue_ranged_tome' && c.level >= 2 && has(c.before, 'mark') && c.hits >= 3)
        this.shield(c.source, 0.1 * A);
      if (c.tome === 'mage_ice_tome' && this.r.heroFirst)
        this.each('mage_ice_2', (s, n) => this.shield(s, (H * n([1, 2, 3])) / 100));
      if (c.tome === 'rogue_shadow_tome' && has(c.selfBefore, 'smoke'))
        this.each('rogue_shadow_3', (s, n) =>
          this.state(s, this.r.hero, 'guard', n([4, 6, 8]) / 100, 1),
        );
      if (c.tome === 'rogue_ranged_tome' && this.round <= 3 && has(c.before, 'mark'))
        this.each('rogue_volley_3', (s, n) => this.add(s, c.target, n([15, 22, 30])));
      if (c.tome === 'warrior_shield_tome' && consumed > 0)
        this.each('warrior_guard_3', (s, n) =>
          this.shield(s, Math.min((consumed * n([20, 30, 40])) / 100, (H * n([1, 1.5, 2])) / 100)),
        );
    }
    if (
      c.hits &&
      c.source.skills.some((k) => k.actions.some((a) => a.kind === 'damage' && a.type === 'magic'))
    ) {
      const count = this.count('magicSkills');
      if (count === 2)
        this.each('mage_staff_2', (s, n) => {
          if (this.once(s, 'twoSkills')) this.add(s, c.target, n([8, 12, 16]), 'magic');
        });
    }
    if (c.support && c.source.kind === 'item' && c.source.family === 'support') {
      const book = this.r.sources.find((s) =>
        s.skills.some((k) => k.tome?.id === 'mage_arcane_tome'),
      );
      if (book && this.once(book, 'star'))
        this.r.charges['v3:star'] = Math.min(3, (this.r.charges['v3:star'] ?? 0) + 1);
      this.each('mage_arcane_1', (s, n) => {
        if (this.once(s, 'support')) {
          this.shield(s, (A * n([6, 10, 14])) / 100);
          if (book) this.r.charges['v3:star'] = Math.min(3, (this.r.charges['v3:star'] ?? 0) + 1);
        }
      });
      this.each('mage_robe_1', (s, n) => {
        if (this.once(s, 'support')) this.shield(s, (A * n([6, 10, 14])) / 100);
      });
      this.each('mage_robe_2', (s, n) => {
        if (this.once(s, 'support')) this.state(s, this.r.hero, 'guard', n([3, 5, 7]) / 100, 1);
      });
      this.each('mage_robe_3', (s, n) => {
        if (this.once(s, 'support')) {
          this.r.charges[this.key(s, 'pending')] = (A * n([10, 15, 20])) / 100;
          this.r.flags[this.key(s, 'expires')] = this.round + 1;
        }
      });
      const identity = this.key(c.source, 'supportIdentity');
      if (this.r.flags[identity] !== this.round) {
        this.r.flags[identity] = this.round;
        this.count('supportItems');
      }
      if (this.r.flags[this.budget('supportItems')] >= 2)
        this.each('mage_arcane_2', (s, n) => {
          if (this.once(s, 'twoSupports')) {
            this.shield(s, (H * n([1, 2, 3])) / 100);
            this.r.charges[this.key(s, 'pending')] = (A * n([15, 25, 35])) / 100;
          }
        });
    }
  }
  enemyStart() {
    this.r.flags['v3:absorbed'] = 0;
    if (has(this.r.enemy, 'chill'))
      this.each('mage_ice_2', (s, n) => this.state(s, this.r.hero, 'guard', n([4, 6, 8]) / 100, 1));
    if (has(this.r.hero, 'smoke'))
      this.each('rogue_shadow_1', (s, n) => {
        if (this.once(s, 'smoke')) this.shield(s, (this.r.hero.attack * n([6, 10, 14])) / 100);
      });
  }
  enemyHit(absorbed: number, broke: boolean, beforeHp: number, smokeReduced: boolean) {
    if (this.r.hero.hp <= 0) return;
    this.r.flags['v3:absorbed'] = (this.r.flags['v3:absorbed'] ?? 0) + absorbed;
    if (broke)
      for (const [id, values] of [
        ['warrior_guard_3', [5, 7, 9]],
        ['warrior_shield_3', [4, 6, 8]],
        ['mage_book_3', [2, 3, 4]],
      ] as const)
        this.each(id, (s, n) => {
          if (this.once(s, 'break', true))
            this.shield(s, (this.r.hero.maxHp * n([...values])) / 100);
        });
    if (this.r.hero.hp <= this.r.hero.maxHp * 0.5 && beforeHp > this.r.hero.maxHp * 0.5)
      this.each('rogue_shadow_3', (s, n) => {
        if (this.once(s, 'low', true)) this.shield(s, (this.r.hero.maxHp * n([4, 6, 8])) / 100);
      });
    if (smokeReduced)
      this.each('rogue_shadow_2', (s, n) => {
        if (this.once(s, 'smoke'))
          this.r.charges[this.key(s, 'pending')] = (this.r.hero.attack * n([10, 15, 20])) / 100;
      });
  }
  dotTick(kind: 'burn' | 'poison', victim: Fighter, worked: boolean) {
    if (!worked) return;
    if (kind === 'burn')
      this.each('mage_flame_2', (s) => {
        if (this.once(s, 'tick')) {
          const key = this.key(s, 'layers');
          this.r.charges[key] = Math.min(3, (this.r.charges[key] ?? 0) + 1);
        }
      });
    else
      this.each('rogue_poison_3', (s) => {
        const targetKey =
          victim === this.r.enemy ? 'boss' : this.r.minions.find((m) => m === victim)?.id;
        if (!targetKey) return;
        const tick = this.key(s, 'poison:' + targetKey);
        if (this.r.flags[tick] === this.round) return;
        const consecutive = this.r.flags[tick] === this.round - 1;
        this.r.flags[tick] = this.round;
        if (consecutive && this.once(s, 'tick')) this.r.charges[this.key(s, 'layers')] = 1;
      });
  }
  enemyEnd() {
    if (this.r.hero.hp <= 0 || this.r.enemy.hp <= 0) return;
    const A = this.r.hero.attack,
      H = this.r.hero.maxHp,
      absorbed = this.r.flags['v3:absorbed'] ?? 0;
    if (absorbed > 0) {
      this.each('warrior_guard_2', (s, n) => {
        if (this.once(s, 'absorbed')) {
          this.port.damage(
            s,
            this.r.enemy,
            Math.min((absorbed * n([15, 20, 25])) / 100, (A * n([15, 25, 35])) / 100),
            'physical',
          );
          this.r.charges[this.key(s, 'pending')] = Math.min(
            (absorbed * n([10, 15, 20])) / 100,
            (A * n([10, 15, 20])) / 100,
          );
        }
      });
      this.each('warrior_shield_2', (s, n) => {
        if (this.once(s, 'absorbed'))
          this.shield(s, Math.min((absorbed * n([8, 12, 16])) / 100, (H * n([1, 1.5, 2])) / 100));
      });
    }
    for (const [id, kind, values, type] of [
      ['mage_flame_1', 'burn', [2, 3, 4], 'magic'],
      ['rogue_poison_1', 'poison', [2, 3, 4], 'true'],
    ] as const)
      this.each(id, (s, n) => {
        if (has(this.r.enemy, kind) && this.once(s, 'tick'))
          this.add(s, this.r.enemy, n([...values]), type);
      });
  }
}
