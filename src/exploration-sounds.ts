import type { ExplorationAudio } from './audio';
import type { SoundId } from './audio-assets';
import type { Game } from './game';
import type { GameState } from './types';
import { equipmentFamily } from './categories';
import { isEnemySource } from './combat';
import { WHEEL_SECONDS } from './event-rules';

export const exploring = (phase: GameState['phase']) =>
  ['opening', 'initial', 'camp', 'journey', 'combat', 'event', 'awakening', 'reward'].includes(
    phase,
  );
export function attackSound(game: Game, source?: string, enemy = false): SoundId {
  if (enemy) {
    const id = game.state.combat.runtime?.enemyId ?? game.state.enemy?.templateId;
    if (source?.startsWith('minion:')) return 'explore-melee-hit';
    return id === 'archer'
      ? 'explore-crossbow'
      : ['wraith', 'dragon'].includes(id ?? '')
        ? 'explore-magic-hit'
        : ['spider', 'queen'].includes(id ?? '')
          ? 'explore-poison'
          : 'explore-melee-hit';
  }
  const item = source ? game.findItem(source) : null;
  const family = item ? equipmentFamily(item) : '';
  if (family === 'ranged') return 'explore-crossbow';
  if (family === 'support' && item?.profession === 'rogue') return 'explore-poison';
  if (['staff', 'focus', 'support'].includes(family) || source?.startsWith('tome:'))
    return 'explore-magic-hit';
  if (family === 'sword' || family === 'spear') return 'explore-melee-hit';
  return game.state.run.profession === 'mage' ? 'explore-magic-hit' : 'explore-melee-hit';
}
interface Snapshot {
  phase: GameState['phase'];
  run: number;
  index: number;
  hp: number;
  maxHp: number;
  shield: number;
  enemyShield: number;
  points: number;
  round: number;
  history: number;
  ids: Set<string>;
  resonances: number;
  spinning: boolean;
  digClaims: number;
}
/** Observe displayed changes once. Never modify simulation, play old logs, or queue missed sounds. */
export class ExplorationSounds {
  private previous: Snapshot | null = null;
  private pendingLoot = false;
  constructor(private audio: Pick<ExplorationAudio, 'effect' | 'wheel' | 'setScene' | 'stopAll'>) {}
  reset() {
    this.previous = null;
    this.pendingLoot = false;
    this.audio.stopAll();
  }
  sync(game: Game, packVisible: boolean, legacyWheel?: { ready: boolean } | null) {
    const s = game.state,
      previous = this.previous;
    if (previous && !exploring(s.phase) && s.phase !== 'summary' && previous.phase !== s.phase)
      this.audio.stopAll();
    const spinning =
      (!!s.run.wheel && s.run.wheel.elapsed < WHEEL_SECONDS) ||
      (!!legacyWheel && !legacyWheel.ready);
    this.audio.setScene(exploring(s.phase), s.phase === 'combat' || s.phase === 'awakening');
    this.audio.wheel(spinning);
    const ids = new Set([...s.inventory, ...s.run.starterOffers].map((i) => i.id));
    if (previous && previous.run === s.meta.runs) {
      const active = exploring(s.phase);
      const transitioned = previous.phase !== s.phase;
      if (previous.phase === 'combat' && transitioned && ['camp', 'summary'].includes(s.phase)) {
        this.audio.effect(s.lastReport?.won ? 'explore-victory' : 'explore-defeat');
        if ((s.lastReport?.recovery ?? 0) > 0) this.audio.effect('explore-heal');
      } else if (s.phase === 'summary' && transitioned && exploring(previous.phase))
        this.audio.effect(s.run.summary?.outcome === 'win' ? 'explore-victory' : 'explore-defeat');
      if (active) {
        if (s.phase === 'awakening' && transitioned) this.audio.effect('explore-promotion');
        if (s.run.resonances.length > previous.resonances) this.audio.effect('explore-resonance');
        const history = s.run.journey.slice(previous.history);
        if (history.some((l) => ['主动重铸', '回收未入包装备'].includes(l.title)))
          this.audio.effect('explore-reforge');
        const redeemed = previous.points - s.run.points >= 6;
        if (redeemed) this.audio.effect('explore-reforge');
        if (history.some((l) => l.kind === 'growth') && s.phase !== 'awakening')
          this.audio.effect('explore-event-gain');
        if (
          s.phase !== 'combat' &&
          previous.phase !== 'combat' &&
          s.player.hp > previous.hp &&
          s.player.maxHp === previous.maxHp
        )
          this.audio.effect('explore-heal');
        if (previous.spinning && !spinning) this.audio.effect('explore-event-gain');
        const digClaims = s.run.dig?.claimed.length ?? 0;
        if (s.phase === 'event' && digClaims > previous.digClaims)
          this.audio.effect('explore-event-gain');
        const added = [...ids].some((id) => !previous.ids.has(id));
        if (added && !redeemed && !(s.phase === 'event' && game.currentEvent()?.kind === 'dig'))
          this.pendingLoot = true;
        if (this.pendingLoot && packVisible && s.phase !== 'combat') {
          this.audio.effect('explore-chest-open');
          this.pendingLoot = false;
        }
        if (s.phase === 'combat' && !game.skippingCombat()) {
          if (
            (previous.shield > 0 && s.player.shield <= 0) ||
            (previous.enemyShield > 0 && (s.combat.runtime?.enemy.shield ?? 0) <= 0)
          )
            this.audio.effect('explore-shield-break');
          if (previous.round < 10 && s.combat.round >= 10 && !game.skippingCombat())
            this.audio.effect('explore-boss-warning');
        }
      } else this.pendingLoot = false;
    }
    this.previous = {
      phase: s.phase,
      run: s.meta.runs,
      index: s.run.index,
      hp: s.player.hp,
      maxHp: s.player.maxHp,
      shield: s.player.shield,
      enemyShield: s.combat.runtime?.enemy.shield ?? 0,
      points: s.run.points,
      round: s.combat.round,
      history: s.run.journey.length,
      ids,
      resonances: s.run.resonances.length,
      spinning,
      digClaims: s.run.dig?.claimed.length ?? 0,
    };
  }
  feedback(game: Game, fresh: Game['feedback']) {
    if (game.skippingCombat()) return;
    const sounds = new Set<SoundId>();
    const enemySource = fresh.find((f) => f.kind === 'activation' && isEnemySource(f.id))?.id;
    for (const f of fresh) {
      if (!(f.amount > 0)) continue;
      if (f.kind === 'damage') sounds.add(attackSound(game, f.id));
      if (f.kind === 'hurt' || f.kind === 'blocked')
        sounds.add(attackSound(game, enemySource, true));
      if (f.kind === 'activation') {
        const item = game.findItem(f.id);
        if (item && item.profession === 'rogue' && equipmentFamily(item) === 'support')
          sounds.add('explore-poison');
      }
      if (f.kind === 'healing') sounds.add('explore-heal');
      if (f.kind === 'shield') sounds.add('explore-shield-gain');
      if (f.kind === 'trigger' && f.id.startsWith('resonance:')) sounds.add('explore-resonance');
    }
    for (const sound of sounds) this.audio.effect(sound, game.state.speed);
  }
}
