import { BattleEngine, battleRuntime, fighter, fighterSpeed, type BattleSignal } from './combat';
import { ENEMY_TEMPLATES } from './enemies';
import { guildBenefits } from './guild';
import { currentHero, heroBattleBuild } from './progression';
import type { GameState, Enemy, HeroRecord } from './types';
import type { ExpeditionFrame, ExpeditionReport, ExpeditionState } from './expedition-types';
import {
  chapterEnemy,
  expeditionGoals,
  stageReward,
  EXPEDITION_STAR_REWARDS,
} from './expedition-chapters';

export const EXPEDITION_AREAS = [
  {
    name: '古道前哨',
    subtitle: '清理迷雾边境的通行道路',
    factor: 1,
    power: 1600,
    gold: 80,
    medals: 12,
    enemies: ['slime', 'wolf', 'bone_king'],
  },
  {
    name: '蛛影营地',
    subtitle: '深入旧营地，驱散蛛群',
    factor: 3.5,
    power: 3500,
    gold: 180,
    medals: 20,
    enemies: ['skeleton', 'spider', 'queen'],
  },
  {
    name: '白骨要塞',
    subtitle: '夺回边境要塞，建立探索驻地',
    factor: 10,
    power: 6500,
    gold: 300,
    medals: 35,
    enemies: ['wraith', 'golem', 'dragon'],
  },
] as const;
export const DISPATCH_MS = 5 * 60 * 1000;
export const emptyExpedition = (): ExpeditionState => ({
  version: 2,
  goals: Array.from({ length: 10 }, () => [false, false, false]),
  claimedStars: [],
  team: [],
  cleared: 0,
  run: null,
  dispatch: null,
});
export const expeditionState = (s: GameState) => {
  const e = (s.meta.expedition ??= emptyExpedition());
  if (e.version !== 2) {
    e.goals = Array.from({ length: 10 }, (_, n) => [n < [0, 3, 6, 10][e.cleared], false, false]);
    e.claimedStars = [];
    if (e.run) e.run.format = 'legacy';
    e.version = 2;
  }
  return e;
};
export const expeditionUnlocked = (s: GameState) => {
  const i = expeditionState(s).goals!.findIndex((g) => !g[0]);
  return i < 0 ? 10 : i + 1;
};
export const expeditionStars = (s: GameState) =>
  expeditionState(s).goals!.flat().filter(Boolean).length;
export const expeditionRunEnemy = (run: NonNullable<ExpeditionState['run']>) =>
  run.format === 'chapter' ? chapterEnemy(run.node) : expeditionEnemy(run.area, run.node);
