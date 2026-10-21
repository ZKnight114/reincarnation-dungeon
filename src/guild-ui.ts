import { decorateStatusText } from './status-art';
// Pure presentation for the approved tome pages and single-path guild route.
import { finalAttributes, PROFESSIONS, PROFESSION_KEYS } from './backpack';
import { GUILD_NODES, guildBenefits, guildNodeEffect } from './guild';
import { readableEffect } from './item-rules';
import { esc } from './pack-ui';
import { TOMES, tome, realmName, upgradeCost } from './progression';
import { heroArt } from './scene';
import type { GameState, Profession } from './types';
import { tomeArt, uiControl, uiIcon } from './ui-art';
import { tomeSkills } from './skills';
import { shieldActionScale } from './combat-balance';

export type TomeFilter = Profession | 'all';
type Meta = GameState['meta'];
type Tome = (typeof TOMES)[number];
const header = (title: string, action: string, back: string) =>
  `<header class="feature-header"><button class="feature-back" data-action="${action}">${uiControl('back')}${back}</button><h1>${title}</h1></header>`;
const filters = (filter: TomeFilter, scope: 'tome' | 'library') =>
  `<div class="tome-filters" role="group" aria-label="职业筛选">${(['all', ...PROFESSION_KEYS] as const).map((p) => `<button data-${scope}-filter="${p}" aria-pressed="${p === filter}" class="${p === filter ? 'selected' : ''}">${p === 'all' ? '全部' : PROFESSIONS[p].name}</button>`).join('')}</div>`;
const visibleTomes = (filter: TomeFilter) =>
  TOMES.filter((t) => filter === 'all' || t.profession === filter);
export const tomeAttributeText = (t: Tome, level: number) =>
  Object.entries(t.attributes[Math.max(0, level - 1)])
    .filter(([, value]) => value)
    .map(
      ([key, value]) =>
        `${({ attackPercent: '攻击', hpPercent: '生命', defensePercent: '防御' } as Record<string, string>)[key]} +${value}%`,
    )
    .join(' · ');
function skill(t: Tome, level: number) {
  const text = readableEffect(t.skillStages[Math.max(0, level - 1)]);
  const name = t.skillName || '自动回合技能';
  return { name, text: text.startsWith(name + '：') ? text.slice(name.length + 1) : text };
}

/** Compact selection preview; coefficients come from the actual combat skill. */
export function tomePreviewText(id: string, level: number) {
  const s = tomeSkills(id, level)[0];
  const percent = (value: number) => `${+(value * 100).toFixed(2)}%`;
  const effects = s.actions
    .filter(
      (a) =>
        !a.when &&
        ['damage', 'shield', 'heal', 'regen'].includes(a.kind) &&
        (a.kind !== 'damage' || (a.a ?? 0) > 0),
    )
    .map((a) => {
      if (a.kind === 'shield')
        return `${percent(a.h! * shieldActionScale('hero', s.cooldown))}生命护盾`;
      if (a.kind === 'heal')
        return `${percent(a.h!)}生命治疗${a.unlimited ? '' : `（每战至多${a.limit}次）`}`;
      if (a.kind === 'regen') return `后续${a.duration}回合各回复${percent(a.h!)}生命`;
      return `${a.hits ? a.hits + '次×' : ''}${percent(a.a!)}攻击${a.type === 'magic' ? '法伤' : '物伤'}`;
    });
  const synergy: Record<string, string> = {
    warrior_sword_tome: '破防时穿防，残血目标追加伤害。',
    warrior_spear_tome: '破防时穿防。',
    warrior_shield_tome: '消耗部分护盾追加伤害。',
    mage_flame_tome: '施加灼烧；已有灼烧时追加伤害。',
    mage_ice_tome: '施加减速；已有减速时穿防。',
    mage_arcane_tome: '辅助生效蓄星能，消耗星能追加法伤。',
    rogue_poison_tome: '施毒；已有毒时追加真实伤害。',
    rogue_ranged_tome: '施加标记增幅手弩；已有标记时增伤。',
    rogue_shadow_tome: '烟幕下追加伤害。',
  };
  return `每${s.cooldown}回合：${effects.join('、')}。${synergy[id]}`;
}

