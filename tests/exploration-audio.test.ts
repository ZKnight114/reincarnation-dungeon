import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorationAudio, AUDIO_SETTINGS_KEY } from '../src/audio';
import { SOUND_IDS, type AudioId } from '../src/audio-assets';
import { ExplorationSounds, attackSound } from '../src/exploration-sounds';
import { Game } from '../src/game';
import { start, positionEvent, add } from './helpers';
import { Window } from 'happy-dom';

class Param {
  value = 1;
  targets: number[] = [];
  setValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number) {
    this.targets.push(value);
  }
  setTargetAtTime(value: number) {
    this.targets.push(value);
  }
}
class Gain {
  gain = new Param();
  connect() {}
  disconnect() {}
}
class Source {
  buffer: { duration: number; key: number } | null = null;
  loop = false;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  started: number[] | null = null;
  stopped = false;
  connect() {}
  disconnect() {}
  start(...args: number[]) {
    this.started = args;
  }
  stop() {
    this.stopped = true;
    this.onended?.();
  }
}
class Context {
  state = 'suspended';
  currentTime = 1;
  destination = {};
  sources: Source[] = [];
  gains: Gain[] = [];
  resumes = 0;
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    const key = new Uint8Array(bytes)[0];
    return { key, duration: key === 0 ? 120 : 0.6 } as unknown as AudioBuffer;
  }
  async resume() {
    this.state = 'running';
    this.resumes++;
  }
  async suspend() {
    this.state = 'suspended';
  }
}
function fixture() {
  const context = new Context(),
    calls: string[] = [],
    storage = new Map<string, string>();
  const ids: AudioId[] = ['exploration-bgm', ...SOUND_IDS];
  let fail: string | null = null,
    hidden = false;
  const audio = new ExplorationAudio({
    createContext: () => context as unknown as AudioContext,
    entries: ids.map((id) => ({ id, url: '/' + id })),
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === fail) throw new Error('offline');
      return new Response(new Uint8Array([ids.indexOf(url.slice(1) as AudioId)]));
    },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    hidden: () => hidden,
  });
  return {
    audio,
    context,
    calls,
    storage,
    fail: (url: string | null) => {
      fail = url;
    },
    hidden: (value: boolean) => {
      hidden = value;
    },
  };
}
test('preload never autoplays; a gesture starts current music and never replays missed effects', async () => {
  const { audio, context } = fixture();
  try {
    await audio.preload();
    audio.setScene(true);
    assert.equal(context.resumes, 0);
    assert.equal(audio.effect('explore-item-merge'), false);
    assert.equal(context.sources.length, 0);
    await audio.unlock();
    assert.equal(audio.diagnostics.music, 1);
    assert.equal(audio.diagnostics.effects, 0);
    assert.equal(audio.effect('explore-item-merge'), true);
  } finally {
    audio.stopAll();
  }
});
test('preload deduplicates concurrent downloads; retry fetches only failed audio', async () => {
  const f = fixture();
  try {
    f.fail('/explore-heal');
    await Promise.all([f.audio.preload(), f.audio.preload()]);
    assert.equal(f.audio.readyCount, 24);
    assert.equal(f.calls.length, 26, 'only the failed sound retries automatically');
    assert.equal(f.audio.failed, 1);
    f.fail(null);
    await f.audio.preload();
    assert.equal(f.calls.length, 27);
    assert.equal(f.audio.failed, 0);
  } finally {
    f.audio.stopAll();
  }
});

test('entering exploration recovers a missing BGM once without downloading prepared effects again', async () => {
  const f = fixture();
  try {
    f.fail('/exploration-bgm');
    await f.audio.preload();
    assert.equal(f.audio.diagnostics.musicReady, false);
    f.fail(null);
    await f.audio.unlock();
    f.audio.setScene(true);
    for (let n = 0; n < 30 && !f.audio.diagnostics.musicReady; n++)
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.audio.diagnostics.musicReady, true);
    assert.equal(f.audio.diagnostics.music, 1);
    assert.equal(f.audio.failed, 0);
    assert.equal(f.calls.filter((url) => url === '/exploration-bgm').length, 3);
    assert.equal(f.calls.filter((url) => url !== '/exploration-bgm').length, 24);
    f.audio.setScene(true);
    await f.audio.unlock();
    assert.equal(f.calls.length, 27, 'renders and subsequent gestures do not download again');
  } finally {
    f.audio.stopAll();
  }
});