export function expeditionGoalResults(s: GameState) {
  const run = expeditionState(s).run!,
    p = run.report!;
  const professions = run.team.map((id) => expeditionHero(s, id)!.profession);
  return expeditionGoals(run.node).map(
    (g) =>
      p.won &&
      (g.kind === 'victory' ||
        (g.kind === 'profession' && professions.includes(g.profession!)) ||
        (g.kind === 'variety' && new Set(professions).size >= g.value!) ||
        (g.kind === 'members' && run.team.length <= g.value!) ||
        (g.kind === 'health' && p.hp.reduce((n, v) => n + v, 0) / p.hp.length >= g.value!) ||
        (g.kind === 'survival' && p.hp.every((hp) => hp > 0))),
  );
}
export function claimExpeditionStars(s: GameState, threshold: number) {
  const e = expeditionState(s),
    reward = EXPEDITION_STAR_REWARDS.find((r) => r.stars === threshold);
  if (s.phase !== 'home' || !reward || expeditionStars(s) < threshold) return '星数尚未达到';
  if (e.claimedStars!.includes(threshold)) return '奖励已领取';
  e.claimedStars!.push(threshold);
  s.meta.gold += reward.gold;
  s.meta.medals += reward.medals;
  s.revision++;
  return null;
}
export const expeditionHero = (s: GameState, id: string): HeroRecord | undefined => {
  const h = s.meta.heroes.find((h) => h.id === id);
  return h ? currentHero(h, guildBenefits(s.meta.guildPurchased)) : undefined;
};
export function expeditionEnemy(area: number, node: number): Enemy {
  const a = EXPEDITION_AREAS[area - 1],
    id = a.enemies[node];
  const t = ENEMY_TEMPLATES.find((e) => e.id === id)!;
  const species: Record<string, number> = {
    slime: 7,
    wolf: 11,
    bone_king: 18,
    skeleton: 6,
    spider: 9,
    queen: 19,
    wraith: 0,
    golem: 10,
    dragon: 17,
  };
  const hp = Math.round([260, 440, 920][node] * a.factor);
  return {
    templateId: id,
    name: t.name,
    profession: t.profession,
    species: species[id],
    hp,
    maxHp: hp,
    attack: [12, 20, 30][node] * a.factor,
    defense: [3, 5, 9][node] * a.factor,
    speed: [9, 12, 13][node] + (area - 1) * 2,
    isBoss: node === 2,
    isElite: false,
    effects: [],
  };
}
export function setExpeditionTeam(s: GameState, id: string): string | null {
  if (s.phase !== 'home') return '回到公会后再编队';
  const e = expeditionState(s);
  if (e.run && ['ready', 'battle'].includes(e.run.outcome)) return '先完成或撤回当前远征';
  if (!s.meta.heroes.some((h) => h.id === id)) return '冒险者不存在';
  if (e.team.includes(id)) e.team = e.team.filter((k) => k !== id);
  else {
    if (e.dispatch?.team.includes(id)) return '这位冒险者正在驻地探索';
    if (e.team.length >= 3) return '队伍最多三人，先移除一位';
    e.team.push(id);
  }
  s.revision++;
  return null;
}
export function moveExpeditionMember(s: GameState, index: number, direction: number) {
  if (s.phase !== 'home') return '回到公会后再编队';
  if (![-1, 1].includes(direction)) return '无法调整该位置';
  const e = expeditionState(s),
    next = index + direction;
  if (e.run && ['ready', 'battle'].includes(e.run.outcome)) return '远征途中不能更换出战顺序';
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= e.team.length ||
    next < 0 ||
    next >= e.team.length
  )
    return '无法调整该位置';
  [e.team[index], e.team[next]] = [e.team[next], e.team[index]];
  s.revision++;
  return null;
}
export function startExpedition(s: GameState, area: number, node = 0): string | null {
  const e = expeditionState(s);
  if (s.phase !== 'home') return '回到公会后再出征';
  if (e.run && ['ready', 'battle'].includes(e.run.outcome)) return '当前远征尚未结束';
  if (area !== 1 || !Number.isInteger(node) || node < 0 || node >= expeditionUnlocked(s))
    return '该关卡尚未开放';
  if (!e.team.length) return '至少选择一名冒险者';
  if (e.team.some((id) => e.dispatch?.team.includes(id))) return '探索中的冒险者不能同时出征';
  e.run = {
    format: 'chapter',
    area,
    node,
    team: [...e.team],
    hp: e.team.map(() => 1),
    outcome: 'ready',
    report: null,
    gold: 0,
    medals: 0,
    firstClear: false,
  };
  s.revision++;
  return null;
}

