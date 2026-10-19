/** Presentation-only motion. No game timers, stats, saved state or image generation. */
import { COMBAT_PACING } from './combat-pacing';
export type ActorSide = 'hero' | 'enemy';
export type AttackStyle = 'slash' | 'thrust' | 'arcane' | 'bolt' | 'poison';
type ActorEffect = AttackStyle | 'impact' | 'heal' | 'shield' | 'awaken';

export interface ActorAnchors {
  /** Percentages of the rig, independent of source image resolution. */
  center?: [number, number];
  cast?: [number, number];
  scale?: number;
  /** Calibrated visible-body centre in the rendered rig, rather than PNG canvas feet. */
  flight?: { centerY: number; bodyOffset: number; imageCenter?: [number, number] };
}

/** Art, body movement, ground shadow and effects are separate layers. */
export function actorRig(art: string, side: ActorSide, anchors: ActorAnchors = {}, sheet = '') {
  const [cx, cy] = anchors.center ?? [50, 46];
  const [fx, fy] = anchors.cast ?? [side === 'hero' ? 82 : 18, 43];
  return `<div class="actor-rig ${sheet ? 'has-sheet' : ''} ${anchors.flight ? 'actor-flying' : ''}" data-actor="${side}" data-motion="idle" style="--actor-direction:${side === 'hero' ? 1 : -1};--actor-center-x:${cx}%;--actor-center-y:${anchors.flight?.centerY ?? cy}%;--actor-cast-x:${fx}%;--actor-cast-y:${anchors.flight?.centerY ?? fy}%;--actor-scale:${anchors.scale ?? 1};--actor-body-offset:${anchors.flight?.bodyOffset ?? 0}px"><div class="actor-shadow" aria-hidden="true"></div><div class="actor-body"><div class="actor-art">${art}${sheet}</div></div><div class="actor-fx-layer" aria-hidden="true"></div></div>`;
}

