/** Presentation only. Audio failures never block an action or change the save. */
import { audioEntries, type AudioId, type SoundId } from './audio-assets';
import { ResourceLoader, type ResourceActivity } from './resource-loader';
import { resourceDeadline } from './resource-deadline';
import { pageMediaCache } from './page-media-cache';

export const AUDIO_SETTINGS_KEY = 'guild-exploration-audio-v1';
export interface AudioSettings {
  music: boolean;
  effects: boolean;
}
export interface AudioEnvironment {
  createContext: (() => AudioContext) | null;
  entries: { id: AudioId; url: string }[];
  fetch: typeof globalThis.fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  hidden: () => boolean;
}
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  id: AudioId;
}
function browserEnvironment(): AudioEnvironment {
  const host =
    typeof window !== 'undefined'
      ? (window as Window & {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        })
      : null;
  const Context = host?.AudioContext ?? host?.webkitAudioContext;
  let storage: Storage | undefined;
  try {
    storage = host?.localStorage;
  } catch {}
  return {
    createContext: Context ? () => new Context() : null,
    entries: audioEntries(),
    fetch: (input, init) =>
      pageMediaCache.response(input instanceof Request ? input.url : String(input), init),
    storage,
    hidden: () => typeof document !== 'undefined' && document.hidden,
  };
}
export class ExplorationAudio {
  settings: AudioSettings = { music: true, effects: true };
  private context: AudioContext | null = null;
  private buffers = new Map<AudioId, AudioBuffer>();
  private downloads: ResourceLoader<AudioBuffer>;
  private voices = new Set<Voice>();
  private cooldowns = new Map<SoundId, number>();
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private musicVoices = new Set<Voice>();
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private wheelVoice: Voice | null = null;
  private active = false;
  private duck = false;
  private wantsWheel = false;
  private unlocked = false;
  private epoch = 0;
  private musicRetry: Promise<void> | null = null;
  private lastMusicRetry = -Infinity;
  private lastPrime = -Infinity;
  failed = 0;
  constructor(private env = browserEnvironment()) {
    // Two sounds plus four images at most: avoid a 25-request audio burst at startup.
    this.downloads = new ResourceLoader(
      async (url, stage) => {
        const context = this.getContext();
        if (!context) throw new Error('音频不可用');
        const entry = this.env.entries.find((entry) => entry.url === url)!;
        const abort = new AbortController();
        const bytes = await resourceDeadline(
          async () => {
            const response = await this.env.fetch(url, { signal: abort.signal });
            if (!response.ok) throw new Error('音频下载失败');
            return response.arrayBuffer();
          },
          entry.id === 'exploration-bgm' ? 60_000 : 30_000,
          '音频下载超时',
          () => abort.abort(),
        );
        stage('decoding');
        const buffer = await resourceDeadline(
          () => context.decodeAudioData(bytes),
          15_000,
          '音频解码超时',
        );
        this.buffers.set(entry.id, buffer);
        return buffer;
      },
      2,
      2,
      { retries: 1 },
    );
    try {
      const saved = JSON.parse(env.storage?.getItem(AUDIO_SETTINGS_KEY) ?? 'null');
      if (saved && typeof saved.music === 'boolean' && typeof saved.effects === 'boolean')
        this.settings = { music: saved.music, effects: saved.effects };
    } catch {}
  }
  get supported() {
    return !!this.env.createContext;
  }
  get readyCount() {
    return this.buffers.size;
  }
  get resourceCount() {
    return this.supported ? this.env.entries.length : 0;
  }
  get diagnostics() {
    return {
      state: this.context?.state ?? 'unavailable',
      ready: this.readyCount,
      music: this.musicVoices.size,
      effects: this.voices.size,
      wheel: !!this.wheelVoice,
      musicReady: this.buffers.has('exploration-bgm'),
      musicEnabled: this.settings.music,
      unlocked: this.unlocked,
      active: this.active,
      failed: this.failed,
    };
  }
  private getContext() {
    if (!this.context && this.env.createContext) {
      try {
        this.context = this.env.createContext();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.gain.value = 0.28;
        this.effectsBus.gain.value = 0.5;
        this.musicBus.connect(this.context.destination);
        this.effectsBus.connect(this.context.destination);
        this.context.onstatechange = () => {
          // Mobile engines can interrupt output while their page stays visible.
          if (this.context?.state === 'running') this.reconcile();
        };
      } catch {
        this.context = null;
        this.musicBus = this.effectsBus = null;
        return null;
      }
    }
    return this.context;
  }
  async preload(
    progress: (done: number, total: number) => void = () => {},
    onActivity?: (activity: ResourceActivity) => void,
  ) {
    if (!this.supported) {
      progress(0, 0);
      return;
    }
    const stop = onActivity ? this.downloads.observe(onActivity) : () => {};
    try {
      await this.downloads.batch(
        this.env.entries.map((entry) => entry.url),
        progress,
      );
    } catch {
      // Only pictures are required for admission; failed sounds can retry in settings.
    } finally {
      stop();
    }
    this.failed = this.env.entries.length - this.buffers.size;
    this.reconcile();
  }
  /** Called directly inside pointer/key activation. Never queue old sound effects. */
  async unlock() {
    const context = this.getContext();
    if (!context || this.env.hidden()) return;
    try {
      const resume = context.state !== 'running' ? context.resume() : Promise.resolve();
      // Start inside the gesture, before awaiting resume. Some mobile WebViews also need
      // a source activation on touchend/click even when state already says "running".
      if (typeof context.createBuffer === 'function' && Date.now() - this.lastPrime >= 80) {
        this.lastPrime = Date.now();
        try {
          const primer = context.createBufferSource();
          primer.buffer = context.createBuffer(1, 1, context.sampleRate);
          primer.connect(context.destination);
          primer.onended = () => primer.disconnect();
          primer.start(0);
        } catch {
          /* Resume still completes if this optional primer is unavailable. */
        }
      }
      await resume;
      this.unlocked = context.state === 'running';
      this.recoverMusic();
      this.reconcile();
    } catch {
      this.unlocked = context.state === 'running';
    }
  }
  attach() {
    if (typeof window === 'undefined') return;
    for (const event of ['pointerdown', 'pointerup', 'touchend', 'click'])
      window.addEventListener(event, () => void this.unlock(), { capture: true, passive: true });
    window.addEventListener(
      'keydown',
      (event) => {
        if (['Enter', ' '].includes(event.key)) void this.unlock();
      },
      { capture: true },
    );
    document.addEventListener('visibilitychange', () => {
      if (this.env.hidden()) {
        this.stopAll();
        void this.context?.suspend().catch(() => {});
      } else if (this.unlocked) void this.unlock();
    });
    window.addEventListener('pagehide', () => this.stopAll());
  }
  setScene(active: boolean, duck = false) {
    const entering = active && !this.active;
    if (this.active && !active) {
      this.wantsWheel = false;
      this.stopAll();
    }
    this.active = active;
    this.duck = duck;
    if (entering) this.recoverMusic();
    this.reconcile();
  }
  private recoverMusic() {
    if (
      !this.active ||
      !this.settings.music ||
      this.buffers.has('exploration-bgm') ||
      this.musicRetry ||
      this.env.hidden() ||
      Date.now() - this.lastMusicRetry < 10_000
    )
      return;
    const entry = this.env.entries.find((entry) => entry.id === 'exploration-bgm');
    if (!entry) return;
    this.lastMusicRetry = Date.now();
    this.musicRetry = this.downloads
      .request(entry.url)
      .then(() => {
        this.failed = this.env.entries.length - this.buffers.size;
        this.reconcile();
      })
      .catch(() => {})
      .finally(() => {
        this.musicRetry = null;
      });
  }
  setSettings(next: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...next };
    try {
      this.env.storage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {}
    if (!this.settings.music) this.stopMusic();
    if (!this.settings.effects) {
      for (const voice of [...this.voices]) this.stopVoice(voice);
      this.stopWheel();
    }
    this.recoverMusic();
    this.reconcile();
  }
  private playable() {
    return this.unlocked && this.context?.state === 'running' && !this.env.hidden();
  }
  private voice(id: AudioId, bus: GainNode, level = 1) {
    const buffer = this.buffers.get(id),
      context = this.context;
    if (!buffer || !context || !this.playable()) return null;
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(bus);
    const voice = { source, gain, id };
    source.onended = () => {
      this.voices.delete(voice);
      this.musicVoices.delete(voice);
      if (this.wheelVoice === voice) this.wheelVoice = null;
      source.disconnect();
      gain.disconnect();
    };
    return voice;
  }
  effect(id: SoundId, speed = 1, cue?: 'reclaim') {
    if (!this.settings.effects || !this.effectsBus || !this.playable() || !this.buffers.has(id))
      return false;
    const now = this.context!.currentTime;
    const reclaim = id === 'explore-reforge' && cue === 'reclaim';
    const interval = [
      'explore-melee-hit',
      'explore-crossbow',
      'explore-magic-hit',
      'explore-poison',
    ].includes(id)
      ? 0.065
      : id === 'explore-ui-confirm'
        ? 0.12
        : 0.25;
    // Point flights already own one-shot callbacks. Preserve every arrival, including
    // simultaneous arrivals in a large batch; normal repeated actions stay throttled.
    if (!reclaim) {
      if (now - (this.cooldowns.get(id) ?? -Infinity) < interval) return false;
      this.cooldowns.set(id, now);
    }
    const same = [...this.voices].filter((voice) => voice.id === id);
    if (same.length >= 2) this.stopVoice(same[0]);
    if (this.voices.size >= 6) this.stopVoice(this.voices.values().next().value!);
    const voice = this.voice(id, this.effectsBus, reclaim ? 0.55 : 1);
    if (!voice) return false;
    this.voices.add(voice);
    const full = voice.source.buffer!.duration;
    const combat = [
      'explore-melee-hit',
      'explore-crossbow',
      'explore-magic-hit',
      'explore-poison',
    ].includes(id);
    const duration = reclaim
      ? Math.min(full, 0.16)
      : combat
        ? Math.min(full, Math.max(0.09, 0.6 / Math.max(1, speed)))
        : full;
    if (duration < full) {
      voice.gain.gain.setValueAtTime(reclaim ? 0.55 : 1, now + Math.max(0, duration - 0.025));
      voice.gain.gain.linearRampToValueAtTime(0, now + duration);
    }
    voice.source.start(now, 0, duration);
    return true;
  }
  wheel(spinning: boolean) {
    this.wantsWheel = spinning && this.active;
    this.reconcile();
  }
  private stopVoice(voice: Voice) {
    try {
      voice.source.stop();
    } catch {}
    this.voices.delete(voice);
    this.musicVoices.delete(voice);
    if (this.wheelVoice === voice) this.wheelVoice = null;
    voice.source.disconnect();
    voice.gain.disconnect();
  }
  private stopWheel() {
    if (this.wheelVoice) this.stopVoice(this.wheelVoice);
  }
  private stopMusic() {
    this.epoch++;
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    for (const voice of [...this.musicVoices]) this.stopVoice(voice);
  }
  stopAll() {
    this.stopMusic();
    this.stopWheel();
    for (const voice of [...this.voices]) this.stopVoice(voice);
    this.cooldowns.clear();
  }
  private musicSegment(fadeIn = false) {
    if (!this.musicBus || !this.playable() || !this.active || !this.settings.music) return;
    const voice = this.voice('exploration-bgm', this.musicBus);
    if (!voice) return;
    const context = this.context!,
      duration = voice.source.buffer!.duration;
    const overlap = Math.min(1.2, duration / 4),
      now = context.currentTime;
    voice.gain.gain.setValueAtTime(fadeIn ? 0 : 1, now);
    if (fadeIn) voice.gain.gain.linearRampToValueAtTime(1, now + overlap);
    voice.gain.gain.setValueAtTime(1, now + duration - overlap);
    voice.gain.gain.linearRampToValueAtTime(0, now + duration);
    this.musicVoices.add(voice);
    voice.source.start(now);
    const epoch = this.epoch;
    this.musicTimer = setTimeout(
      () => {
        if (epoch === this.epoch) this.musicSegment(true);
      },
      Math.max(20, (duration - overlap) * 1000),
    );
  }
  private reconcile() {
    if (!this.playable() || !this.active) return;
    if (this.musicBus && this.context)
      this.musicBus.gain.setTargetAtTime(this.duck ? 0.12 : 0.28, this.context.currentTime, 0.12);
    if (this.settings.music && !this.musicVoices.size) this.musicSegment();
    if (!this.wantsWheel || !this.settings.effects) this.stopWheel();
    else if (!this.wheelVoice && this.effectsBus) {
      const voice = this.voice('explore-wheel-spin', this.effectsBus, 0.6);
      if (voice) {
        this.wheelVoice = voice;
        voice.source.loop = true;
        voice.source.start();
      }
    }
  }
}
export const explorationAudio = new ExplorationAudio();
