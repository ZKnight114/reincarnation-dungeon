import { professionIcon } from './art';
import { PROFESSIONS } from './backpack';
import { heroArt } from './scene';
import { foeRig } from './pixel';
import { esc } from './pack-ui';
import { realmName } from './progression';
import { uiControl, uiIcon } from './ui-art';
import {
  chapterEnemy,
  expeditionGoals,
  expeditionRecommended,
  stageReward,
  EXPEDITION_STAR_REWARDS,
} from './expedition-chapters';
import {
  expeditionState,
  expeditionStars,
  expeditionUnlocked,
  expeditionHero,
  expeditionGoalResults,
  EXPEDITION_AREAS,
} from './expedition';
import type { GameState, Profession } from './types';

export const star = (filled: boolean) =>
  `<svg viewBox="0 0 24 24" class="exp-star ${filled ? 'filled' : ''}" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2l-5-4.9 6.9-1Z"/></svg>`;
const stars = (marks: boolean[]) => {
  const count = marks.filter(Boolean).length;
  return `<span class="exp-stars" aria-label="${count}星">${marks.map((_, n) => star(n < count)).join('')}</span>`;
};
export const expHeader = (title: string, back = 'exp-map') =>
  `<header class="feature-header"><button class="feature-back" data-action="${back}" aria-label="返回">${uiControl('back')}</button><h1>${title}</h1></header>`;