export class Motion {
  private speed = 1;
  private classes = new Map<Element, Map<string, ReturnType<typeof setTimeout>>>();
  private transients = new Map<Element, ReturnType<typeof setTimeout>>();
  private healthValues = new WeakMap<HTMLElement, { value: number; context: string }>();
  constructor(private root: HTMLElement) {
    // Capture only adds feedback; the existing handlers own every action and touch deduplication.
    root.parentElement!.addEventListener(
      'click',
      (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (button && !button.disabled) this.pulse(button, 'motion-tapped', 180, false);
      },
      true,
    );
  }
  get reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  sync(speed: number, paused = false) {
    const nextSpeed = Math.max(1, Math.min(4, speed || 1));
    if (this.speed !== nextSpeed) this.reset();
    this.speed = nextSpeed;
    this.root.style.setProperty('--motion-factor', String(1 / this.speed));
    this.root.dataset.motionPaused = String(paused);
    // Remove pending work for DOM that a phase transition has replaced.
    for (const [el, pending] of this.classes)
      if (!el.isConnected) {
        for (const timer of pending.values()) clearTimeout(timer);
        this.classes.delete(el);
      }
    for (const [el, timer] of this.transients)
      if (!el.isConnected) {
        clearTimeout(timer);
        this.transients.delete(el);
      }
  }
  pulse(el: Element | null, name: string, milliseconds = 420, scaled = true) {
    if (!el || this.reduced) return;
    const pending = this.classes.get(el) ?? new Map();
    clearTimeout(pending.get(name));
    el.classList.remove(name);
    // Restart a finite CSS animation, including repeated hits by the same actor.
    void el.getBoundingClientRect();
    el.classList.add(name);
    pending.set(
      name,
      setTimeout(
        () => {
          el.classList.remove(name);
          pending.delete(name);
          if (!pending.size) this.classes.delete(el);
        },
        milliseconds / (scaled ? this.speed : 1),
      ),
    );
    this.classes.set(el, pending);
  }
  private spawn(parent: Element | null, className: string, milliseconds: number, text = '') {
    if (!parent || this.reduced) return null;
    // Bound DOM/effect work when many equipment skills fire in the same turn at 4x.
    if (this.transients.size >= 28) return null;
    const el = document.createElement('span');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = text;
    parent.append(el);
    this.transients.set(
      el,
      setTimeout(() => {
        el.remove();
        this.transients.delete(el);
      }, milliseconds / this.speed),
    );
    return el;
  }
  rig(side: ActorSide) {
    return this.root.querySelector<HTMLElement>(`[data-actor="${side}"]`);
  }
  alignFlight(imageCenter: [number, number]) {
    const hero = this.rig('hero'),
      enemy = this.rig('enemy'),
      img = enemy?.querySelector<HTMLImageElement>('img');
    if (!hero || !enemy?.classList.contains('actor-flying') || !img) return false;
    const h = hero.getBoundingClientRect(),
      e = enemy.getBoundingClientRect(),
      art = img.getBoundingClientRect();
    if (!h.height || !e.height || !art.height || !img.naturalHeight) return false;
    const target =
      h.top + (h.height * parseFloat(hero.style.getPropertyValue('--actor-center-y'))) / 100;
    const paintScale = Math.min(art.width / img.naturalWidth, art.height / img.naturalHeight);
    // object-fit contain / object-position bottom: measure painted pixels, including transparent padding.
    const paintedHeight = img.naturalHeight * paintScale;
    const visibleCenter = art.bottom - paintedHeight + paintedHeight * imageCenter[1];
    const scale = e.height / enemy.offsetHeight;
    const current = parseFloat(enemy.style.getPropertyValue('--actor-body-offset')) || 0;
    enemy.style.setProperty(
      '--actor-body-offset',
      `${current + (target - visibleCenter) / scale}px`,
    );
    const cy = ((target - e.top) / e.height) * 100;
    enemy.style.setProperty('--actor-center-y', `${cy}%`);
    enemy.style.setProperty('--actor-cast-y', `${cy}%`);
    enemy.dataset.flightAligned = 'true';
    return true;
  }
  depart(art: HTMLElement | null, parent: Element | null) {
    if (!art || !parent) return;
    const ghost = this.spawn(parent, 'actor-departure', 320);
    if (!ghost) return;
    const copy = art.cloneNode(true) as HTMLElement;
    copy.classList.remove('acting', 'hurt');
    copy.querySelector('.actor-fx-layer')?.replaceChildren();
    ghost.append(copy);
  }
  act(side: ActorSide, style: AttackStyle) {
    const rig = this.rig(side);
    if (!rig) return;
    rig.dataset.attack = style;
    rig.closest('.fighter')?.classList.remove('hurt');
    this.pulse(rig.closest('.fighter'), 'acting', COMBAT_PACING.movement);
  }
  hit(side: ActorSide, style: AttackStyle = 'slash') {
    this.pulse(this.rig(side)?.closest('.fighter') ?? null, 'hurt', COMBAT_PACING.impact + 100);
    this.effect(side, style);
    this.effect(side, 'impact');
  }
  effect(side: ActorSide, kind: ActorEffect) {
    const rig = this.rig(side);
    if (!rig) return;
    const el = this.spawn(
      rig.querySelector('.actor-fx-layer'),
      `actor-effect effect-${kind}`,
      kind === 'awaken' ? 1300 : COMBAT_PACING.effect,
    );
    if (kind === 'heal' || kind === 'shield') this.pulse(rig, 'motion-' + kind, 440);
    return el;
  }
  number(side: ActorSide, kind: string, amount: number) {
    if (!['damage', 'hurt', 'heal', 'healing'].includes(kind)) return;
    if (kind === 'healing') kind = 'heal';
    const layer = this.rig(side)?.querySelector('.actor-fx-layer');
    const prefix =
      kind === 'damage' || kind === 'hurt'
        ? '−'
        : kind === 'blocked'
          ? '◇−'
          : kind === 'shield'
            ? '◇+'
            : '+';
    // A new hit replaces the previous number of the same kind instead of piling on top.
    const previous = layer?.querySelector(`.combat-number.${kind}`);
    if (previous) {
      clearTimeout(this.transients.get(previous));
      this.transients.delete(previous);
      previous.remove();
    }
    this.spawn(
      layer ?? null,
      `combat-number ${kind}`,
      COMBAT_PACING.number,
      prefix + Math.round(amount),
    );
  }
  projectile(source: Element | null, side: ActorSide, style: AttackStyle) {
    const target = this.rig(side),
      panel = this.root.querySelector('#battle-panel');
    if (!source || !target || !panel || this.reduced) return;
    const a = source.getBoundingClientRect(),
      b = target.getBoundingClientRect(),
      p = panel.getBoundingClientRect();
    // Convert viewport coordinates back into the scaled game canvas; no body-level overlay.
    const scaleX =
      p.width && (panel as HTMLElement).offsetWidth
        ? p.width / (panel as HTMLElement).offsetWidth
        : 1;
    const scaleY =
      p.height && (panel as HTMLElement).offsetHeight
        ? p.height / (panel as HTMLElement).offsetHeight
        : scaleX;
    const el = this.spawn(panel, `combat-projectile projectile-${style}`, 320);
    if (!el) return;
    const sourceRig = source.closest<HTMLElement>('.actor-rig');
    const anchor = (rig: HTMLElement | null, name: string, fallback: number) =>
      rig ? parseFloat(rig.style.getPropertyValue(name)) || fallback : fallback;
    const x = a.left + (a.width * anchor(sourceRig, '--actor-cast-x', 50)) / 100;
    const y = a.top + (a.height * anchor(sourceRig, '--actor-cast-y', 50)) / 100;
    const endX = b.left + (b.width * anchor(target, '--actor-center-x', 50)) / 100;
    const endY = b.top + (b.height * anchor(target, '--actor-center-y', 46)) / 100;
    el.style.cssText = `left:${(x - p.left) / scaleX}px;top:${(y - p.top) / scaleY}px;--tx:${(endX - x) / scaleX}px;--ty:${(endY - y) / scaleY}px;--projectile-angle:${Math.atan2(endY - y, endX - x)}rad`;
  }
  health(bar: HTMLElement, hp: number, max: number, context: string) {
    const value =
      Number.isFinite(hp) && Number.isFinite(max) && max > 0
        ? Math.max(0, Math.min(100, (hp / max) * 100))
        : 0;
    const last = this.healthValues.get(bar);
    let trail = bar.parentElement!.querySelector<HTMLElement>('.health-trail');
    if (!trail) {
      trail = document.createElement('em');
      trail.className = 'health-trail';
      trail.setAttribute('aria-hidden', 'true');
      bar.before(trail);
    }
    if (!last || last.context !== context || this.reduced) {
      bar.style.transition = 'none';
      trail.style.transition = 'none';
      bar.style.width = trail.style.width = value + '%';
      void bar.getBoundingClientRect();
      bar.style.transition = trail.style.transition = '';
    } else if (last.value !== value) {
      bar.style.width = trail.style.width = value + '%';
      this.pulse(bar.parentElement, value < last.value ? 'health-damaged' : 'health-restored', 550);
    }
    this.healthValues.set(bar, { value, context });
  }
  reset() {
    for (const [el, pending] of this.classes)
      for (const [name, timer] of pending) {
        clearTimeout(timer);
        el.classList.remove(name);
      }
    for (const [el, timer] of this.transients) {
      clearTimeout(timer);
      el.remove();
    }
    this.classes.clear();
    this.transients.clear();
    this.healthValues = new WeakMap();
  }
}
