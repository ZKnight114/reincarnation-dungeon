import type { Aptitude } from './types';

export const APTITUDES = {
  common: { name: '平凡', color: '#bac6bf', weight: 60, gold: 0, purple: 0 },
  gifted: { name: '出众', color: '#72bdf0', weight: 27, gold: 0, purple: 1 },
  brilliant: { name: '卓越', color: '#cb9eff', weight: 10, gold: 1, purple: 0 },
  legendary: { name: '传奇', color: '#ffcf70', weight: 3, gold: 2, purple: 0 },
} as const;
export function rollAptitude(random: () => number): Aptitude {
  let draw = random() * 100;
  return (
    (Object.keys(APTITUDES) as Aptitude[]).find((k) => (draw -= APTITUDES[k].weight) < 0) ??
    'legendary'
  );
}
export function aptitudeDescription(key: Aptitude) {
  const a = APTITUDES[key];
  return `${a.name}资质 · ${a.gold ? `至少 ${a.gold} 条金色天赋` : a.purple ? '至少 1 条紫色或金色天赋' : '天赋品质随机'}`;
}
export function aptitudeIcon(key?: Aptitude) {
  const rank = key ? Object.keys(APTITUDES).indexOf(key) : 0;
  return `<svg class="aptitude-symbol" viewBox="0 0 40 32" aria-hidden="true"><path d="M20 2 32 10v12L20 30 8 22V10Z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2"/><path d="m20 8 6 8-6 8-6-8Z" fill="currentColor"/>${Array.from({ length: rank + 1 }, (_, n) => `<rect x="${15 - rank * 2 + n * 4}" y="26" width="3" height="3" fill="currentColor"/>`).join('')}</svg>`;
}
