import { spriteUrl } from './assets';
import { decodedAsset } from './loading';
import { headshotUrl } from './character-parts';
import { ACTOR_APPEARANCE } from './actor-appearance';
import { foeSprite } from './pixel';
import { cropHeadImage } from './head-crop';
import type { Enemy, HeroAppearance, Profession } from './types';
import { professionIcon } from './art';

// Normalized source crops; replace these together with the corresponding full image.
export const HEAD_CROPS: Record<string, [number, number, number, number]> = {
  'warrior-full': [0.37, 0, 0.33, 0.16],
  'mage-full': [0.3, 0, 0.36, 0.175],
  'rogue-full': [0.41, 0.1, 0.3, 0.16],
  'sentinel-full': [0.47, 0, 0.19, 0.12],
  'enemy-bat-full': [0.2, 0.46, 0.32, 0.32],
  'enemy-dragon-full': [0.04, 0.17, 0.28, 0.35],
  'enemy-golem-full': [0.43, 0.03, 0.23, 0.24],
  'enemy-ogre-full': [0.35, 0.09, 0.22, 0.25],
  'enemy-queen-full': [0.11, 0.3, 0.34, 0.35],
  'enemy-slime-full': [0.33, 0.3, 0.44, 0.4],
  'enemy-spider-full': [0.2, 0.54, 0.27, 0.35],
  'enemy-wolf-full': [0.08, 0.44, 0.37, 0.36],
  'enemy-wraith-full': [0.32, 0.02, 0.2, 0.21],
};
const crops = new Map<string, string>();
function cropUrl(key: string) {
  const source = spriteUrl(key),
    image = decodedAsset(source);
  if (crops.has(source)) return crops.get(source)!;
  if (!image) return source;
  const [x, y, w, h] = HEAD_CROPS[key] ?? [0.25, 0, 0.5, 0.4];
  const url = cropHeadImage(image, [
    x * image.naturalWidth,
    y * image.naturalHeight,
    w * image.naturalWidth,
    h * image.naturalHeight,
  ]);
  if (!url) return source;
  crops.set(source, url);
  return url;
}
export function heroHead(profession: Profession, appearance?: HeroAppearance, label = '') {
  return `<span class="battle-portrait"><img src="${headshotUrl(profession, appearance) ?? cropUrl(ACTOR_APPEARANCE[profession].image)}" alt="勇者头像">${professionIcon(profession)}${label ? `<small>${label}</small>` : ''}</span>`;
}
export function enemyHead(enemy: Enemy) {
  return `<span class="battle-portrait enemy-portrait"><img src="${cropUrl(foeSprite(enemy.species))}" alt="敌人头像">${professionIcon(enemy.profession ?? 'warrior')}</span>`;
}
