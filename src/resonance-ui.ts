import { spriteUrl } from './assets';
import {
  RESONANCES,
  PROFESSIONS,
  resonanceScore,
  runBagCells,
  cells,
  dimensions,
} from './backpack';
import { CATEGORY_NAMES } from './categories';
import { QUALITIES } from './data';
import { esc } from './pack-ui';
import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import { itemPainting, shapePath } from './scene';
import type { GameState, ResonanceKey, Reward } from './types';

const categoryKey = (series: string) =>
  Object.entries(CATEGORY_NAMES).find(([, name]) => name === series)?.[0] ?? 'support';
function sigil(key: ResonanceKey) {
  const d = RESONANCES[key];
  return `<img class="resonance-sigil" src="${spriteUrl(d.kind === 'profession' ? 'ui/status/' + d.profession : 'ui/categories/' + categoryKey(d.series))}" alt="" aria-hidden="true">`;
}
function contributionSource(key: ResonanceKey) {
  const d = RESONANCES[key];
  return d.kind === 'profession' ? `${PROFESSIONS[d.profession].name}物品` : `${d.series}类物品`;
}

export function resonanceCandidates(s: GameState, reward: Reward, canRefresh: boolean) {
  return `<div class="resonance-candidates">${reward.resonances
    .map((key, index) => {
      const d = RESONANCES[key],
        score = resonanceScore(s.inventory, s.draft, key);
      const summary = d.effects[0].split('；')[0].replace('独立', '');
      return `<article class="resonance-candidate ${resonanceRankClass(d.rank)}">
      <button class="resonance-pick" data-resonance="${key}" aria-label="选择${esc(d.name)}">
        ${sigil(key)}<span class="resonance-copy"><span class="resonance-heading"><strong>${esc(d.name)}</strong><small>${resonanceRankName(d.rank)}</small></span><span class="resonance-summary">${esc(summary)}</span><small class="resonance-contribution">${contributionSource(key)} ${score.score} · ${score.thresholds.join(' / ')}</small></span>
      </button><div class="resonance-card-tools"><button data-resonance-detail="${key}" aria-label="查看${esc(d.name)}详情">详情</button><button data-refresh-resonance="${index}" aria-label="刷新${esc(d.name)}" ${!canRefresh ? 'disabled' : ''}>刷新</button></div>
    </article>`;
    })
    .join(
      '',
    )}</div><footer class="resonance-picker-tools"><small>${reward.refreshUsed ? '本次刷新已使用' : canRefresh ? '免费刷新 1 次' : '暂无其他候选'}</small><button data-resonance-pack>查看背包</button></footer>`;
}

export function resonanceDetails(s: GameState, key: ResonanceKey) {
  const d = RESONANCES[key],
    score = resonanceScore(s.inventory, s.draft, key);
  return `<article class="resonance-detail ${resonanceRankClass(d.rank)}"><header>${sigil(key)}<div><h2>${esc(d.name)}</h2><small>${resonanceRankName(d.rank)} · ${d.kind === 'profession' ? '职业' : '物品'}共鸣</small></div></header><p class="resonance-detail-score">${contributionSource(key)}贡献 <b>${score.score}</b> 点 · 已激活 ${score.tier}/3 段</p><div class="resonance-detail-tiers">${d.effects.map((effect, n) => `<section class="textured-inset ${score.tier > n ? 'reached' : ''}"><h3>第${['一', '二', '三'][n]}段 <small>${score.thresholds[n]} 点${score.tier > n ? ' · 已激活' : ''}</small></h3><p>${esc(effect)}</p></section>`).join('')}</div>${d.requires.length ? `<p class="resonance-prerequisite">前置共鸣：${d.requires.map((k) => esc(RESONANCES[k].name)).join(' / ')}</p>` : ''}</article>`;
}

/** Read-only snapshot: inspecting the pack never changes the active candidates or draft. */
export function resonancePack(s: GameState) {
  const open = runBagCells(s);
  return `<h2>当前背包</h2><svg class="resonance-pack-preview" viewBox="0 0 700 600" role="img" aria-label="当前装备布局">${Array.from({ length: 42 }, (_, n) => `<rect x="${(n % 7) * 100 + 3}" y="${Math.floor(n / 7) * 100 + 3}" width="94" height="94" fill="${open.has(`${n % 7},${Math.floor(n / 7)}`) ? '#425454' : '#15262a'}" stroke="#81918c" stroke-opacity="${open.has(`${n % 7},${Math.floor(n / 7)}`) ? '.7' : '.15'}"/>`).join('')}${s.draft
    .map((p) => {
      const i = s.inventory.find((i) => i.id === p.id)!;
      const size = dimensions(i, p);
      return `<svg x="${p.x * 100}" y="${p.y * 100}" width="${size.w * 100}" height="${size.h * 100}" viewBox="0 0 ${size.w * 100} ${size.h * 100}"><title>${esc(i.name)}</title><path d="${shapePath(cells(i, p.rotation))}" fill="${QUALITIES[i.quality].color}33" stroke="${QUALITIES[i.quality].color}" stroke-width="3"/>${itemPainting(i, p.rotation, 'resonance-preview')}</svg>`;
    })
    .join('')}</svg>`;
}
