import { icon, professionIcon } from './art';
import { resonanceScore } from './backpack';
import { esc } from './pack-ui';
import { realmName } from './progression';
import { RESONANCES } from './resonances';
import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import { uiControl, uiIcon } from './ui-art';
import type { Attributes, GameState } from './types';

export function combatVitals(hp: number, maxHp: number) {
  return `<span class="health-value">♥ ${Math.ceil(hp)}/${Math.ceil(maxHp)}</span>`;
}

/** Shared presentation; callers supply live training or immutable graduate stats. */
export function combatHud(s: GameState, stats: Attributes) {
  return `<strong>${esc(s.run.trainee?.name ?? '勇者')} ${professionIcon(s.run.profession)}<small>${realmName(s.run.realm)}</small></strong><div class="hud-life"><span aria-label="生命">${uiIcon('hp')}${Math.ceil(s.player.hp)}/${Math.ceil(s.player.maxHp)}</span><div class="hud-health-track"><i style="width:${Math.max(0, Math.min(100, (s.player.hp / s.player.maxHp) * 100))}%"></i></div></div><div class="hud-values"><span aria-label="攻击">${uiIcon('attack')}<b>${Math.round(stats.attack)}</b></span><span aria-label="防御">${uiIcon('defense')}<b>${stats.defense.toFixed(0)}</b></span><span aria-label="速度">${uiControl('speed')}<b>${stats.speed}</b></span></div>`;
}

export function combatResonances(
  s: GameState,
  editable = false,
  attribute = 'data-inspect-resonance',
  emptyLabels: string[] = [],
) {
  return Array.from({ length: 4 }, (_, n) => {
    const k = s.run.resonances[n];
    if (!k)
      return `<div class="resonance-slot empty">${icon('spark', 20)}<b>${n ? '待觉醒' : '初始共鸣'}</b><small>${esc(emptyLabels[n] ?? '未获得')}</small></div>`;
    const r = resonanceScore(s.inventory, editable ? s.draft : s.placements, k),
      definition = RESONANCES[k];
    return `<button class="resonance-slot ${resonanceRankClass(definition.rank)} ${r.tier ? 'lit' : ''}" ${attribute}="${k}">${icon(definition.icon, 12)}<b>${esc(definition.name)}</b><small>${resonanceRankName(definition.rank)} · ${r.score}/${r.next ?? r.thresholds[2]}</small><span class="resonance-meter"><i style="width:${Math.min(100, (r.score / (r.next ?? r.thresholds[2])) * 100)}%"></i></span><span class="tier-marks">${[1, 2, 3].map((tier) => `<i class="${r.tier >= tier ? 'on' : ''}"></i>`).join('')}</span></button>`;
  }).join('');
}