test('click and touchend unlock mobile output with a silent source inside the gesture', async () => {
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  const w = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { window: w, document: w.document });
  class MobileContext extends Context {
    sampleRate = 48000;
    createBuffer() {
      return { key: -1, duration: 1 / this.sampleRate };
    }
  }
  const context = new MobileContext();
  const audio = new ExplorationAudio({
    createContext: () => context as unknown as AudioContext,
    entries: [{ id: 'exploration-bgm', url: '/music' }],
    fetch: async () => new Response(new Uint8Array([0])),
    hidden: () => false,
  });
  try {
    await audio.preload();
    audio.attach();
    audio.setScene(true);
    w.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(context.sources[0].buffer?.key, -1, 'primer starts before resume resolves');
    assert.deepEqual(context.sources[0].started, [0]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(audio.diagnostics.music, 1);
    audio.stopAll();
    context.state = 'suspended';
    w.dispatchEvent(new w.Event('touchend'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.state, 'running');
    assert.equal(audio.diagnostics.music, 1);
    assert.equal(context.resumes, 2);
  } finally {
    audio.stopAll();
    Object.assign(globalThis, { window: previousWindow, document: previousDocument });
    await w.happyDOM.close();
  }
});

test('equipment-point cues are short and separately audible without using the full reforge tail', async () => {
  const f = fixture();
  try {
    await f.audio.preload();
    await f.audio.unlock();
    for (let n = 0; n < 3; n++) {
      assert.equal(f.audio.effect('explore-reforge', 1, 'reclaim'), true);
    }
    assert.equal(f.context.sources.length, 3);
    assert.ok(f.context.sources.every((source) => source.started?.[2] === 0.16));
    assert.ok(f.context.gains.slice(2).every((gain) => gain.gain.targets.includes(0)));
  } finally {
    f.audio.stopAll();
  }
});
test('audio download queue caps concurrency at two while preparing the full catalogue', async () => {
  const context = new Context();
  let active = 0,
    peak = 0,
    requests = 0;
  const audio = new ExplorationAudio({
    createContext: () => context as unknown as AudioContext,
    entries: ['exploration-bgm', ...SOUND_IDS].map((id) => ({ id: id as AudioId, url: '/' + id })),
    fetch: async () => {
      requests++;
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return new Response(new Uint8Array([1]));
    },
    hidden: () => false,
  });
  await audio.preload();
  assert.equal(peak, 2);
  assert.equal(requests, 25);
  assert.equal(audio.readyCount, 25);
});
test('temporary audio loss recovers automatically without replaying successful downloads', async () => {
  const context = new Context(),
    calls: string[] = [];
  const audio = new ExplorationAudio({
    createContext: () => context as unknown as AudioContext,
    entries: [
      { id: 'exploration-bgm', url: '/music' },
      { id: 'explore-heal', url: '/heal' },
    ],
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === '/music' && calls.filter((entry) => entry === url).length === 1)
        throw new Error('temporary disconnect');
      return new Response(new Uint8Array([1]));
    },
    hidden: () => false,
  });
  await audio.preload();
  assert.equal(audio.failed, 0);
  assert.equal(audio.readyCount, 2);
  assert.equal(calls.filter((url) => url === '/music').length, 2);
  assert.equal(calls.filter((url) => url === '/heal').length, 1);
});
test('music continues across pack and events, ducks for battle, and toggles independently of effects', async () => {
  const { audio, context, storage } = fixture();
  try {
    await audio.preload();
    await audio.unlock();
    audio.setScene(true);
    audio.setScene(true, true);
    audio.setScene(true, false);
    assert.equal(context.sources.length, 1, 'scene changes do not restart BGM');
    assert.ok(context.gains[0].gain.targets.includes(0.12));
    audio.setSettings({ music: false });
    assert.equal(audio.diagnostics.music, 0);
    assert.equal(audio.effect('explore-item-place'), true);
    audio.setSettings({ effects: false });
    assert.equal(audio.diagnostics.effects, 0);
    assert.deepEqual(JSON.parse(storage.get(AUDIO_SETTINGS_KEY)!), {
      music: false,
      effects: false,
    });
    audio.setSettings({ music: true });
    assert.equal(audio.diagnostics.music, 1);
    assert.equal(audio.effect('explore-item-place'), false);
  } finally {
    audio.stopAll();
  }
});
test('wheel is a single loop; stopping, muting or leaving exploration releases it', async () => {
  const { audio, context } = fixture();
  try {
    await audio.preload();
    await audio.unlock();
    audio.setScene(true);
    audio.wheel(true);
    audio.wheel(true);
    assert.equal(context.sources.filter((s) => s.loop && !s.stopped).length, 1);
    audio.wheel(false);
    assert.equal(audio.diagnostics.wheel, false);
    audio.wheel(true);
    audio.setSettings({ effects: false });
    assert.equal(audio.diagnostics.wheel, false);
    audio.setSettings({ effects: true });
    assert.equal(audio.diagnostics.wheel, true);
    audio.setScene(false);
    assert.equal(audio.diagnostics.music, 0);
    assert.equal(audio.diagnostics.wheel, false);
    assert.ok(context.sources.every((s) => s.stopped));
  } finally {
    audio.stopAll();
  }
});
test('fast combat limits overlap and fades shorter tails without raising pitch; hidden pages stay silent', async () => {
  const f = fixture();
  try {
    await f.audio.preload();
    await f.audio.unlock();
    f.audio.setScene(true);
    for (let n = 0; n < 10; n++) {
      f.context.currentTime += 0.07;
      f.audio.effect('explore-melee-hit', 4);
    }
    const active = f.context.sources.filter((s) => !s.stopped && s.buffer?.key !== 0);
    assert.ok(active.length <= 2);
    assert.equal(active[0].playbackRate.value, 1);
    assert.equal(active[0].started?.[2], 0.15);
    f.hidden(true);
    assert.equal(f.audio.effect('explore-melee-hit'), false);
    f.hidden(false);
    assert.equal(f.audio.effect('explore-melee-hit'), false, 'duplicate beat is throttled');
  } finally {
    f.audio.stopAll();
  }
});
test('unsupported audio and denied settings storage preserve silent gameplay', async () => {
  let downloads = 0;
  const audio = new ExplorationAudio({
    createContext: null,
    entries: [],
    fetch: async () => {
      downloads++;
      throw new Error('not used');
    },
    storage: {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    },
    hidden: () => false,
  });
  await audio.preload();
  await audio.unlock();
  audio.setSettings({ music: false });
  audio.setScene(true);
  assert.equal(downloads, 0);
  assert.equal(audio.effect('explore-item-merge'), false);
});
function recorder() {
  const played: string[] = [],
    scenes: boolean[] = [],
    wheels: boolean[] = [];
  const sound = {
    effect: (id: string) => {
      played.push(id);
      return true;
    },
    wheel: (value: boolean) => {
      wheels.push(value);
    },
    setScene: (value: boolean) => {
      scenes.push(value);
    },
    stopAll: () => {},
  };
  return { played, scenes, wheels, presenter: new ExplorationSounds(sound) };
}
test('attack families select physical, crossbow, magic and poison for both sides', () => {
  const g = start();
  for (const [template, sound] of [
    ['warrior_blade_2', 'explore-melee-hit'],
    ['rogue_archer_2', 'explore-crossbow'],
    ['mage_flame_2', 'explore-magic-hit'],
    ['rogue_leather_2', 'explore-poison'],
  ]) {
    const item = add(g, template);
    assert.equal(attackSound(g, item.id), sound);
  }
});
test('feedback groups actual hits once and skipping discards attacks, heals and resonance backlog', () => {
  const g = start(),
    r = recorder();
  positionEvent(g, 'battle');
  const id = g.state.inventory.find((i) => i.slot === 'weapon')!.id;
  const signals: Game['feedback'] = [
    { serial: 1, id, kind: 'damage', amount: 12 },
    { serial: 2, id, kind: 'damage', amount: 4 },
    { serial: 3, id: 'hero', kind: 'blocked', amount: 10 },
    { serial: 4, id: 'hero', kind: 'hurt', amount: 3 },
    { serial: 5, id: 'resonance:test', kind: 'trigger', amount: 1 },
  ];
  const before = JSON.stringify(g.state);
  r.presenter.feedback(g, signals);
  assert.equal(r.played.filter((x) => x === 'explore-melee-hit').length, 1);
  assert.ok(r.played.includes('explore-resonance'));
  assert.equal(JSON.stringify(g.state), before);
  r.played.length = 0;
  g.state.combat.skip = true;
  r.presenter.feedback(g, signals);
  assert.deepEqual(r.played, []);
});
test('restoring narration never replays history; new growth and healing play once', () => {
  const g = start(),
    r = recorder();
  g.chronicle('old', 'old', 'growth');
  r.presenter.sync(g, true);
  assert.deepEqual(r.played, []);
  g.chronicle('new', 'new', 'growth');
  r.presenter.sync(g, false);
  r.presenter.sync(g, false);
  assert.deepEqual(r.played, ['explore-event-gain']);
  r.played.length = 0;
  g.state.player.hp -= 10;
  r.presenter.sync(g, false);
  g.state.player.hp += 5;
  r.presenter.sync(g, false);
  r.presenter.sync(g, false);
  assert.deepEqual(r.played, ['explore-heal']);
});

