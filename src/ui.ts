import { archiveDetails, archiveOutcome, type ArchiveTab } from './archive-ui';
import { icon, professionIcon } from './art';
import {
  BUFFS,
  cells,
  contributionPoints,
  definition,
  dimensions,
  finalAttributes,
  PROFESSION_KEYS,
  PROFESSIONS,
  RESONANCES,
  resonanceScore,
} from './backpack';
import { COUNTERS, enrageMultiplier } from './combat';
import { QUALITIES } from './data';
import { ENEMY_TEMPLATES } from './enemies';
import {
  createState,
  ENERGY_CAP,
  EVENT_NAMES,
  Game,
  RECRUIT_COST,
  safelyGraduated,
  TARGET_RECRUIT_COST,
} from './game';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_POINTS,
  ATTRIBUTES,
  heroAttributes,
  pointsSpent,
  TALENTS,
} from './hero';
import { itemStageText, readableEffect } from './item-rules';
import { eventStory, runRoute, STAGES, trialGain, TRIALS } from './journey';
import { esc, PackUI } from './pack-ui';
import { actorMotion, foeArt, pixel } from './pixel';
import { journeyGroups } from './presentation';
import {
  currentHero,
  guildConditions,
  guildMultiplier,
  realmName,
  tome,
  TOMES,
  upgradeCost,
} from './progression';
import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import { cleanLegacyData, parseSave, SAVE_KEY, saveGame } from './save';
import { heroArt, itemPainting, shapePath } from './scene';
import type {
  Attribute,
  GameState,
  HeroRecord,
  Profession,
  ResonanceKey,
  TrialTier,
} from './types';
export class UI {
  private homeView: 'guild' | 'roster' = 'guild';
  private rosterFilter: Profession | 'all' = 'all';
  private rosterAscending = false;
  private rosterPage = 0;
  private archiveHero: HeroRecord | null = null;
  private archiveTab: ArchiveTab = 'profile';
  private pageOwner: string | null = null;
  private tomeFilter: Profession | 'all' = 'all';
  private wheel: {
    sector: number;
    result: string;
    started: number;
    node: number;
    angle: number;
    ready: boolean;
  } | null = null;
  private root: HTMLElement;
  private pack: PackUI;
  private profession: Profession = 'warrior';
  private recruitMode: 'random' | 'targeted' = 'random';
  private phase = '';
  private keys: Record<string, string> = {};
  private toastTimer = 0;
  private showPack = true;
  private journeyVisible = false;
  private lastFeedback = 0;
  private journeyFollow = true;
  private journeyScroll = 0;
  private journeyRendered: string[] = [];
  private resonanceTiers: Record<string, number> = {};
  constructor(
    public game: Game,
    private replaceState: (s: GameState) => void,
  ) {
    this.profession = game.state.run.profession;
    this.root = document.getElementById('app')!;
    this.root.innerHTML = `<main class="app-shell"><section id="home-screen" class="guild-home"><div class="guild-scene guild-art" aria-hidden="true"></div><div class="guild-title"><h1>冒险公会</h1><small>灰石之门</small></div><button class="home-settings" data-action="settings">设置</button><div id="guild-wallet"></div><p class="home-chapter" id="home-chapter"></p><div class="guild-progress-controls"><button data-action="guild-level" id="guild-level-button">公会 Lv.1</button><button data-action="library">典籍</button></div><button class="primary-button guild-expedition" data-action="chapters">地牢探险</button></section><section id="roster-screen" hidden><header><h1>冒险者</h1></header><div class="roster-toolbar"><small id="guild-count"></small><button data-action="roster-sort" id="roster-sort">战力 ↓</button></div><div id="guild-roster"></div><div class="roster-pagination"><button data-action="roster-prev" aria-label="上一页">‹</button><small id="roster-page"></small><button data-action="roster-next" aria-label="下一页">›</button></div><div class="roster-filters">${(['all', ...PROFESSION_KEYS] as const).map((k) => `<button data-roster-filter="${k}">${k === 'all' ? '全部' : PROFESSIONS[k].name}</button>`).join('')}</div></section><nav id="guild-nav" class="guild-nav" aria-label="公会导航"><button data-action="roster">${heroArt('warrior')}<strong>冒险者</strong></button><button data-action="guild"><span class="guild-nav-icon" aria-hidden="true"></span><strong>冒险公会</strong></button></nav><section id="selection-screen" class="selection-screen"></section><section id="adventure-screen" class="adventure-screen"><header class="adventure-header"><div><small id="chapter-label"></small><strong id="event-label"></strong></div><div class="header-actions"><span id="hero-power"></span><button data-action="settings" aria-label="存档设置">⚙</button></div></header><div id="stage-route" class="stage-route"></div><section id="battle-panel" class="battle-panel"></section><div id="shared-board" class="shared-board"><div id="combat-hud" class="combat-hud"></div><div id="resonance-strip" class="resonance-strip"></div><div id="resonance-info" class="resonance-info" hidden></div><section id="view-pack"></section><section id="journey-panel" class="journey-panel" hidden><div class="journey-heading"><strong>探险历程</strong><span id="journey-status"></span></div><div id="journey-history" class="journey-history" role="log" aria-label="探险经过与结果"></div></section></div><div id="adventure-footer" class="adventure-footer"></div></section><section id="summary-screen" class="summary-screen"></section></main><dialog id="decision-sheet" class="event-dialog" aria-labelledby="decision-title"><div id="decision"></div></dialog><dialog id="modal"><div id="modal-body"></div><button data-action="close" class="secondary-button modal-close">关闭</button></dialog><div id="toast" role="status"></div>`;
    document
      .getElementById('decision-sheet')!
      .addEventListener('cancel', (e) => e.preventDefault());
    document.getElementById('journey-history')!.addEventListener('scroll', () => {
      const el = document.getElementById('journey-history')!;
      if (
        !this.showPack &&
        !document.getElementById('journey-panel')!.hidden &&
        el.clientHeight > 0
      ) {
        this.journeyScroll = el.scrollTop;
        this.journeyFollow = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      }
    });
    this.fit();
    window.addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    this.pack = new PackUI(
      game,
      () => {
        this.render();
        this.persist();
      },
      (s) => this.toast(s),
      () => {
        if (!this.showPack) {
          this.game.state.run.autoExplore = false;
          this.showPack = true;
          this.render();
        }
      },
    );
    this.root.parentElement!.addEventListener('keydown', (e) => {
      const item = (e.target as Element).closest('[data-bound-item]');
      if (item && ['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      }
    });
    this.root.parentElement!.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLElement>('button,[data-bound-item]');
      if (!button || (button as HTMLButtonElement).disabled) return;
      const d = button.dataset;
      if (this.wheel && (d.action !== 'wheel-confirm' || !this.wheel.ready)) return;
      if (d.inspectTome) {
        const b = tome(d.inspectTome)!;
        this.modal(
          `<h2>${b.name}</h2>${b.skillStages.map((skill, n) => `<section><h3>第 ${n + 1} 阶</h3><p>攻击 +${b.attributes[n].attackPercent}% · 生命 +${b.attributes[n].hpPercent}% · 防御 +${b.attributes[n].defensePercent}%</p><p>${esc(readableEffect(skill))}</p></section>`).join('')}`,
        );
      } else if (d.tome) {
        this.result(this.game.selectTome(d.tome), '');
      } else if (d.tomeFilter) {
        this.tomeFilter = d.tomeFilter as Profession | 'all';
        this.keys.selection = '';
      } else if (d.upgradeTome) {
        this.result(this.game.upgradeTome(d.upgradeTome), '');
        this.library();
      } else if (d.claimPage) {
        this.result(this.game.claimPage(d.owner!, d.claimPage), '');
        this.close();
      } else if (d.boundItem) {
        const h = this.game.state.meta.heroes.find((h) => h.id === d.owner),
          item = h?.loadout?.equipment.find((i) => i.id === d.boundItem),
          el = button.closest('.hero-equipment-section')?.querySelector('[data-bound-detail]');
        if (item && el) {
          el.innerHTML = `<strong>${esc(item.name)} · ${item.level}阶</strong><p>${item.attack ? `攻击 +${item.attack.toFixed(1)} · ` : ''}生命 +${item.hp} · 防御 +${item.defense} · 共鸣 ${contributionPoints(item)} 点</p><p>${esc(readableEffect(itemStageText(item)))}</p>`;
          button
            .closest('.hero-equipment-section')
            ?.querySelectorAll('[data-bound-item]')
            .forEach((n) => n.classList.toggle('selected', n === button));
        }
      } else if (d.rosterFilter) {
        this.rosterFilter = d.rosterFilter as Profession | 'all';
        this.rosterPage = 0;
        this.keys.roster = '';
      } else if (d.archiveTab) {
        this.archiveTab = d.archiveTab as ArchiveTab;
        this.openArchive();
      } else if (d.recruitMode) {
        this.recruitMode = d.recruitMode as 'random' | 'targeted';
        this.keys.selection = '';
      } else if (d.profession) {
        this.profession = d.profession as Profession;
        this.keys.selection = '';
      } else if (d.chapter) this.game.chooseChapter(Number(d.chapter));
      else if (d.attribute)
        this.result(this.game.allocate(d.attribute as Attribute, Number(d.delta)), '属性已分配');
      else if (d.resonance)
        this.result(this.game.chooseResonance(d.resonance as ResonanceKey), '共鸣已获得');
      else if (d.reward !== undefined)
        this.result(this.game.chooseReward(Number(d.reward)), '祝福已获得');
      else if (d.event) {
        if (d.event === 'spin') this.spinWheel();
        else this.result(this.game.chooseEvent(d.event), '事件完成');
      } else if (d.inspectResonance) {
        const k = d.inspectResonance as ResonanceKey;
        this.pack.showResonance(k);
        const r = resonanceScore(this.game.state.inventory, this.game.state.draft, k),
          rd = RESONANCES[k];
        this.modal(
          `<div class="resonance-inspection ${resonanceRankClass(rd.rank)}"><h2>${rd.name} <small>${resonanceRankName(rd.rank)}</small></h2><p>${r.score} 贡献 · ${r.tier} / 3 段</p>${rd.effects.map((effect, n) => `<p class="${r.tier > n ? 'reached' : 'muted'}"><b>${r.thresholds[n]} 点</b> ${esc(effect)}</p>`).join('')}</div>`,
        );
      } else if (d.hero) {
        const h = this.game.state.meta.heroes.find((h) => h.id === d.hero);
        if (h) {
          this.archiveHero = h;
          this.archiveTab = 'profile';
          this.openArchive();
        }
      } else if (d.speed) this.game.state.speed = Number(d.speed) as 1 | 2 | 4;
      else if (d.action) this.action(d.action);
      else return;
      this.render();
      this.persist();
    });
    // Resolve footer touch taps on pointer-up, including taps following a captured backpack drag.
    // Ignore the subsequent native click so a single tap can never advance two nodes.
    let footerTouch: { pointer: number; x: number; y: number; button: HTMLButtonElement } | null =
        null,
      lastTouchButton: HTMLButtonElement | null = null,
      lastTouchTime = 0;
    const footer = document.getElementById('adventure-footer')!;
    footer.addEventListener('pointerdown', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button');
      if (e.pointerType === 'touch' && button && !button.disabled)
        footerTouch = { pointer: e.pointerId, x: e.clientX, y: e.clientY, button };
    });
    footer.addEventListener('pointerup', (e) => {
      const t = footerTouch;
      footerTouch = null;
      if (
        t &&
        t.pointer === e.pointerId &&
        Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8 &&
        t.button.contains(e.target as Node)
      ) {
        lastTouchButton = t.button;
        lastTouchTime = Date.now();
        t.button.click();
      }
    });
    footer.addEventListener('pointercancel', () => {
      footerTouch = null;
    });
    this.root.parentElement!.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLButtonElement>('#adventure-footer button');
        if (e.isTrusted && b && lastTouchButton && Date.now() - lastTouchTime < 650) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    let swipe: { pointer: number; x: number; y: number } | null = null;
    this.root.addEventListener('pointerdown', (e) => {
      if (
        this.game.state.phase !== 'chapter' ||
        e.button !== 0 ||
        !(e.target as Element).closest('[data-chapter-carousel]') ||
        (e.target as Element).closest('button')
      )
        return;
      swipe = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.root.addEventListener('pointermove', (e) => {
      if (
        swipe?.pointer === e.pointerId &&
        Math.abs(e.clientX - swipe.x) > Math.abs(e.clientY - swipe.y) * 1.3 &&
        Math.abs(e.clientX - swipe.x) > 20
      )
        e.preventDefault();
    });
    this.root.addEventListener('pointerup', (e) => {
      if (!swipe || swipe.pointer !== e.pointerId) return;
      const dx = e.clientX - swipe.x,
        dy = e.clientY - swipe.y;
      swipe = null;
      if (
        this.game.state.phase === 'chapter' &&
        Math.abs(dx) >= 45 &&
        Math.abs(dx) > Math.abs(dy) * 1.3
      ) {
        this.game.chooseChapter(this.game.state.run.chapter + (dx < 0 ? 1 : -1));
        this.render();
        this.persist();
      }
    });
    this.root.addEventListener('pointercancel', () => {
      swipe = null;
    });
    this.root.addEventListener('keydown', (e) => {
      if (
        this.game.state.phase === 'chapter' &&
        (e.target as Element).closest('[data-chapter-carousel]') &&
        ['ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        this.game.chooseChapter(this.game.state.run.chapter + (e.key === 'ArrowRight' ? 1 : -1));
        this.render();
        this.persist();
      }
    });
    document.getElementById('modal')!.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.id !== 'import-file') return;
      const file = input.files?.[0];
      if (file)
        void file
          .text()
          .then((raw) => {
            this.replaceState(parseSave(raw));
            this.close();
            this.persist();
            this.toast('存档已导入');
          })
          .catch((err) => this.toast((err as Error).message));
    });
    this.render();
  }
  private changed(key: string, value: string) {
    if (this.keys[key] === value) return false;
    this.keys[key] = value;
    return true;
  }
  private result(error: string | null, _success: string) {
    if (error) this.toast(error);
  }
  private action(action: string) {
    if (action === 'guild-level') {
      this.guildPanel();
      return;
    }
    if (action === 'upgrade-guild') {
      this.result(this.game.upgradeGuild(), '');
      this.guildPanel();
      return;
    }
    if (action === 'library') {
      this.library();
      return;
    }
    if (action === 'pending-pages') {
      const s = this.game.state;
      this.pageReward(s.phase === 'summary' ? s.run.summary?.heroId : undefined);
      return;
    }
    if (action === 'refresh-pages') {
      const r = this.game.state.meta.pendingPages.find((r) => r.heroId === this.pageOwner);
      if (r) this.result(this.game.refreshPages(r.heroId), '');
      this.pageReward(this.pageOwner ?? undefined);
      return;
    }
    if (action === 'inspect-enemy') {
      const e = this.game.state.enemy,
        t = ENEMY_TEMPLATES.find((t) => t.id === e?.templateId);
      if (e && t)
        this.modal(
          `<h2>${t.name} · ${PROFESSIONS[t.profession].name}${e.isBoss ? ' · Boss' : ''}</h2><p>生命 ${e.maxHp} · 攻击 ${e.attack.toFixed(1)} · 防御 ${e.defense.toFixed(1)} · 速度 ${e.speed}</p>${t.skills.map((k) => `<p>${esc(k)}</p>`).join('')}<p>${esc(t.passive)}</p><p>${esc(t.phase)}</p>`,
        );
      return;
    }
    const g = this.game,
      s = g.state;
    if (action === 'chapters') {
      g.enterChapters();
      this.homeView = 'guild';
    }
    if (action === 'home' || action === 'guild') {
      g.backHome();
      this.homeView = 'guild';
    }
    if (action === 'roster') {
      g.backHome();
      this.homeView = 'roster';
    }
    if (action === 'roster-sort') {
      this.rosterAscending = !this.rosterAscending;
      this.keys.roster = '';
    }
    if (action === 'roster-prev') {
      this.rosterPage = Math.max(0, this.rosterPage - 1);
      this.keys.roster = '';
    }
    if (action === 'roster-next') {
      this.rosterPage++;
      this.keys.roster = '';
    }
    if (action === 'wheel-confirm' && this.wheel?.ready) {
      this.wheel = null;
      this.keys.decision = '';
    }
    if (action === 'prev-chapter') g.chooseChapter(s.run.chapter - 1);
    if (action === 'next-chapter') g.chooseChapter(s.run.chapter + 1);
    if (action === 'resume-recruit') g.resumeRecruit();
    if (action === 'recruit')
      this.result(
        g.recruit(this.recruitMode === 'targeted' ? this.profession : undefined),
        '勇者已招募，配置入会档案',
      );
    if (action === 'start') this.result(g.startRun(), '两轮起始物品全部赠送');
    if (action === 'confirm-allocation') this.result(g.confirmAllocation(), '选择典籍');
    if (action === 'back-allocation') g.backToAllocation();
    if (action === 'reset-allocation') g.resetAllocation();
    if (action === 'balance-allocation') g.balanceAllocation();
    if (action === 'finish-awakening') g.finishAwakening();
    if (action === 'hero-details') {
      const h = s.meta.heroes.find((h) => h.id === s.run.summary?.heroId);
      if (h) {
        this.archiveHero = h;
        this.archiveTab = 'equipment';
        this.openArchive();
      }
    }
    if (action === 'combat-tools' && s.phase === 'combat')
      this.modal(
        `<h2 data-combat-controls>战斗控制</h2><button data-action="pause">${s.isRunning ? '暂停战斗' : '继续战斗'}</button><button data-action="step-turn">推进一个行动</button>`,
      );
    if (action === 'claim-starters') this.result(g.claimStarterRound(), '本轮三件物品已全部领取');
    if (action === 'finish-opening') this.result(g.finishOpening(), '选择初始共鸣');
    if (action === 'fast-explore') {
      s.run.autoExplore = true;
      s.skipCombat = true;
      const error = g.continueCamp();
      if (error) s.run.autoExplore = false;
      this.result(error, '快速探险');
    }
    if (action === 'skip-combat') {
      s.skipCombat = !s.skipCombat;
      s.revision++;
    }
    if (action === 'continue-story') {
      this.showPack = false;
      g.continueJourney();
    }
    if (action === 'continue') this.result(g.continueCamp(), '培养继续');
    if (action === 'skip-reward') g.skipReward();
    if (action === 'redeem') this.result(g.redeemEquipment(), '随机装备已放在战场');
    if (action === 'pause' && s.phase === 'combat') s.isRunning = !s.isRunning;
    if (action === 'step-turn' && s.phase === 'combat') {
      s.isRunning = false;
      s.combat.elapsed = 0;
      g.advanceTurn();
    }
    if (action === 'selection') {
      g.returnToSelection();
      this.homeView = 'guild';
    }
    if (action === 'open-pack') this.showPack = true;
    if (action === 'cycle-speed') s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1;
    if (action === 'retreat')
      this.modal(
        '<h2>结束本次培养？</h2><p>勇者保留当前成长并加入公会，未通关评级最高 B。装备将绑定给这名勇者。</p><button class="danger-button" data-action="confirm-retreat">结算勇者并返回</button>',
      );
    if (action === 'confirm-retreat') {
      g.retreat();
      this.close();
    }
    if (action === 'settings') this.settings();
    if (action === 'close') this.close();
    if (action === 'export') {
      this.persist();
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }),
        ),
        a = document.createElement('a');
      a.href = url;
      a.download = '轮回冒险公会-v15.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (action === 'reset')
      this.modal(
        '<h2>清空本地进度？</h2><p>当前培养、勇者名册、体力、金币和地牢解锁都会清空。</p><button class="danger-button" data-action="confirm-reset">确认清空</button>',
      );
    if (action === 'confirm-reset') {
      try {
        localStorage.removeItem(SAVE_KEY);
        cleanLegacyData();
      } catch {}
      this.replaceState(createState());
      this.close();
      this.persist();
      this.toast('已回到新的公会');
    }
  }
  render() {
    this.game.recoverEnergy();
    if (this.wheel && !this.wheel.ready && Date.now() - this.wheel.started >= 3600)
      this.wheel.ready = true;
    const s = this.game.state;
    if (this.phase !== s.phase) {
      const previous = this.phase;
      this.phase = s.phase;
      this.showPack =
        ['opening', 'combat'].includes(s.phase) || (s.phase === 'camp' && previous === 'combat');
    }
    const equipmentVisible =
      s.phase !== 'combat' && (s.run.starterOffers.length > 0 || this.game.looseItems().length > 0);
    if (equipmentVisible && s.phase !== 'awakening') this.showPack = true;
    if (s.phase === 'awakening') this.showPack = false;
    if (s.phase === 'camp' && this.game.currentEvent()?.completed && safelyGraduated(s))
      this.showPack = true;
    const active = [
      'opening',
      'initial',
      'camp',
      'journey',
      'combat',
      'event',
      'awakening',
      'reward',
    ].includes(s.phase);
    document.body.classList.toggle('playing', active);
    this.fit();
    document.getElementById('home-screen')!.hidden =
      s.phase !== 'home' || this.homeView !== 'guild';
    document.getElementById('roster-screen')!.hidden =
      s.phase !== 'home' || this.homeView !== 'roster';
    document.getElementById('guild-nav')!.hidden = !['home', 'chapter'].includes(s.phase);
    document.querySelectorAll<HTMLElement>('#guild-nav button').forEach((b) => {
      const selected = b.dataset.action === (this.homeView === 'roster' ? 'roster' : 'guild');
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    document.getElementById('selection-screen')!.hidden = ![
      'chapter',
      'configure',
      'tome',
    ].includes(s.phase);
    document
      .getElementById('selection-screen')!
      .classList.toggle('dungeon-select', s.phase === 'chapter');
    document
      .getElementById('selection-screen')!
      .classList.toggle('tome-select', s.phase === 'tome');
    document.getElementById('adventure-screen')!.hidden = !active;
    document.getElementById('summary-screen')!.hidden = s.phase !== 'summary';
    document.getElementById('adventure-screen')!.classList.toggle('compact', true);
    document
      .getElementById('adventure-screen')!
      .classList.toggle(
        'resonance-screen',
        s.phase === 'initial' || (s.phase === 'reward' && s.run.rewards[0]?.kind === 'resonance'),
      );
    if (s.phase === 'home') this.home();
    if (['chapter', 'configure', 'tome'].includes(s.phase)) this.selection();
    if (s.phase === 'summary') this.summary();
    if (document.querySelector('[data-combat-controls]')) {
      if (s.phase !== 'combat') {
        this.close();
        document.getElementById('modal-body')!.innerHTML = '';
      } else
        document.querySelector('[data-action="pause"]')!.textContent = s.isRunning
          ? '暂停战斗'
          : '继续战斗';
    }
    if (active) {
      document.getElementById('chapter-label')!.textContent = `第 ${s.run.chapter} 关`;
      document.getElementById('event-label')!.textContent =
        s.phase === 'opening'
          ? `起始补给 ${Math.min(2, s.run.starterRound + 1)}/2`
          : s.phase === 'initial'
            ? '选择初始共鸣'
            : `${s.run.index + 1}/${s.run.events.length} · ${EVENT_NAMES[this.game.currentEvent()!.kind]}${s.run.extreme ? ' · 极限挑战' : ''}`;
      const h = this.game.heroPreview(
        safelyGraduated(s) && this.game.currentEvent()?.completed ? 'win' : 'retreat',
      );
      document.getElementById('hero-power')!.textContent = `战力 ${h?.power ?? 0}`;
      this.battle();
      this.route();
      this.pack.render();
      this.footer();
      this.resonance();
      for (const f of this.game.feedback) {
        if (f.serial <= this.lastFeedback) continue;
        this.lastFeedback = f.serial;
        this.pack.pulse(f.id);
        if (f.kind === 'trigger') {
          this.resonancePulse(f.id);
          continue;
        }
        if (f.kind === 'hurt') {
          this.animateFighter('hero', 'hurt');
        }
        if (['hurt', 'blocked'].includes(f.kind) && s.enemy?.isBoss) this.trialImpact();
        if (f.kind === 'damage') {
          this.projectile(f.id);
          this.animateFighter('enemy', 'hurt');
        }
        const el = document.createElement('span');
        el.className = `combat-number ${f.kind}`;
        el.textContent = `${['damage', 'hurt'].includes(f.kind) ? '-' : f.kind === 'blocked' ? '◇−' : f.kind === 'shield' ? '◇' : '+'}${Math.round(f.amount)}`;
        el.style.left = f.kind === 'damage' ? '75%' : '25%';
        document.getElementById('battle-panel')!.append(el);
        setTimeout(() => el.remove(), 900);
      }
    }
    document.getElementById('view-pack')!.hidden = !active || !this.showPack;
    document.getElementById('journey-panel')!.hidden = !active || this.showPack;
    this.decision();
    this.journey();
    document.getElementById('combat-hud')!.hidden = !active;
  }
  get holdingJourney() {
    return this.game.state.phase === 'journey' && this.showPack;
  }
  private energyText() {
    const e = this.game.state.meta.energy,
      wait = Math.ceil(this.game.energyWait() / 1000);
    return `体力 ${e.value}/${ENERGY_CAP} · ${wait ? `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')} 后 +1` : '已满'}`;
  }
  private home() {
    const s = this.game.state,
      e = s.meta.energy,
      wait = Math.ceil(this.game.energyWait() / 1000);
    document.getElementById('guild-wallet')!.innerHTML =
      `<div><strong>体力 ${e.value} / ${ENERGY_CAP}</strong><small>${wait ? `恢复 ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : '体力已满'}</small></div><strong>金币 ${s.meta.gold}</strong>`;
    document.getElementById('home-chapter')!.textContent = `第 ${s.meta.highestChapter} 关`;
    const pending = s.meta.pendingPages.length;
    if (this.changed('guild-controls', `${s.meta.guildLevel}|${pending}`))
      document.querySelector('.guild-progress-controls')!.innerHTML =
        `<button data-action="guild-level" id="guild-level-button">公会 Lv.${s.meta.guildLevel}</button><button data-action="library">典籍</button>${pending ? `<button data-action="pending-pages">待领残页 ${pending}</button>` : ''}`;
    if (
      !this.changed(
        'roster',
        `${s.revision}|${this.rosterFilter}|${this.rosterAscending}|${this.rosterPage}`,
      )
    )
      return;
    const heroes = s.meta.heroes
        .map((h) => currentHero(h, s.meta.guildLevel))
        .filter((h) => this.rosterFilter === 'all' || h.profession === this.rosterFilter)
        .sort((a, b) => (this.rosterAscending ? a.power - b.power : b.power - a.power)),
      pages = Math.max(1, Math.ceil(heroes.length / 6));
    this.rosterPage = Math.max(0, Math.min(pages - 1, this.rosterPage));
    document.getElementById('guild-count')!.textContent = `${heroes.length} / 500`;
    document.getElementById('guild-roster')!.innerHTML = heroes.length
      ? heroes
          .slice(this.rosterPage * 6, this.rosterPage * 6 + 6)
          .map(
            (h) =>
              `<button class="hero-card rating-${h.rating}" data-hero="${h.id}" aria-label="${esc(h.name)}，${PROFESSIONS[h.profession].name}，${h.rating}级，战力${h.power}"><span class="card-job">${PROFESSIONS[h.profession].name.slice(0, 1)}</span><span class="card-rating">${h.rating}</span><strong class="card-name">${esc(h.name)}</strong>${heroArt(h.profession)}<b class="card-power">${h.power.toLocaleString()}</b></button>`,
          )
          .join('')
      : '<div class="roster-empty">尚无冒险者</div>';
    document.getElementById('roster-sort')!.textContent =
      `战力 ${this.rosterAscending ? '↑' : '↓'}`;
    document.getElementById('roster-page')!.textContent = `${this.rosterPage + 1} / ${pages}`;
    (document.querySelector('[data-action="roster-prev"]') as HTMLButtonElement).disabled =
      this.rosterPage === 0;
    (document.querySelector('[data-action="roster-next"]') as HTMLButtonElement).disabled =
      this.rosterPage === pages - 1;
    document.querySelectorAll<HTMLElement>('[data-roster-filter]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.rosterFilter === this.rosterFilter);
      b.setAttribute('aria-pressed', String(b.dataset.rosterFilter === this.rosterFilter));
    });
  }
  private openArchive() {
    if (!this.archiveHero) return;
    this.modal(
      archiveDetails(
        currentHero(this.archiveHero, this.game.state.meta.guildLevel),
        this.archiveTab,
      ),
    );
    document.getElementById('modal')!.classList.add('archive-modal');
  }
  private selection() {
    const s = this.game.state,
      el = document.getElementById('selection-screen')!;
    if (s.phase === 'tome') {
      this.tomeSelection();
      return;
    }
    if (s.phase === 'chapter') {
      const cost = this.recruitMode === 'random' ? RECRUIT_COST : TARGET_RECRUIT_COST;
      const key = `chapter|${s.run.chapter}|${s.meta.highestChapter}|${s.run.trainee?.id}|${this.recruitMode}|${this.profession}`;
      if (this.changed('selection', key)) {
        const names = ['迷雾古道', '白骨遗迹', '蛛影深林', '失落堡垒', '灰烬高地'];
        el.innerHTML = `<header><button data-action="home">← 公会</button><span>选择地牢</span></header><div class="dungeon-carousel" data-chapter-carousel tabindex="0" role="group" aria-label="关卡选择，可左右滑动"><div class="dungeon-view"><div class="dungeon-pixel-scene" aria-hidden="true"></div><div class="dungeon-caption" aria-live="polite"><h1>第 ${s.run.chapter} 关</h1><h2>${names[(s.run.chapter - 1) % 5]}</h2><p>守门者盘踞的古老遗迹</p><small>${s.run.chapter === s.meta.highestChapter ? '最新解锁地牢' : '可再次挑战'}</small></div></div><button class="chapter-arrow previous" data-action="prev-chapter" aria-label="上一关" ${s.run.chapter === 1 ? 'disabled' : ''}>‹</button><button class="chapter-arrow next" data-action="next-chapter" aria-label="下一关" ${s.run.chapter === s.meta.highestChapter ? 'disabled' : ''}>›</button></div><p class="swipe-hint">已解锁 ${s.meta.highestChapter}/20</p><section class="recruit-panel"><div class="recruit-energy" id="recruit-energy-text"></div>${s.run.trainee ? `<p>${esc(s.run.trainee.name)} · 见习${PROFESSIONS[s.run.trainee.profession].name}</p><button class="primary-button" data-action="resume-recruit">继续配置 →</button>` : `<div class="recruit-tabs" role="group" aria-label="招募方式"><button data-recruit-mode="random" aria-pressed="${this.recruitMode === 'random'}" class="${this.recruitMode === 'random' ? 'selected' : ''}">基础招募<small>随机职业 · 5 体力</small></button><button data-recruit-mode="targeted" aria-pressed="${this.recruitMode === 'targeted'}" class="${this.recruitMode === 'targeted' ? 'selected' : ''}">定向招募<small>指定职业 · 20 体力</small></button></div>${this.recruitMode === 'targeted' ? `<div class="profession-targets">${PROFESSION_KEYS.map((k) => `<button data-profession="${k}" aria-pressed="${k === this.profession}" class="${k === this.profession ? 'selected' : ''}">${heroArt(k)}<strong>${PROFESSIONS[k].name}</strong></button>`).join('')}</div>` : ''}<button class="primary-button" data-action="recruit" id="recruit-button">${this.recruitMode === 'random' ? '招募随机勇者' : `招募${PROFESSIONS[this.profession].name}`} · ${cost} 体力 →</button><small>每 5 分钟恢复 1 点体力</small>`}</section>`;
      }
      document.getElementById('recruit-energy-text')!.textContent = this.energyText();
      const button = document.getElementById('recruit-button') as HTMLButtonElement | null;
      if (button) button.disabled = s.meta.energy.value < cost || s.meta.heroes.length >= 500;
      return;
    }
    const t = s.run.trainee!;
    if (!this.changed('selection', `configure|${s.revision}`)) return;
    const base = heroAttributes(t, t.profession, false),
      allocated = finalAttributes(s),
      remaining = ATTRIBUTE_POINTS - pointsSpent(t),
      p = PROFESSIONS[t.profession];
    el.innerHTML = `<header><button data-action="chapters">← 地牢</button><span>勇者档案</span></header><section class="admission-file"><div class="file-heading"><h1>入会档案</h1><span class="file-stamp">见习</span></div><div class="admission-identity">${heroArt(t.profession)}<div><small>档案 #${t.id.slice(5).padStart(4, '0')} · ${t.recruitment === 'random' ? '基础招募' : '定向招募'}</small><h2>${esc(t.name)} <span>${p.name}</span></h2><p>${p.trait}</p><small>${realmName(t.realmStart ?? 0)} · 第 ${s.run.chapter} 关培养</small></div></div><div class="talent-heading"><strong>起始天赋</strong><small></small></div><div class="talent-grid">${t.talents.map((k) => `<div class="talent-badge talent-${TALENTS[k].attribute}"><strong>${TALENTS[k].name}</strong><small>${TALENTS[k].description}</small></div>`).join('')}</div><div class="allocation-heading"><strong>可分配属性点 <b id="remaining-points">${remaining}</b> / ${ATTRIBUTE_POINTS}</strong><div><button data-action="reset-allocation">重置</button><button data-action="balance-allocation">均衡分配</button></div></div><div class="attribute-rows">${ATTRIBUTE_KEYS.map((k) => `<div class="attribute-row" data-stat-row="${k}"><div class="attribute-name"><strong>${ATTRIBUTES[k].name}</strong><small>每点 +${ATTRIBUTES[k].step}</small></div><div class="attribute-value"><span>${base[k]}</span><i>→</i><b>${+allocated[k].toFixed(1)}</b></div><div class="attribute-controls"><button data-attribute="${k}" data-delta="-1" aria-label="减少${ATTRIBUTES[k].name}加点" ${t.allocation[k] === 0 ? 'disabled' : ''}>−</button><span>${t.allocation[k]}</span><button data-attribute="${k}" data-delta="1" aria-label="增加${ATTRIBUTES[k].name}加点" ${remaining === 0 ? 'disabled' : ''}>＋</button></div></div>`).join('')}</div><p class="allocation-guild">公会属性 +${Math.round((guildMultiplier(s.meta.guildLevel) - 1) * 100)}%</p><button class="primary-button admission-submit" data-action="confirm-allocation" ${remaining ? 'disabled' : ''}>${remaining ? `还有 ${remaining} 点待分配` : '确认加点 · 选择典籍'}</button></section>`;
  }

  private tomeSelection() {
    const s = this.game.state,
      t = s.run.trainee!;
    if (!this.changed('selection', `tome|${s.revision}|${this.tomeFilter}`)) return;
    const selected = t.tomeId ? tome(t.tomeId) : null;
    const free = !s.meta.tomeGifts.includes(t.profession);
    const stats = finalAttributes(s),
      attrs = selected?.attributes[(t.tomeLevel ?? 1) - 1];
    document.getElementById('selection-screen')!.innerHTML =
      `<header><button data-action="back-allocation">← 加点</button><span>选择典籍</span></header>
      <section class="tome-dossier"><div class="tome-hero">${heroArt(t.profession)}<div><h2>${esc(t.name)} · ${PROFESSIONS[t.profession].name}</h2><small>${realmName(t.realmStart ?? 0)}</small><p>攻 ${stats.attack.toFixed(1)} · 生 ${Math.round(stats.hp)} · 防 ${stats.defense.toFixed(1)} · 速 ${stats.speed}</p></div></div>
      <div class="tome-preview"><div class="tome-equipped"><strong>本局典籍</strong><b>${selected ? selected.name : '未装备'}</b><small>${selected ? PROFESSIONS[selected.profession].name + ' · ' + selected.series + ' · Lv.' + t.tomeLevel : '选择下方一本典籍'}</small></div><div class="tome-effects"><strong>典籍效果</strong>${selected && attrs ? `<p>攻击 +${attrs.attackPercent}% · 生命 +${attrs.hpPercent}% · 防御 +${attrs.defensePercent}%</p><p>${esc(readableEffect(selected.skillStages[(t.tomeLevel ?? 1) - 1]))}</p>` : '<p>选择后查看属性与自动技能</p>'}</div></div>
      <p class="tome-source">${selected && selected.profession !== t.profession ? `辅修 · 战利品与重铸有15%概率出现${PROFESSIONS[selected.profession].name}的${selected.series}装备` : free ? '首次培养该职业，可任选一本典籍免费解锁' : '选择已收集的典籍'}</p>
      <div class="tome-catalogue">${TOMES.filter(
        (b) => this.tomeFilter === 'all' || b.profession === this.tomeFilter,
      )
        .map((b) => {
          const o = s.meta.tomes[b.id];
          return `<button data-tome="${b.id}" class="tome-card ${t.tomeId === b.id ? 'selected' : ''}" ${!o.level && !free ? 'disabled' : ''}><span class="tome-book" aria-hidden="true">▤</span><strong>${b.name}</strong><small>${PROFESSIONS[b.profession].name} · ${b.series}</small><small>${o.level ? 'Lv.' + o.level : free ? '可免费解锁' : '未收集'}</small></button>`;
        })
        .join('')}</div>
      <div class="tome-filters">${(['all', ...PROFESSION_KEYS] as const).map((p) => `<button data-tome-filter="${p}" class="${this.tomeFilter === p ? 'selected' : ''}">${p === 'all' ? '全部' : PROFESSIONS[p].name}</button>`).join('')}</div>
      ${selected ? `<button class="tome-page-details" data-inspect-tome="${selected.id}">查看三阶效果</button>` : ''}
      <button class="primary-button tome-start" data-action="start" ${!selected ? 'disabled' : ''}>确认典籍 · 进入地牢</button></section>`;
  }

  private battle() {
    const s = this.game.state,
      e = s.enemy,
      el = document.getElementById('battle-panel')!,
      key = `${s.phase === 'combat' ? 'combat' : 'explore'}|${s.run.profession}|${e?.species}`;
    if (this.changed('battle', key))
      el.innerHTML = `<div class="scene-ground" aria-hidden="true"></div><div class="battle-scene"><div class="trial-altar" aria-hidden="true"></div><div class="fighter hero-fighter">${heroArt(s.run.profession)}${actorMotion(s.run.profession)}<span>${esc(s.run.trainee?.name ?? '勇者')}</span></div><span class="versus">${e ? '⚔' : '✦'}</span><div class="fighter enemy-fighter">${e ? foeArt(e) : '<span class="trail-marker">♜</span>'}<span>${e ? esc(e.name) : s.phase === 'opening' ? '整备行囊' : safelyGraduated(s) && this.game.currentEvent()?.completed ? '培养完成' : '前方的旅程'}</span></div></div><div class="fighter-health"><div><span id="player-hp"></span><div class="bar"><i id="player-bar"></i></div></div><div><span id="enemy-hp"></span><div class="bar enemy-bar"><i id="enemy-bar"></i></div></div></div><div id="hero-effects" class="hero-effects"></div><div id="enemy-effects" class="enemy-effects"></div><div id="turn-order" class="turn-order"></div><div id="field-items" class="field-items"></div>`;
    el.querySelector('.hero-fighter')?.classList.toggle(
      'acting',
      s.phase === 'combat' && s.combat.lastActor === 'hero',
    );
    el.querySelector('.enemy-fighter')?.classList.toggle(
      'acting',
      s.phase === 'combat' && s.combat.lastActor === 'enemy',
    );
    el.classList.toggle(
      'has-offers',
      s.phase !== 'combat' &&
        s.phase !== 'awakening' &&
        (s.run.starterOffers.length > 0 || this.game.looseItems().length > 0),
    );
    el.classList.toggle('in-combat', s.phase === 'combat');
    el.classList.toggle(
      'exploring',
      ['journey', 'camp', 'opening'].includes(s.phase) && !this.wheel,
    );
    el.classList.toggle(
      'waiting',
      ['event', 'initial', 'reward'].includes(s.phase) || !!this.wheel,
    );
    el.classList.toggle('trial-combat', s.phase === 'combat' && !!e?.isBoss);
    el.classList.toggle('awakened', s.phase === 'awakening');
    el.style.setProperty('--explore-duration', `${6 / s.speed}s`);
    el.classList.toggle('shielded', s.player.shield > 0);
    el.dataset.profession = s.run.profession;
    document.getElementById('player-hp')!.innerHTML =
      `${professionIcon(s.run.profession)}<span class="health-value">♥ ${Math.ceil(s.player.hp)}/${Math.ceil(s.player.maxHp)}${s.player.shield ? ` · ◇${Math.ceil(s.player.shield)}` : ''}</span>`;
    document.getElementById('player-bar')!.style.width = `${(s.player.hp / s.player.maxHp) * 100}%`;
    document.getElementById('enemy-hp')!.innerHTML = e
      ? `${professionIcon(e.profession ?? 'warrior')}<span class="health-value">${e.isBoss ? 'BOSS · ' : ''}${Math.ceil(e.hp)}/${e.maxHp}</span>`
      : '';
    document.getElementById('enemy-bar')!.style.width = e ? `${(e.hp / e.maxHp) * 100}%` : '0%';
    const runtime = s.combat.runtime;
    const statusText = (k: string) =>
      (
        ({
          poison: '☠ 毒',
          burn: '♨ 灼烧',
          chill: '❄ 减速',
          break: '破防',
          mark: '标记',
        }) as Record<string, string>
      )[k];
    document.getElementById('hero-effects')!.innerHTML =
      s.phase === 'combat'
        ? `${s.player.shield ? `<span>◇ ${Math.ceil(s.player.shield)}</span>` : ''}${runtime?.hero.statuses.map((x) => `<span>${statusText(x.kind)} ${x.remaining}</span>`).join('') ?? ''}`
        : '';
    document.getElementById('enemy-effects')!.innerHTML = e
      ? `<button data-action="inspect-enemy" class="enemy-inspect">${professionIcon(e.profession ?? 'warrior')} ${COUNTERS[s.run.profession][e.profession ?? 'warrior'] > 1 ? '克制' : COUNTERS[s.run.profession][e.profession ?? 'warrior'] < 1 ? '被克制' : '同职业'}</button>${runtime?.enemy.shield ? `<span>◇ ${Math.ceil(runtime.enemy.shield)}</span>` : ''}${runtime?.enemy.statuses.map((x) => `<span>${statusText(x.kind)} ${x.remaining}</span>`).join('') ?? ''}${runtime?.warning ? `<small>${runtime.warning}</small>` : ''}${
          runtime?.minions
            .filter((m) => m.hp > 0)
            .map(
              (m) =>
                `<span class="minion-status" title="幼蛛 ${Math.ceil(m.hp)}/${Math.ceil(m.maxHp)}"><img src="${pixel('enemy-spider-full')}" alt="幼蛛"><i><b style="width:${(100 * m.hp) / m.maxHp}%"></b></i></span>`,
            )
            .join('') ?? ''
        }${s.combat.round >= 16 ? `<b class="enrage-tag">狂暴 +${Math.round((enrageMultiplier(s.combat.round) - 1) * 100)}%</b>` : ''}`
      : '';
    const order = document.getElementById('turn-order');
    if (order) {
      order.hidden = s.phase !== 'combat';
      order.textContent =
        s.phase === 'combat'
          ? `第 ${s.combat.round} 回合 · ${this.game.nextActor() === 'hero' ? '勇者' : '敌人'}行动`
          : '';
    }
    const p = finalAttributes(s, this.game.editable());
    document.getElementById('combat-hud')!.innerHTML =
      `<img class="hud-portrait" src="${pixel(s.run.profession + '-full')}" alt=""><strong>${esc(s.run.trainee?.name ?? '勇者')} ${professionIcon(s.run.profession)}<small>${realmName(s.run.realm)} · ♥ ${Math.ceil(s.player.hp)}/${Math.ceil(s.player.maxHp)}</small></strong><span>攻 ${Math.round(p.attack)}</span><span>防 ${p.defense.toFixed(0)}</span><span>速 ${this.game.playerSpeed()}</span><small>${s.run.boundTome ? tome(s.run.boundTome.id)!.name + (s.phase === 'combat' ? ' · ' + ((s.combat.runtime?.timers['tome:' + s.run.boundTome.id + ':0'] ?? 0) ? s.combat.runtime?.timers['tome:' + s.run.boundTome.id + ':0'] + '回合' : '就绪') : '') : ''}</small>`;
  }
  private route() {
    const s = this.game.state;
    if (!this.changed('route', s.phase + '|' + s.revision)) return;
    const starting = ['opening', 'initial'].includes(s.phase);
    document.getElementById('stage-route')!.innerHTML = s.run.events
      .map(
        (e, n) =>
          `<span class="route-step ${e.completed ? 'complete' : ''} ${!starting && s.run.index === n ? 'current' : ''} ${['boss', 'elite', 'graduation', 'ending'].includes(e.kind) ? 'milestone' : ''} node-${e.kind} ${n > runRoute(s).graduation ? 'optional' : ''}" data-node="${n + 1}" aria-label="第 ${n + 1} 步 · ${EVENT_NAMES[e.kind]} · ${e.completed ? '已完成' : !starting && s.run.index === n ? '进行中' : '未到达'}" ${!starting && s.run.index === n ? 'aria-current="step"' : ''} title="${n + 1} · ${EVENT_NAMES[e.kind]}">${({ battle: '·', boss: '✦', elite: '✦', rest: '+', dig: '⌑', graduation: '◆', ending: '◆', choice: '?', chance: '?', supply: '□', treasure: '□' } as Record<string, string>)[e.kind] ?? '·'}</span>`,
      )
      .join('');
  }
  private resonance() {
    const s = this.game.state;
    for (const k of s.run.resonances) {
      const r = resonanceScore(s.inventory, this.game.editable() ? s.draft : s.placements, k);
      if (this.resonanceTiers[k] !== undefined && r.tier > this.resonanceTiers[k])
        this.toast(`${RESONANCES[k].name} · ${r.tier}档激活`);
      this.resonanceTiers[k] = r.tier;
    }
    if (!this.changed('resonance', s.phase + '|' + s.revision)) return;
    document.getElementById('resonance-strip')!.innerHTML = Array.from({ length: 4 }, (_, n) => {
      const k = s.run.resonances[n];
      if (!k)
        return `<div class="resonance-slot empty">${icon('spark', 20)}<b>${n ? '待觉醒' : '初始共鸣'}</b><small>${n ? `试炼 ${runRoute(s).trials[n - 1] + 1}` : '启程'}</small></div>`;
      const r = resonanceScore(s.inventory, this.game.editable() ? s.draft : s.placements, k);
      return `<button class="resonance-slot ${resonanceRankClass(RESONANCES[k].rank)} ${r.tier ? 'lit' : ''}" data-inspect-resonance="${k}">${icon(RESONANCES[k].icon, 12)}<b>${RESONANCES[k].name}</b><small>${resonanceRankName(RESONANCES[k].rank)} · ${r.score}/${r.next ?? r.thresholds[2]}</small><span class="resonance-meter"><i style="width:${Math.min(100, (r.score / (r.next ?? r.thresholds[2])) * 100)}%"></i></span><span class="tier-marks">${[1, 2, 3].map((n) => `<i class="${r.tier >= n ? 'on' : ''}"></i>`).join('')}</span></button>`;
    }).join('');
  }
  private footer() {
    const s = this.game.state;
    if (
      !this.changed(
        'footer',
        `${s.phase}|${s.run.index}|${s.run.starterRound}|${this.game.completed()}|${s.speed}|${s.isRunning}|${this.showPack}|${s.skipCombat}|${s.run.autoExplore}|${s.run.points}|${this.game.looseItems().length}`,
      )
    )
      return;
    const tone =
      s.phase === 'combat'
        ? 'battle'
        : s.phase === 'awakening' ||
            s.phase === 'initial' ||
            s.phase === 'reward' ||
            (s.phase === 'opening' && s.run.starterRound === 2)
          ? 'resonance'
          : s.phase === 'camp' && safelyGraduated(s) && this.game.currentEvent()?.completed
            ? 'graduate'
            : s.phase === 'opening' || (s.phase === 'camp' && this.game.looseItems().length > 0)
              ? 'loot'
              : s.phase === 'journey'
                ? 'journey'
                : 'explore';
    document.getElementById('adventure-footer')!.dataset.tone = tone;
    let html = '';
    if (s.phase === 'opening')
      html =
        s.run.starterRound < 2
          ? `<button class="primary-button" data-action="claim-starters">继续补给 ${s.run.starterRound + 1}/2</button>`
          : '<button class="primary-button" data-action="finish-opening">选择初始共鸣 →</button>';
    else if (s.phase === 'camp')
      html = `<button class="primary-button" data-action="continue">${safelyGraduated(s) && this.game.currentEvent()?.completed ? '确认毕业' : this.game.completed() ? '继续探险' : '开始冒险'} →</button>`;
    else if (s.phase === 'journey')
      html = '<button class="primary-button" data-action="continue-story">继续 →</button>';
    else if (s.phase === 'awakening')
      html = '<button class="primary-button" data-action="finish-awakening">选择共鸣 →</button>';
    else if (s.phase === 'combat')
      html = `<button data-action="skip-combat" aria-pressed="${s.skipCombat}">${s.skipCombat ? '快速战斗' : '跳过战斗'}</button><button class="combat-tools" data-action="combat-tools" aria-label="战斗控制">⋯</button>`;
    const utility = this.showPack
      ? `<button id="point-redeem" class="reforge-button" data-action="redeem" aria-label="重铸随机装备，消耗6点，当前${s.run.points}点" ${!this.game.editable() || s.run.points < 6 ? 'disabled' : ''}><span>重铸</span><small id="point-count">${s.run.points}/6</small></button>`
      : '<button class="backpack-button" data-action="open-pack" aria-label="查看背包">背包</button>';
    document.getElementById('adventure-footer')!.innerHTML =
      `${utility}<div class="footer-main">${html}</div><button class="speed-button" data-action="cycle-speed" aria-label="切换播放速度">${s.speed}×</button>`;
  }
  private journey() {
    const s = this.game.state;
    if (
      !['opening', 'initial', 'camp', 'journey', 'combat', 'event', 'awakening', 'reward'].includes(
        s.phase,
      )
    )
      return;
    document.getElementById('journey-status')!.textContent =
      `${Math.min(3, runRoute(s).trials.filter((n) => n < s.run.index).length + 1)} 阶段 · ${this.game.completed()}/${s.run.events.length}`;
    const el = document.getElementById('journey-history')!;
    el.classList.toggle('playing-story', s.phase === 'journey');
    const firstVisible = !this.journeyVisible && !this.showPack;
    this.journeyVisible = !this.showPack;
    if (!this.changed('journey', JSON.stringify(s.run.journey))) {
      if (firstVisible) el.scrollTop = this.journeyFollow ? el.scrollHeight : this.journeyScroll;
      this.awakening();
      return;
    }
    const signatures = s.run.journey.map((l) => JSON.stringify(l));
    const appendOnly =
      el.querySelectorAll('.journey-entry').length === this.journeyRendered.length &&
      this.journeyRendered.length <= signatures.length &&
      this.journeyRendered.every((l, n) => l === signatures[n]);
    if (!appendOnly) {
      el.innerHTML = '';
      this.journeyRendered = [];
    }
    const pending = s.run.journey.slice(this.journeyRendered.length);
    for (const g of journeyGroups(pending)) {
      let group = el.querySelector<HTMLElement>(`[data-journey-node="${g.event}"]`);
      if (!group) {
        group = document.createElement('section');
        group.className = 'journey-group';
        group.dataset.journeyNode = String(g.event);
        group.innerHTML = `<div class="journey-time">${g.event ? `探险 ${String(g.event).padStart(2, '0')}` : '启程'}</div>`;
        el.append(group);
      }
      group.insertAdjacentHTML(
        'beforeend',
        g.entries
          .map(
            (l) =>
              `<article class="journey-entry journey-new journey-${l.kind}"><div class="journey-paper"><strong>${esc(l.title)}</strong><p>${esc(l.text)}</p></div></article>`,
          )
          .join(''),
      );
      group.querySelectorAll('.journey-new').forEach((entry) =>
        entry.addEventListener('animationend', () => entry.classList.remove('journey-new'), {
          once: true,
        }),
      );
    }
    this.journeyRendered = signatures;
    if (!this.showPack) el.scrollTop = this.journeyFollow ? el.scrollHeight : this.journeyScroll;
    this.awakening();
  }
  private awakening() {
    const s = this.game.state,
      board = document.getElementById('shared-board')!;
    let el = document.getElementById('awakening-result');
    if (s.phase !== 'awakening') {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('section');
      el.id = 'awakening-result';
      board.append(el);
    }
    const a = s.awakening!;
    if (el.dataset.stage === String(a.stage)) return;
    el.dataset.stage = String(a.stage);
    el.innerHTML = `<small>${TRIALS[a.tier].name} · 通过</small><h2>境界晋升</h2><div class="realm-promotion" role="status" aria-label="境界晋升"><span>${realmName(s.run.realm - 1)}</span><i aria-hidden="true">→</i><strong>${realmName(s.run.realm)}</strong></div><div class="awakening-gains"><b>攻击 +${+(a.attack * 100).toFixed(1)}%</b><b>生命上限 +${a.hp}</b><b>防御 +${+a.defense.toFixed(2)}</b><b>恢复生命 ${a.healed}</b></div>`;
  }
  private spinWheel() {
    const s = this.game.state;
    if (
      this.wheel ||
      s.phase !== 'event' ||
      this.game.currentEvent()?.kind !== 'chance' ||
      this.game.currentEvent()?.variant !== 0
    )
      return;
    const start = s.run.journey.length,
      error = this.game.chooseEvent('spin');
    if (error) {
      this.toast(error);
      return;
    }
    s.run.autoExplore = false;
    const entry = s.run.journey
      .slice(start)
      .find((l) => l.title === '轮盘馈赠' || l.title === '轮盘反噬')!;
    const sector =
      entry.kind === 'danger'
        ? 3
        : entry.kind === 'rest'
          ? 2
          : entry.text.includes('获得 2 点')
            ? 1
            : 0;
    const centers = [90, 234, 315, 351];
    this.wheel = {
      sector,
      result: entry.text,
      started: Date.now(),
      node: s.run.index,
      angle: 1800 + 360 - centers[sector],
      ready: false,
    };
    this.keys.decision = '';
    this.persist();
  }
  private wheelGraphic(angle = 0) {
    const sizes = [180, 108, 54, 18],
      labels = ['装备', '点数', '治疗', '反噬'],
      colors = ['#a88a53', '#608277', '#7a91aa', '#a46860'];
    let start = -90;
    const segments = sizes
      .map((size, n) => {
        const end = start + size,
          a = (start * Math.PI) / 180,
          b = (end * Math.PI) / 180,
          m = ((start + size / 2) * Math.PI) / 180,
          path = `M150 150L${150 + 132 * Math.cos(a)} ${150 + 132 * Math.sin(a)}A132 132 0 ${size > 180 ? 1 : 0} 1 ${150 + 132 * Math.cos(b)} ${150 + 132 * Math.sin(b)}Z`,
          text = `<text x="${150 + 95 * Math.cos(m)}" y="${154 + 95 * Math.sin(m)}" text-anchor="middle" fill="#f2e2bc" font-size="${size < 30 ? 11 : 14}">${labels[n]}</text>`;
        start = end;
        return `<path d="${path}" fill="${colors[n]}" stroke="#e0c58b" stroke-width="2"/>${text}`;
      })
      .join('');
    return `<svg class="fate-wheel-art" viewBox="0 0 300 300" aria-label="命运轮盘，装备50%，点数30%，治疗15%，反噬5%"><g class="wheel-rotor" style="--wheel-angle:${angle}deg">${segments}</g><circle cx="150" cy="150" r="28" fill="#24373b" stroke="#d7b66d" stroke-width="3"/><text x="150" y="155" text-anchor="middle" font-size="16" fill="#e2c684">命运</text><path d="M139 4H161L150 29Z" fill="#372c1c" stroke="#ead4a4" stroke-width="2"/></svg>`;
  }
  private wheelDecision() {
    const w = this.wheel!;
    const dialog = document.getElementById('decision-sheet') as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
    dialog.classList.add('wheel-dialog');
    if (this.changed('decision', `wheel|${w.started}|${w.ready}`))
      document.getElementById('decision')!.innerHTML =
        `<h2 id="decision-title">命运轮盘</h2>${this.wheelGraphic(w.angle)}<p class="wheel-result" role="status">${w.ready ? esc(w.result) : '转动中…'}</p><button class="primary-button" data-action="wheel-confirm" ${w.ready ? '' : 'disabled'}>${w.ready ? '收下馈赠' : '命运流转'}</button>`;
  }
  private animateFighter(actor: 'hero' | 'enemy', state: string) {
    const el = document.querySelector('.' + actor + '-fighter');
    if (!el) return;
    el.classList.remove(state);
    void el.getBoundingClientRect();
    el.classList.add(state);
    setTimeout(() => el.classList.remove(state), 380);
  }
  private trialImpact() {
    const el = document.createElement('span');
    el.className = 'trial-impact';
    el.setAttribute('aria-hidden', 'true');
    document.querySelector('.hero-fighter')?.append(el);
    setTimeout(() => el.remove(), 500);
  }
  private resonancePulse(id: string) {
    const item = this.game.findItem(id);
    if (!item) return;
    for (const key of this.game.state.run.resonances) {
      if (
        RESONANCES[key].matches(item) &&
        resonanceScore(this.game.state.inventory, this.game.state.placements, key).tier
      ) {
        const el = document.querySelector(`[data-inspect-resonance="${key}"]`);
        if (el) {
          el.classList.remove('resonance-fired');
          void el.getBoundingClientRect();
          el.classList.add('resonance-fired');
        }
      }
    }
  }

  private decision() {
    const s = this.game.state,
      container = document.getElementById('decision-sheet') as HTMLDialogElement,
      el = document.getElementById('decision')!;
    if (this.wheel) {
      this.wheelDecision();
      return;
    }
    container.classList.remove('wheel-dialog');
    const needed = ['event', 'reward', 'initial'].includes(s.phase);
    if (!needed) {
      if (container.open) container.close();
      return;
    }
    if (!container.open) container.showModal();
    if (!this.changed('decision', s.phase + '|' + s.revision)) return;
    let title = '',
      body = '';
    if (['initial', 'reward'].includes(s.phase)) {
      const r = s.run.rewards[0];
      title = r.title;
      body = `<div class="choice-grid">${
        r.kind === 'buff'
          ? r.buffs
              .map(
                (k, n) =>
                  `<button class="reward-card" data-reward="${n}"><strong>${BUFFS[k].name}</strong><p>${BUFFS[k].description}</p></button>`,
              )
              .join('')
          : r.resonances
              .map((k) => {
                const d = RESONANCES[k],
                  score = resonanceScore(s.inventory, s.draft, k);
                return `<button class="resonance-choice ${resonanceRankClass(d.rank)}" data-resonance="${k}">${icon(d.icon, 22)}<strong>${d.name}</strong><small class="resonance-kind">${d.kind === 'profession' ? '职业' : '物品'} · ${d.series} · ${resonanceRankName(d.rank)}</small><div class="resonance-levels">${d.effects.map((effect, n) => `<span class="${score.tier > n ? 'reached' : ''}"><b>${score.thresholds[n]}</b>${esc(effect)}</span>`).join('')}</div><small>${d.requires.length ? '前置：' + d.requires.map((k) => RESONANCES[k].name).join(' / ') : '基础候选'} · 当前 ${score.score} 点</small></button>`;
              })
              .join('')
      }</div>${r.kind === 'buff' ? '<button class="text-button" data-action="skip-reward">离开祭坛</button>' : ''}`;
    }
    if (s.phase === 'event') {
      const e = this.game.currentEvent()!;
      title = EVENT_NAMES[e.kind];
      if (e.kind === 'elite' || e.kind === 'boss')
        body = `<div class="trial-crest">✦</div><p class="trial-subtitle">${STAGES[runRoute(s).trials.indexOf(s.run.index)]} · 晋阶之门</p><div class="choice-grid trial-choices">${TRIALS.map((t, n) => `<button class="trial-choice trial-${n}" data-event="trial-${n}"><strong>${t.name}</strong><p>${t.description}</p><small>敌人生命 ×${t.hp} · 伤害 ×${t.attack}</small><b>${trialGain(s.run.profession, n as TrialTier)} · 恢复生命 ${[25, 35, 45][n]}%</b></button>`).join('')}</div>`;
      if (e.kind === 'treasure' || e.kind === 'supply')
        body = `<button class="primary-button" data-event="${e.kind === 'treasure' ? 'open' : 'take'}">${e.kind === 'treasure' ? '打开宝箱' : '接受补给'}</button>`;
      if (e.kind === 'rest')
        body = `<div class="choice-grid"><button class="reward-card" data-event="heal"><strong>饮下月泉</strong><p>恢复 ${Math.round(Math.min(s.player.maxHp - s.player.hp, s.player.maxHp * 0.35))} 生命</p></button><button class="reward-card" data-event="vigor" ${s.run.buffs.vitality >= 3 ? 'disabled' : ''}><strong>凝聚泉华</strong><p>${BUFFS.vitality.description}</p></button></div>`;
      if (e.kind === 'dig') body = this.digBoard();
      if (e.kind === 'choice')
        body =
          e.variant === 2
            ? `<div class="choice-grid"><button class="reward-card" data-event="heal"><strong>饮用泉水</strong><p>恢复生命上限的30%</p></button><button class="reward-card" data-event="vigor"><strong>锻炼体魄</strong><p>生命上限 +18</p></button></div>`
            : `<div class="choice-grid"><button class="reward-card" data-event="risk" ${s.player.hp <= Math.ceil(s.player.hp * 0.15) ? 'disabled' : ''}><strong>${e.variant === 1 ? '取出遗物' : '解开封印'}</strong><p>消耗15%当前生命，${e.variant === 1 ? '获得三件装备' : e.variant === 3 ? '防御 +2' : e.variant === 4 ? '随机基础属性成长' : '攻击 +8%'}</p></button><button class="reward-card" data-event="skip"><strong>安全离开</strong><p>继续前行</p></button></div>`;
      if (e.kind === 'graduation')
        body = `<div class="choice-grid"><button class="reward-card" data-event="graduate"><strong>完成培养</strong><p>保存当前勇者，成功结业</p></button>${runRoute(s).hasExtreme ? '<button class="reward-card" data-event="extreme"><strong>挑战极限</strong><p>继续迎战更强魔物，成功后额外战力与双倍金币</p></button>' : ''}</div>`;
      if (e.kind === 'mentor')
        body = '<button class="primary-button" data-event="learn">接受传授</button>';
      if (e.kind === 'ending')
        body = '<button class="primary-button" data-event="finish">整理最终行囊 →</button>';
      if (e.kind === 'chance')
        body =
          e.variant === 0
            ? `${this.wheelGraphic()}<p>50% 高阶装备 · 30% 点数 · 15% 治疗 · 5% 反噬</p><div class="event-actions"><button class="primary-button" data-event="spin">转动轮盘</button><button data-event="skip">离开</button></div>`
            : `<div class="event-actions"><button class="danger-button" data-event="sacrifice" ${s.player.hp <= Math.ceil(s.player.maxHp * 0.15) ? 'disabled' : ''}>献祭 ${Math.ceil(s.player.maxHp * 0.15)} 生命</button><button data-event="skip">离开</button></div>`;
    }
    el.innerHTML = `<h2 id="decision-title">${esc(title)}</h2>${s.phase === 'event' ? `<p class="event-narrative">${esc(eventStory(this.game.currentEvent()!.kind, this.game.currentEvent()!.variant, runRoute(s).hasExtreme))}</p>` : ''}${body}`;
  }

  private digBoard() {
    const d = this.game.state.run.dig!;
    return `<div class="dig-status">⛏ ${d.shovels} 次 · 已挖出 ${d.claimed.length}/3</div><div class="dig-board">${Array.from({ length: 16 }, (_, n) => `<button class="dig-cell ${d.revealed.includes(n) ? 'revealed' : ''}" data-event="dig-${n}" aria-label="挖掘第${n + 1}格" ${d.revealed.includes(n) || !d.shovels ? 'disabled' : ''}>${d.revealed.includes(n) ? '' : '✦'}</button>`).join('')}${d.placements
      .map((p) => {
        const item = d.equipment.find((i) => i.id === p.id)!,
          dim = dimensions(item, p),
          revealed = cells(item, p.rotation).filter(([x, y]) =>
            d.revealed.includes((p.y + y) * 4 + p.x + x),
          );
        return `<svg class="dig-piece" viewBox="0 0 ${dim.w * 100} ${dim.h * 100}" style="left:${p.x * 25}%;top:${p.y * 25}%;width:${dim.w * 25}%;height:${dim.h * 25}%;--item-color:${QUALITIES[item.quality].color};--item-fill:${QUALITIES[item.quality].color}44"><defs><clipPath id="dig-${item.id}">${revealed.map(([x, y]) => `<rect x="${x * 100}" y="${y * 100}" width="100" height="100"/>`).join('')}</clipPath></defs><g clip-path="url(#dig-${item.id})"><path class="item-outline" d="${shapePath(cells(item, p.rotation))}"/>${itemPainting(item, p.rotation, 'dig')}</g></svg>`;
      })
      .join(
        '',
      )}</div><button class="primary-button" data-event="dig-finish">${d.shovels && d.claimed.length < 3 ? '结束挖宝' : '收好遗物，继续'}</button>`;
  }
  private summary() {
    const s = this.game.state;
    if (!this.changed('summary', String(s.revision))) return;
    const r = s.run.summary!,
      h = s.meta.heroes.find((h) => h.id === r.heroId)!;
    const resonances = Array.from({ length: 4 }, (_, n) => {
      const k = h.resonances[n];
      if (!k) return '<div class="empty"><b>未觉醒</b><small>—</small></div>';
      const d = RESONANCES[k];
      return `<div class="${resonanceRankClass(d.rank)}" data-summary-resonance="${k}"><b>${esc(d.name)}</b><small>${resonanceRankName(d.rank)}</small><small>${h.resonanceTiers[k] ?? 0}/3 段</small></div>`;
    }).join('');
    document.getElementById('summary-screen')!.innerHTML =
      `<section class="graduation-spotlight"><h1>${r.outcome === 'win' ? '培养完成' : '冒险结束'}</h1><div class="summary-scene">${heroArt(h.profession)}<div class="summary-identity"><h2>${esc(h.name)}</h2>${professionIcon(h.profession)}<div class="summary-realm" aria-label="最终境界"><small>最终境界</small><strong>${realmName(h.realm)}</strong><span>${h.stages} 次试炼晋升</span></div></div></div><div class="summary-score"><strong class="hero-rating rating-${h.rating}" aria-label="战力评级 ${h.rating}">${h.rating}</strong><b class="final-power">最终战力 ${h.power}</b></div><div class="graduate-resonances" aria-label="最终共鸣">${resonances}</div><div class="summary-stats"><span>攻击 <b>${h.stats.attack}</b></span><span>生命 <b>${h.stats.hp}</b></span><span>防御 <b>${h.stats.defense}</b></span><span>速度 <b>${h.stats.speed}</b></span></div><div class="summary-record"><strong>第 ${h.chapter} 关 · ${archiveOutcome(h)}</strong><p>${h.completed}/${s.run.extreme ? h.routeLength : h.normalLength} 步 · ${h.stages}/3 次试炼通过</p><b>${r.outcome === 'win' ? `获得奖励 · 金币 +${r.gold}` : '当前勇者已加入公会'}</b></div><button data-action="hero-details">查看最终装备与档案</button><button class="primary-button" data-action="selection">返回公会</button></section>`;
  }
  private projectile(id: string) {
    const source = document.querySelector(`[data-pack-item="${id}"]`),
      target = document.querySelector('.enemy-fighter');
    if (!source || !target) return;
    const a = source.getBoundingClientRect(),
      b = target.getBoundingClientRect(),
      el = document.createElement('span');
    el.className = 'combat-projectile';
    el.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;--tx:${b.left + b.width / 2 - a.left - a.width / 2}px;--ty:${b.top + b.height / 2 - a.top - a.height / 2}px`;
    document.body.append(el);
    setTimeout(() => el.remove(), 450);
  }
  private fit() {
    const v = window.visualViewport,
      w = v?.width ?? window.innerWidth,
      h = v?.height ?? window.innerHeight,
      scale = Math.min(w / 390, h / 844, 1.15);
    document.documentElement.style.setProperty('--game-scale', String(scale));
    document.documentElement.style.setProperty('--game-width', `${390 * scale}px`);
    document.documentElement.style.setProperty('--game-height', `${844 * scale}px`);
  }
  private guildPanel() {
    const s = this.game.state,
      conditions = guildConditions(s);
    this.modal(
      `<h2>冒险公会 Lv.${s.meta.guildLevel}</h2><p>全体勇者攻击、生命、防御 +${Math.round((guildMultiplier(s.meta.guildLevel) - 1) * 100)}%</p><p>招募起始境界：${realmName(Math.floor((s.meta.guildLevel - 1) / 3) * 3)}</p>${conditions.map((c) => `<p class="${c.value >= c.target ? 'reached' : 'muted'}">${c.value >= c.target ? '✓' : '○'} ${c.label} · ${Math.min(c.value, c.target)}/${c.target}</p>`).join('')}<button data-action="upgrade-guild" class="primary-button" ${!conditions.length || conditions.some((c) => c.value < c.target) ? 'disabled' : ''}>${conditions.length ? '满足全部条件后升级' : '已达最高等级'}</button>`,
    );
  }
  private library() {
    const s = this.game.state;
    this.modal(
      `<h2>公会典籍</h2><p>金币 ${s.meta.gold}</p><div class="library-list">${TOMES.map((t) => {
        const o = s.meta.tomes[t.id],
          cost = upgradeCost(o.level);
        return `<section><h3>${t.name} · ${PROFESSIONS[t.profession].name}</h3><button data-inspect-tome="${t.id}">三阶详情</button><small>${o.level ? o.level + '阶' : '未收集'} · 残页 ${o.pages}</small><p>${esc(readableEffect(t.skillStages[Math.max(0, o.level - 1)]))}</p>${o.level && o.level < 3 ? `<button data-upgrade-tome="${t.id}" ${o.pages < cost.pages || s.meta.gold < cost.gold ? 'disabled' : ''}>升阶 · ${cost.pages} 残页 + ${cost.gold} 金币</button>` : ''}</section>`;
      }).join('')}</div>`,
    );
  }
  private pageReward(owner?: string) {
    const rewards = this.game.state.meta.pendingPages;
    const r = owner ? rewards.find((r) => r.heroId === owner) : rewards[0];
    if (!r) {
      this.close();
      this.toast('没有待领取的残页');
      return;
    }
    this.pageOwner = r.heroId;
    this.modal(
      `<h2>典籍残页 · ${r.choices.length} 选一</h2><div class="choice-grid">${r.choices
        .map((id) => {
          const t = tome(id)!,
            owned = this.game.state.meta.tomes[id];
          return `<button data-claim-page="${id}" data-owner="${r.heroId}"><strong>${t.name}</strong><small>${owned.level ? '残页 +1' : '解锁典籍'}</small><p>${esc(readableEffect(t.skillStages[0]))}</p></button>`;
        })
        .join(
          '',
        )}</div>${r.extreme && !r.refreshed ? '<button data-action="refresh-pages">极限毕业 · 免费刷新一次</button>' : ''}`,
    );
  }
  private settings() {
    this.modal(
      '<h2>设置</h2>' +
        (['opening', 'initial', 'camp', 'journey', 'event', 'reward'].includes(
          this.game.state.phase,
        )
          ? '<button data-action="retreat">结束培养</button>'
          : '') +
        '<div class="toolbar"><button data-action="export">导出存档</button><label class="import-label">导入存档<input id="import-file" type="file" accept=".json"></label><button class="danger-button" data-action="reset">清空公会进度</button></div>',
    );
  }
  private modal(html: string) {
    document.getElementById('modal')!.classList.remove('archive-modal');
    document.getElementById('modal-body')!.innerHTML = html;
    const dialog = document.getElementById('modal') as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
  }
  private close() {
    (document.getElementById('modal') as HTMLDialogElement).close();
    document.getElementById('modal')!.classList.remove('archive-modal');
  }
  toast(message: string) {
    const el = document.getElementById('toast')!;
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
  }
  persist() {
    saveGame(this.game.state);
  }
  replace(game: Game) {
    this.game = game;
    this.pack.replace(game);
    this.wheel = null;
    this.homeView = 'guild';
    this.archiveHero = null;
    this.rosterPage = 0;
    this.profession = game.state.run.profession;
    this.keys = {};
    this.phase = '';
    this.journeyScroll = 0;
    this.journeyRendered = [];
    this.journeyFollow = true;
    this.resonanceTiers = {};
    this.journeyVisible = false;
    this.lastFeedback = 0;
    this.render();
  }
}
