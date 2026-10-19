import { itemBadge } from './item-badge';
import { talentMarkup } from './talents';
import { bagCells, cells, dimensions, PROFESSIONS, RESONANCES, resonanceScore } from './backpack';
import { QUALITIES } from './data';
import { ATTRIBUTE_KEYS, ATTRIBUTES, TALENTS } from './hero';
import { STAGES, TRIALS } from './journey';
import { esc } from './pack-ui';
import { realmName, tome } from './progression';
import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import { heroArt, itemPainting, shapePath } from './scene';
import type { HeroRecord } from './types';
export type ArchiveTab = 'profile' | 'resonances' | 'equipment';
export const archiveOutcome = (h: HeroRecord) =>
  h.outcome === 'win'
    ? h.completed === h.routeLength && h.routeLength > h.normalLength
      ? '极限毕业'
      : '正常结业'
    : h.outcome === 'death'
      ? '探险止步'
      : '提前归会';
export function archiveDetails(h: HeroRecord, tab: ArchiveTab) {
  const b = h.loadout;
  const content =
    tab === 'profile'
      ? `<section class="archive-attributes"><h3>${realmName(h.realm)}</h3><p>${h.tomeId ? (tome(h.tomeId)?.name ?? '') : ''}${h.tomeLevel ? ' · Lv.' + h.tomeLevel : ''}</p><h3>当前属性</h3><div class="hero-stats"><span>攻击 <b>${h.stats.attack}</b></span><span>生命 <b>${h.stats.hp}</b></span><span>防御 <b>${h.stats.defense}</b></span><span>速度 <b>${h.stats.speed}</b></span></div><small>续航 ${h.stats.sustain}/回合</small></section><section class="archive-talents"><h3>起始天赋</h3><div class="talent-grid">${h.talents.map((k) => talentMarkup(k, h.loadout?.equipment ?? [])).join('')}</div><p>${ATTRIBUTE_KEYS.map((k) => `${ATTRIBUTES[k].name} +${h.allocation[k]} 点`).join(' · ')}</p></section><div class="graduate-trials">${h.trials.map((t, n) => `<span class="${n < h.stages ? 'passed' : ''}">${STAGES[n]}<small>${n < h.stages ? TRIALS[t ?? 0].name : '未通过'}</small></span>`).join('')}</div><p class="archive-score">战力来源：成长 ${h.score.growth} + 构筑 ${h.score.build} + 表现 ${h.score.performance}</p>`
      : tab === 'resonances'
        ? `<div class="archive-resonances">${
            h.resonances.length
              ? h.resonances
                  .map((k) => {
                    const d = RESONANCES[k],
                      r = resonanceScore(b?.equipment ?? [], b?.placements ?? [], k),
                      tier = h.resonanceTiers[k] ?? 0;
                    return `<section class="archive-resonance ${resonanceRankClass(d.rank)}"><header><strong>${d.name}</strong><small>${resonanceRankName(d.rank)} · ${tier}/3 段</small></header><small>贡献 ${r.score} · ${r.thresholds.join(' / ')}</small>${d.effects.map((effect, n) => `<p class="${tier > n ? 'reached' : 'muted'}"><b>${['Ⅰ', 'Ⅱ', 'Ⅲ'][n]}</b> ${esc(effect)}</p>`).join('')}</section>`;
                  })
                  .join('')
              : '<p class="archive-empty">尚未获得共鸣</p>'
          }</div>`
        : `<section class="hero-equipment-section"><h3>最终绑定装备 <small>${b?.equipment.length ?? 0} 件</small></h3>${
            b
              ? `<div class="pack-grid graduate-pack" aria-label="${esc(h.name)}的专属装备">${Array.from({ length: 42 }, (_, n) => `<span class="pack-cell ${bagCells(b.capacity, b.packLayout === 'legacy').has(`${n % 7},${Math.floor(n / 7)}`) ? 'open' : 'closed'}"></span>`).join('')}${b.placements
                  .map((p) => {
                    const item = b.equipment.find((i) => i.id === p.id)!,
                      d = dimensions(item, p);
                    return `<svg class="pack-piece bound-piece" data-bound-item="${item.id}" data-owner="${h.id}" role="button" tabindex="0" aria-label="${esc(item.name)}，等级${item.level}" style="left:${(p.x / 7) * 100}%;top:${(p.y / 6) * 100}%;width:${(d.w / 7) * 100}%;height:${(d.h / 6) * 100}%;--item-color:${QUALITIES[item.quality].color};--item-fill:${QUALITIES[item.quality].color}33" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><path class="item-outline" d="${shapePath(cells(item, p.rotation))}"/>${itemPainting(item, p.rotation, 'archive-' + h.id)}${itemBadge(item)}</svg>`;
                  })
                  .join(
                    '',
                  )}</div><div class="bound-item-detail" data-bound-detail><strong>仅供 ${esc(h.name)} 使用</strong><p>计入最终战力</p></div>`
              : '<p>没有绑定装备</p>'
          }</section>`;
  return `<article class="archive-frame"><header class="archive-heading"><h2>勇者档案</h2></header><div class="archive-identity">${heroArt(h.profession, h.appearance)}</div><h2 class="archive-name">${esc(h.name)}</h2><p class="archive-power">${PROFESSIONS[h.profession].name} · <span class="rating-${h.rating}">${h.rating} 级</span> · 战力 ${h.power}</p><nav class="archive-tabs" aria-label="档案页面">${(['profile', 'resonances', 'equipment'] as const).map((t, n) => `<button data-archive-tab="${t}" aria-pressed="${t === tab}" class="${t === tab ? 'selected' : ''}">${['档案', '共鸣', '装备'][n]}</button>`).join('')}</nav><div class="archive-content">${content}</div><footer>第 ${h.chapter} 关 · ${h.completed}/${h.routeLength} 步 · ${archiveOutcome(h)}</footer></article>`;
}