export function tomeSelectionView(s: GameState, filter: TomeFilter) {
  const trainee = s.run.trainee!,
    chosen = trainee.tomeId ? tome(trainee.tomeId) : null,
    level = trainee.tomeLevel || 1,
    free = !s.meta.tomeGifts.includes(trainee.profession),
    stats = finalAttributes(s),
    effect = chosen ? skill(chosen, level) : null;
  return `${header('选择典籍', 'back-allocation', '加点')}
    <section class="tome-dossier"><div class="tome-hero">${heroArt(trainee.profession, trainee.appearance)}<div><h2>${esc(trainee.name)} · ${PROFESSIONS[trainee.profession].name}</h2><small>${realmName(trainee.realmStart ?? 0)}</small><p>攻 ${+stats.attack.toFixed(1)} · 生 ${Math.round(stats.hp)} · 防 ${+stats.defense.toFixed(1)} · 速 ${stats.speed}</p></div></div>
    <div class="tome-preview"><button class="tome-equipped" ${chosen ? `data-inspect-tome="${chosen.id}" aria-label="查看${chosen.name}详情"` : 'disabled'}><small>本局典籍</small>${chosen ? tomeArt(chosen.id) : '<span class="tome-empty">?</span>'}<strong>${chosen ? chosen.name : '未装备'}</strong><small>${chosen ? level + '阶' : '请选择典籍'}</small></button><div class="tome-effects"><h3>典籍效果</h3>${chosen && effect ? `<p>${tomeAttributeText(chosen, level)}</p><p><strong>${esc(effect.name)} · </strong>${esc(tomePreviewText(chosen.id, level))}</p>` : '<p>选择后查看人物属性与自动技能</p>'}</div></div>
    <p class="tome-caption">${free ? '首次培养 · 可任选一本免费解锁' : '选择已收集的典籍'}</p>
    <div class="tome-catalogue">${visibleTomes(filter)
      .map((b) => {
        const owned = s.meta.tomes[b.id],
          selectable = owned.level || free;
        return `<button data-tome="${b.id}" aria-pressed="${trainee.tomeId === b.id}" class="tome-card ${trainee.tomeId === b.id ? 'selected' : ''} ${!selectable ? 'locked' : ''}" ${!selectable ? 'disabled' : ''}>${tomeArt(b.id)}<strong>${b.name}</strong><small>${PROFESSIONS[b.profession].name} · ${b.series}</small><small>${owned.level ? owned.level + '阶' : free ? '可免费解锁' : '未收集'}</small></button>`;
      })
      .join('')}</div>${filters(filter, 'tome')}
    <button class="primary-button tome-start" data-action="start" ${!chosen ? 'disabled' : ''}>确认典籍 · 进入地牢</button></section>`;
}

export function libraryView(meta: Meta, filter: TomeFilter) {
  const books = visibleTomes(filter);
  let shelves = '';
  for (let row = 0; row < 3; row++) {
    shelves += `<div class="library-shelf">${books
      .slice(row * 3, row * 3 + 3)
      .map((b) => {
        const owned = meta.tomes[b.id];
        return `<button class="library-book ${!owned.level ? 'locked' : ''}" data-inspect-tome="${b.id}" aria-label="查看${b.name}详情">${tomeArt(b.id)}<strong>${b.name}</strong><small>${PROFESSIONS[b.profession].name} · ${b.series}</small><small>${owned.level ? owned.level + '阶 · 残页 ' + owned.pages : '未收集'}</small></button>`;
      })
      .join('')}</div>`;
  }
  return `${header('公会典籍', 'guild', '公会')}<div class="library-meta"><strong>藏书 ${Object.values(meta.tomes).filter((t) => t.level).length} / 9</strong><span>${uiIcon('gold')}金币 ${meta.gold}</span></div>${filters(filter, 'library')}<div class="library-shelves">${shelves}</div><div class="library-note"><h3>公会藏书</h3><p>典籍提供人物增幅与自动回合技能。<br>已收集典籍可在培养时自由选用，不限制职业。</p></div><footer class="feature-footer"><small>收集 · 查看 · 升阶</small><button data-action="guild">返回公会</button></footer>`;
}

export function tomeDetailView(s: GameState, id: string, rank: number) {
  const book = tome(id)!,
    owned = s.meta.tomes[id],
    stage = skill(book, rank),
    cost = upgradeCost(owned.level);
  const available =
    s.phase === 'home' &&
    owned.level > 0 &&
    owned.level < 3 &&
    owned.pages >= cost.pages &&
    s.meta.gold >= cost.gold;
  const status = !owned.level
    ? '未收集 · 获取途径后续开放'
    : owned.level === 3
      ? '已达最高阶'
      : `残页 ${owned.pages} / ${cost.pages} · 金币 ${s.meta.gold} / ${cost.gold}<br>升阶后提高人物增幅与回合技能效果。`;
  return `<section class="tome-detail"><header>${tomeArt(id)}<div><h2>${book.name}</h2><small>${PROFESSIONS[book.profession].name} · ${book.series} · ${owned.level ? owned.level + '阶' : '未收集'}</small></div><button class="detail-close" data-action="close" aria-label="关闭详情">${uiControl('close')}</button></header><div class="tome-ranks" role="group" aria-label="典籍阶位预览">${[1, 2, 3].map((r) => `<button data-tome-rank="${r}" class="rank-${r}" aria-pressed="${rank === r}">${['一阶', '二阶', '三阶'][r - 1]}</button>`).join('')}</div><div class="tome-detail-body"><section><h3>人物属性 · ${rank}阶效果</h3><p>${tomeAttributeText(book, rank)}</p></section><section><h3>自动技能 · ${esc(stage.name)}</h3><p>${decorateStatusText(esc(stage.text))}</p></section></div><div class="tome-detail-status">${status}</div>${s.phase === 'home' ? `<button class="primary-button" data-upgrade-tome="${id}" ${!available ? 'disabled' : ''}>${!owned.level ? '尚未收集' : owned.level === 3 ? '已达最高阶' : `升至${['', '一阶', '二阶', '三阶'][owned.level + 1]} · ${cost.pages}残页 + ${cost.gold}金币`}</button>` : '<button class="primary-button" data-action="close">返回选择</button>'}</section>`;
}