test('animated equipment reclaim does not replay the batch sound on credit', () => {
  const g = start(),
    r = recorder();
  r.presenter.sync(g, true);
  g.chronicle('回收未入包装备', '3件装备转为3点', 'loot');
  r.presenter.sync(g, true, null, true);
  r.presenter.sync(g, true);
  assert.deepEqual(r.played, []);
  g.chronicle('主动重铸', '装备转为1点', 'loot');
  r.presenter.sync(g, true);
  assert.deepEqual(r.played, ['explore-reforge']);
});
test('loot reveal waits for displayed pack after victory narration, then only plays once', () => {
  const g = start(),
    r = recorder();
  positionEvent(g, 'battle');
  r.presenter.sync(g, true);
  add(g, 'warrior_blade_2');
  g.state.phase = 'camp';
  g.state.lastReport = {
    event: 1,
    seconds: 1,
    rounds: 1,
    won: true,
    reason: '',
    items: {},
    lifeAtEnd: g.state.player.hp,
    recovery: 5,
  };
  r.presenter.sync(g, false);
  assert.deepEqual(r.played, ['explore-victory', 'explore-heal']);
  r.presenter.sync(g, true);
  r.presenter.sync(g, true);
  assert.equal(r.played.filter((x) => x === 'explore-chest-open').length, 1);
});
test('maximum-life growth does not impersonate healing; promotion and shield break play once', () => {
  const g = start(),
    r = recorder();
  r.presenter.sync(g, false);
  g.state.player.hp *= 1.06;
  g.state.player.maxHp *= 1.06;
  g.chronicle('生命提升', '最大生命+6%', 'growth');
  r.presenter.sync(g, false);
  assert.deepEqual(r.played, ['explore-event-gain']);
  g.state.phase = 'awakening';
  r.presenter.sync(g, false);
  r.presenter.sync(g, false);
  assert.equal(r.played.filter((x) => x === 'explore-promotion').length, 1);
  g.state.phase = 'combat';
  g.state.player.shield = 20;
  r.presenter.sync(g, true);
  g.state.player.shield = 0;
  r.presenter.sync(g, true);
  r.presenter.sync(g, true);
  assert.equal(r.played.filter((x) => x === 'explore-shield-break').length, 1);
});
