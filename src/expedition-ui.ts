import { foeRig, foeSprite, heroRig } from './pixel';
import { Motion } from './motion';
import { ENEMY_ANCHORS } from './actor-appearance';
import { esc } from './pack-ui';
import { uiControl } from './ui-art';
import { heroHead, enemyHead } from './battle-portraits';
import { statusButton } from './battle-status';
import { combatHud, combatVitals } from './combat-view';
import { expeditionMap, expeditionTeam, expeditionResult, expHeader } from './expedition-views';
import {
  expeditionBattleState,
  expeditionBuildPanel,
  updateExpeditionCooldown,
} from './expedition-combat-view';
import {
  beginExpeditionBattle,
  cancelDispatch,
  claimDispatch,
  claimExpeditionStars,
  expeditionHero,
  expeditionState,
  expeditionRunEnemy,
  finishExpeditionBattle,
  moveExpeditionMember,
  retreatExpedition,
  setExpeditionTeam,
  startDispatch,
  startExpedition,
} from './expedition';
import type { GameState, Profession } from './types';

export class ExpeditionUI {
  private area = 1;
  private node = 0;
  private chapterIndex = 0;
  private mode: 'map' | 'team' | 'dispatch' = 'map';
  private popup: number | null = null;
  private filter: Profession | 'all' = 'all';
  private ascending = false;
  private key = '';
  private nextBeat = 0;
  private lastCursor = -1;
  private actorSlot = -1;
  private speed = 1;
  private motion: Motion;
  constructor(private root: HTMLElement) {
    this.motion = new Motion(root);
  }
  reset() {
    this.key = '';
    this.nextBeat = 0;
    this.lastCursor = -1;
    this.mode = 'map';
    this.popup = null;
  }
  showExploration() {
    this.reset();
    this.mode = 'dispatch';
  }
  get showingExploration() {
    return this.mode === 'dispatch';
  }
  get showNavigation() {
    return (this.mode === 'map' && this.root.dataset.view === 'map') || this.mode === 'dispatch';
  }
  battleState(s: GameState) {
    return expeditionBattleState(s);
  }
  handle(action: string, s: GameState): string | null {
    if (s.phase !== 'home') return '回到公会后再操作';
    const e = expeditionState(s);
    if (action !== 'exp-speed' && action !== 'exp-skip') this.key = '';
    if (action.startsWith('exp-team-') && action !== 'exp-team-open')
      return setExpeditionTeam(s, action.slice(9));
    if (action.startsWith('exp-order-')) {
      const match = action.match(/^exp-order-(\d+)-(up|down)$/);
      return match
        ? moveExpeditionMember(s, +match[1], match[2] === 'up' ? -1 : 1)
        : '无法调整该位置';
    }
    if (action.startsWith('exp-stage-')) {
      const n = Number(action.slice(10));
      if (Number.isInteger(n) && n >= 0 && n < 10) {
        this.node = n;
        this.popup = n;
      }
    }
    if (action === 'exp-detail-close') this.popup = null;
    if (action === 'exp-team-open') {
      this.mode = 'team';
      this.popup = null;
    }
    if (action.startsWith('exp-filter-')) {
      const f = action.slice(11);
      if (['all', 'warrior', 'mage', 'rogue'].includes(f)) this.filter = f as Profession | 'all';
    }
    if (action === 'exp-sort') this.ascending = !this.ascending;
    if (action === 'exp-chapter-prev') this.chapterIndex = 0;
    if (action === 'exp-chapter-next') this.chapterIndex = 1;
    if (action.startsWith('exp-reward-')) return claimExpeditionStars(s, Number(action.slice(11)));
    if (action === 'exp-map' || action === 'exp-result-close') {
      if (e.run) retreatExpedition(s);
      this.mode = 'map';
      this.popup = null;
    }
    if (action === 'exp-next-stage' || action === 'exp-retry') {
      if (!e.run) return '没有可继续的关卡';
      this.node = e.run.node + (action === 'exp-next-stage' ? 1 : 0);
      if (this.node > 9) {
        this.node = 9;
        return '本章已完成';
      }
      retreatExpedition(s);
      this.mode = 'team';
      if (action === 'exp-next-stage') {
        const error = startExpedition(s, 1, this.node);
        if (error) return error;
        this.nextBeat = 0;
        this.lastCursor = -1;
        return beginExpeditionBattle(s);
      }
    }
    if (action === 'exp-start') {
      const error = startExpedition(s, 1, this.node);
      if (error) return error;
      this.nextBeat = 0;
      this.lastCursor = -1;
      return beginExpeditionBattle(s);
    }
    if (action === 'exp-battle') {
      this.nextBeat = 0;
      this.lastCursor = -1;
      return beginExpeditionBattle(s);
    }
    if (action === 'exp-next') return finishExpeditionBattle(s);
    if (action === 'exp-retreat') return retreatExpedition(s);
    if (action.startsWith('exp-area-')) this.area = Number(action.slice(9));
    if (action === 'exp-dispatch') return startDispatch(s, this.area);
    if (action === 'exp-claim') return claimDispatch(s);
    if (action === 'exp-cancel-dispatch') return cancelDispatch(s);
    if (action === 'exp-skip' && e.run?.report) {
      e.run.report.cursor = e.run.report.frames.length - 1;
      s.revision++;
    }
    if (action === 'exp-speed') {
      this.speed = this.speed === 4 ? 1 : this.speed * 2;
      this.motion.sync(this.speed);
      this.nextBeat = Date.now() + 430 / this.speed;
      const label = this.root.querySelector('[data-action="exp-speed"]');
      if (label) label.textContent = `${this.speed}×`;
    }
    return null;
  }
  render(s: GameState) {
    const e = expeditionState(s),
      run = e.run;
    if (this.mode !== 'dispatch' && run?.outcome === 'battle') {
      this.root.dataset.view = 'battle';
      this.battle(s);
      return;
    }
    const key = JSON.stringify([
      s.revision,
      this.mode,
      this.node,
      this.popup,
      this.chapterIndex,
      this.filter,
      this.ascending,
      e.dispatch ? Math.floor(Date.now() / 1000) : 0,
    ]);
    if (key === this.key) return;
    const scroll = this.root.querySelector('.exp-heroes')?.scrollTop ?? 0;
    const mapScroll = this.root.querySelector('.exp-map-scroll')?.scrollTop;
    this.key = key;
    if (this.mode !== 'dispatch' && run && ['won', 'lost'].includes(run.outcome)) {
      this.root.dataset.view = 'result';
      this.root.innerHTML = expeditionResult(s);
      return;
    }
    if (this.mode !== 'dispatch' && run?.outcome === 'ready') {
      this.root.dataset.view = 'team';
      this.root.innerHTML = `${expHeader('继续远征', 'guild')}<div class="exp-legacy-ready"><h2>第 ${run.node + 1} 场</h2><div class="exp-enemy-preview">${foeRig(expeditionRunEnemy(run))}</div><p>${esc(expeditionRunEnemy(run).name)}</p><button class="primary-button" data-action="exp-battle">开始战斗</button><button data-action="exp-retreat">返回地图</button></div>`;
      return;
    }
    if (this.mode === 'map') {
      this.root.dataset.view = 'map';
      this.root.innerHTML = expeditionMap(s, this.popup, this.chapterIndex);
      const el = this.root.querySelector('.exp-map-scroll');
      const latest = this.root.querySelector<HTMLElement>('.exp-map-node.current');
      if (el)
        el.scrollTop = mapScroll ?? Math.max(0, (latest?.offsetTop ?? 1060) - el.clientHeight / 2);
    } else {
      this.root.dataset.view = this.mode;
      this.root.innerHTML = expeditionTeam(
        s,
        this.node,
        this.filter,
        this.ascending,
        this.mode === 'dispatch',
        this.area,
      );
      const el = this.root.querySelector('.exp-heroes');
      if (el) el.scrollTop = scroll;
    }
  }
  private battle(s: GameState) {
    const run = expeditionState(s).run!,
      report = run.report!,
      enemy = expeditionRunEnemy(run);
    const key = `battle|${run.format}|${run.node}|${run.team.join(',')}`;
    if (this.key !== key) {
      this.key = key;
      this.actorSlot = -1;
      this.lastCursor = -1;
      this.root.innerHTML = `<header class="exp-battle-heading"><button data-action="guild" aria-label="返回公会">${uiControl('back')}</button><strong>${run.format === 'chapter' ? '第一章 · 幽影森林' : '远征'}</strong><div class="exp-battle-route" aria-label="关卡进度">${Array.from({ length: run.format === 'chapter' ? 10 : 3 }, (_, n) => `<i class="${n < run.node ? 'complete' : n === run.node ? 'current' : ''}"></i>`).join('')}</div><small>${run.node + 1}/${run.format === 'chapter' ? 10 : 3} · ${esc(enemy.name)}</small></header><div class="exp-battle in-combat"><div class="fighter-health"><div class="health-side hero-health"><span class="exp-leader-portrait"></span><strong class="exp-hero-name"></strong><span class="exp-hero-hp"></span><div class="bar"><i class="exp-hero-bar"></i></div><div class="exp-hero-status hero-effects"></div></div><div class="health-side enemy-health">${enemyHead(enemy)}<strong>${esc(enemy.name)}</strong><span class="exp-enemy-hp"></span><div class="bar enemy-bar"><i class="exp-enemy-bar"></i></div><div class="exp-enemy-status enemy-effects"></div></div></div><div class="exp-relay-portraits" aria-label="队伍头像">${run.team
        .map((id, n) => {
          const h = expeditionHero(s, id)!;
          return `<button data-hero="${h.id}" data-exp-slot="${n}" aria-label="${esc(h.name)}档案">${heroHead(h.profession, h.appearance, n + 1 + 'P')}</button>`;
        })
        .join(
          '',
        )}</div><div class="battle-scene"><div class="exp-active-hero fighter hero-fighter"></div><div class="exp-active-enemy fighter enemy-fighter">${foeRig(enemy)}</div></div><div class="exp-battle-result turn-order" role="status"></div></div><div class="exp-shared-board"></div><footer class="exp-actions adventure-footer" data-tone="battle"><div class="footer-main"><button class="primary-button" data-action="exp-skip">跳过战斗</button><button class="primary-button" data-action="exp-next" hidden>查看结算</button></div><button class="speed-button" data-action="exp-speed" aria-label="切换播放速度">${uiControl('speed')}<span>${this.speed}×</span></button></footer>`;
    }
    if (this.nextBeat && Date.now() >= this.nextBeat && report.cursor < report.frames.length - 1) {
      report.cursor++;
      s.revision++;
    }
    if (this.lastCursor === report.cursor) return;
    this.nextBeat = Date.now() + 430 / this.speed;
    this.lastCursor = report.cursor;
    const frame = report.frames[report.cursor],
      h = expeditionHero(s, run.team[frame.slot])!,
      view = expeditionBattleState(s)!;
    if (this.actorSlot !== frame.slot) {
      this.root.querySelector('.exp-active-hero')!.innerHTML = heroRig(h.profession, h.appearance);
      this.root.querySelector('.exp-leader-portrait')!.outerHTML = heroHead(
        h.profession,
        h.appearance,
        frame.slot + 1 + 'P',
      ).replace('battle-portrait"', 'battle-portrait exp-leader-portrait"');
      this.root.querySelector('.exp-shared-board')!.innerHTML = expeditionBuildPanel(h, view);
      const panel = this.root.querySelector<HTMLElement>('.exp-battle')!;
      panel.dataset.profession = h.profession;
      this.motion.rig('hero')?.setAttribute('data-motion', 'combat');
      const center = ENEMY_ANCHORS[foeSprite(enemy.species)]?.flight?.imageCenter;
      if (center) this.motion.alignFlight(center);
      this.actorSlot = frame.slot;
    }
    const text = (q: string, t: string) => {
      this.root.querySelector(q)!.textContent = t;
    };
    text('.exp-hero-name', h.name);
    this.root.querySelector('.exp-hero-hp')!.innerHTML = combatVitals(frame.hp, frame.maxHp);
    this.root.querySelector('.exp-enemy-hp')!.innerHTML = combatVitals(frame.enemyHp, enemy.maxHp);
    this.motion.health(this.root.querySelector('.exp-hero-bar')!, frame.hp, frame.maxHp, h.id);
    this.motion.health(
      this.root.querySelector('.exp-enemy-bar')!,
      frame.enemyHp,
      enemy.maxHp,
      String(run.node),
    );
    this.root.querySelector('.combat-hud')!.innerHTML = combatHud(view, h.stats);
    for (const side of ['hero', 'enemy'] as const) {
      const row = this.root.querySelector(`.exp-${side}-status`)!,
        html = statusButton(view, side);
      if (row.innerHTML !== html) {
        const button = row.querySelector('button');
        if (button && html) {
          const next = document.createElement('template');
          next.innerHTML = html;
          button.innerHTML = next.content.firstElementChild!.innerHTML;
        } else row.innerHTML = html;
      }
    }
    this.root.querySelectorAll<HTMLElement>('[data-exp-slot]').forEach((el, n) => {
      el.classList.toggle('active', n === frame.slot);
      el.hidden = n === frame.slot;
    });
    updateExpeditionCooldown(this.root, h, view.combat.runtime!, frame.sourceId);
    if (frame.sourceId) {
      const item = this.root.querySelector(`[data-bound-item="${frame.sourceId}"]`);
      this.motion.pulse(item, 'triggered', 260);
      if (frame.sourceId.startsWith('resonance:'))
        this.motion.pulse(
          this.root.querySelector(`[data-exp-resonance="${frame.sourceId.slice(10)}"]`),
          'resonance-fired',
          650,
        );
      if (frame.sourceId.startsWith('tome:'))
        this.motion.pulse(this.root.querySelector('.combat-hud'), 'tome-fired', 500);
    }
    const name = frame.sourceId
      ? view.combat.runtime!.sources.find((x) => x.id === frame.sourceId)?.name
      : undefined;
    text(
      '.exp-battle-result',
      `第 ${frame.round} 回合 · ${name ? name + '发动' : frame.actor === 'enemy' ? '敌人行动' : '勇者行动'}`,
    );
    this.motion.sync(this.speed);
    if (frame.damage || frame.hurt)
      this.motion.act(
        frame.actor,
        h.profession === 'mage' && frame.actor === 'hero' ? 'arcane' : 'slash',
      );
    if (frame.damage) {
      this.motion.hit('enemy');
      this.motion.number('enemy', 'damage', frame.damage);
    }
    if (frame.hurt) {
      this.motion.hit('hero');
      this.motion.number('hero', 'hurt', frame.hurt);
    }
    if (frame.healed) this.motion.number('hero', 'healing', frame.healed);
    if (frame.enemyHealed) this.motion.number('enemy', 'healing', frame.enemyHealed);
    const done = report.cursor === report.frames.length - 1;
    (this.root.querySelector('[data-action="exp-skip"]') as HTMLElement).hidden = done;
    (this.root.querySelector('[data-action="exp-next"]') as HTMLElement).hidden = !done;
    text('[data-action="exp-speed"] span', `${this.speed}×`);
    if (done) text('.exp-battle-result', report.won ? '魔物已被击败' : '队伍已撤回公会');
  }
}