// The three nodes per level alternate direction; progression reads from bottom to top.
export function guildRouteLayout() {
  const positions: { x: number; y: number; level: number }[] = [];
  let cursor = 90;
  for (let level = 1; level <= 30; level++) {
    const nodes = GUILD_NODES.filter((n) => n.level === level),
      xs = level % 2 ? [58, 179, 300] : [300, 179, 58];
    nodes
      .filter((n) => !n.critical)
      .forEach((n, i) => {
        positions[n.id] = { x: xs[i], y: cursor, level };
      });
    cursor += 150;
    const special = nodes.find((n) => n.critical);
    if (special) {
      positions[special.id] = { x: 179, y: cursor - 10, level };
      cursor += 140;
    }
  }
  const height = cursor + 30;
  positions.forEach((p) => {
    p.y = height - p.y;
  });
  return { positions, height };
}
export const GUILD_LAYOUT = guildRouteLayout();
function nodeState(meta: Meta, id: number) {
  const n = GUILD_NODES[id];
  return id < meta.guildPurchased
    ? '已购买'
    : n.level > meta.guildLevel
      ? `需 Lv.${n.level}`
      : id === meta.guildPurchased
        ? '可购买'
        : '前置未完成';
}
export function guildRouteView(meta: Meta, selected: number) {
  const picked = GUILD_NODES[selected],
    bonus = guildBenefits(meta.guildPurchased),
    available =
      selected === meta.guildPurchased &&
      picked.level <= meta.guildLevel &&
      meta.medals >= picked.cost;
  const { positions, height } = GUILD_LAYOUT;
  const paths = positions
    .slice(1)
    .map((b, index) => {
      const a = positions[index];
      const d = `M ${a.x} ${a.y} ${a.y === b.y ? `L ${b.x} ${b.y}` : `L ${a.x} ${(a.y + b.y) / 2} L ${b.x} ${(a.y + b.y) / 2} L ${b.x} ${b.y}`}`;
      return `<path d="${d}" fill="none" stroke="${index + 1 < meta.guildPurchased ? '#c3a568' : '#64746a'}" stroke-width="2"/>`;
    })
    .join('');
  const labels = positions
    .filter((p, i) => GUILD_NODES[i - 1]?.level !== p.level)
    .map((p) => `<span class="guild-level-label" style="top:${p.y - 60}px">Lv.${p.level}</span>`)
    .join('');
  const nodes = GUILD_NODES.map((n) => {
    const p = positions[n.id],
      owned = n.id < meta.guildPurchased,
      locked = n.id > meta.guildPurchased || n.level > meta.guildLevel,
      symbol = n.critical
        ? 'guild-bonus'
        : n.benefit.startsWith('attack')
          ? 'attack'
          : n.benefit.startsWith('hp')
            ? 'hp'
            : 'defense';
    return `<button class="guild-route-node ${owned ? 'purchased' : locked ? 'locked' : 'available'} ${selected === n.id ? 'selected' : ''} ${n.critical ? 'critical' : ''}" data-action="guild-node-${n.id}" aria-pressed="${selected === n.id}" aria-label="Lv.${n.level} ${n.name} ${guildNodeEffect(n)} ${nodeState(meta, n.id)}" style="left:${p.x - 43}px;top:${p.y - 28}px"><span class="guild-node-symbol"><span>${uiIcon(symbol)}${n.benefit.endsWith('Percent') ? '<i>%</i>' : ''}</span>${owned ? '<b class="guild-node-check">✓</b>' : ''}</span><strong>${guildNodeEffect(n)}</strong><small>${nodeState(meta, n.id)}</small></button>`;
  }).join('');
  const label =
    selected < meta.guildPurchased
      ? '已购买'
      : picked.level > meta.guildLevel
        ? '公会等级未开放'
        : selected !== meta.guildPurchased
          ? '需完成前置节点'
          : meta.medals < picked.cost
            ? '勋章不足'
            : `购买增幅 · ${picked.cost}勋章`;
  return `${header('公会增幅', 'guild', '公会')}<div class="guild-route-meta"><strong>公会 Lv.${meta.guildLevel} / 30</strong><span>${uiIcon('medal')}勋章 ${meta.medals}</span></div><div class="guild-route-overview"><p>已购买 ${meta.guildPurchased} / 94 节点<br>攻击 +${bonus.attack} / +${Math.round(bonus.attackPercent * 100)}% · 生命 +${bonus.hp} / +${Math.round(bonus.hpPercent * 100)}%</p><button data-action="guild-total">增幅总览</button></div><div class="guild-route-scroll" tabindex="0" aria-label="单线公会增益路线"><div class="guild-route-content" style="height:${height}px"><svg viewBox="0 0 358 ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${labels}${nodes}</div></div><footer class="guild-route-footer"><button class="primary-button" data-action="guild-buy-${selected}" ${!available ? 'disabled' : ''}>${label}</button></footer>`;
}