/** Frozen deterministic replay: actual engine steps, not a power comparison or invented damage. */
export function simulateExpedition(s: GameState): ExpeditionReport {
  const run = expeditionState(s).run!,
    enemy = expeditionRunEnemy(run);
  const heroes = run.team.map((id) => expeditionHero(s, id)!),
    hp = [...run.hp];
  let slot = hp.findIndex((n) => n > 0),
    round = 1;
  const frames: ExpeditionFrame[] = [],
    signals: BattleSignal[] = [];
  const runtimeFor = (n: number) => {
    const h = heroes[n],
      build = heroBattleBuild(h);
    const r = battleRuntime(
      fighter(h.stats, h.profession, h.stats.hp * hp[n]),
      fighter(
        { attack: enemy.attack, hp: enemy.maxHp, defense: enemy.defense, speed: enemy.speed },
        enemy.profession!,
      ),
      build.sources,
      enemy.templateId!,
      build.mixed,
    );
    r.tiers = build.tiers;
    return r;
  };
  let r = runtimeFor(slot);
  const engine = () => new BattleEngine(r, round, (signal) => signals.push(signal));
  const capture = (actor: 'hero' | 'enemy', label?: string) => {
    const activated = signals.find((f) => f.kind === 'activation');
    const source = activated && r.sources.find((source) => source.id === activated.source);
    const sum = (kind: BattleSignal['kind'], enemySource = false) =>
      signals
        .filter(
          (f) =>
            f.kind === kind &&
            (kind !== 'healing' || f.source.startsWith('enemy:') === enemySource),
        )
        .reduce((n, f) => n + f.amount, 0);
    frames.push({
      round,
      slot,
      actor,
      label: label ?? source?.name ?? (actor === 'enemy' ? enemy.name + '攻击' : '回合开始'),
      hp: Math.max(0, r.hero.hp),
      maxHp: r.hero.maxHp,
      enemyHp: Math.max(0, r.enemy.hp),
      shield: r.hero.shield,
      enemyShield: r.enemy.shield,
      damage: sum('damage'),
      hurt: sum('hurt'),
      healed: sum('healing'),
      enemyHealed: sum('healing', true),
      ...(source ? { sourceId: source.id } : {}),
      heroFighter: structuredClone(r.hero),
      enemyFighter: structuredClone(r.enemy),
      timers: { ...r.timers },
      firedAt: Object.fromEntries(
        Object.entries(r.flags).filter(([key]) => key.endsWith(':firedAt')),
      ),
      heroActions: r.heroActions,
      enemyActions: r.enemyActions,
      minions: structuredClone(r.minions),
      warning: r.warning,
    });
    signals.length = 0;
  };
  engine().opening();
  capture('hero', heroes[slot].name + '出战');
  while (round <= 60 && r.enemy.hp > 0 && slot < heroes.length) {
    const order: ('hero' | 'enemy')[] =
      fighterSpeed(r.hero) >= fighterSpeed(r.enemy) ? ['hero', 'enemy'] : ['enemy', 'hero'];
    for (const side of order) {
      if (r.hero.hp <= 0 || r.enemy.hp <= 0) break;
      if (side === 'hero') {
        engine().beginHeroTurn();
        do {
          engine().nextHeroBeat();
          capture(side);
        } while (r.heroTurn && r.enemy.hp > 0 && r.hero.hp > 0);
      } else {
        engine().beginEnemyTurn();
        do {
          engine().nextEnemyStep();
          capture(side);
        } while (r.enemyTurn && r.enemy.hp > 0 && r.hero.hp > 0);
      }
    }
    hp[slot] = Math.max(0, Math.min(1, r.hero.hp / r.hero.maxHp));
    if (r.enemy.hp <= 0) break;
    if (r.hero.hp <= 0) {
      const previous = r;
      slot = hp.findIndex((n, index) => index > slot && n > 0);
      if (slot < 0) break;
      r = runtimeFor(slot);
      r.enemy = structuredClone(previous.enemy);
      r.heroFirst = fighterSpeed(r.hero) >= fighterSpeed(r.enemy);
      r.enemyActions = previous.enemyActions;
      r.minions = structuredClone(previous.minions);
      r.summons = previous.summons;
      r.phase = previous.phase;
      r.flags = Object.fromEntries(
        Object.entries(previous.flags).filter(
          ([k]) => k.startsWith('ogre') || k.startsWith('queen'),
        ),
      );
      r.charges = Object.fromEntries(
        Object.entries(previous.charges).filter(
          ([k]) => k.startsWith('slime') || k.startsWith('golem'),
        ),
      );
      engine().opening(false);
      capture('hero', heroes[slot].name + '接替出战');
    }
    round++;
  }
  const won = r.enemy.hp <= 0;
  return {
    frames,
    cursor: 0,
    won,
    hp,
    enemyHp: Math.max(0, r.enemy.hp),
    rounds: Math.min(60, round),
  };
}
export function beginExpeditionBattle(s: GameState): string | null {
  const run = expeditionState(s).run;
  if (s.phase !== 'home' || !run || run.outcome !== 'ready') return '当前无法开始战斗';
  run.report = simulateExpedition(s);
  run.outcome = 'battle';
  s.revision++;
  return null;
}
export function finishExpeditionBattle(s: GameState): string | null {
  const e = expeditionState(s),
    run = e.run,
    report = run?.report;
  if (!run || run.outcome !== 'battle' || !report || report.cursor < report.frames.length - 1)
    return '等待战斗结束';
  run.hp = [...report.hp];
  if (run.format === 'chapter') {
    if (report.won) {
      run.firstClear = !e.goals![run.node][0];
      const results = expeditionGoalResults(s);
      e.goals![run.node] = e.goals![run.node].map((old, n) => old || results[n]);
      const reward = stageReward(run.node, run.firstClear);
      run.gold = reward.gold;
      run.medals = reward.medals;
      s.meta.gold += run.gold;
      s.meta.medals += run.medals;
      if (e.goals![9][0]) e.cleared = Math.max(1, e.cleared);
    }
    run.outcome = report.won ? 'won' : 'lost';
    s.revision++;
    return null;
  }
  if (!report.won || (run.node < 2 && report.hp.every((n) => n === 0))) run.outcome = 'lost';
  else if (run.node < 2) {
    run.node++;
    run.outcome = 'ready';
    run.report = null;
  } else {
    const area = EXPEDITION_AREAS[run.area - 1];
    run.firstClear = run.area > e.cleared;
    run.gold = run.firstClear ? area.gold : 20 * run.area;
    run.medals = run.firstClear ? area.medals : run.area;
    s.meta.gold += run.gold;
    s.meta.medals += run.medals;
    e.cleared = Math.max(e.cleared, run.area);
    for (let n = 0; n < [0, 3, 6, 10][e.cleared]; n++) e.goals![n][0] = true;
    run.outcome = 'won';
  }
  s.revision++;
  return null;
}
export function retreatExpedition(s: GameState) {
  const e = expeditionState(s);
  if (!e.run) return '没有正在进行的远征';
  e.run = null;
  s.revision++;
  return null;
}
export function startDispatch(s: GameState, area: number, now = Date.now()): string | null {
  const e = expeditionState(s);
  if (s.phase !== 'home') return '回到公会后再派遣';
  if (e.dispatch) return '先领取或撤回当前探索';
  if (!Number.isInteger(area) || area < 1 || area > e.cleared) return '先通关该据点';
  if (!e.team.length) return '至少选择一名冒险者';
  if (
    e.run &&
    ['ready', 'battle'].includes(e.run.outcome) &&
    e.team.some((id) => e.run!.team.includes(id))
  )
    return '远征中的冒险者不能同时探索';
  const power = e.team.reduce((n, id) => n + expeditionHero(s, id)!.power, 0) / e.team.length;
  const bonus = Math.min(0.25, (power / EXPEDITION_AREAS[area - 1].power) * 0.1);
  e.dispatch = {
    area,
    team: [...e.team],
    startedAt: now,
    readyAt: now + DISPATCH_MS,
    gold: Math.round((25 + 15 * (area - 1)) * (1 + bonus)),
    medals: area,
  };
  s.revision++;
  return null;
}
export function claimDispatch(s: GameState, now = Date.now()): string | null {
  const e = expeditionState(s),
    d = e.dispatch;
  if (!d) return '没有可领取的探索';
  if (now < d.readyAt) return '探索尚未完成';
  s.meta.gold += d.gold;
  s.meta.medals += d.medals;
  e.dispatch = null;
  s.revision++;
  return null;
}
export function cancelDispatch(s: GameState) {
  const e = expeditionState(s);
  if (!e.dispatch) return '没有正在进行的探索';
  e.dispatch = null;
  s.revision++;
  return null;
}
