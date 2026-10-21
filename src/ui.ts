import { updateBossView } from './boss-view';
import {
  SUPPLY_SECONDS,
  SPRING_HEAL,
  SPRING_MAX_LIFE,
  WHEEL_SECONDS,
  WHEEL_SECTORS,
  lifeAmount,
  chanceName,
} from './event-rules';
import { itemTalentText } from './talents';
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
  runBagCells,
  validateLayout,
} from './backpack';
import { isEnemySource } from './combat';
import { QUALITIES } from './data';
import { ENEMY_TEMPLATES } from './enemies';
import {
  createState,
  ENERGY_CAP,
  EVENT_NAMES,
  Game,
  RECRUIT_COST,
  safelyGraduated,
  storyDuration,
  TARGET_RECRUIT_COST,
} from './game';
import { TALENTS } from './hero';
import { itemStageText, readableEffect } from './item-rules';
import { eventStory, runRoute, TRIALS } from './journey';
import { esc, PackUI } from './pack-ui';
import { foeRig, heroRig, pixel } from './pixel';
import { journeyGroups } from './presentation';
import { viewportFit } from './viewport-fit';
import { currentHero, guildConditions, realmName, tome } from './progression';
import { CHAPTER_CAP, GUILD_NODES, guildBenefits, startingRealm } from './guild';
import { resonanceRankClass, resonanceRankName } from './resonance-appearance';
import { resonanceCandidates, resonanceDetails, resonancePack } from './resonance-ui';
import { ExpeditionUI } from './expedition-ui';
import { heroHead, enemyHead } from './battle-portraits';
import { combatHud, combatResonances, combatVitals } from './combat-view';
import { cleanLegacyData, parseSave, SAVE_KEY, saveGame } from './save';
import { heroArt, itemPainting, shapePath } from './scene';
import {
  GUILD_LAYOUT,
  guildRouteView,
  libraryView,
  tomeDetailView,
  tomeSelectionView,
} from './guild-ui';
import { uiControl, uiIcon } from './ui-art';
import { Motion, type AttackStyle } from './motion';
import { recyclingFlight } from './recycle-transition';
import { equipmentFamily } from './categories';
import { ENEMY_ANCHORS } from './actor-appearance';
import { configurationView } from './configuration-ui';
import { trialView } from './trial-ui';
import { statusButton, statusDetails, type StatusSide } from './battle-status';
import { visibleAssets } from './resource-plan';
import { missingAssets, preloadAssets } from './loading';
import { registerCharacterParts } from './character-parts';
import { explorationAudio, type ExplorationAudio } from './audio';
import { ExplorationSounds, exploring } from './exploration-sounds';
import type {
  Attribute,
  GameState,
  HeroRecord,
  Profession,
  ResonanceKey,
  TrialTier,
  TalentKey,
} from './types';
export class UI {
  private resourcesBlocked = false;
  private resourceEpoch = 0;
  private resourceTask = false;
  private resourceFailed = false;
  private resourceDialog: HTMLDialogElement | null = null;
  private homeView: 'guild' | 'roster' | 'library' | 'guild-tree' | 'expedition' = 'guild';
  private expedition: ExpeditionUI;
  private rosterFilter: Profession | 'all' = 'all';
  private rosterAscending = false;
  private rosterPage = 0;
  private archiveHero: HeroRecord | null = null;
  private archiveTab: ArchiveTab = 'profile';
  private pageOwner: string | null = null;
  private tomeFilter: Profession | 'all' = 'all';
  private libraryFilter: Profession | 'all' = 'all';
  private inspectedTome: string | null = null;
  private guildSelectedNode = 0;
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
  private motion: Motion;
  private profession: Profession = 'warrior';
  private recruitMode: 'random' | 'targeted' = 'random';
  private phase = '';
  private keys: Record<string, string> = {};
  private toastTimer = 0;
  private showPack = true;
  private journeyVisible = false;
  private lastFeedback = 0;
  private journeyFollow = true;
  private journeyFlow = '';
  private journeyScroll = 0;
  private journeyRendered: string[] = [];
  private journeyQueue: HTMLElement[] = [];
  private journeyNext = 0;
  private journeyActiveUntil = 0;
  private transitionUntil = 0;
  private transitionNode = -1;
  private resultNode = -1;
  private recycling: {
    game: Game;
    action: 'continue' | 'finish-opening';
    until: number;
    credited: boolean;
    cleanup: () => void;
  } | null = null;
  private footerReady = false;
  private reforgeReady = false;
  private digFeedbackCell = -1;
  private digFeedbackUntil = 0;
  private ritualStarted = 0;
  private resonanceTiers: Record<string, number> = {};
  private selectedTrial: TrialTier = 0;
  private trialNode = -1;
  private statusSide: StatusSide | null = null;
  private talentBubble: HTMLElement | null = null;
  private sounds: ExplorationSounds;
  constructor(
    public game: Game,
    private replaceState: (s: GameState) => void,
    private audio: ExplorationAudio = explorationAudio,
  ) {
    this.sounds = new ExplorationSounds(audio);
    this.profession = game.state.run.profession;
    // An old paused save must resume now that pause is no longer a player control.
    if (game.state.phase === 'combat') game.state.isRunning = true;
    this.root = document.getElementById('app')!;
    this.root.innerHTML = `<main class="app-shell"><section id="home-screen" class="guild-home"><div class="guild-scene guild-art" aria-hidden="true"></div><div class="guild-title"><h1>冒险公会</h1><small>灰石之门</small></div><button class="home-settings" data-action="settings">${uiIcon('settings')}设置</button><div id="guild-wallet"></div><p class="home-chapter" id="home-chapter"></p><div class="guild-progress-controls"><button data-action="guild-level" id="guild-level-button">公会 Lv.1</button><button data-action="library">典籍</button></div><button class="primary-button guild-expedition" data-action="chapters">${uiIcon('dungeon')}地牢探险</button></section><section id="roster-screen" hidden><header><h1>冒险者</h1></header><div class="roster-toolbar"><small id="guild-count"></small><button data-action="roster-sort" id="roster-sort">战力 ↓</button></div><div id="guild-roster"></div><div class="roster-pagination"><button data-action="roster-prev" aria-label="上一页">‹</button><small id="roster-page"></small><button data-action="roster-next" aria-label="下一页">›</button></div><div class="roster-filters">${(['all', ...PROFESSION_KEYS] as const).map((k) => `<button data-roster-filter="${k}">${k === 'all' ? '全部' : PROFESSIONS[k].name}</button>`).join('')}</div></section><nav id="guild-nav" class="guild-nav" aria-label="公会导航"><button data-action="roster">${uiIcon('adventurers')}<strong>冒险者</strong></button><button data-action="guild">${uiIcon('guild')}<strong>冒险公会</strong></button><button data-action="expedition">${uiIcon('trial')}<strong>远征</strong></button></nav><section id="guild-feature-screen" class="guild-feature-screen" hidden></section><section id="selection-screen" class="selection-screen"></section><section id="adventure-screen" class="adventure-screen"><header class="adventure-header"><div><small id="chapter-label"></small><strong id="event-label"></strong></div><div class="header-actions"><span id="hero-power"></span><button data-action="settings" aria-label="存档设置">${uiIcon('settings')}</button></div></header><div id="stage-route" class="stage-route"></div><section id="battle-panel" class="battle-panel"></section><div id="shared-board" class="shared-board"><div id="combat-hud" class="combat-hud"></div><div id="resonance-strip" class="resonance-strip"></div><div id="resonance-info" class="resonance-info" hidden></div><section id="view-pack"></section><section id="journey-panel" class="journey-panel" hidden><div class="journey-heading"><strong>探险历程</strong><span id="journey-status"></span></div><div id="journey-history" class="journey-history" role="log" aria-label="探险经过与结果"></div></section></div><div id="adventure-footer" class="adventure-footer"></div></section><section id="summary-screen" class="summary-screen"></section></main><dialog id="decision-sheet" class="event-dialog" aria-labelledby="decision-title"><div id="decision"></div></dialog><dialog id="modal"><div id="modal-body"></div><button data-action="close" class="secondary-button modal-close">关闭</button></dialog><div id="toast" role="status"></div>`;
    document
      .getElementById('decision-sheet')!
      .addEventListener('cancel', (e) => e.preventDefault());
    document.getElementById('modal')!.addEventListener('close', () => {
      this.statusSide = null;
    });
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
    this.motion = new Motion(this.root);
    this.expedition = new ExpeditionUI(document.getElementById('guild-feature-screen')!);
    if (game.state.phase === 'home' && game.state.meta.expedition?.run)
      this.homeView = 'expedition';
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
      this.motion,
      (sound) => this.audio.effect(sound),
    );
    this.root.parentElement!.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideTalent();
      const tier = (e.target as Element).closest<HTMLElement>('[data-trial-tier]');
      if (tier && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 2
              : (Number(tier.dataset.trialTier) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
        this.selectedTrial = next as TrialTier;
        this.keys.decision = '';
        this.decision();
        document.querySelector<HTMLButtonElement>(`[data-trial-tier="${next}"]`)?.focus();
      }
      const item = (e.target as Element).closest('[data-bound-item]');
      if (item && ['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      }
    });
    this.root.parentElement!.addEventListener('click', (e) => {
      if (this.recycling) return;
      const talent = (e.target as Element).closest<HTMLElement>('[data-inspect-talent]');
      if (!talent && !this.talentBubble?.contains(e.target as Node)) this.hideTalent();
      const button = (e.target as Element).closest<HTMLElement>('button,[data-bound-item]');
      if (!button || (button as HTMLButtonElement).disabled) return;
      const d = button.dataset;
      if (this.wheel && (d.action !== 'wheel-confirm' || !this.wheel.ready)) return;
      if (d.inspectTalent) {
        this.inspectTalent(d.inspectTalent as TalentKey, button);
      } else if (d.statusSide) {
        this.statusSide = d.statusSide as StatusSide;
        this.modal(
          statusDetails(
            this.homeView === 'expedition'
              ? (this.expedition.battleState(this.game.state) ?? this.game.state)
              : this.game.state,
            this.statusSide,
          ),
        );
        document.getElementById('modal')!.classList.add('battle-status-modal');
      } else if (d.expResonance) {
        const view = this.expedition.battleState(this.game.state);
        if (view) {
          this.modal(resonanceDetails(view, d.expResonance as ResonanceKey), 'event');
          document.getElementById('modal')!.classList.add('resonance-detail-modal');
        }
      } else if (d.trialTier !== undefined) {
        this.selectedTrial = Number(d.trialTier) as TrialTier;
        this.keys.decision = '';
      } else if (d.inspectTome) {
        this.tomeDetail(d.inspectTome);
      } else if (d.tomeRank && this.inspectedTome) {
        this.tomeDetail(this.inspectedTome, Number(d.tomeRank));
      } else if (d.tome) {
        this.result(this.game.selectTome(d.tome), '');
      } else if (d.tomeFilter) {
        this.tomeFilter = d.tomeFilter as Profession | 'all';
        this.keys.selection = '';
      } else if (d.libraryFilter) {
        this.libraryFilter = d.libraryFilter as Profession | 'all';
        this.keys['guild-feature'] = '';
      } else if (d.upgradeTome) {
        this.result(this.game.upgradeTome(d.upgradeTome), '');
        this.keys['guild-feature'] = '';
        this.tomeDetail(d.upgradeTome);
      } else if (d.claimPage) {
        this.result(this.game.claimPage(d.owner!, d.claimPage), '');
        this.close();
      } else if (d.boundItem) {
        const h = this.game.state.meta.heroes.find((h) => h.id === d.owner),
          item = h?.loadout?.equipment.find((i) => i.id === d.boundItem),
          el = button.closest('.hero-equipment-section')?.querySelector('[data-bound-detail]');
        if (item && !el && this.homeView === 'expedition') {
          this.modal(
            `<h2>${esc(item.name)} · ${item.level}阶</h2><p>${item.attack ? `攻击 +${item.attack.toFixed(1)} · ` : ''}生命 +${item.hp} · 防御 +${item.defense}</p><p>${esc(readableEffect(itemStageText(item)))}</p><small>天赋增幅：${esc(itemTalentText(item, h!.talents))}</small>`,
          );
        }
        if (item && el) {
          el.innerHTML = `<strong>${esc(item.name)} · ${item.level}阶</strong><p>${item.attack ? `攻击 +${item.attack.toFixed(1)} · ` : ''}生命 +${item.hp} · 防御 +${item.defense} · 共鸣 ${contributionPoints(item)} 点</p><p>${esc(readableEffect(itemStageText(item)))}</p><small>天赋增幅：${esc(itemTalentText(item, h!.talents))}</small>`;
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
      else if (d.resonanceDetail) {
        const key = d.resonanceDetail as ResonanceKey;
        if (this.game.state.run.rewards[0]?.resonances.includes(key)) {
          this.modal(resonanceDetails(this.game.state, key), 'event');
          document.getElementById('modal')!.classList.add('resonance-detail-modal');
        }
      } else if (d.refreshResonance !== undefined)
        this.result(this.game.refreshResonance(Number(d.refreshResonance)), '');
      else if (d.resonancePack !== undefined) {
        this.modal(resonancePack(this.game.state), 'guild');
        document.getElementById('modal')!.classList.add('resonance-pack-modal');
      } else if (d.resonance)
        this.result(this.game.chooseResonance(d.resonance as ResonanceKey), '共鸣已获得');
      else if (d.reward !== undefined)
        this.result(this.game.chooseReward(Number(d.reward)), '祝福已获得');
      else if (d.event) {
        if (d.event === 'spin') this.spinWheel();
        else {
          const error = this.game.chooseEvent(d.event);
          if (!error && /^dig-\d+$/.test(d.event)) {
            this.audio.effect('explore-dig');
            this.digFeedbackCell = Number(d.event.slice(4));
            this.digFeedbackUntil = Date.now() + 380;
          }
          this.result(error, '事件完成');
        }
      } else if (d.inspectResonance) {
        const k = d.inspectResonance as ResonanceKey;
        this.pack.showResonance(k);
        this.modal(resonanceDetails(this.game.state, k), 'event');
        document.getElementById('modal')!.classList.add('resonance-detail-modal');
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
      if (exploring(this.game.state.phase) && !d.action?.startsWith('audio-'))
        this.audio.effect('explore-ui-confirm');
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
    if (this.recycling) return;
    if (action === 'expedition' || action === 'exploration') {
      if (this.game.state.phase === 'home') {
        this.close();
        this.expedition.reset();
        if (action === 'exploration') this.expedition.showExploration();
        this.keys['guild-feature'] = '';
        this.homeView = 'expedition';
      }
      return;
    }
    if (action.startsWith('exp-')) {
      this.result(this.expedition.handle(action, this.game.state), '');
      return;
    }
    if (['continue', 'continue-story'].includes(action) && this.journeyPlaying) return;
    if (action === 'guild-level') {
      this.guildPanel();
      return;
    }
    if (action === 'guild-tree') {
      this.guildRoute(undefined, this.homeView === 'guild-tree');
      return;
    }
    if (action === 'guild-total') {
      this.guildTotal();
      return;
    }
    if (action.startsWith('guild-node-')) {
      this.guildRoute(Number(action.slice(11)), true);
      return;
    }
    if (action.startsWith('guild-buy-')) {
      this.result(this.game.buyGuildNode(Number(action.slice(10))), '');
      this.guildRoute(Math.min(this.game.state.meta.guildPurchased, GUILD_NODES.length - 1), true);
      return;
    }
    if (action === 'upgrade-guild-all') {
      this.result(this.game.upgradeGuildAvailable(), '');
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
    if (action === 'challenge-trial') this.result(g.chooseTrial(this.selectedTrial), '');
    if (action === 'chapters') {
      g.enterChapters();
      this.homeView = 'guild';
    }
    if (action === 'home' || action === 'guild') {
      g.backHome();
      this.homeView = 'guild';
      this.close();
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
      if (this.game.state.run.routeRevision === 16 && !this.game.finishWheel()) return;
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
    if (action === 'claim-starters') this.result(g.claimStarterRound(), '本轮三件物品已全部领取');
    if (action === 'finish-opening') this.advanceWithRecycling('finish-opening');
    if (action === 'fast-explore') {
      s.run.autoExplore = true;
      s.skipCombat = true;
      const error = g.continueCamp();
      if (error) s.run.autoExplore = false;
      this.result(error, '快速探险');
    }
    if (action === 'skip-combat') {
      if (s.phase === 'combat') s.combat.skip = true;
      s.revision++;
    }
    if (action === 'continue-story') {
      this.showPack = false;
      // Closing voluntary inspection resumes playback; it never skips the story.
    }
    if (action === 'continue-resonance' && !this.journeyPlaying && s.run.resonanceNarration) {
      const startAdventure = s.run.prologue === 'ready';
      g.continueJourney();
      if (startAdventure) this.result(g.continueCamp(), '');
    }
    if (action === 'continue') this.advanceWithRecycling('continue');
    if (action === 'skip-reward') g.skipReward();
    if (action === 'redeem') this.result(g.redeemEquipment(), '随机装备已放在战场');
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
    if (action === 'audio-music') {
      this.audio.setSettings({ music: !this.audio.settings.music });
      this.settings();
    }
    if (action === 'audio-effects') {
      this.audio.setSettings({ effects: !this.audio.settings.effects });
      this.settings();
    }
    if (action === 'audio-retry') {
      void this.audio.preload().then(() => {
        if ((document.getElementById('modal') as HTMLDialogElement).open) this.settings();
      });
    }
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
  private advanceWithRecycling(action: 'continue' | 'finish-opening') {
    const s = this.game.state;
    if (
      this.recycling ||
      (action === 'continue' && s.phase !== 'camp') ||
      (action === 'finish-opening' && (s.phase !== 'opening' || s.run.starterRound !== 2))
    )
      return;
    const error = validateLayout(s.inventory, s.draft, runBagCells(s));
    if (error || !this.game.packAnalysis(true).hasWeapon) {
      this.toast(error ?? '至少放入一件武器');
      return;
    }
    const loose = this.game.looseItems();
    const target = document.getElementById('point-redeem');
    if (!loose.length || !target || (s.run.pendingPromotion && s.run.routeRevision !== 16)) {
      this.completeAdvance(action);
      return;
    }
    const ids = new Set(loose.map((item) => item.id));
    const sources = Array.from(
      this.root.querySelectorAll<SVGElement>('#field-items [data-pack-item]'),
    ).filter((source) => ids.has(source.dataset.packItem!));
    const flight = recyclingFlight(sources, target, this.motion.reduced);
    this.recycling = {
      game: this.game,
      action,
      credited: false,
      until: Date.now() + flight.duration,
      cleanup: flight.cleanup,
    };
    this.pack.setLocked(true);
    this.root.dataset.recycling = 'true';
  }
  private completeAdvance(action: 'continue' | 'finish-opening') {
    this.result(action === 'continue' ? this.game.continueCamp() : this.game.finishOpening(), '');
  }
  private updateRecycling() {
    const pending = this.recycling;
    if (!pending || Date.now() < pending.until) return;
    if (!pending.credited) {
      pending.cleanup();
      this.game.collectLooseEquipment();
      pending.credited = true;
      pending.until = Date.now() + (this.motion.reduced ? 0 : 220);
      this.keys.footer = '';
      this.persist();
      return;
    }
    this.recycling = null;
    this.pack.setLocked(false);
    delete this.root.dataset.recycling;
    this.completeAdvance(pending.action);
    this.persist();
  }
  render() {
    if (!this.ensureResources()) return;
    this.updateRecycling();
    this.game.recoverEnergy();
    this.root.dataset.mobileScene =
      this.game.state.phase === 'home'
        ? this.homeView === 'expedition'
          ? 'expedition'
          : 'guild'
        : 'dungeon';
    if (this.game.state.run.routeRevision === 16) {
      const w = this.game.state.run.wheel;
      this.wheel = w
        ? {
            sector: w.sector,
            result: `${WHEEL_SECTORS[w.sector].label} +${WHEEL_SECTORS[w.sector].value * 100}%`,
            started: this.wheel?.started ?? Date.now(),
            node: this.game.state.run.index,
            angle: 2160 - (w.sector * 60 + 30),
            ready: w.elapsed >= WHEEL_SECONDS,
          }
        : null;
    }
    if (
      this.game.state.run.routeRevision !== 16 &&
      this.wheel &&
      !this.wheel.ready &&
      Date.now() - this.wheel.started >= 3600
    )
      this.wheel.ready = true;
    const s = this.game.state;
    if (this.statusSide && !(document.getElementById('modal') as HTMLDialogElement).open)
      this.statusSide = null;
    if (
      this.statusSide &&
      s.phase !== 'combat' &&
      !(this.homeView === 'expedition' && this.expedition.battleState(s))
    )
      this.close();
    if (this.talentBubble && s.phase !== 'configure') this.hideTalent();
    this.motion.sync(s.speed, (s.phase === 'combat' && !s.isRunning) || document.hidden);
    if (this.phase !== s.phase) {
      const previous = this.phase;
      this.phase = s.phase;
      this.resultNode =
        s.phase === 'camp' &&
        !!this.game.currentEvent()?.completed &&
        (previous === 'combat' ||
          (previous === 'event' && this.game.currentEvent()?.kind !== 'supply') ||
          previous === 'reward')
          ? s.run.index
          : -1;
      if (
        previous === 'event' &&
        s.phase === 'combat' &&
        ['boss', 'elite'].includes(this.game.currentEvent()!.kind)
      ) {
        this.transitionUntil = Date.now() + (this.motion.reduced ? 0 : 680 / s.speed);
        this.audio.effect('explore-boss-warning');
        this.audio.effect('explore-encounter');
      }
      this.showPack =
        ['opening', 'combat'].includes(s.phase) ||
        (s.phase === 'camp' &&
          (!this.game.currentEvent()?.completed ||
            (!previous &&
              ['battle', 'boss', 'elite', 'ending'].includes(this.game.currentEvent()!.kind))));
      if (s.phase === 'awakening') this.ritualStarted = Date.now();
    }
    // Result playback is a one-shot entry into camp, not a reaction to later arrange logs.
    if (this.resultNode === s.run.index && s.phase === 'camp' && !this.resultPlaying) {
      this.resultNode = -1;
      this.showPack =
        this.game.looseItems().length > 0 ||
        ['battle', 'boss', 'elite', 'ending'].includes(this.game.currentEvent()!.kind);
    }
    const equipmentVisible =
      s.phase !== 'combat' && (s.run.starterOffers.length > 0 || this.game.looseItems().length > 0);
    if (this.resultPlaying) this.showPack = false;
    else if (equipmentVisible && s.phase !== 'awakening' && !s.run.resonanceNarration)
      this.showPack = true;
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
    const featureVisible =
      s.phase === 'home' && ['library', 'guild-tree', 'expedition'].includes(this.homeView);
    document.getElementById('guild-feature-screen')!.hidden = !featureVisible;
    document.getElementById('guild-nav')!.hidden =
      (featureVisible && !(this.homeView === 'expedition' && this.expedition.showNavigation)) ||
      !['home', 'chapter'].includes(s.phase);
    document.querySelectorAll<HTMLElement>('#guild-nav button').forEach((b) => {
      const selected =
        b.dataset.action ===
        (this.homeView === 'roster'
          ? 'roster'
          : this.homeView === 'expedition' && !this.expedition.showingExploration
            ? 'expedition'
            : 'guild');
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
      .classList.toggle('combat-screen', s.phase === 'combat');
    document
      .getElementById('adventure-screen')!
      .classList.toggle('ritual-screen', s.phase === 'awakening');
    document
      .getElementById('adventure-screen')!
      .classList.toggle(
        'resonance-screen',
        s.phase === 'initial' || (s.phase === 'reward' && s.run.rewards[0]?.kind === 'resonance'),
      );
    if (s.phase === 'home') this.home();
    if (featureVisible) this.guildFeature();
    if (['chapter', 'configure', 'tome'].includes(s.phase)) this.selection();
    if (s.phase === 'summary') this.summary();
    if (active) {
      document.getElementById('chapter-label')!.textContent = `第 ${s.run.chapter} 关`;
      document.getElementById('event-label')!.textContent = s.run.prologue
        ? s.run.prologue === 'departure'
          ? '公会启程'
          : s.run.prologue === 'equipped'
            ? '整备完成'
            : s.run.prologue === 'resonance'
              ? '选择初始共鸣'
              : '准备就绪'
        : s.phase === 'opening'
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
      const field = document.getElementById('field-items');
      if (field) field.hidden = !!s.run.prologue || this.resultPlaying;
      this.resonance();
      this.feedback();
    }
    document.getElementById('view-pack')!.hidden = !active || !this.showPack;
    document.getElementById('journey-panel')!.hidden = !active || this.showPack;
    this.journey();
    // Queue newly added narration before deciding whether an event sheet may open.
    this.decision();
    if (active) {
      this.prepareEncounter();
      this.footer();
      if (this.recycling?.credited)
        this.motion.pulse(document.getElementById('point-redeem'), 'reforge-notify', 220, false);
    }
    document.getElementById('combat-hud')!.hidden = !active;
    this.sounds.sync(this.game, this.showPack && !this.resultPlaying, this.wheel);
    this.root.dataset.audio = JSON.stringify(this.audio.diagnostics);
  }
  get holdingJourney() {
    return (
      this.resourcesBlocked ||
      !!this.recycling ||
      (this.game.state.phase === 'journey' &&
        (this.showPack || this.journeyPlaying || Date.now() < this.transitionUntil))
    );
  }
  get holdingCombat() {
    return (
      this.resourcesBlocked ||
      (this.game.state.phase === 'combat' && Date.now() < this.transitionUntil)
    );
  }
  private ensureResources() {
    const urls = missingAssets(visibleAssets(this.game.state, this.homeView));
    if (!urls.length && !this.resourceTask) {
      this.resourcesBlocked = false;
      this.resourceFailed = false;
      this.resourceDialog?.close();
      this.root.removeAttribute('aria-busy');
      registerCharacterParts();
      return true;
    }
    this.resourcesBlocked = true;
    if (this.resourceTask || this.resourceFailed) return false;
    this.resourceTask = true;
    const epoch = this.resourceEpoch;
    let dialog = this.resourceDialog;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'resource-wait';
      dialog.setAttribute('aria-label', '准备页面资源');
      dialog.innerHTML =
        '<strong>准备页面</strong><p role="status"></p><progress max="100" value="0"></progress><button hidden>重试</button>';
      dialog.addEventListener('cancel', (e) => e.preventDefault());
      dialog.querySelector('button')!.onclick = () => {
        this.resourceFailed = false;
        this.render();
      };
      document.body.append(dialog);
      this.resourceDialog = dialog;
    }
    const button = dialog.querySelector('button')!;
    button.hidden = true;
    this.root.setAttribute('aria-busy', 'true');
    if (!dialog.open) dialog.showModal();
    const panel = dialog;
    void preloadAssets((done, total) => {
      if (epoch !== this.resourceEpoch) return;
      panel.querySelector('p')!.textContent = `加载素材 ${done}/${total}`;
      panel.querySelector('progress')!.value = total ? (done * 100) / total : 100;
    }, urls)
      .then(() => {
        if (epoch !== this.resourceEpoch) return;
        this.resourceTask = false;
        registerCharacterParts();
        this.render();
      })
      .catch((error) => {
        if (epoch !== this.resourceEpoch) return;
        this.resourceTask = false;
        this.resourceFailed = true;
        panel.querySelector('p')!.textContent =
          error instanceof Error ? error.message : '资源加载失败';
        button.hidden = false;
      });
    return false;
  }
  private get resultPlaying() {
    const s = this.game.state;
    return (
      this.resultNode === s.run.index &&
      s.phase === 'camp' &&
      !!this.game.currentEvent()?.completed &&
      (s.run.journey.length > this.journeyRendered.length || this.journeyPlaying)
    );
  }
  private get journeyPlaying() {
    return !this.showPack && (this.journeyQueue.length > 0 || Date.now() < this.journeyActiveUntil);
  }
  private prepareEncounter() {
    const s = this.game.state;
    const panel = document.getElementById('battle-panel')!;
    if (
      s.phase === 'journey' &&
      !s.run.prologue &&
      !s.run.resonanceNarration &&
      !this.showPack &&
      !this.journeyPlaying &&
      this.game.currentEvent()!.kind === 'battle' &&
      s.run.storyElapsed >= storyDuration(this.game.currentEvent()!) - 0.68 &&
      this.transitionNode !== s.run.index
    ) {
      this.transitionNode = s.run.index;
      s.run.storyElapsed = storyDuration(this.game.currentEvent()!);
      this.transitionUntil = Date.now() + (this.motion.reduced ? 0 : 680 / s.speed);
      this.audio.effect('explore-encounter');
    }
    panel.classList.toggle(
      'encounter-approach',
      ['journey', 'combat'].includes(s.phase) && Date.now() < this.transitionUntil,
    );
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
      `<div><strong>${uiIcon('energy')}体力 ${e.value} / ${ENERGY_CAP}</strong><small>${wait ? `恢复 ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : '体力已满'}</small></div><div class="guild-currencies"><strong>${uiIcon('gold')}金币 ${s.meta.gold}</strong><strong>${uiIcon('medal')}勋章 ${s.meta.medals}</strong></div>`;
    document.getElementById('home-chapter')!.textContent = `第 ${s.meta.highestChapter} 关`;
    let expeditionButton = document.querySelector<HTMLButtonElement>('.guild-remote-expedition');
    if (!expeditionButton) {
      expeditionButton = document.createElement('button');
      expeditionButton.className = 'guild-remote-expedition';
      expeditionButton.dataset.action = 'exploration';
      document.getElementById('home-screen')!.append(expeditionButton);
    }
    const job = s.meta.expedition?.dispatch;
    expeditionButton.innerHTML = `${uiIcon('dungeon')}驻地探索${job && job.readyAt <= Date.now() ? '<small>探索待领取</small>' : ''}`;
    const pending = s.meta.pendingPages.length;
    if (
      this.changed(
        'guild-controls',
        `${s.meta.guildLevel}|${pending}|${s.meta.guildPurchased}|${s.meta.medals}`,
      )
    )
      document.querySelector('.guild-progress-controls')!.innerHTML =
        `<button data-action="guild-level" id="guild-level-button">${uiIcon('guild')}公会 Lv.${s.meta.guildLevel}</button><button data-action="guild-tree">${uiIcon('guild-bonus')}公会增幅</button><button data-action="library">${uiIcon('library')}典籍</button>${pending ? `<button data-action="pending-pages">待领残页 ${pending}</button>` : ''}`;
    if (this.homeView !== 'roster') return;
    if (
      !this.changed(
        'roster',
        `${s.revision}|${this.rosterFilter}|${this.rosterAscending}|${this.rosterPage}`,
      )
    )
      return;
    const heroes = s.meta.heroes
        .map((h) => currentHero(h, guildBenefits(s.meta.guildPurchased)))
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
              `<button class="hero-card rating-${h.rating}" data-hero="${h.id}" aria-label="${esc(h.name)}，${PROFESSIONS[h.profession].name}，${h.rating}级，战力${h.power}"><span class="card-job">${PROFESSIONS[h.profession].name.slice(0, 1)}</span><span class="card-rating">${h.rating}</span><strong class="card-name">${esc(h.name)}</strong>${heroArt(h.profession, h.appearance)}<b class="card-power">${h.power.toLocaleString()}</b></button>`,
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
        currentHero(this.archiveHero, guildBenefits(this.game.state.meta.guildPurchased)),
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
        el.innerHTML = `<header><button data-action="home">← 公会</button><span>选择地牢</span></header><div class="dungeon-carousel" data-chapter-carousel tabindex="0" role="group" aria-label="关卡选择，可左右滑动"><div class="dungeon-view"><div class="dungeon-pixel-scene" aria-hidden="true"></div><div class="dungeon-caption" aria-live="polite"><h1>第 ${s.run.chapter} 关</h1><h2>${names[(s.run.chapter - 1) % 5]}</h2><p>${realmName(startingRealm(s.run.chapter))} → ${realmName(startingRealm(s.run.chapter) + 3)}</p><small>${s.run.chapter === s.meta.highestChapter ? '最新解锁地牢' : '可再次挑战'}</small></div></div><button class="chapter-arrow previous" data-action="prev-chapter" aria-label="上一关" ${s.run.chapter === 1 ? 'disabled' : ''}>‹</button><button class="chapter-arrow next" data-action="next-chapter" aria-label="下一关" ${s.run.chapter === s.meta.highestChapter ? 'disabled' : ''}>›</button></div><p class="swipe-hint">已解锁 ${s.meta.highestChapter}/${CHAPTER_CAP}</p><section class="recruit-panel"><div class="recruit-energy" id="recruit-energy-text"></div>${s.run.trainee ? `<p>${esc(s.run.trainee.name)} · 见习${PROFESSIONS[s.run.trainee.profession].name}</p><button class="primary-button" data-action="resume-recruit">继续配置</button>` : `<div class="recruit-tabs" role="group" aria-label="招募方式"><button data-recruit-mode="random" aria-pressed="${this.recruitMode === 'random'}" class="${this.recruitMode === 'random' ? 'selected' : ''}">基础招募<small>随机职业 · 5 体力</small></button><button data-recruit-mode="targeted" aria-pressed="${this.recruitMode === 'targeted'}" class="${this.recruitMode === 'targeted' ? 'selected' : ''}">定向招募<small>指定职业 · 20 体力</small></button></div>${this.recruitMode === 'targeted' ? `<div class="profession-targets">${PROFESSION_KEYS.map((k) => `<button data-profession="${k}" aria-pressed="${k === this.profession}" class="${k === this.profession ? 'selected' : ''}">${heroArt(k)}<strong>${PROFESSIONS[k].name}</strong></button>`).join('')}</div>` : ''}<button class="primary-button" data-action="recruit" id="recruit-button">${this.recruitMode === 'random' ? '招募随机勇者' : `招募${PROFESSIONS[this.profession].name}`} · ${cost} 体力</button><small>每 5 分钟恢复 1 点体力</small>`}</section>`;
      }
      document.getElementById('recruit-energy-text')!.textContent = this.energyText();
      const button = document.getElementById('recruit-button') as HTMLButtonElement | null;
      if (button) button.disabled = s.meta.energy.value < cost || s.meta.heroes.length >= 500;
      return;
    }
    const t = s.run.trainee!;
    if (!this.changed('selection', `configure|${s.revision}`)) return;
    this.hideTalent();
    el.innerHTML = configurationView(s, this.guildBonusText(t.guildBonus ?? guildBenefits(0)));
  }

  private tomeSelection() {
    const s = this.game.state;
    if (!this.changed('selection', `tome|${s.revision}|${this.tomeFilter}`)) return;
    document.getElementById('selection-screen')!.innerHTML = tomeSelectionView(s, this.tomeFilter);
  }

  private tomeDetail(id: string, rank = this.game.state.meta.tomes[id]?.level || 1) {
    if (!tome(id) || ![1, 2, 3].includes(rank)) return;
    this.inspectedTome = id;
    this.modal(tomeDetailView(this.game.state, id, rank));
    document.getElementById('modal')!.classList.add('tome-modal');
  }

  private battle() {
    const s = this.game.state,
      e = s.enemy,
      el = document.getElementById('battle-panel')!,
      key = `${s.phase === 'combat' ? 'combat' : 'explore'}|${s.run.profession}|${s.run.trainee?.id}|${e?.species}`;
    el.dataset.profession = s.run.profession;
    if (this.changed('battle', key)) {
      const defeated =
        el.classList.contains('in-combat') && !e && s.player.hp > 0 && s.phase === 'camp'
          ? el.querySelector<HTMLElement>('.enemy-fighter')
          : null;
      el.innerHTML = `<div class="scene-ground" aria-hidden="true"></div><div class="battle-scene"><div class="trial-altar" aria-hidden="true"></div><div class="fighter hero-fighter">${heroRig(s.run.profession, s.run.trainee?.appearance)}<span>${esc(s.run.trainee?.name ?? '勇者')}</span></div><span class="versus">${e ? '⚔' : '✦'}</span><div class="fighter enemy-fighter">${e ? foeRig(e) : '<span class="trail-marker">♜</span>'}<span>${e ? esc(e.name) : s.phase === 'opening' ? '整备行囊' : safelyGraduated(s) && this.game.currentEvent()?.completed ? '培养完成' : '前方的旅程'}</span></div></div><div class="fighter-health"><div class="health-side hero-health">${heroHead(s.run.profession, s.run.trainee?.appearance, '1P')}<strong id="hero-health-name"></strong><span id="player-hp"></span><div class="bar"><i id="player-bar"></i></div><div id="hero-effects" class="hero-effects"></div></div><div class="health-side enemy-health">${e ? enemyHead(e) : ''}<strong id="enemy-health-name"></strong><span id="enemy-hp"></span><div class="bar enemy-bar"><i id="enemy-bar"></i></div><div id="enemy-effects" class="enemy-effects"></div></div></div><div id="turn-order" class="turn-order"></div><div id="field-items" class="field-items"></div>`;
      this.motion.depart(defeated, el.querySelector('.battle-scene'));
    }
    el.classList.toggle(
      'has-offers',
      s.phase !== 'combat' &&
        s.phase !== 'awakening' &&
        !this.resultPlaying &&
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
    // Boot hides the canvas during loading. Calibrate after both pixels and layout exist.
    const flyingImage = el.querySelector<HTMLElement>('[data-enemy-art]')?.dataset.enemyArt;
    const flight = flyingImage ? ENEMY_ANCHORS[flyingImage]?.flight : undefined;
    if (flight?.imageCenter && this.motion.rig('enemy')?.dataset.flightAligned !== 'true')
      this.motion.alignFlight(flight.imageCenter);
    this.motion
      .rig('hero')
      ?.setAttribute(
        'data-motion',
        s.phase === 'combat' ? 'combat' : el.classList.contains('exploring') ? 'explore' : 'idle',
      );
    el.classList.toggle('shielded', s.player.shield > 0);
    el.dataset.profession = s.run.profession;
    document.getElementById('player-hp')!.innerHTML = combatVitals(s.player.hp, s.player.maxHp);
    this.motion.health(
      document.getElementById('player-bar')!,
      s.player.hp,
      s.player.maxHp,
      s.run.trainee?.id ?? 'hero',
    );
    document.getElementById('enemy-hp')!.innerHTML = e ? combatVitals(e.hp, e.maxHp) : '';
    this.motion.health(
      document.getElementById('enemy-bar')!,
      e?.hp ?? 0,
      e?.maxHp ?? 0,
      `${s.run.index}|${e?.species}`,
    );
    document.getElementById('hero-health-name')!.textContent = s.run.trainee?.name ?? '勇者';
    document.getElementById('enemy-health-name')!.textContent = e?.name ?? '';
    for (const side of ['hero', 'enemy'] as const) {
      const effects = document.getElementById(side + '-effects')!;
      const html = s.phase === 'combat' ? statusButton(s, side) : '';
      if (effects.innerHTML !== html) {
        const button = effects.querySelector<HTMLButtonElement>('[data-status-side]');
        if (button && html) {
          // Keep the touch target alive from pointer-down through pointer-up, even if statuses change.
          const next = document.createElement('template');
          next.innerHTML = html;
          const replacement = next.content.firstElementChild!;
          button.innerHTML = replacement.innerHTML;
        } else effects.innerHTML = html;
      }
    }
    updateBossView(
      el.querySelector('.battle-scene'),
      s.phase === 'combat' ? s.combat.runtime : null,
    );
    if (this.statusSide) {
      const body = document.getElementById('modal-body')!,
        html = statusDetails(s, this.statusSide);
      if (body.innerHTML !== html) {
        const scroll = body.scrollTop;
        body.innerHTML = html;
        body.scrollTop = scroll;
      }
    }
    const order = document.getElementById('turn-order');
    if (order) {
      order.hidden = s.phase !== 'combat';
      order.textContent =
        s.phase === 'combat'
          ? `第 ${s.combat.round} 回合 · ${this.game.nextActor() === 'hero' ? '勇者' : '敌人'}行动`
          : '';
    }
    const p = finalAttributes(s, this.game.editable());
    document.getElementById('combat-hud')!.innerHTML = combatHud(s, {
      ...p,
      speed: this.game.playerSpeed(),
    });
  }
  private route() {
    const s = this.game.state;
    if (!this.changed('route', s.phase + '|' + s.revision)) return;
    const starting = !!s.run.prologue || ['opening', 'initial'].includes(s.phase);
    document.getElementById('stage-route')!.innerHTML = s.run.events
      .map(
        (e, n) =>
          `<span class="route-step ${e.completed ? 'complete' : ''} ${!starting && s.run.index === n ? 'current' : ''} ${['boss', 'elite', 'promotion', 'graduation', 'ending'].includes(e.kind) ? 'milestone' : ''} node-${e.kind} ${n > runRoute(s).graduation ? 'optional' : ''}" data-node="${n + 1}" aria-label="第 ${n + 1} 步 · ${EVENT_NAMES[e.kind]} · ${e.completed ? '已完成' : !starting && s.run.index === n ? '进行中' : '未到达'}" ${!starting && s.run.index === n ? 'aria-current="step"' : ''} title="${n + 1} · ${EVENT_NAMES[e.kind]}">${({ battle: '·', boss: '✦', elite: '✦', rest: '+', dig: '⌑', graduation: '◆', ending: '◆', choice: '?', chance: '?', promotion: '✧', supply: '□', treasure: '□' } as Record<string, string>)[e.kind] ?? '·'}</span>`,
      )
      .join('');
  }
  private resonance() {
    const s = this.game.state;
    const promoted: string[] = [];
    for (const k of s.run.resonances) {
      const r = resonanceScore(s.inventory, this.game.editable() ? s.draft : s.placements, k);
      if (this.resonanceTiers[k] !== undefined && r.tier > this.resonanceTiers[k]) {
        this.toast(`${RESONANCES[k].name} · ${r.tier}档激活`);
        promoted.push(k);
      }
      this.resonanceTiers[k] = r.tier;
    }
    if (!this.changed('resonance', s.phase + '|' + s.revision)) return;
    document.getElementById('resonance-strip')!.innerHTML = combatResonances(
      s,
      this.game.editable(),
      'data-inspect-resonance',
      ['启程', ...runRoute(s).trials.map((n) => `试炼 ${n + 1}`)],
    );
    for (const k of promoted)
      this.motion.pulse(
        document.querySelector(`[data-inspect-resonance="${k}"]`),
        'resonance-promoted',
        750,
      );
  }
  private footer() {
    const s = this.game.state;
    const waiting =
      !!this.recycling ||
      this.journeyPlaying ||
      (s.phase === 'journey' && !this.showPack && !s.run.resonanceNarration);
    const ready = (s.phase === 'camp' || !!s.run.resonanceNarration) && !waiting;
    const canReforge = this.showPack && this.game.editable() && s.run.points >= 6;
    const notifyContinue = ready && !this.footerReady;
    const notifyReforge = canReforge && !this.reforgeReady;
    this.footerReady = ready;
    this.reforgeReady = canReforge;
    if (
      !this.changed(
        'footer',
        `${s.phase}|${s.run.index}|${s.run.starterRound}|${this.game.completed()}|${s.speed}|${s.isRunning}|${this.showPack}|${this.game.skippingCombat()}|${s.run.autoExplore}|${s.run.points}|${this.game.looseItems().length}|${s.run.pendingPromotion}|${this.ritualReady}|${waiting}`,
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
          : '<button class="primary-button" data-action="finish-opening">继续</button>';
    else if (s.phase === 'camp')
      html = `<button class="primary-button" data-action="continue" ${waiting ? 'disabled' : ''}>${waiting ? '历程播放中' : s.run.pendingPromotion && (s.run.routeRevision !== 16 || s.run.events[s.run.index + 1]?.kind === 'promotion') ? '进入晋阶' : safelyGraduated(s) && this.game.currentEvent()?.completed ? '确认毕业' : this.game.completed() ? '继续探险' : '开始冒险'}</button>`;
    else if (s.phase === 'journey')
      html = `<button class="primary-button" data-action="${s.run.resonanceNarration ? 'continue-resonance' : 'continue-story'}" ${waiting ? 'disabled' : ''}>${waiting ? '历程播放中' : '继续'}</button>`;
    else if (s.phase === 'awakening')
      html = `<button class="primary-button" data-action="finish-awakening" ${this.ritualReady ? '' : 'disabled'}>${this.ritualReady ? '继续' : '境界觉醒'}</button>`;
    else if (s.phase === 'combat')
      html = `<button class="primary-button" data-action="skip-combat" aria-pressed="${this.game.skippingCombat()}">${this.game.skippingCombat() ? '快速结算' : '跳过战斗'}</button>`;
    const utility =
      s.phase === 'awakening'
        ? ''
        : this.showPack
          ? `<button id="point-redeem" class="reforge-button ${canReforge ? 'reforge-ready' : ''}" data-action="redeem" aria-label="重铸随机装备，消耗6点，当前${s.run.points}点" ${!canReforge ? 'disabled' : ''}>${uiIcon('reforge')}<span>重铸</span><small id="point-count">${s.run.points}/6</small></button>`
          : `<button class="backpack-button" data-action="open-pack" aria-label="查看背包">${uiIcon('backpack')}背包</button>`;
    document.getElementById('adventure-footer')!.innerHTML =
      `${utility}<div class="footer-main">${html}</div>${s.phase === 'awakening' ? '' : `<button class="speed-button" data-action="cycle-speed" aria-label="切换播放速度">${uiControl('speed')}<span>${s.speed}×</span></button>`}`;
    const footer = document.getElementById('adventure-footer')!;
    footer.dataset.ritual = String(s.phase === 'awakening');
    if (this.recycling) {
      footer
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach((button) => (button.disabled = true));
      const main = footer.querySelector('.footer-main button');
      if (main) main.textContent = this.recycling.credited ? '点数已回收' : '回收装备中';
    }
    footer.dataset.readiness = waiting ? 'waiting' : ready ? 'ready' : 'decision';
    if (notifyContinue) {
      this.motion.pulse(footer.querySelector('.footer-main button'), 'continue-ready', 650, false);
      this.audio.effect('explore-journal-ready');
    }
    if (notifyReforge) {
      this.motion.pulse(footer.querySelector('#point-redeem'), 'reforge-notify', 650, false);
      this.audio.effect('explore-reforge-ready');
    }
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
      `${Math.min(3, s.run.stages + 1)} 阶段 · ${this.game.completed()}/${s.run.events.length}`;
    const el = document.getElementById('journey-history')!;
    const flow = `${s.run.index}|${s.run.prologue ?? ''}|${!!s.run.resonanceNarration}|${!!this.game.currentEvent()?.completed}`;
    if (flow !== this.journeyFlow) {
      this.journeyFlow = flow;
      this.journeyFollow = true;
    }
    el.classList.toggle('playing-story', s.phase === 'journey');
    const firstVisible = !this.journeyVisible && !this.showPack;
    this.journeyVisible = !this.showPack;
    this.revealJourney();
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
      this.journeyQueue = [];
    }
    // The departure line is new narration even on the very first adventure render.
    // A longer saved history stays visible without replaying old entries.
    const restoredHistory =
      !this.journeyRendered.length &&
      !(s.run.prologue === 'departure' && s.run.journey.length === 1);
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
              `<article class="journey-entry journey-entry-frame ${restoredHistory ? '' : 'journey-pending'} journey-${l.kind}"><div class="journey-paper"><strong>${esc(l.title)}</strong><p>${esc(l.text)}</p></div></article>`,
          )
          .join(''),
      );
    }
    this.journeyQueue = Array.from(el.querySelectorAll<HTMLElement>('.journey-pending'));
    this.revealJourney();
    this.journeyRendered = signatures;
    if (!this.showPack) el.scrollTop = this.journeyFollow ? el.scrollHeight : this.journeyScroll;
    this.awakening();
  }
  private awakening() {
    const s = this.game.state,
      board = document.getElementById('adventure-screen')!;
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
    el.innerHTML = `<small>${TRIALS[a.tier].name} · 通过</small><h2>境界晋升</h2><div class="ritual-hero"><div class="ritual-light"></div>${heroRig(s.run.profession, s.run.trainee?.appearance)}</div><div class="realm-promotion" role="status" aria-label="境界晋升"><span>${realmName(s.run.realm - 1)}</span><i aria-hidden="true">→</i><strong>${realmName(s.run.realm)}</strong></div><div class="awakening-gains"><b>攻击 +${+(a.attack * 100).toFixed(1)}%</b><b>最大生命 +${a.hp}</b><b>防御 +${+a.defense.toFixed(2)}</b>${a.healed > 0 ? `<b>恢复生命 ${a.healed}</b>` : ''}</div>`;
    this.motion.pulse(el, 'motion-awakening', 1300);
  }
  private get ritualReady() {
    return this.motion.reduced || Date.now() - this.ritualStarted >= 1400 / this.game.state.speed;
  }
  private revealJourney() {
    if (this.showPack || Date.now() < this.journeyNext) return;
    const entry = this.journeyQueue.shift();
    if (!entry) return;
    entry.classList.remove('journey-pending');
    entry.classList.add('journey-new');
    const result = this.game.state.phase === 'camp' && !!this.game.currentEvent()?.completed;
    this.journeyActiveUntil =
      Date.now() +
      (result
        ? Math.max(450, 900 / this.game.state.speed)
        : this.motion.reduced
          ? 0
          : 240 / this.game.state.speed);
    entry.addEventListener('animationend', () => entry.classList.remove('journey-new'), {
      once: true,
    });
    this.journeyNext = Date.now() + 500 / this.game.state.speed;
    const el = document.getElementById('journey-history')!;
    if (this.journeyFollow) el.scrollTop = el.scrollHeight;
  }
  private spinWheel() {
    const s = this.game.state;
    if (
      this.wheel ||
      s.phase !== 'event' ||
      this.game.currentEvent()?.kind !== 'chance' ||
      (s.run.routeRevision !== 16 && this.game.currentEvent()?.variant !== 0)
    )
      return;
    if (s.run.routeRevision === 16) {
      this.result(this.game.chooseEvent('spin'), '');
      this.keys.decision = '';
      this.persist();
      return;
    }
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
  private wheelGraphic(angle = 0, elapsed = 0) {
    const revised = this.game.state.run.routeRevision === 16;
    const sizes = revised ? [60, 60, 60, 60, 60, 60] : [180, 108, 54, 18],
      labels = revised
        ? WHEEL_SECTORS.map((x) => `${x.label} +${x.value * 100}%`)
        : ['装备', '点数', '治疗', '反噬'],
      colors = revised
        ? ['#668374', '#987346', '#637e9b', '#668374', '#987346', '#637e9b']
        : ['#a88a53', '#608277', '#7a91aa', '#a46860'];
    let start = -90;
    const segments = sizes
      .map((size, n) => {
        const end = start + size,
          a = (start * Math.PI) / 180,
          b = (end * Math.PI) / 180,
          m = ((start + size / 2) * Math.PI) / 180,
          path = `M150 150L${150 + 132 * Math.cos(a)} ${150 + 132 * Math.sin(a)}A132 132 0 ${size > 180 ? 1 : 0} 1 ${150 + 132 * Math.cos(b)} ${150 + 132 * Math.sin(b)}Z`,
          tx = 150 + 88 * Math.cos(m),
          ty = 154 + 88 * Math.sin(m),
          text = revised
            ? `<text x="${tx}" y="${ty}" text-anchor="middle" fill="#f2e2bc" font-size="13"><tspan x="${tx}" dy="-6">${WHEEL_SECTORS[n].label}</tspan><tspan x="${tx}" dy="16">+${WHEEL_SECTORS[n].value * 100}%</tspan></text>`
            : `<text x="${tx}" y="${ty}" text-anchor="middle" fill="#f2e2bc" font-size="${size < 30 ? 11 : 14}">${labels[n]}</text>`;
        start = end;
        return `<path d="${path}" fill="${colors[n]}" stroke="#e0c58b" stroke-width="2"/>${text}`;
      })
      .join('');
    const timed = revised && !!this.wheel;
    return `<svg class="fate-wheel-art" viewBox="0 0 300 300" aria-label="${revised ? '命运轮盘，生命攻击防御交替排列，六格等概率' : '命运轮盘，装备50%，点数30%，治疗15%，反噬5%'}"><g class="wheel-rotor" ${timed ? 'data-timed-wheel' : ''} style="--wheel-angle:${angle}deg;${timed ? `transform:rotate(${this.wheelAngle(angle, elapsed)}deg);--wheel-counter-angle:${-this.wheelAngle(angle, elapsed)}deg` : ''}">${segments}</g><circle cx="150" cy="150" r="28" fill="#24373b" stroke="#d7b66d" stroke-width="3"/><text x="150" y="155" text-anchor="middle" font-size="16" fill="#e2c684">命运</text><path d="M139 4H161L150 29Z" fill="#372c1c" stroke="#ead4a4" stroke-width="2"/></svg>`;
  }
  private wheelAngle(angle: number, elapsed: number) {
    const progress = Math.min(1, Math.max(0, elapsed / WHEEL_SECONDS));
    return angle * (this.motion.reduced ? 1 : 1 - (1 - progress) ** 3);
  }
  private wheelDecision() {
    const w = this.wheel!;
    const dialog = document.getElementById('decision-sheet') as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
    dialog.classList.add('wheel-dialog');
    if (this.changed('decision', `wheel|${w.started}|${w.ready}|${this.game.state.speed}`))
      document.getElementById('decision')!.innerHTML =
        `<h2 id="decision-title">命运轮盘</h2>${this.wheelGraphic(w.angle, this.game.state.run.wheel?.elapsed ?? 0)}<p class="wheel-result" role="status">${w.ready ? esc(w.result) : '转动中…'}</p><button class="primary-button" data-action="wheel-confirm" ${w.ready ? '' : 'disabled'}>${w.ready ? '领取祝福' : '命运流转'}</button>`;
    const rotor = dialog.querySelector<SVGElement>('[data-timed-wheel]');
    if (rotor) {
      const angle = this.wheelAngle(w.angle, this.game.state.run.wheel!.elapsed);
      rotor.style.transform = `rotate(${angle}deg)`;
      rotor.style.setProperty('--wheel-counter-angle', `${-angle}deg`);
    }
  }
  private resonancePulse(id: string) {
    // Contribution tags do not mean a resonance skill fired. Only pulse the actual source.
    if (!id.startsWith('resonance:')) return;
    const key = id.slice(10);
    this.motion.pulse(
      document.querySelector(`[data-inspect-resonance="${key}"]`),
      'resonance-fired',
      650,
    );
  }

  private attackStyle(id?: string, profession = this.game.state.run.profession): AttackStyle {
    const item = id ? this.game.findItem(id) : null;
    const family = item ? equipmentFamily(item) : '';
    if (family === 'spear') return 'thrust';
    if (family === 'ranged') return 'bolt';
    if (family === 'sword') return 'slash';
    if (family === 'support' && item?.profession === 'rogue') return 'poison';
    if (['staff', 'focus', 'support'].includes(family)) return 'arcane';
    return profession === 'mage' ? 'arcane' : profession === 'rogue' ? 'bolt' : 'slash';
  }
  private enemyAttackStyle(source?: string): AttackStyle {
    if (source?.startsWith('minion:')) return 'slash';
    const id = this.game.state.combat.runtime?.enemyId ?? this.game.state.enemy?.templateId;
    return id === 'archer'
      ? 'bolt'
      : ['wraith', 'dragon'].includes(id ?? '')
        ? 'arcane'
        : ['spider', 'queen'].includes(id ?? '')
          ? 'poison'
          : 'slash';
  }
  private feedback() {
    const fresh = this.game.feedback.filter((f) => f.serial > this.lastFeedback);
    if (!fresh.length) return;
    this.lastFeedback = fresh[fresh.length - 1].serial;
    this.sounds.feedback(this.game, fresh);
    const totals = new Map<string, { kind: string; amount: number; id: string }>();
    const fired = new Set<string>();
    const activated = new Set<string>();
    for (const f of fresh) {
      if (f.kind === 'activation') {
        activated.add(f.id);
        continue;
      }
      if (f.kind === 'trigger') {
        fired.add(f.id);
        continue;
      }
      const key = `${f.id}|${f.kind}`;
      const last = totals.get(key);
      totals.set(key, { kind: f.kind, amount: (last?.amount ?? 0) + f.amount, id: f.id });
    }
    for (const id of fired) {
      this.pack.pulse(id);
      this.resonancePulse(id);
      if (id.startsWith('tome:'))
        this.motion.pulse(document.getElementById('combat-hud'), 'tome-fired', 500);
    }
    for (const id of activated) {
      if (id.startsWith('minion:')) {
        this.motion.pulse(document.querySelector(`[data-minion="${id}"]`), 'minion-attacking', 260);
        continue;
      }
      if (isEnemySource(id)) {
        const rig = this.motion.rig('enemy');
        if (rig) rig.dataset.activationSource = id;
        const style = this.enemyAttackStyle(id);
        this.motion.act('enemy', style);
        if (['arcane', 'bolt', 'poison'].includes(style))
          this.motion.projectile(rig, 'hero', style);
        continue;
      }
      const source = this.game.state.combat.runtime?.sources.find((s) => s.id === id);
      if (
        totals.has(`${id}|damage`) ||
        source?.skills.some(
          (s) =>
            s.cooldown > 0 && s.actions.some((a) => a.kind === 'damage' || a.kind === 'status'),
        )
      ) {
        const rig = this.motion.rig('hero');
        if (rig) rig.dataset.activationSource = id;
        this.motion.act('hero', this.attackStyle(id, this.game.state.run.profession));
        if (
          !totals.has(`${id}|damage`) &&
          ['arcane', 'bolt', 'poison'].includes(this.attackStyle(id))
        ) {
          const style = this.attackStyle(id, this.game.state.run.profession);
          this.motion.projectile(rig, 'enemy', style);
        }
      }
    }
    for (const f of totals.values()) {
      const style = this.attackStyle(f.id);
      const side =
        f.kind === 'damage' || (f.kind === 'healing' && isEnemySource(f.id)) ? 'enemy' : 'hero';
      if (f.kind === 'damage') {
        // Periodic damage and retaliation still hit, but do not impersonate a weapon cast.
        if (activated.has(f.id) && ['arcane', 'bolt', 'poison'].includes(style))
          this.motion.projectile(this.motion.rig('hero'), 'enemy', style);
        this.motion.hit('enemy', style);
      } else if (f.kind === 'hurt') this.motion.hit('hero', this.enemyAttackStyle());
      else if (f.kind === 'healing') this.motion.effect(side, 'heal');
      else if (f.kind === 'shield' || f.kind === 'blocked') this.motion.effect('hero', 'shield');
      this.motion.number(side, f.kind, f.amount);
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
    container.classList.toggle(
      'resonance-picker',
      ['initial', 'reward'].includes(s.phase) && s.run.rewards[0]?.kind === 'resonance',
    );
    container.classList.toggle(
      'dig-dialog',
      s.phase === 'event' && this.game.currentEvent()?.kind === 'dig',
    );
    const isTrial =
      s.phase === 'event' && ['elite', 'boss'].includes(this.game.currentEvent()!.kind);
    container.classList.toggle('trial-dialog', isTrial);
    if (isTrial && this.trialNode !== s.run.index) {
      this.trialNode = s.run.index;
      this.selectedTrial = 0;
    }
    const needed =
      ['event', 'reward', 'initial'].includes(s.phase) &&
      (s.run.routeRevision !== 16 || !this.journeyPlaying) &&
      !(s.phase === 'event' && s.run.supply && s.run.supply.elapsed < SUPPLY_SECONDS);
    if (!needed) {
      if (container.open) container.close();
      return;
    }
    if (!this.changed('decision', s.phase + '|' + s.revision + '|' + this.selectedTrial)) {
      if (!container.open) container.showModal();
      return;
    }
    if (isTrial) {
      el.innerHTML = trialView(s, this.selectedTrial);
      if (!container.open) container.showModal();
      return;
    }
    let title = '',
      body = '',
      narrative = '';
    if (['initial', 'reward'].includes(s.phase)) {
      const r = s.run.rewards[0];
      title = r.title;
      body =
        r.kind === 'resonance'
          ? resonanceCandidates(
              s,
              r,
              !r.refreshUsed &&
                this.game
                  .resonanceChoices(s.phase === 'initial')
                  .some((k) => !r.resonances.includes(k)),
            )
          : `<div class="choice-grid">${r.buffs
              .map(
                (k, n) =>
                  `<button class="reward-card" data-reward="${n}"><strong>${BUFFS[k].name}</strong><p>${BUFFS[k].description}</p></button>`,
              )
              .join(
                '',
              )}</div><button class="text-button" data-action="skip-reward">离开祭坛</button>`;
    }
    if (s.phase === 'event') {
      const e = this.game.currentEvent()!;
      title = EVENT_NAMES[e.kind];
      narrative = eventStory(e.kind, e.variant, runRoute(s).hasExtreme);
      if (e.kind === 'supply' && s.run.routeRevision === 16) {
        const great = s.run.supply!.result === 'great';
        title = great ? '大吉补给' : '旅人补给';
        narrative = `${great ? '旅人寻到了三件更珍贵的装备' : '旅人留下了三件备用装备'}，愿它们助你平安归来。领取补给，整理行囊后继续前行。`;
        body = '<button class="primary-button" data-event="take">确认</button>';
      } else if (e.kind === 'treasure' && s.run.routeRevision === 16)
        body = `<div class="event-actions"><button class="danger-button" data-event="open">消耗 ${lifeAmount(s.player.hp * 0.1)} 生命，取出装备</button><button data-event="skip">离开</button></div>`;
      else if (e.kind === 'treasure' || e.kind === 'supply')
        body = `<button class="primary-button" data-event="${e.kind === 'treasure' ? 'open' : 'take'}">${e.kind === 'treasure' ? '打开宝箱' : '接受补给'}</button>`;
      if (e.kind === 'rest')
        body = `<div class="spring-health" role="group" aria-label="当前生命"><div><strong>当前生命</strong><span>${lifeAmount(s.player.hp)} / ${lifeAmount(s.player.maxHp)}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, (s.player.hp / s.player.maxHp) * 100))}%"></i></div></div><div class="choice-grid"><button class="reward-card" data-event="heal"><strong>饮下月泉</strong><p>恢复最大生命的${SPRING_HEAL * 100}%</p></button><button class="reward-card" data-event="vigor" ${s.run.routeRevision !== 16 && s.run.buffs.vitality >= 3 ? 'disabled' : ''}><strong>凝聚泉华</strong><p>${s.run.routeRevision === 16 ? `最大生命 +${SPRING_MAX_LIFE * 100}%` : BUFFS.vitality.description}</p></button></div>`;
      if (e.kind === 'dig') body = this.digBoard();
      if (e.kind === 'choice')
        body =
          e.variant === 2
            ? `<div class="choice-grid"><button class="reward-card" data-event="heal"><strong>饮用泉水</strong><p>恢复最大生命的30%</p></button><button class="reward-card" data-event="vigor"><strong>锻炼体魄</strong><p>最大生命 +18</p></button></div>`
            : `<div class="choice-grid"><button class="reward-card" data-event="risk" ${s.player.hp <= Math.ceil(s.player.hp * 0.15) ? 'disabled' : ''}><strong>${e.variant === 1 ? '取出遗物' : '解开封印'}</strong><p>消耗15%当前生命，${e.variant === 1 ? '获得三件装备' : e.variant === 3 ? '防御 +2' : e.variant === 4 ? '随机基础属性成长' : '攻击 +8%'}</p></button><button class="reward-card" data-event="skip"><strong>安全离开</strong><p>继续前行</p></button></div>`;
      if (e.kind === 'graduation')
        body = `<div class="choice-grid"><button class="reward-card" data-event="graduate"><strong>完成培养</strong><p>保存当前勇者，成功结业</p></button>${runRoute(s).hasExtreme ? '<button class="reward-card" data-event="extreme"><strong>挑战极限</strong><p>继续迎战更强魔物，成功后额外战力与双倍金币</p></button>' : ''}</div>`;
      if (e.kind === 'mentor')
        body = '<button class="primary-button" data-event="learn">接受传授</button>';
      if (e.kind === 'ending')
        body = '<button class="primary-button" data-event="finish">整理最终行囊</button>';
      if (e.kind === 'chance' && s.run.routeRevision === 16) {
        title = chanceName(e.variant);
        body = `${this.wheelGraphic()}<div class="event-actions"><button class="danger-button" data-event="spin">献祭 ${lifeAmount(s.player.hp * 0.15)} 生命</button><button data-event="skip">离开</button></div>`;
      } else if (e.kind === 'chance')
        body =
          e.variant === 0
            ? `${this.wheelGraphic()}<p>50% 高阶装备 · 30% 点数 · 15% 治疗 · 5% 反噬</p><div class="event-actions"><button class="primary-button" data-event="spin">转动轮盘</button><button data-event="skip">离开</button></div>`
            : `<div class="event-actions"><button class="danger-button" data-event="sacrifice" ${s.player.hp <= Math.ceil(s.player.maxHp * 0.15) ? 'disabled' : ''}>献祭 ${Math.ceil(s.player.maxHp * 0.15)} 生命</button><button data-event="skip">离开</button></div>`;
    }
    el.innerHTML = `<h2 id="decision-title">${esc(title)}</h2>${narrative ? `<p class="event-narrative">${esc(narrative)}</p>` : ''}${body}`;
    container.setAttribute('aria-label', title);
    container.setAttribute('aria-labelledby', 'decision-title');
    if (!container.open) container.showModal();
  }

  private digBoard() {
    const d = this.game.state.run.dig!;
    const finished = d.shovels === 0 || d.claimed.length === d.equipment.length;
    return `<div class="dig-status" role="status">${uiIcon('dig')}<strong>剩余挖掘 ${d.shovels} 次</strong></div><div class="dig-board ${finished ? 'dig-finished' : ''}">${Array.from({ length: 16 }, (_, n) => `<button class="dig-cell soil-${n % 4} ${d.revealed.includes(n) ? 'revealed' : ''} ${n === this.digFeedbackCell && Date.now() < this.digFeedbackUntil ? 'dig-struck' : ''}" data-event="dig-${n}" aria-label="${d.revealed.includes(n) ? '已挖掘' : '挖掘'}第${n + 1}格" ${d.revealed.includes(n) || finished ? 'disabled' : ''}><span class="soil-stone" aria-hidden="true"></span></button>`).join('')}${d.placements
      .map((p) => {
        const item = d.equipment.find((i) => i.id === p.id)!,
          dim = dimensions(item, p),
          revealed = cells(item, p.rotation).filter(([x, y]) =>
            d.revealed.includes((p.y + y) * 4 + p.x + x),
          );
        return `<svg class="dig-piece ${d.claimed.includes(item.id) ? 'dig-found' : ''}" viewBox="0 0 ${dim.w * 100} ${dim.h * 100}" style="left:${p.x * 25}%;top:${p.y * 25}%;width:${dim.w * 25}%;height:${dim.h * 25}%;--item-color:${QUALITIES[item.quality].color};--item-fill:${QUALITIES[item.quality].color}44"><defs><clipPath id="dig-${item.id}">${revealed.map(([x, y]) => `<rect x="${x * 100}" y="${y * 100}" width="100" height="100"/>`).join('')}</clipPath></defs><g clip-path="url(#dig-${item.id})"><path class="item-outline" d="${shapePath(cells(item, p.rotation))}"/>${itemPainting(item, p.rotation, 'dig')}</g></svg>`;
      })
      .join(
        '',
      )}</div><button class="primary-button" data-event="dig-finish">${finished ? '结束挖宝' : '离开挖掘地'}</button>`;
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
      `<section class="graduation-spotlight"><h1>${r.outcome === 'win' ? '培养完成' : '冒险结束'}</h1><div class="summary-scene">${heroArt(h.profession, h.appearance)}<div class="summary-identity"><h2>${esc(h.name)}</h2>${professionIcon(h.profession)}<div class="summary-realm" aria-label="最终境界"><small>最终境界</small><strong>${realmName(h.realm)}</strong><span>${h.stages} 次试炼晋升</span></div></div></div><div class="summary-score"><strong class="hero-rating rating-${h.rating}" aria-label="战力评级 ${h.rating}">${h.rating}</strong><b class="final-power">最终战力 ${h.power}</b></div><div class="graduate-resonances" aria-label="最终共鸣">${resonances}</div><div class="summary-stats"><span>攻击 <b>${h.stats.attack}</b></span><span>生命 <b>${h.stats.hp}</b></span><span>防御 <b>${h.stats.defense}</b></span><span>速度 <b>${h.stats.speed}</b></span></div><div class="summary-record"><strong>第 ${h.chapter} 关 · ${archiveOutcome(h)}</strong><p>${h.completed}/${s.run.extreme ? h.routeLength : h.normalLength} 步 · ${h.stages}/3 次试炼通过</p><b>${r.outcome === 'win' ? `金币 +${r.gold} · 勋章 +${r.medals ?? 0}` : `勇者已加入公会 · 勋章 +${r.medals ?? 0}`}</b></div><button data-action="hero-details">查看最终装备与档案</button><button class="primary-button" data-action="selection">返回公会</button></section>`;
  }
  private fit() {
    const v = window.visualViewport,
      w = v?.width ?? window.innerWidth,
      h = v?.height ?? window.innerHeight,
      { mobile, scale, frameWidth, frameHeight, contentWidth, contentHeight } = viewportFit(w, h);
    this.root.classList.toggle('mobile-frame', mobile);
    document.documentElement.style.setProperty('--game-scale', String(scale));
    document.documentElement.style.setProperty('--game-width', `${frameWidth}px`);
    document.documentElement.style.setProperty('--game-height', `${frameHeight}px`);
    document.documentElement.style.setProperty(
      '--game-left',
      `${(frameWidth - contentWidth) / 2}px`,
    );
    document.documentElement.style.setProperty(
      '--game-top',
      `${(frameHeight - contentHeight) / 2}px`,
    );
  }
  private guildBonusText(b: import('./types').GuildBonus) {
    const text = (name: string, fixed: number, percent: number) =>
      `${name}＋${fixed} / ＋${Math.round(percent * 100)}%`;
    return [
      text('攻击', b.attack, b.attackPercent),
      text('生命', b.hp, b.hpPercent),
      text('防御', b.defense, b.defensePercent),
    ].join(' · ');
  }
  private guildPanel() {
    const s = this.game.state,
      conditions = guildConditions(s),
      ready = conditions.length && conditions.every((c) => c.value >= c.target);
    this.modal(
      `<h2>冒险公会 Lv.${s.meta.guildLevel}</h2><p>升级开放增益路线</p>${conditions.map((c) => `<p class="${c.value >= c.target ? 'reached' : 'muted'}">${c.value >= c.target ? '✓' : '○'} ${c.label} · ${Math.min(c.value, c.target)}/${c.target}</p>`).join('')}<button data-action="upgrade-guild" class="primary-button" ${!ready ? 'disabled' : ''}>${conditions.length ? '升级公会' : '已达最高等级'}</button>${ready ? '<button data-action="upgrade-guild-all" class="secondary-button">连续升级至当前可达等级</button>' : ''}<button data-action="guild-tree" class="secondary-button">查看增益路线</button>`,
    );
  }
  private guildTotal() {
    const s = this.game.state,
      b = guildBenefits(s.meta.guildPurchased);
    this.modal(
      `<h2>公会累计增益</h2><div class="guild-bonus-total"><p>攻击 <b>＋${b.attack} / ＋${Math.round(b.attackPercent * 100)}%</b></p><p>生命 <b>＋${b.hp} / ＋${Math.round(b.hpPercent * 100)}%</b></p><p>防御 <b>＋${b.defense} / ＋${Math.round(b.defensePercent * 100)}%</b></p><p>初始分配点 <b>${12 + b.points}</b></p></div><button data-action="guild-tree" class="secondary-button">返回增益路线</button>`,
    );
    document.getElementById('modal')!.classList.add('guild-total-modal');
  }
  private guildFeature() {
    const s = this.game.state;
    const panel = document.getElementById('guild-feature-screen')!;
    panel.classList.toggle('expedition-page', this.homeView === 'expedition');
    if (this.homeView === 'expedition') {
      panel.classList.remove('guild-route-page', 'library-page');
      this.expedition.render(s);
      if (this.statusSide && (document.getElementById('modal') as HTMLDialogElement).open) {
        const view = this.expedition.battleState(s);
        if (view)
          document.getElementById('modal-body')!.innerHTML = statusDetails(view, this.statusSide);
      }
      return;
    }
    const key = `${this.homeView}|${s.revision}|${this.libraryFilter}|${this.guildSelectedNode}`;
    if (!this.changed('guild-feature', key)) return;
    const before = panel.querySelector('.guild-route-scroll')?.scrollTop;
    panel.classList.toggle('guild-route-page', this.homeView === 'guild-tree');
    panel.classList.toggle('library-page', this.homeView === 'library');
    panel.innerHTML =
      this.homeView === 'library'
        ? libraryView(s.meta, this.libraryFilter)
        : guildRouteView(s.meta, this.guildSelectedNode);
    const scroll = panel.querySelector('.guild-route-scroll');
    if (scroll && before !== undefined) scroll.scrollTop = before;
  }
  private guildRoute(selected?: number, retainScroll = false) {
    if (this.game.state.phase !== 'home') return;
    const previous = document.querySelector('.guild-route-scroll')?.scrollTop;
    this.close();
    this.guildSelectedNode = Math.max(
      0,
      Math.min(
        selected ??
          (this.homeView === 'guild-tree'
            ? this.guildSelectedNode
            : this.game.state.meta.guildPurchased),
        GUILD_NODES.length - 1,
      ),
    );
    this.homeView = 'guild-tree';
    this.keys['guild-feature'] = '';
    this.render();
    const scroll = document.querySelector('.guild-route-scroll')!;
    if (retainScroll && previous !== undefined) scroll.scrollTop = previous;
    else
      scroll.scrollTop = Math.max(
        0,
        GUILD_LAYOUT.positions[this.guildSelectedNode].y - scroll.clientHeight / 2 + 15,
      );
  }
  private library() {
    if (this.game.state.phase !== 'home') return;
    this.close();
    this.homeView = 'library';
    this.keys['guild-feature'] = '';
    this.render();
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
        '<div class="audio-options"><button data-action="audio-music" aria-pressed="' +
        this.audio.settings.music +
        '">探索音乐：' +
        (this.audio.settings.music ? '开' : '关') +
        '</button><button data-action="audio-effects" aria-pressed="' +
        this.audio.settings.effects +
        '">探索音效：' +
        (this.audio.settings.effects ? '开' : '关') +
        '</button>' +
        (!this.audio.supported
          ? '<small>当前浏览器暂不支持声音播放</small>'
          : this.audio.failed
            ? '<button class="audio-retry" data-action="audio-retry">重试音频加载</button>'
            : '') +
        '</div>' +
        (['opening', 'initial', 'camp', 'journey', 'event', 'reward'].includes(
          this.game.state.phase,
        )
          ? '<button data-action="retreat">结束培养</button>'
          : '') +
        '<div class="toolbar"><button data-action="export">导出存档</button><label class="import-label">导入存档<input id="import-file" type="file" accept=".json"></label><button class="danger-button" data-action="reset">清空公会进度</button></div>',
    );
  }
  private modal(html: string, skin?: 'event' | 'guild') {
    this.hideTalent();
    document
      .getElementById('modal')!
      .classList.remove(
        'archive-modal',
        'tome-modal',
        'guild-total-modal',
        'battle-status-modal',
        'resonance-detail-modal',
        'resonance-pack-modal',
      );
    document.getElementById('modal-body')!.innerHTML = html;
    const dialog = document.getElementById('modal') as HTMLDialogElement;
    dialog.dataset.skin =
      skin ??
      (['home', 'chapter', 'configure', 'tome', 'summary'].includes(this.game.state.phase)
        ? 'guild'
        : 'event');
    dialog.setAttribute('aria-label', dialog.querySelector('h2')?.textContent ?? '详情');
    if (!dialog.open) dialog.showModal();
  }
  private close() {
    (document.getElementById('modal') as HTMLDialogElement).close();
    document
      .getElementById('modal')!
      .classList.remove(
        'archive-modal',
        'tome-modal',
        'guild-total-modal',
        'battle-status-modal',
        'resonance-detail-modal',
        'resonance-pack-modal',
      );
    this.inspectedTome = null;
    this.statusSide = null;
  }
  private hideTalent() {
    this.talentBubble?.remove();
    this.talentBubble = null;
    this.root.querySelectorAll('[data-inspect-talent]').forEach((el) => {
      el.setAttribute('aria-expanded', 'false');
      el.removeAttribute('aria-describedby');
    });
  }
  private inspectTalent(key: TalentKey, button: HTMLElement) {
    if (button.getAttribute('aria-expanded') === 'true') {
      this.hideTalent();
      return;
    }
    this.hideTalent();
    const talent = TALENTS[key];
    const bubble = document.createElement('div');
    bubble.className = 'talent-detail-bubble quality-' + (talent.quality ?? 'blue');
    bubble.id = 'talent-description';
    bubble.setAttribute('role', 'tooltip');
    bubble.innerHTML = `<strong>${esc(talent.name)}</strong><p>${esc(talent.description)}</p>`;
    this.root.parentElement!.append(bubble);
    const box = button.getBoundingClientRect(),
      view = window.visualViewport;
    const width = view?.width ?? innerWidth,
      height = view?.height ?? innerHeight;
    const rect = bubble.getBoundingClientRect();
    bubble.style.left = `${Math.max(8, Math.min(width - rect.width - 8, box.right - rect.width))}px`;
    bubble.style.top = `${Math.max(8, Math.min(height - rect.height - 8, box.bottom + 8))}px`;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', bubble.id);
    this.talentBubble = bubble;
  }
  toast(message: string) {
    const el = document.getElementById('toast')!;
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
  }
  persist() {
    try {
      saveGame(this.game.state);
    } catch (error) {
      this.toast('保存未完成，旧进度已保留；请导出当前进度。');
      console.error('保存校验失败', error);
    }
  }
  replace(game: Game) {
    this.resourceEpoch++;
    this.resourceTask = this.resourceFailed = this.resourcesBlocked = false;
    this.resourceDialog?.close();
    this.expedition.reset();
    this.recycling?.cleanup();
    this.recycling = null;
    this.pack.setLocked(false);
    delete this.root.dataset.recycling;
    this.motion.reset();
    this.sounds.reset();
    this.hideTalent();
    this.statusSide = null;
    this.trialNode = -1;
    this.game = game;
    this.pack.replace(game);
    this.wheel = null;
    this.homeView = 'guild';
    this.archiveHero = null;
    this.inspectedTome = null;
    this.libraryFilter = 'all';
    this.guildSelectedNode = 0;
    this.rosterPage = 0;
    this.profession = game.state.run.profession;
    this.keys = {};
    this.phase = '';
    this.journeyScroll = 0;
    this.journeyRendered = [];
    this.journeyQueue = [];
    this.journeyNext = 0;
    this.journeyActiveUntil = 0;
    this.transitionUntil = 0;
    this.resultNode = -1;
    this.transitionNode = -1;
    this.footerReady = false;
    this.reforgeReady = false;
    this.journeyFollow = true;
    this.journeyFlow = '';
    this.resonanceTiers = {};
    this.journeyVisible = false;
    this.lastFeedback = 0;
    this.render();
  }
}
