import { decorateStatusText } from './status-art';
import {
  BRANCHES,
  cells,
  contributionPoints,
  definition,
  dimensions,
  PACK_COLS,
  PACK_ROWS,
  RESONANCES,
  resonanceScore,
  runBagCapacity,
  runBagCells,
  SHAPE_NAMES,
} from './backpack';
import { QUALITIES } from './data';
import type { Game } from './game';
import { adjacencyDescription, readableEffect, itemProposal, itemStageText } from './item-rules';
import { itemPainting, shapePath } from './scene';
import { itemSkills } from './skills';
import { cooldownView } from './cooldown';
import { itemBadge } from './item-badge';
import { itemTalentText } from './talents';
import type { Motion } from './motion';
import type { Equipment, ResonanceKey } from './types';
import {
  PACK_WIDTH,
  PACK_HEIGHT,
  PACK_CELL,
  PACK_PITCH,
  shapeSize,
  pieceStyle,
  packPoint,
} from './pack-geometry';
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
  white: '#65716d',
  green: '#195e38',
  blue: '#184f80',
  purple: '#623285',
  orange: '#755234',
};
export function itemCard(item: Equipment) {
  return `<span class="card-art quality-${item.quality}" style="--quality-color:${QUALITIES[item.quality].color}">${itemPainting(item)}</span><strong>${esc(item.name)} <small>Lv.${item.level}</small></strong><span class="branch-label" style="color:${BRANCHES[item.branch].color}">${BRANCHES[item.branch].name} · 共鸣 ${contributionPoints(item)} 点 · 属性倍率 ${Math.round(item.potency * 100)}%</span><p>${item.attack ? `攻击 +${item.attack.toFixed(0)} · ` : ''}${item.hp ? `生命 +${item.hp.toFixed(0)} · ` : ''}${item.defense ? `防御 +${item.defense.toFixed(1)} · ` : ''}${shapePreview(item)}</p>`;
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
  private lastItems: Map<string, { level: number; location: string }> | null = null;
  constructor(
    public game: Game,
    private changed: () => void,
    private toast: (s: string) => void,
    private prepareArrange: () => void = () => {},
    private motion?: Motion,
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
    // A compatibility click after a drag must never redeem points or open details.
    this.root.addEventListener(
      'click',
      (e) => {
        if (
          Date.now() < this.suppressUntil &&
          (e.target as Element).closest('[data-pack-item],#point-redeem')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
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
      if (this.recycleTarget(e.clientX, e.clientY)) {
        if (this.game.recycleItem(g.id)) {
          this.selected = null;
          this.toast('已转化 · +1 点');
        } else this.toast('最后一件武器不能转化');
      } else if (point) {
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
    this.lastItems = null;
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
      owned = s.inventory.some((i) => i.id === id),
      placed = s.draft.some((p) => p.id === id),
      a = this.game.packAnalysis(true);
    const proposal = itemProposal(item.templateId);
    const links = a.links.filter((l) => l.source === id || l.target === id);
    const role =
      proposal.adjacency.direction === '给别人'
        ? '增幅相邻物品'
        : proposal.adjacency.direction === '别人给自己'
          ? '相邻物品增强自身'
          : '相邻效果';
    this.details.innerHTML = `<header class="item-description-header" style="--quality-color:${QUALITIES[item.quality].color}"><h2>${esc(item.name)} <small>【${item.level}阶】</small></h2><span>${placed ? '装备中' : owned ? '暂放中' : '起始补给'}</span><button data-pack-action="close" aria-label="关闭装备详情">×</button></header>
    <div class="item-description-overview"><div class="item-description-tags">${itemPainting(item, 0, 'detail')}<strong>${proposal.contributionTags.join(' · ')}</strong><small>共鸣值：${contributionPoints(item)}</small><small>${shapePreview(item)}</small></div><div class="item-description-attributes"><p>人物攻击 <b>+${item.attack}</b></p><p>人物防御 <b>+${item.defense}</b></p><p>人物生命 <b>+${item.hp}</b></p></div></div>
    <section class="item-native-effect"><h3>当前效果</h3>${itemSkills(item.templateId, item.level).some((k) => k.cooldown) ? `<small>首次第 ${itemSkills(item.templateId, item.level).find((k) => k.cooldown)!.initialDelay ?? 1} 回合发动</small>` : ''}<p>${decorateStatusText(esc(readableEffect(itemStageText(item))))}</p><small>天赋增幅：${esc(itemTalentText(item, s.run.trainee?.talents ?? []))}</small></section>
    <section class="item-adjacency-effect"><h3>${role}</h3><p>${esc(adjacencyDescription(item))}</p><small>相邻指物品格子边缘接触，斜角不算。</small>${
      links.length
        ? `<div class="item-active-links"><strong>当前已生效</strong>${links
            .map((l) => {
              const source = this.game.findItem(l.source)!,
                target = this.game.findItem(l.target)!;
              return `<p>${esc(source.name)} → ${esc(target.name)}：${l.label}</p>`;
            })
            .join('')}</div>`
        : '<small class="muted">当前没有相邻增幅生效</small>'
    }</section>
    <section class="item-stage-changes"><h3>升阶效果</h3>${proposal.stageEffects.map((text, n) => `<p class="${item.level === n + 1 ? 'reached' : 'muted'}"><b>【${n + 1}阶】</b>${decorateStatusText(esc(readableEffect(text)))}</p>`).join('')}<details><summary>各阶人物属性</summary>${proposal.attributes.map((v, n) => `<p>${n + 1}阶 · 攻击 +${v.attack} · 生命 +${v.hp} · 防御 +${v.defense}</p>`).join('')}</details></section>
    <small class="item-contribution-note">贡献标签：${proposal.contributionTags.join(' + ')} · ${contributionPoints(item)} 点</small><div class="detail-actions">${owned ? `<button class="danger-button" data-pack-action="discard" ${this.game.editable() ? '' : 'disabled'}>弃用 · +1 点</button>` : ''}</div>`;
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
    return packPoint(
      ((clientX - r.left) / r.width) * PACK_WIDTH,
      ((clientY - r.top) / r.height) * PACK_HEIGHT,
    );
  }
  private inUpper(x: number, y: number) {
    const r = document.getElementById('battle-panel')!.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }
  private recycleTarget(x: number, y: number) {
    // Only the visible footer button accepts recycling; bag cells always win
    // if layout changes ever cause the two rectangles to overlap.
    if (this.point(x, y)) return null;
    const button = document.getElementById('point-redeem');
    if (!button || !this.game.editable()) return null;
    const r = button.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom
      ? button
      : null;
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
    this.root.querySelector('.recycle-target')?.classList.remove('recycle-target');
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
    const scale = r.width / PACK_WIDTH;
    this.floating.style.cssText = `width:${shapeSize(d.w) * scale}px;height:${shapeSize(d.h) * scale}px;left:${clientX - (this.anchor[0] * PACK_PITCH + PACK_CELL / 2) * scale}px;top:${clientY - (this.anchor[1] * PACK_PITCH + PACK_CELL / 2) * scale}px`;
    this.floating.innerHTML = itemPainting(item, this.rotation, 'floating');
    document.body.append(this.floating);
    const recycle = this.recycleTarget(clientX, clientY);
    if (recycle) {
      recycle.classList.add('recycle-target');
      return;
    }
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
    ghost.style.cssText = pieceStyle(p.x, p.y, d.w, d.h);
    ghost.innerHTML = `<svg viewBox="0 0 ${d.w * 100} ${d.h * 100}"><path d="${shapePath(cells(item, this.rotation))}"/></svg><span>${plan.kind === 'swap' ? '互换' : plan.kind === 'eject' ? '移到上方' : plan.kind === 'invalid' ? '无法放置' : '放置'}</span>`;
    this.grid.append(ghost);
  }
  pulse(id: string) {
    const el = this.grid.querySelector(`[data-pack-item="${id}"]`);
    if (el && !el.querySelector('.item-activation-rim')) {
      const rim = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rim.setAttribute('class', 'item-activation-rim');
      rim.setAttribute('d', el.querySelector('.item-outline')!.getAttribute('d')!);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'item-activation-label');
      const cell = cells(this.game.findItem(id)!)[0];
      label.setAttribute('x', String(cell[0] * 100 + 50));
      label.setAttribute('y', String(cell[1] * 100 + 58));
      label.textContent = '发动';
      el.append(rim, label);
    }
    if (!el) return;
    this.motion?.pulse(el, 'triggered', 260);
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
      const open = runBagCells(s),
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
            return `<svg class="pack-piece quality-${item.quality}" data-pack-item="${item.id}" role="button" tabindex="0" aria-label="${esc(item.name)}，等级${item.level}" style="${pieceStyle(p.x, p.y, d.w, d.h)};--item-color:${QUALITIES[item.quality].color};--item-fill:${gradeFill[item.quality]}" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><path class="item-outline" d="${shapePath(points)}"/>${itemPainting(item, p.rotation, 'board')}<path class="item-grade-rim" d="${shapePath(points)}"/>${itemBadge(item)}</svg>`;
          })
          .join('');
      document.getElementById('pack-space')!.textContent = `${a.occupied}/${runBagCapacity(s)} 格`;
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
      this.itemFeedback();
    }
    this.cooldowns();
  }
  private fieldItem(i: Equipment, offer: boolean) {
    const d = dimensions(i, { rotation: 0 }),
      points = cells(i);
    return `<svg class="field-piece field-item quality-${i.quality} ${offer ? 'offer' : ''}" data-pack-item="${i.id}" role="button" tabindex="0" aria-label="${esc(i.name)}，等级${i.level}，${cells(i).length}格" style="width:${shapeSize(d.w)}px;height:${shapeSize(d.h)}px;--shape-w:${d.w};--shape-h:${d.h};--item-color:${QUALITIES[i.quality].color};--item-fill:${gradeFill[i.quality]}" viewBox="0 0 ${d.w * 100} ${d.h * 100}"><title>${esc(i.name)} · Lv.${i.level} · ${BRANCHES[i.branch].name}</title><path class="item-outline" d="${shapePath(points)}"/>${itemPainting(i, 0, 'field')}<path class="item-grade-rim" d="${shapePath(points)}"/>${itemBadge(i)}</svg>`;
  }
  private itemFeedback() {
    const next = new Map<string, { level: number; location: string }>();
    let reveal = 0;
    for (const el of this.root.querySelectorAll<SVGElement>('[data-pack-item]')) {
      const id = el.dataset.packItem!,
        item = this.game.findItem(id);
      if (!item) continue;
      const p = this.game.state.draft.find((p) => p.id === id);
      const location = el.classList.contains('field-piece') ? 'field' : `${p?.x},${p?.y}`;
      next.set(id, { level: item.level, location });
      const previous = this.lastItems?.get(id);
      if (!this.lastItems) continue;
      if (previous && previous.level < item.level)
        this.motion?.pulse(el, 'equipment-merged', 580, false);
      else if (previous && previous.location !== location)
        this.motion?.pulse(el, 'equipment-landed', 280, false);
      else if (!previous && location === 'field') {
        el.style.setProperty('--reveal-order', String(Math.min(2, reveal++)));
        this.motion?.pulse(el, 'equipment-revealed', 460, false);
      }
    }
    this.lastItems = next;
  }
  private cooldowns() {
    const s = this.game.state;
    for (const el of this.grid.querySelectorAll<SVGElement>('[data-pack-item]')) {
      const id = el.dataset.packItem!,
        i = this.game.findItem(id);
      if (!i) continue;
      const runtime = s.combat.runtime,
        skills =
          runtime?.sources.find((source) => source.id === id)?.skills ??
          itemSkills(i.templateId, i.level),
        index = skills.findIndex((skill) => skill.cooldown > 0),
        view =
          runtime && index >= 0
            ? cooldownView(runtime, id, index, skills[index])
            : { remaining: 0, progress: 1 },
        remaining = view.remaining,
        inCombat = s.phase === 'combat';
      let label = el.querySelector<SVGTextElement>('.cooldown-label');
      if (!label) {
        label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'cooldown-label');
        const c = cells(i, s.placements.find((p) => p.id === id)?.rotation ?? 0)[0];
        label.setAttribute('x', String(c[0] * 100 + 12));
        label.setAttribute('y', String(c[1] * 100 + 84));
        el.append(label);
      }
      label.textContent = inCombat && index >= 0 ? (remaining ? `${remaining} 回合` : '就绪') : '';
      let mask = el.querySelector<SVGPathElement>('.item-cooldown-mask');
      if (!mask) {
        const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clip.id = `cooldown-clip-${id}`;
        clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
        clip.append(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.append(clip);
        el.prepend(defs);
        mask = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mask.setAttribute('class', 'item-cooldown-mask');
        mask.setAttribute('clip-path', `url(#${clip.id})`);
        mask.setAttribute(
          'd',
          shapePath(cells(i, s.placements.find((p) => p.id === id)?.rotation ?? 0)),
        );
        // Grade rim, badges and the timer are above the silhouette-shaped mask.
        el.querySelector('.item-grade-rim')!.before(mask);
      }
      const size = dimensions(i, { rotation: 0 }),
        progress = inCombat && index >= 0 ? view.progress : 1,
        rect = el.querySelector('clipPath rect')!;
      rect.setAttribute('x', '0');
      rect.setAttribute('y', String(progress * size.h * 100));
      rect.setAttribute('width', String(size.w * 100));
      rect.setAttribute('height', String((1 - progress) * size.h * 100));
      mask.style.opacity = inCombat && index >= 0 ? '0.78' : '0';
      el.dataset.cooldownProgress = String(progress);
      el.dataset.cooldown = inCombat ? String(remaining) : '';
    }
  }
}
function resonanceMatch(k: ResonanceKey, i: Equipment) {
  return RESONANCES[k].matches(i);
}
