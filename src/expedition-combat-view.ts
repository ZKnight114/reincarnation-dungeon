import { battleRuntime, fighter } from './combat';
import { expeditionHero, expeditionRunEnemy, expeditionState } from './expedition';
import { heroBattleBuild } from './progression';
import { cells, dimensions, bagCells } from './backpack';
import { QUALITIES } from './data';
import { esc, bagCellClass, gradeFill, equipmentActivation } from './pack-ui';
import { itemPainting, shapePath } from './scene';
import { pieceStyle } from './pack-geometry';
import { itemBadge } from './item-badge';
import { cooldownView } from './cooldown';
import { combatHud, combatResonances } from './combat-view';
import type { GameState, HeroRecord } from './types';
import type { BattleRuntime } from './skill-types';

/** A replay-only view; never writes the training run or a graduate's bound gear. */
export function expeditionBattleState(s: GameState): GameState | null {
  const run = expeditionState(s).run,
    report = run?.report;
  if (!run || run.outcome !== 'battle' || !report) return null;
  const frame = report.frames[report.cursor],
    h = expeditionHero(s, run.team[frame.slot])!,
    e = expeditionRunEnemy(run),
    build = heroBattleBuild(h);
  const runtime = battleRuntime(
    fighter(h.stats, h.profession, frame.hp),
    fighter(
      { attack: e.attack, hp: e.maxHp, defense: e.defense, speed: e.speed },
      e.profession!,
      frame.enemyHp,
    ),
    build.sources,
    e.templateId!,
    build.mixed,
  );
  runtime.hero = frame.heroFighter
    ? structuredClone(frame.heroFighter)
    : { ...runtime.hero, shield: frame.shield };
  runtime.enemy = frame.enemyFighter
    ? structuredClone(frame.enemyFighter)
    : { ...runtime.enemy, shield: frame.enemyShield };
  runtime.tiers = build.tiers;
  runtime.timers = { ...frame.timers };
  runtime.flags = { ...frame.firedAt };
  runtime.heroActions = frame.heroActions ?? frame.round;
  runtime.enemyActions = frame.enemyActions ?? frame.round;
  runtime.minions = structuredClone(frame.minions ?? []);
  runtime.warning = frame.warning ?? '';
  return {
    ...s,
    phase: 'combat',
    enemy: { ...e, hp: frame.enemyHp },
    combat: { ...s.combat, round: frame.round, runtime },
    player: { hp: frame.hp, maxHp: frame.maxHp, defense: h.stats.defense, shield: frame.shield },
    inventory: h.loadout?.equipment ?? [],
    placements: h.loadout?.placements ?? [],
    draft: h.loadout?.placements ?? [],
    run: {
      ...s.run,
      profession: h.profession,
      trainee: h,
      realm: h.realm,
      resonances: h.resonances,
      boundTome: h.tomeId ? { id: h.tomeId, level: h.tomeLevel ?? 1 } : null,
    },
  };
}
export function expeditionPack(h: HeroRecord) {
  const load = h.loadout,
    open = bagCells(load?.capacity ?? 42, load?.packLayout === 'legacy');
  return `<div class="exp-pack pack-grid" aria-label="当前冒险者最终背包">${Array.from({ length: 42 }, (_, n) => `<span class="pack-cell ${bagCellClass(open, n % 7, Math.floor(n / 7))}"></span>`).join('')}${(
    load?.placements ?? []
  )
    .map((p) => {
      const item = load!.equipment.find((i) => i.id === p.id)!;
      const d = dimensions(item, p),
        path = shapePath(cells(item, p.rotation)),
        clip = `exp-cooldown-${item.id}`;
      const first = cells(item, p.rotation)[0];
      return `<svg class="pack-piece quality-${item.quality}" data-bound-item="${item.id}" data-owner="${h.id}" role="button" tabindex="0" aria-label="${esc(item.name)}" style="${pieceStyle(p.x, p.y, d.w, d.h)};--item-color:${QUALITIES[item.quality].color};--item-fill:${gradeFill[item.quality]}" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect width="${d.w * 100}" height="0"/></clipPath></defs><path class="item-outline" d="${path}"/>${itemPainting(item, p.rotation, 'board')}<path class="item-cooldown-mask" clip-path="url(#${clip})" d="${path}"/><path class="item-grade-rim" d="${path}"/>${itemBadge(item)}<text class="cooldown-label" x="${first[0] * 100 + 12}" y="${first[1] * 100 + 84}"></text></svg>`;
    })
    .join('')}</div>`;
}
export function expeditionBuildPanel(h: HeroRecord, view: GameState) {
  return `<div class="combat-hud">${combatHud(view, h.stats)}</div><div class="resonance-strip">${combatResonances(view, false, 'data-exp-resonance')}</div><section class="exp-view-pack">${expeditionPack(h)}</section>`;
}
export function updateExpeditionCooldown(
  root: HTMLElement,
  h: HeroRecord,
  runtime: BattleRuntime,
  sourceId?: string,
) {
  root.querySelectorAll<SVGSVGElement>('[data-bound-item]').forEach((el) => {
    const id = el.dataset.boundItem!,
      item = h.loadout?.equipment.find((i) => i.id === id),
      source = runtime.sources.find((x) => x.id === id);
    if (!item) return;
    const index = source?.skills.findIndex((k) => k.cooldown > 0) ?? -1,
      view =
        index >= 0
          ? cooldownView(runtime, id, index, source!.skills[index])
          : { remaining: 0, progress: 1 },
      d = dimensions(item, { rotation: 0 });
    const rect = el.querySelector('clipPath rect')!;
    rect.setAttribute('y', String(view.progress * d.h * 100));
    rect.setAttribute('height', String((1 - view.progress) * d.h * 100));
    el.querySelector('.cooldown-label')!.textContent =
      index < 0 ? '' : view.remaining ? view.remaining + ' 回合' : '就绪';
    el.dataset.cooldownProgress = String(view.progress);
    if (sourceId === id) {
      equipmentActivation(el, item);
    }
  });
}
