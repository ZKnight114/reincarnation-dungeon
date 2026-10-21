export const SOUND_IDS = [
  'explore-ui-confirm',
  'explore-journal-ready',
  'explore-encounter',
  'explore-item-pickup',
  'explore-item-place',
  'explore-item-merge',
  'explore-reforge',
  'explore-reforge-ready',
  'explore-chest-open',
  'explore-dig',
  'explore-wheel-spin',
  'explore-event-gain',
  'explore-heal',
  'explore-melee-hit',
  'explore-crossbow',
  'explore-magic-hit',
  'explore-poison',
  'explore-shield-gain',
  'explore-shield-break',
  'explore-resonance',
  'explore-promotion',
  'explore-boss-warning',
  'explore-victory',
  'explore-defeat',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export type AudioId = SoundId | 'exploration-bgm';
let files: Record<string, string> = {};
try {
  files = import.meta.glob('./assets/audio/**/*.{mp3,wav}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>;
} catch {
  // Rule/DOM tests do not run Vite's asset transform.
}
export function audioUrl(id: AudioId) {
  const name =
    id === 'exploration-bgm'
      ? 'bgm/exploration.mp3'
      : 'sfx/' + id + '.' + (id === 'explore-wheel-spin' ? 'wav' : 'mp3');
  return files['./assets/audio/' + name];
}
export function audioEntries() {
  return (['exploration-bgm', ...SOUND_IDS] as AudioId[])
    .map((id) => ({ id, url: audioUrl(id) }))
    .filter((entry) => !!entry.url);
}