const chest = `<svg class="exp-chest" viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges"><path fill="#442f25" d="M4 12h24v16H4zM6 6h20v6H6z"/><path fill="#99704a" d="M6 14h20v12H6zM8 8h16v4H8z"/><path fill="#c6a56a" d="M4 12h24v3H4zM6 6h3v6H6zm17 0h3v6h-3zM6 15h3v11H6zm17 0h3v11h-3z"/><path fill="#f4d783" d="M13 12h6v8h-6z"/><path fill="#46332c" d="M15 15h2v3h-2z"/></svg>`;
const routePoints = [
  [170, 1060],
  [76, 955],
  [205, 850],
  [140, 745],
  [65, 640],
  [201, 535],
  [136, 430],
  [67, 325],
  [195, 220],
  [141, 115],
];
export function expeditionMap(s: GameState, popup: number | null, chapterIndex: number) {
  const e = expeditionState(s),
    unlocked = expeditionUnlocked(s),
    total = expeditionStars(s);
  const future = chapterIndex > 0;
  const map = `<section class="exp-map-page"><header class="exp-map-header"><h1>远征</h1><span>${star(true)}${total}/30</span></header><div class="exp-chapter-heading"><button data-action="exp-chapter-prev" aria-label="上一章节" ${future ? '' : 'disabled'}>${uiControl('back')}</button><div><small>第${future ? '二' : '一'}章</small><h2>${future ? '迷雾未散' : '幽影森林'}</h2></div><button data-action="exp-chapter-next" aria-label="下一章节" ${future ? 'disabled' : ''}><span class="exp-forward">${uiControl('back')}</span></button></div>${future ? '<div class="exp-coming">新章节筹备中</div>' : `<div class="exp-map-scroll"><div class="exp-map-route"><svg class="exp-route-line" viewBox="0 0 300 1170" aria-hidden="true"><polyline points="${routePoints.map((p) => p.join(',')).join(' ')}"/></svg>${routePoints.map(([x, y], n) => `<button class="exp-map-node ${n === 4 ? 'elite' : n === 9 ? 'boss' : ''} ${n === unlocked - 1 ? 'current' : ''}" data-action="exp-stage-${n}" style="left:${x}px;top:${y}px" ${n >= unlocked ? 'disabled' : ''}><strong>${n === 4 ? uiIcon('trial') : n === 9 ? uiIcon('dungeon') : ''}${n + 1}</strong>${stars(e.goals![n])}<small>${n === 4 ? '精英' : n === 9 ? 'Boss' : ''}</small></button>`).join('')}</div></div><aside class="exp-star-rail">${EXPEDITION_STAR_REWARDS.map((r, n) => `<button data-action="exp-reward-${r.stars}" style="top:${76 + n * 177}px" class="${e.claimedStars!.includes(r.stars) ? 'claimed' : total >= r.stars ? 'available' : ''}" aria-label="${r.stars}星奖励${e.claimedStars!.includes(r.stars) ? '已领取' : ''}" ${total < r.stars || e.claimedStars!.includes(r.stars) ? 'disabled' : ''}>${chest}<small>${e.claimedStars!.includes(r.stars) ? '已领取' : r.stars + '星'}</small></button>`).join('')}</aside>`}</section>`;
  if (popup === null || future) return map;
  const enemy = chapterEnemy(popup),
    reward = stageReward(popup, !e.goals![popup][0]);
  return (
    map +
    `<div class="exp-sheet-mask"><section class="exp-stage-sheet"><button class="exp-sheet-close" data-action="exp-detail-close" aria-label="关闭">${uiControl('close')}</button><h2>第 ${popup + 1} 关${popup === 4 ? ' · 精英' : popup === 9 ? ' · Boss' : ''}</h2><div class="exp-enemy-preview">${foeRig(enemy)}</div><strong>${esc(enemy.name)} ${professionIcon(enemy.profession!)}</strong><small>推荐战力 ${expeditionRecommended(popup)}</small><div class="exp-goals">${expeditionGoals(
      popup,
    )
      .map(
        (g, n) =>
          `<div>${star(e.goals![popup][n])}<span>${g.text}</span>${e.goals![popup][n] ? '<small>已达成</small>' : ''}</div>`,
      )
      .join(
        '',
      )}</div><p class="exp-reward-line">${uiIcon('gold')}${reward.gold} ${uiIcon('medal')}${reward.medals}</p><button class="primary-button" data-action="exp-team-open">编队挑战</button></section></div>`
  );
}
export function expeditionTeam(
  s: GameState,
  node: number,
  filter: Profession | 'all',
  ascending: boolean,
  dispatch = false,
  area = 1,
) {
  const e = expeditionState(s),
    job = e.dispatch,
    busy = new Set(job?.team ?? []);
  const enemy = chapterEnemy(node);
  const canStart =
    e.team.length > 0 &&
    e.team.every((id) => !busy.has(id)) &&
    (!dispatch || (area <= e.cleared && !job));
  const roster = [...s.meta.heroes]
    .map((h) => expeditionHero(s, h.id)!)
    .filter((h) => filter === 'all' || h.profession === filter)
    .sort((a, b) => (ascending ? a.power - b.power : b.power - a.power));
  const remaining = job ? Math.max(0, Math.ceil((job.readyAt - Date.now()) / 1000)) : 0;
  const title = dispatch ? '驻地探索' : `幽影森林 · 第 ${node + 1} 关`;
  return `${expHeader(title, dispatch ? 'guild' : 'exp-map')}<div class="exp-team-enemy">${dispatch ? uiIcon('guild') : foeRig(enemy)}<div><h2>${dispatch ? EXPEDITION_AREAS[area - 1].name : esc(enemy.name)}</h2><small>${dispatch ? '探索时长 5 分钟' : `${node === 4 ? '精英' : node === 9 ? 'Boss' : '遭遇战'} · 推荐战力 ${expeditionRecommended(node)}`}</small></div></div>${dispatch ? `<nav class="exp-area-tabs">${EXPEDITION_AREAS.map((a, n) => `<button data-action="exp-area-${n + 1}" aria-pressed="${n + 1 === area}" ${n + 1 > e.cleared ? 'disabled' : ''}>${a.name}</button>`).join('')}</nav>` : ''}${
    dispatch && job
      ? `<section class="exp-dispatch"><h2>${remaining ? '探索中' : '探索完成'}</h2><p>${job.team.map((id) => esc(expeditionHero(s, id)!.name)).join(' · ')}</p><strong>${remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : `金币 +${job.gold} · 勋章 +${job.medals}`}</strong><div class="exp-actions"><button data-action="exp-cancel-dispatch">撤回</button><button class="primary-button" data-action="exp-claim" ${remaining ? 'disabled' : ''}>领取收益</button></div></section>`
      : `<div class="exp-team-heading"><strong>出战队伍 ${e.team.length}/3</strong><small>依次接替出战</small></div><div class="exp-team">${Array.from(
          { length: 3 },
          (_, n) => {
            const h = expeditionHero(s, e.team[n]);
            return h
              ? `<article><span class="exp-slot-number">${n + 1}P</span><button class="exp-team-member" data-action="exp-team-${h.id}">${heroArt(h.profession, h.appearance)}<strong>${esc(h.name)}</strong></button><div class="exp-order"><button data-action="exp-order-${n}-up" ${n === 0 ? 'disabled' : ''}>前移</button><button data-action="exp-order-${n}-down" ${n === e.team.length - 1 ? 'disabled' : ''}>后移</button></div></article>`
              : `<article class="exp-team-empty"><strong>${n + 1}</strong><small>待编入</small></article>`;
          },
        ).join('')}</div>${
          dispatch
            ? ''
            : `<div class="exp-team-check">${expeditionGoals(node)
                .slice(1)
                .map((g) => g.text)
                .join(' · ')}</div>`
        }`
  }
  <div class="exp-roster-toolbar"><strong>冒险者</strong><button data-action="exp-sort">战力 ${ascending ? '↑' : '↓'}</button></div><div class="exp-heroes">${roster.map((h) => `<article class="exp-hero-card ${e.team.includes(h.id) ? 'selected' : ''}"><button data-action="exp-team-${h.id}" ${busy.has(h.id) ? 'disabled' : ''} aria-pressed="${e.team.includes(h.id)}">${heroArt(h.profession, h.appearance)}<strong>${esc(h.name)} ${professionIcon(h.profession)}</strong><span>${h.rating} · 战力 ${h.power}</span><small>${realmName(h.realm)}${busy.has(h.id) ? ' · 探索中' : ''}</small></button><button data-hero="${h.id}">详情</button></article>`).join('') || '<div class="exp-empty"><p>公会还没有可出征的冒险者</p><button data-action="chapters">培养第一名勇者</button></div>'}</div><div class="exp-filters">${(['all', 'warrior', 'mage', 'rogue'] as const).map((k) => `<button data-action="exp-filter-${k}" aria-pressed="${filter === k}">${k === 'all' ? '全部' : PROFESSIONS[k].name}</button>`).join('')}</div>${!job || !dispatch ? `<footer class="exp-footer"><button class="primary-button" data-action="${dispatch ? 'exp-dispatch' : 'exp-start'}" ${canStart ? '' : 'disabled'}>${dispatch ? '派遣探索' : '开始战斗'}</button></footer>` : ''}`;
}
export function expeditionResult(s: GameState) {
  const run = expeditionState(s).run!,
    won = run.outcome === 'won',
    modern = run.format === 'chapter';
  const results = modern ? expeditionGoalResults(s) : [won, false, false];
  return `<section class="exp-result-page"><small>${modern ? `幽影森林 · 第 ${run.node + 1} 关` : EXPEDITION_AREAS[run.area - 1].name}</small><h1>${won ? '远征胜利' : '挑战未通过'}</h1><div class="exp-result-stars">${stars(results)}</div><div class="exp-goals">${(modern ? expeditionGoals(run.node) : [{ text: '据点通关' }]).map((g, n) => `<div>${star(results[n])}<span>${g.text}</span><small>${results[n] ? '达成' : '未达成'}</small></div>`).join('')}</div>${won ? `<div class="exp-rewards"><strong>${run.firstClear ? '首次通关' : '再次通关'}</strong><span>${uiIcon('gold')}金币 +${run.gold}</span><span>${uiIcon('medal')}勋章 +${run.medals}</span></div>` : '<p>调整队伍后再次挑战</p>'}<footer class="exp-actions"><button data-action="exp-result-close">返回地图</button><button class="primary-button" data-action="${won ? 'exp-next-stage' : 'exp-retry'}" ${won && (!modern || run.node === 9) ? 'disabled' : ''}>${won ? (modern && run.node < 9 ? '挑战下一关' : '本章完成') : '再次挑战'}</button></footer></section>`;
}
