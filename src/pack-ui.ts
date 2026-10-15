import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import {
  PACK_COLS,
  PACK_ROWS,
  openBagCells,
  bagCapacity,
  BRANCHES,
  cells,
  definition,
  dimensions,
  itemStats,
  LEVEL_POWER,
  contributionPoints,
  RESONANCES,
  resonanceScore,
  SHAPE_NAMES,
  PROFESSIONS,
} from './backpack';
import { QUALITIES } from './data';
import { itemPainting, shapePath } from './scene';
import type { Game } from './game';
import type { Equipment, ResonanceKey } from './types';
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function bagCellClass(open: Set<string>, x: number, y: number) {
  if (!open.has(`${x},${y}`)) return 'closed';
  return (
    'open ' +
    (
      [
        [0, -1, 'top'],
        [0, 1, 'bottom'],
        [-1, 0, 'left'],
        [1, 0, 'right'],
      ] as const
    )
      .filter(([dx, dy]) => !open.has(`${x + dx},${y + dy}`))
      .map(([, , side]) => 'edge-' + side)
      .join(' ')
  );
}
export function shapePreview(item: Equipment) {
  return `<span class="shape-name">${SHAPE_NAMES[definition(item).shape]}</span>`;
}
const gradeFill: Record<Equipment['quality'], string> = {
  white: '#414c46',
  green: '#3b6040',
  blue: '#344d6e',
  purple: '#594367',
  orange: '#755234',
};
export function itemCard(item: Equipment) {
  return `<span class="card-art quality-${item.quality}" style="--quality-color:${QUALITIES[item.quality].color}">${itemPainting(item)}</span><strong>${esc(item.name)} <small>Lv.${item.level}</small></strong><span class="branch-label" style="color:${BRANCHES[item.branch].color}">${BRANCHES[item.branch].name} · 共鸣 ${contributionPoints(item)} 点 · 效果倍率 ${Math.round(item.potency * 100)}%</span><p>${item.attack ? `伤害 ${item.attack.toFixed(0)} · ` : ''}${item.hp ? `生命 +${item.hp.toFixed(0)} · ` : ''}${item.defense ? `防御 +${item.defense.toFixed(1)} · ` : ''}${shapePreview(item)}</p>`;
}
type Gesture = { pointer: number; id: string; x: number; y: number; dragging: boolean };
export class PackUI {
  private selected: string | null = null;
  private rotation = 0;
  private anchor: [number, number] = [0, 0];
  private key = '';
  private gesture: Gesture | null = null;
  private suppressUntil = 0;
  private root: HTMLElement;
  private grid: HTMLElement;
  private floating: HTMLElement | null = null;
  private details: HTMLDialogElement;
  private focusResonance: ResonanceKey | null = null;
  private lastOpen: Set<string> | null = null;
  constructor(
    public game: Game,
    private changed: () => void,
    private toast: (s: string) => void,
    private prepareArrange: () => void = () => {},
  ) {
    this.root = document.getElementById('adventure-screen')!;
    document.getElementById('view-pack')!.innerHTML =
      `<section class="workbench"><span id="pack-space" hidden></span><div id="pack-grid" class="pack-grid" aria-label="七列六行背包"></div><div id="pack-hint" class="pack-hint"></div></section>`;
    this.grid = document.getElementById('pack-grid')!;
    this.details = document.createElement('dialog');
    this.details.id = 'equipment-detail';
    this.details.className = 'equipment-detail';
    document.body.append(this.details);
    this.details.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('[data-pack-action]');
      if (button && !button.disabled) this.action(button.dataset.packAction!);
    });
    this.root.addEventListener('click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-pack-item],[data-pack-action]');
      if (!el) return;
      if (el.dataset.packItem && Date.now() < this.suppressUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (el.dataset.packAction) this.action(el.dataset.packAction);
      else this.showDetails(el.dataset.packItem!);
    });
    this.root.addEventListener('keydown', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-pack-item]');
      if (el && ['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        this.showDetails(el.dataset.packItem!);
      }
      if (e.key === 'Escape') {
        this.cancel();
        this.selected = null;
        this.refresh();
      }
    });
    this.root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-pack-item]');
      if (!el || !this.game.editable() || e.button !== 0 || this.gesture) return;
      this.game.state.run.autoExplore = false;
      this.prepareArrange();
      this.select(el.dataset.packItem!);
      const p = this.game.state.draft.find((p) => p.id === this.selected),
        point = this.point(e.clientX, e.clientY);
      this.anchor = this.firstCell(this.game.findItem(this.selected!)!);
      if (!p && el.classList.contains('field-piece') && this.rotation === 0) {
        const rect = el.getBoundingClientRect(),
          item = this.game.findItem(this.selected!)!,
          dim = dimensions(item, { rotation: 0 });
        if (rect.width && rect.height) {
          const cell: [number, number] = [
            Math.floor(((e.clientX - rect.left) / rect.width) * dim.w),
            Math.floor(((e.clientY - rect.top) / rect.height) * dim.h),
          ];
          if (cells(item).some(([x, y]) => x === cell[0] && y === cell[1])) this.anchor = cell;
        }
      }
      if (
        p &&
        p.rotation === this.rotation &&
        point &&
        cells(this.game.findItem(p.id)!, p.rotation).some(
          ([x, y]) => x === point.x - p.x && y === point.y - p.y,
        )
      )
        this.anchor = [point.x - p.x, point.y - p.y];
      this.gesture = {
        pointer: e.pointerId,
        id: this.selected!,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
      };
      try {
        this.root.setPointerCapture(e.pointerId);
      } catch {}
      this.highlight();
    });
    this.root.addEventListener('pointermove', (e) => {
      const g = this.gesture;
      if (!g || g.pointer !== e.pointerId) return;
      if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
      e.preventDefault();
      g.dragging = true;
      this.dragPreview(e.clientX, e.clientY);
    });
    this.root.addEventListener('pointerup', (e) => {
      const g = this.gesture;
      if (!g || g.pointer !== e.pointerId) return;
      this.gesture = null;
      this.suppressUntil = Date.now() + 350;
      this.clearGhost();
      try {
        this.root.releasePointerCapture(e.pointerId);
      } catch {}
      if (!g.dragging) {
        this.showDetails(g.id);
        return;
      }
      const point = this.point(e.clientX, e.clientY);
      if (point) {
        const plan = this.game.previewMove(
            g.id,
            point.x - this.anchor[0],
            point.y - this.anchor[1],
            this.rotation,
            [point.x, point.y],
          ),
          error = this.game.moveItem(
            g.id,
            point.x - this.anchor[0],
            point.y - this.anchor[1],
            this.rotation,
            [point.x, point.y],
          );
        if (error) this.toast(error);
        else if (plan.kind === 'merge') this.toast('合并升级成功');
        if (!error) this.selected = null;
      } else {
        const target = this.upperTarget(e.clientX, e.clientY, g.id);
        if (target) {
          const error = this.game.mergeItems(g.id, target.dataset.packItem!);
          if (error) this.toast(error);
          else {
            this.toast('合并升级成功');
            this.selected = null;
          }
        } else if (this.inUpper(e.clientX, e.clientY) && this.game.moveToUpper(g.id)) {
          this.selected = null;
        }
      }
      this.refresh();
    });
    this.root.addEventListener('pointercancel', () => {
      this.cancel();
      this.refresh();
    });
    this.root.addEventListener('lostpointercapture', () => {
      if (this.gesture) {
        this.cancel();
        this.refresh();
      }
    });
  }
  replace(game: Game) {
    this.cancel();
    this.suppressUntil = 0;
    this.details.close();
    this.game = game;
    this.selected = null;
    this.focusResonance = null;
    this.key = '';
    this.lastOpen = null;
  }
  private refresh() {
    this.key = '';
    this.changed();
  }
  private firstCell(item: Equipment) {
    return cells(item, this.rotation).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  }
  private select(id: string) {
    if (!this.game.findItem(id)) return;
    if (this.selected !== id) {
      this.selected = id;
      this.rotation = this.game.state.draft.find((p) => p.id === id)?.rotation ?? 0;
    }
  }
  private highlight() {
    const s = this.game.state,
      a = this.game.packAnalysis(this.game.editable()),
      linked = new Set(
        a.links
          .filter((l) => l.source === this.selected || l.target === this.selected)
          .flatMap((l) => [l.source, l.target]),
      );
    this.root.querySelectorAll<HTMLElement>('[data-pack-item]').forEach((el) => {
      const id = el.dataset.packItem!,
        i = this.game.findItem(id);
      el.classList.toggle('selected', id === this.selected);
      el.classList.toggle('linked', linked.has(id) && id !== this.selected);
      el.classList.toggle(
        'resonant',
        !!i &&
          !!this.focusResonance &&
          resonanceMatch(this.focusResonance, i) &&
          s.draft.some((p) => p.id === id),
      );
    });
  }
  showResonance(key: ResonanceKey) {
    this.focusResonance = this.focusResonance === key ? null : key;
    this.highlight();
    const r = resonanceScore(this.game.state.inventory, this.game.state.draft, key);
    document.getElementById('pack-hint')!.textContent =
      `${RESONANCES[key].name} · ${r.score} 点 / ${r.tier} 段 · ${RESONANCES[key].description}`;
  }
  private showDetails(id: string) {
    this.select(id);
    const item = this.game.findItem(id);
    if (!item) return;
    this.highlight();
    const s = this.game.state,
      d = definition(item),
      owned = s.inventory.some((i) => i.id === id),
      placed = s.draft.some((p) => p.id === id),
      a = this.game.packAnalysis(true),
      partner = this.game.mergePartner(id),
      keys = s.run.resonances.filter((k) => RESONANCES[k].matches(item));
    const next =
      item.level < 5 ? itemStats(item.templateId, item.level + 1, item.profession) : null;
    this.details.innerHTML = `<header><span class="eyebrow">EQUIPMENT</span><button data-pack-action="close" aria-label="关闭装备详情">×</button></header><div class="detail-title" style="--quality-color:${QUALITIES[item.quality].color}">${itemPainting(item, this.rotation, 'detail')}<div><h2>${esc(item.name)}</h2><strong>${QUALITIES[item.quality].label} · Lv.${item.level}</strong><p>${placed ? '已装备' : owned ? '战场暂放' : s.phase === 'opening' ? '起始赠送' : '待选择'} · ${shapePreview(item)}</p></div></div><div class="detail-category">${PROFESSIONS[item.profession].name} / ${BRANCHES[item.branch].name} / ${d.style === 'melee' ? '近战物理' : d.style === 'ranged' ? '远程物理' : d.style === 'spell' ? '法术攻击' : '防御 / 辅助'}</div><div class="detail-stats"><span>伤害<b>${item.attack.toFixed(1)}</b></span><span>生命<b>+${item.hp.toFixed(0)}</b></span><span>防御<b>+${item.defense.toFixed(1)}</b></span></div><p>${esc(d.description)}</p><div class="detail-meta"><span>共鸣贡献 <b>${contributionPoints(item)} 点</b></span><span>分支效果倍率 <b>${Math.round(item.potency * 100)}%</b></span></div><h3>共鸣效果</h3>${keys.length ? '' : '<p>尚未选择匹配的共鸣。装备基础属性与自身效果照常生效。</p>'}${keys
      .map((k) => {
        const r = resonanceScore(s.inventory, s.draft, k),
          active = s.run.resonances.includes(k);
        return `<p class="detail-effect ${resonanceRankClass(RESONANCES[k].rank)} ${active ? '' : 'muted'}"><b>${RESONANCES[k].name} · ${resonanceRankName(RESONANCES[k].rank)} · ${active ? `${r.tier} 段` : '尚未选择'}</b><small>${RESONANCES[k].description}${active ? '' : '（选择对应共鸣后生效）'}</small></p>`;
      })
      .join('')}<h3>相邻联动</h3>${
      a.links
        .filter((l) => l.source === id || l.target === id)
        .map(
          (l) =>
            `<p>${esc(this.game.findItem(l.source === id ? l.target : l.source)!.name)} · ${l.label}</p>`,
        )
        .join('') || '<p class="muted">暂无联动。无分支物品相邻武器可增加伤害。</p>'
    }<h3>${next ? '合并后预览' : '已达到最高等级'}</h3>${next ? `<p>Lv.${item.level + 1} · 伤害 ${next.attack.toFixed(1)} / 生命 +${next.hp.toFixed(0)} / 防御 +${next.defense.toFixed(1)} · 共鸣 ${cells(item).length * 2 ** item.level} 点</p><small>${partner ? `可拖到 ${esc(partner.name)} Lv.${partner.level} 合并` : '需要另一件同名同级装备，拖动到一起合并'}</small>` : ''}<div class="detail-actions">${owned ? `<button class="danger-button" data-pack-action="discard" ${this.game.editable() ? '' : 'disabled'}>弃用 · +1 点</button>` : ''}</div>`;
    if (!this.details.open) this.details.showModal();
  }
  private action(action: string) {
    if (action === 'close') {
      this.details.close();
      return;
    }
    if (!this.game.editable()) {
      this.toast('战斗中只能查看详情');
      return;
    }
    const item = this.game.findItem(this.selected ?? '');
    if (!item) {
      this.toast('先点击装备查看详情');
      return;
    }
    if (action === 'discard') {
      if (!this.game.recycleItem(item.id)) {
        this.toast('最后一件武器不能弃用');
        return;
      }
      this.details.close();
      this.selected = null;
      this.toast('已弃用 · +1 点');
    }
    this.refresh();
  }
  private point(clientX: number, clientY: number) {
    const r = this.grid.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      clientX < r.left ||
      clientY < r.top ||
      clientX >= r.right ||
      clientY >= r.bottom
    )
      return null;
    return {
      x: Math.floor(((clientX - r.left) / r.width) * PACK_COLS),
      y: Math.floor(((clientY - r.top) / r.height) * PACK_ROWS),
    };
  }
  private inUpper(x: number, y: number) {
    const r = document.getElementById('battle-panel')!.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }
  private upperTarget(x: number, y: number, source: string) {
    for (const el of this.root.querySelectorAll<SVGElement>('#field-items [data-pack-item]')) {
      if (el.dataset.packItem === source) continue;
      const r = el.getBoundingClientRect(),
        item = this.game.findItem(el.dataset.packItem!);
      if (
        !item ||
        !r.width ||
        !r.height ||
        x < r.left ||
        x >= r.right ||
        y < r.top ||
        y >= r.bottom
      )
        continue;
      const d = dimensions(item, { rotation: 0 }),
        cx = Math.floor(((x - r.left) / r.width) * d.w),
        cy = Math.floor(((y - r.top) / r.height) * d.h);
      if (cells(item).some(([a, b]) => a === cx && b === cy)) return el;
    }
    return null;
  }
  private clearGhost() {
    this.floating?.remove();
    this.floating = null;
    this.grid.querySelectorAll('.pack-ghost').forEach((el) => el.remove());
    this.root
      .querySelectorAll('.merge-target')
      .forEach((el) => el.classList.remove('merge-target'));
  }
  private cancel() {
    const g = this.gesture;
    this.gesture = null;
    this.clearGhost();
    this.suppressUntil = Date.now() + 350;
    if (g)
      try {
        this.root.releasePointerCapture(g.pointer);
      } catch {}
  }
  private dragPreview(clientX: number, clientY: number) {
    this.clearGhost();
    const item = this.game.findItem(this.selected ?? '');
    if (!item) return;
    const r = this.grid.getBoundingClientRect(),
      d = dimensions(item, { rotation: this.rotation });
    this.floating = document.createElement('div');
    this.floating.className = 'drag-floating';
    this.floating.style.cssText = `width:${(d.w * r.width) / PACK_COLS}px;height:${(d.h * r.height) / PACK_ROWS}px;left:${clientX - (this.anchor[0] * r.width) / PACK_COLS - r.width / (PACK_COLS * 2)}px;top:${clientY - (this.anchor[1] * r.height) / PACK_ROWS - r.height / (PACK_ROWS * 2)}px`;
    this.floating.innerHTML = itemPainting(item, this.rotation, 'floating');
    document.body.append(this.floating);
    const point = this.point(clientX, clientY);
    if (!point) {
      const target = this.upperTarget(clientX, clientY, item.id);
      if (target && this.game.canMerge(item.id, target.dataset.packItem!))
        target.classList.add('merge-target');
      return;
    }
    const p = {
        id: item.id,
        x: point.x - this.anchor[0],
        y: point.y - this.anchor[1],
        rotation: this.rotation,
      },
      plan = this.game.previewMove(item.id, p.x, p.y, p.rotation, [point.x, point.y]);
    if (plan.kind === 'merge') {
      this.grid.querySelector(`[data-pack-item="${plan.target}"]`)?.classList.add('merge-target');
      return;
    }
    const ghost = document.createElement('div');
    ghost.className = `pack-ghost ${plan.kind === 'invalid' ? 'invalid' : plan.kind}`;
    ghost.style.cssText = `left:${(p.x / 7) * 100}%;top:${(p.y / 6) * 100}%;width:${(d.w / 7) * 100}%;height:${(d.h / 6) * 100}%`;
    ghost.innerHTML = `<svg viewBox="0 0 ${d.w * 100} ${d.h * 100}"><path d="${shapePath(cells(item, this.rotation))}"/></svg><span>${plan.kind === 'swap' ? '互换' : plan.kind === 'eject' ? '移到上方' : plan.kind === 'invalid' ? '无法放置' : '放置'}</span>`;
    this.grid.append(ghost);
  }
  pulse(id: string) {
    const el = this.grid.querySelector(`[data-pack-item="${id}"]`);
    if (!el) return;
    el.classList.remove('triggered');
    void el.getBoundingClientRect();
    el.classList.add('triggered');
  }
  render() {
    if (this.gesture) return;
    const s = this.game.state;
    if (this.selected && !this.game.findItem(this.selected)) this.selected = null;
    const structure = s.phase === 'combat' ? JSON.stringify(s.placements) : s.revision,
      key = `${structure}|${s.phase}|${this.selected}|${this.rotation}`;
    if (key !== this.key) {
      this.key = key;
      const editable = this.game.editable(),
        layout = editable ? s.draft : s.placements,
        a = this.game.packAnalysis(editable);
      const open = openBagCells(s.run.kills),
        newCells = this.lastOpen
          ? new Set([...open].filter((k) => !this.lastOpen!.has(k)))
          : new Set<string>();
      this.lastOpen = open;
      this.grid.innerHTML =
        Array.from(
          { length: 42 },
          (_, i) =>
            `<span class="pack-cell ${bagCellClass(open, i % 7, Math.floor(i / 7))} ${newCells.has(`${i % 7},${Math.floor(i / 7)}`) ? 'just-opened' : ''}" data-pack-cell="${i % 7},${Math.floor(i / 7)}"></span>`,
        ).join('') +
        layout
          .map((p) => {
            const item = this.game.findItem(p.id)!,
              d = dimensions(item, p),
              points = cells(item, p.rotation);
            return `<svg class="pack-piece" data-pack-item="${item.id}" role="button" tabindex="0" aria-label="${esc(item.name)}，等级${item.level}" style="left:${(p.x / 7) * 100}%;top:${(p.y / 6) * 100}%;width:${(d.w / 7) * 100}%;height:${(d.h / 6) * 100}%;--item-color:${QUALITIES[item.quality].color};--item-fill:${gradeFill[item.quality]}" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><path class="item-outline" d="${shapePath(points)}"/>${itemPainting(item, p.rotation, 'board')}<text class="item-level" x="${points[0][0] * 100 + 12}" y="${points[0][1] * 100 + 25}">Lv.${item.level}</text></svg>`;
          })
          .join('');
      document.getElementById('pack-space')!.textContent =
        `${a.occupied}/${bagCapacity(s.run.kills)} 格`;
      document.getElementById('pack-hint')!.textContent = this.selected
        ? `${this.game.findItem(this.selected)!.name} · ${this.rotation * 90}°`
        : '';
      const offers = s.phase === 'opening' ? s.run.starterOffers : [],
        allLoose = this.game.looseItems(),
        field = document.getElementById('field-items')!,
        items = [...offers, ...allLoose];
      field.hidden = s.phase === 'combat';
      field.innerHTML = items.length
        ? `<div class="field-shapes">${items.map((i) => this.fieldItem(i, offers.some((o) => o.id === i.id) || s.run.lastLootIds.includes(i.id))).join('')}</div>`
        : '';
      this.highlight();
    }
    this.cooldowns();
  }
  private fieldItem(i: Equipment, offer: boolean) {
    const d = dimensions(i, { rotation: 0 }),
      points = cells(i);
    return `<svg class="field-piece field-item quality-${i.quality} ${offer ? 'offer' : ''}" data-pack-item="${i.id}" role="button" tabindex="0" aria-label="${esc(i.name)}，等级${i.level}，${cells(i).length}格" style="--shape-w:${d.w};--shape-h:${d.h};--item-color:${QUALITIES[i.quality].color};--item-fill:${gradeFill[i.quality]}" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><title>${esc(i.name)} · Lv.${i.level} · ${BRANCHES[i.branch].name}</title><path class="item-outline" d="${shapePath(points)}"/>${itemPainting(i, 0, 'field')}<text class="item-level" x="${points[0][0] * 100 + 12}" y="${points[0][1] * 100 + 25}">${i.level}</text></svg>`;
  }
  private cooldowns() {
    const s = this.game.state;
    for (const el of this.grid.querySelectorAll<SVGElement>('[data-pack-item]')) {
      const id = el.dataset.packItem!,
        i = this.game.findItem(id);
      if (!i) continue;
      const d = definition(i),
        remaining = Math.max(0, (s.combat.timers[id] ?? 0) - 1),
        inCombat = s.phase === 'combat',
        starved = inCombat && !!d.resource && remaining === 0 && s.combat[d.resource] < d.cost;
      el.classList.toggle('resource-starved', starved);
      let label = el.querySelector<SVGTextElement>('.cooldown-label');
      if (!label) {
        label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'cooldown-label');
        const c = cells(i, s.placements.find((p) => p.id === id)?.rotation ?? 0)[0];
        label.setAttribute('x', String(c[0] * 100 + 12));
        label.setAttribute('y', String(c[1] * 100 + 84));
        el.append(label);
      }
      label.textContent =
        inCombat && d.cooldown
          ? starved
            ? '资源不足'
            : remaining
              ? `${remaining} 回合`
              : '就绪'
          : '';
    }
  }
}
function resonanceMatch(k: ResonanceKey, i: Equipment) {
  return RESONANCES[k].matches(i);
}
