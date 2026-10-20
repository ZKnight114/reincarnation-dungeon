import { spriteUrl } from './assets';
import { decodedAsset } from './loading';
import { cropHeadImage } from './head-crop';
import type { HeroAppearance, Profession } from './types';

export function rollAppearance(random: () => number): HeroAppearance {
  const gender = random() < 0.5 ? 'male' : 'female';
  return {
    version: 1,
    gender,
    head: Math.floor(random() * 4),
    hair: Math.floor(random() * 4) + (gender === 'female' ? 4 : 0),
    torso: Math.floor(random() * 4),
    legs: Math.floor(random() * 4),
  };
}
/** Cosmetic randomness never consumes the loot/enemy generator. */
export function recruitAppearance(identity: string): HeroAppearance {
  let seed = 2166136261;
  for (const c of identity) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return rollAppearance(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
}
export function validAppearance(value: unknown): value is HeroAppearance {
  if (!value || typeof value !== 'object') return false;
  const a = value as HeroAppearance;
  return (
    a.version === 1 &&
    ['male', 'female'].includes(a.gender) &&
    (['head', 'hair', 'torso', 'legs'] as const).every(
      (k) => Number.isInteger(a[k]) && a[k] >= 0 && a[k] < (k === 'hair' ? 8 : 4),
    )
  );
}
export function appearanceLayers(profession: Profession, a: HeroAppearance) {
  // The collar covers the head-owned neck; rear flaps always follow the shirt ID.
  return [
    `characters/hair-back/${a.hair}`,
    `characters/${profession}/back-${a.torso}`,
    `characters/${profession}/legs-${a.legs}`,
    `characters/heads/${a.gender}-${a.head}`,
    `characters/${profession}/torso-${a.torso}`,
    `characters/hair/${a.hair}`,
  ];
}
const parts = new Map<string, HTMLImageElement>();
const portraits = new Map<string, string>();
const headshots = new Map<string, string>();
/** Head and hair only. Same saved layers as the full-body image, never rerolled. */
export function headshotUrl(profession: Profession, a?: HeroAppearance): string | null {
  if (!a) return null;
  const layers = [
      `characters/hair-back/${a.hair}`,
      `characters/heads/${a.gender}-${a.head}`,
      `characters/hair/${a.hair}`,
    ],
    key = layers.join('|');
  if (headshots.has(key)) return headshots.get(key)!;
  if (!layers.every((k) => parts.has(k))) return null;
  const body = document.createElement('canvas');
  body.width = 128;
  body.height = 192;
  const full = body.getContext('2d');
  if (!full) return null;
  layers.forEach((k) => full.drawImage(parts.get(k)!, 0, 0));
  // Include the complete chin and long side hair; clothing is never painted.
  const url = cropHeadImage(body, [42, 8, 46, 35]);
  if (!url) return null;
  if (headshots.size >= 128) headshots.delete(headshots.keys().next().value!);
  headshots.set(key, url);
  return url;
}
export function registerCharacterParts() {
  const keys = [
    ...(['male', 'female'] as const).flatMap((g) =>
      Array.from({ length: 4 }, (_, n) => `characters/heads/${g}-${n}`),
    ),
    ...Array.from({ length: 8 }, (_, n) => `characters/hair/${n}`),
    ...Array.from({ length: 8 }, (_, n) => `characters/hair-back/${n}`),
    ...(['warrior', 'mage', 'rogue'] as const).flatMap((p) =>
      ['back', 'torso', 'legs'].flatMap((k) =>
        Array.from({ length: 4 }, (_, n) => `characters/${p}/${k}-${n}`),
      ),
    ),
  ];
  keys.forEach((key) => {
    if (parts.has(key)) return;
    const image = decodedAsset(spriteUrl(key));
    if (!image) return;
    if (image.naturalWidth !== 128 || image.naturalHeight !== 192)
      throw new Error('人物分层资源尺寸错误：' + key);
    parts.set(key, image);
  });
}
/** Compose once, reuse the same immutable portrait across every scene and archive. */
export function portraitUrl(profession: Profession, a?: HeroAppearance): string | null {
  if (!a) return null;
  const layers = appearanceLayers(profession, a),
    key = layers.join('|');
  if (portraits.has(key)) return portraits.get(key)!;
  // DOM unit tests have no image transform; real pages load their layers before rendering.
  if (!layers.every((k) => parts.has(k))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  layers.forEach((k) => ctx.drawImage(parts.get(k)!, 0, 0));
  const url = canvas.toDataURL('image/png');
  if (portraits.size >= 128) portraits.delete(portraits.keys().next().value!);
  portraits.set(key, url);
  return url;
}
