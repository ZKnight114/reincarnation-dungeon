import { dotStrength, enrageMultiplier, statusValue } from './combat';
import { HERO_SHIELD_CAP, ENEMY_SHIELD_CAP } from './combat-balance';
import { PROFESSIONS } from './backpack';
import { ENEMY_TEMPLATES } from './enemies';
import { esc } from './pack-ui';
import { tome } from './progression';
import { uiIcon } from './ui-art';
import type { GameState } from './types';
import type { StatusKind } from './skill-types';
import { statusIcon } from './status-art';
import { readableEffect } from './item-rules';
export { statusIcon } from './status-art';

export type StatusSide = 'hero' | 'enemy';
const names: Record<StatusKind, string> = {
  poison: '中毒',
  burn: '灼烧',
  chill: '减速',
  break: '破防',
  mark: '标记',
  smoke: '烟幕',
  regen: '回生',
  guard: '减伤',
};
interface Row {
  kind: string;
  name: string;
  value: string;
  detail?: string;
  badge?: number;
}
const roundValue = (n: number) => +n.toFixed(2);
export function statusRows(s: GameState, side: StatusSide): Row[] {
  const r = s.combat.runtime;
  if (!r) return [];
  const f = r[side],
    rows: Row[] = [];
  if (f.shield > 0)
    rows.push({
      kind: 'shield',
      badge: Math.ceil(f.shield),
      name: '护盾',
      value: `${Math.ceil(f.shield)} 点`,
      detail: `优先抵消受到的伤害，耗尽后消失；储量上限为最大生命的${(side === 'hero' ? HERO_SHIELD_CAP : ENEMY_SHIELD_CAP) * 100}%。`,
    });
  const groups = new Set(f.statuses.map((x) => x.kind));
  for (const kind of groups) {
    const group = f.statuses.filter((x) => x.kind === kind),
      value = statusValue(f, kind);
    const sum = group.reduce(
        (n, x) => n + (kind === 'poison' || kind === 'burn' ? dotStrength(r, x) : x.value),
        0,
      ),
      opposite = side === 'hero' ? r.enemy : r.hero;
    const detail = group
      .map(
        (x) =>
          `${roundValue(kind === 'poison' || kind === 'burn' ? dotStrength(r, x) : x.value * (kind === 'regen' ? 1 : 100))}${kind === 'poison' || kind === 'burn' || kind === 'regen' ? ' 点强度' : '%'} · 剩余 ${x.remaining} 回合`,
      )
      .join('；');
    const descriptions: Record<StatusKind, string> = {
      poison: `原始持续伤害 ${roundValue(Math.min(sum, opposite.attack * 0.4))}／次行动`,
      burn: `原始持续伤害 ${roundValue(Math.min(sum, opposite.attack * 0.4))}／次行动`,
      chill: `速度降低 ${roundValue(value * 100)}%`,
      break: `防御降低 ${roundValue(value * 100)}%`,
      mark: `受到的远程物品伤害增幅 ${roundValue(value * 100)}%`,
      smoke: `烟幕直接减伤 ${roundValue(Math.min(0.45, value) * 100)}%`,
      regen: `每回合恢复 ${roundValue(sum)} 生命`,
      guard: `直接伤害减免 ${roundValue(Math.min(0.45, sum) * 100)}%`,
    };
    rows.push({ kind, name: names[kind], value: descriptions[kind], detail, badge: group.length });
  }
  if (side === 'enemy') {
    if (r.warning) rows.push({ kind: 'warning', name: '技能预告', value: r.warning });
    if (s.combat.round >= 10)
      rows.push({
        kind: 'rage',
        badge: Math.round((enrageMultiplier(s.combat.round) - 1) * 100),
        name: '狂暴',
        value: `伤害 +${Math.round((enrageMultiplier(s.combat.round) - 1) * 100)}%`,
      });
    if (r.phase)
      rows.push({
        kind: 'phase',
        name: '第二阶段',
        value:
          r.enemyId === 'bone_king'
            ? '技能伤害 +10%'
            : r.flags.queenStrike
              ? '下一次毒刺伤害 +30%'
              : '狩猎阶段',
      });
    for (const m of r.minions.filter((m) => m.hp > 0))
      rows.push({
        kind: 'minions',
        badge: r.minions.filter((m) => m.hp > 0).length,
        name: '幼蛛 ' + m.id.slice(7),
        value: `生命 ${Math.ceil(m.hp)}／${Math.ceil(m.maxHp)}`,
        detail: `${m.activeAt > r.enemyActions ? '下次敌方行动开始攻击' : '本次敌方行动可攻击'} · 独立攻击依次结算`,
      });
  } else if (s.run.boundTome) {
    const t = tome(s.run.boundTome.id)!,
      cooldown = r.timers['tome:' + t.id + ':0'] ?? 0;
    rows.push({
      kind: 'tome',
      badge: cooldown,
      name: t.name,
      value: cooldown ? `剩余 ${cooldown} 回合` : '就绪',
      detail: '按自身周期自动发动。',
    });
  }
  if (side === 'hero') {
    if (r.charges['v3:star'])
      rows.push({
        kind: 'energy',
        badge: r.charges['v3:star'],
        name: '星能',
        value: `${r.charges['v3:star']} / 3 层`,
        detail: '下一次星幕仪典消耗星能追加伤害。',
      });
    const steals = r.sources.filter((s) =>
      s.skills.some(
        (k) =>
          k.passive &&
          ['warrior_flurry_2', 'rogue_poison_2', 'rogue_volley_2'].includes(k.passive.id),
      ),
    );
    if (steals.length)
      rows.push({
        kind: 'lifesteal',
        name: '吸血',
        value: '满足条件的实际生命伤害转为恢复',
        detail:
          steals
            .map((s) => {
              const p = s.skills.find((k) => k.passive)!.passive!,
                n = p.tier - 1;
              return p.id === 'warrior_flurry_2'
                ? `战意回生：获得战意后的下次行动吸血${[3, 4, 5][n]}%，每回合上限${[0.5, 0.75, 1][n]}%最大生命`
                : p.id === 'rogue_poison_2'
                  ? `伏击要害：蚀影刃典攻击前已中毒的目标，吸血${[5, 8, 10][n]}%，每回合上限${[1, 1.5, 2][n]}%最大生命`
                  : `猎手汲取：命中标记目标吸血${[3, 5, 7][n]}%，每回合上限${[0.5, 0.75, 1][n]}%最大生命`;
            })
            .join('；') +
          '。只计算实际生命伤害，不含护盾、过量伤害、持续伤害和反击；共鸣合计每回合最多恢复2%最大生命。',
      });
  }
  return rows;
}
export function statusButton(s: GameState, side: StatusSide) {
  const rows = statusRows(s, side).filter((x) => x.kind !== 'warning');
  const unique = rows.filter((x, n) => rows.findIndex((r) => r.kind === x.kind) === n);
  return `<button class="battle-status-button" data-status-side="${side}" aria-label="查看${side === 'hero' ? '勇者' : '敌人'}状态详情">${unique
    .slice(0, 4)
    .map(
      (row) =>
        `<span class="status-icon-value" data-status-kind="${row.kind}" role="img" aria-label="${esc(row.name + '：' + row.value)}">${statusIcon(row.kind)}${row.badge !== undefined ? `<b class="status-count">${row.badge}</b>` : ''}</span>`,
    )
    .join(
      '',
    )}${unique.length > 4 ? `<small>+${unique.length - 4}</small>` : ''}${statusIcon('info')}</button>`;
}
export function battleVitals(s: GameState, side: StatusSide) {
  const f = s.combat.runtime?.[side];
  if (!f) return '';
  return `<div class="battle-vitals"><span aria-label="攻击 ${roundValue(f.attack)}">${uiIcon('attack')}${Math.round(f.attack)}</span><span aria-label="防御 ${roundValue(f.defense * (1 - statusValue(f, 'break')))}">${uiIcon('defense')}${roundValue(f.defense * (1 - statusValue(f, 'break')))}</span><span aria-label="速度 ${roundValue(f.speed * (1 - statusValue(f, 'chill')))}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m9 1-6 8h4l-1 6 7-9H9Z"/></svg>${roundValue(f.speed * (1 - statusValue(f, 'chill')))}</span></div>`;
}
export function statusDetails(s: GameState, side: StatusSide) {
  const r = s.combat.runtime;
  if (!r) return '';
  const f = r[side],
    title = side === 'hero' ? (s.run.trainee?.name ?? '勇者') : (s.enemy?.name ?? '敌人');
  const template = side === 'enemy' ? ENEMY_TEMPLATES.find((x) => x.id === r.enemyId) : null;
  const rows = statusRows(s, side);
  return `<article class="battle-status-details"><h2>${esc(title)} · 状态</h2><p>${PROFESSIONS[f.profession].name} · 生命 ${Math.ceil(f.hp)}／${Math.ceil(f.maxHp)}</p><div class="status-attributes"><span>${uiIcon('attack')}${roundValue(f.attack)}</span><span>${uiIcon('defense')}${roundValue(f.defense * (1 - statusValue(f, 'break')))}</span><span>速度 ${roundValue(f.speed * (1 - statusValue(f, 'chill')))}</span></div>
    <ul>${rows.length ? rows.map((x) => `<li>${statusIcon(x.kind)}<div><strong>${esc(x.name)}</strong><b>${esc(x.value)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div></li>`).join('') : '<li>当前没有持续状态</li>'}</ul>${template ? `<div class="enemy-skill-details">${template.skills.map((k) => `<p>${esc(readableEffect(k))}</p>`).join('')}<p>${esc(readableEffect(template.passive))}</p><p>${esc(readableEffect(template.phase))}</p></div>` : ''}</article>`;
}
