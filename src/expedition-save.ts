import { EXPEDITION_AREAS, DISPATCH_MS, expeditionRunEnemy, emptyExpedition } from './expedition';
import { stageReward } from './expedition-chapters';
import type { HeroRecord } from './types';
import type { ExpeditionState } from './expedition-types';

/** Validate bounded replay data; executable skills are never supplied by the save. */
export function readExpedition(value: unknown, heroes: HeroRecord[]): ExpeditionState {
  if (value === undefined) return emptyExpedition();
  const e = value as ExpeditionState;
  const check = (ok: unknown) => {
    if (!ok) throw new Error('公会远征存档无效');
  };
  const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  const number = (n: unknown, max = 1e9) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  const integer = (n: unknown, max = 1e9) => number(n, max) && Number.isInteger(n);
  const team = (ids: any, empty = false) =>
    Array.isArray(ids) &&
    ids.length <= 3 &&
    (empty || ids.length > 0) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => heroes.some((h) => h.id === id));
  check(object(e) && integer(e.cleared, 3) && team(e.team, true));
  check(e.version === undefined || e.version === 2);
  if (e.version === undefined) {
    e.goals = Array.from({ length: 10 }, (_, n) => [n < [0, 3, 6, 10][e.cleared], false, false]);
    e.claimedStars = [];
    if (e.run) {
      check(object(e.run));
      e.run.format = 'legacy';
    }
    e.version = 2;
  }
  check(
    Array.isArray(e.goals) &&
      e.goals.length === 10 &&
      e.goals.every(
        (g) => Array.isArray(g) && g.length === 3 && g.every((v) => typeof v === 'boolean'),
      ),
  );
  const starCount = e.goals!.flat().filter(Boolean).length;
  check(
    Array.isArray(e.claimedStars) &&
      e.claimedStars.length <= 3 &&
      new Set(e.claimedStars).size === e.claimedStars.length &&
      e.claimedStars.every((n) => [10, 20, 30].includes(n) && n <= starCount),
  );
  check(e.run === null || object(e.run));
  if (e.run) {
    const r = e.run;
    check(['chapter', 'legacy'].includes(r.format!));
    const modern = r.format === 'chapter';
    check(
      integer(r.area, Math.min(3, e.cleared + 1)) &&
        r.area >= 1 &&
        integer(r.node, modern ? 9 : 2) &&
        team(r.team),
    );
    if (modern) check(r.area === 1 && (r.node === 0 || e.goals![r.node - 1][0]));
    check(Array.isArray(r.hp) && r.hp.length === r.team.length && r.hp.every((n) => number(n, 1)));
    check(
      ['ready', 'battle', 'won', 'lost'].includes(r.outcome) &&
        integer(r.gold) &&
        integer(r.medals) &&
        typeof r.firstClear === 'boolean',
    );
    check(r.outcome === 'ready' ? r.report === null : object(r.report));
    if (r.outcome === 'ready') check(r.hp.some((n) => n > 0));
    if (r.outcome !== 'won') check(r.gold === 0 && r.medals === 0 && !r.firstClear);
    else if (modern) {
      const reward = stageReward(r.node, r.firstClear);
      check(e.goals![r.node][0] && r.gold === reward.gold && r.medals === reward.medals);
    } else
      check(
        r.node === 2 &&
          r.area <= e.cleared &&
          r.gold === (r.firstClear ? EXPEDITION_AREAS[r.area - 1].gold : 20 * r.area) &&
          r.medals === (r.firstClear ? EXPEDITION_AREAS[r.area - 1].medals : r.area),
      );
    if (r.report) {
      const p = r.report,
        enemy = expeditionRunEnemy(r);
      check(
        Array.isArray(p.frames) &&
          p.frames.length > 0 &&
          p.frames.length <= 4096 &&
          integer(p.cursor, p.frames.length - 1),
      );
      check(
        typeof p.won === 'boolean' &&
          number(p.enemyHp, enemy.maxHp) &&
          p.won === (p.enemyHp === 0) &&
          integer(p.rounds, 60) &&
          p.rounds >= 1,
      );
      check(
        Array.isArray(p.hp) && p.hp.length === r.team.length && p.hp.every((n) => number(n, 1)),
      );
      for (const f of p.frames) {
        check(
          object(f) &&
            integer(f.round, 60) &&
            f.round >= 1 &&
            integer(f.slot, r.team.length - 1) &&
            ['hero', 'enemy'].includes(f.actor) &&
            typeof f.label === 'string' &&
            f.label.length <= 150,
        );
        check(
          number(f.maxHp) && f.maxHp > 0 && number(f.hp, f.maxHp) && number(f.enemyHp, enemy.maxHp),
        );
        for (const k of [
          'shield',
          'enemyShield',
          'damage',
          'hurt',
          'healed',
          'enemyHealed',
        ] as const)
          check(number(f[k]));
        if (f.sourceId !== undefined)
          check(typeof f.sourceId === 'string' && f.sourceId.length <= 150);
        for (const snapshot of [f.heroFighter, f.enemyFighter])
          if (snapshot !== undefined) {
            check(object(snapshot) && ['warrior', 'mage', 'rogue'].includes(snapshot.profession));
            for (const k of ['hp', 'maxHp', 'attack', 'defense', 'speed', 'shield'] as const)
              check(number(snapshot[k]));
            check(
              snapshot.maxHp > 0 &&
                snapshot.hp <= snapshot.maxHp &&
                Array.isArray(snapshot.statuses) &&
                snapshot.statuses.length <= 256,
            );
            for (const status of snapshot.statuses)
              check(
                object(status) &&
                  ['poison', 'burn', 'chill', 'break', 'mark', 'smoke'].includes(status.kind) &&
                  number(status.value) &&
                  integer(status.remaining, 1000) &&
                  typeof status.source === 'string' &&
                  status.source.length <= 150,
              );
          }
        for (const timers of [f.timers, f.firedAt])
          if (timers !== undefined)
            check(
              object(timers) &&
                Object.keys(timers).length <= 256 &&
                Object.entries(timers).every(([key, n]) => key.length <= 180 && integer(n, 1000)),
            );
        if (f.heroActions !== undefined) check(integer(f.heroActions, 60));
        if (f.enemyActions !== undefined) check(integer(f.enemyActions, 60));
        if (f.warning !== undefined)
          check(typeof f.warning === 'string' && f.warning.length <= 300);
        if (f.minions !== undefined) {
          check(Array.isArray(f.minions) && f.minions.length <= 64);
          for (const minion of f.minions) {
            check(
              object(minion) &&
                typeof minion.id === 'string' &&
                minion.id.length <= 150 &&
                integer(minion.activeAt, 1000),
            );
            for (const key of ['hp', 'maxHp', 'attack', 'defense', 'speed', 'shield'] as const)
              check(number(minion[key]));
            check(
              minion.maxHp > 0 &&
                minion.hp <= minion.maxHp &&
                ['warrior', 'mage', 'rogue'].includes(minion.profession) &&
                Array.isArray(minion.statuses) &&
                minion.statuses.length === 0,
            );
          }
        }
      }
      check(p.frames.at(-1)!.enemyHp === p.enemyHp);
      if (r.outcome !== 'battle') check(p.cursor === p.frames.length - 1);
    }
  }
  check(e.dispatch === null || object(e.dispatch));
  if (e.dispatch) {
    const d = e.dispatch;
    check(integer(d.area, e.cleared) && d.area >= 1 && team(d.team));
    check(
      number(d.startedAt, 8.64e15) &&
        number(d.readyAt, 8.64e15) &&
        d.readyAt - d.startedAt === DISPATCH_MS &&
        integer(d.gold, 69) &&
        d.gold >= 25 &&
        d.medals === d.area,
    );
    if (e.run && ['ready', 'battle'].includes(e.run.outcome))
      check(d.team.every((id) => !e.run!.team.includes(id)));
  }
  return e;
}
