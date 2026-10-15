import { spriteUrl } from './assets';
import { ENEMIES } from './data';
import type { Enemy, Profession } from './types';
export const pixel = spriteUrl;
export const actorArt = (profession: Profession) =>
  `<img class="pixel-actor hero-portrait" src="${pixel(profession + '-full')}" alt="">`;
export const actorMotion = (profession: Profession) =>
  `<span class="actor-sprite" style="background-image:url('${pixel(profession + '-motion')}')" aria-hidden="true"></span>`;
export function foeSprite(species: number) {
  const form = ENEMIES[species]?.form;
  const sprites: Record<string, string> = {
    slime: 'enemy-slime-full',
    bat: 'enemy-bat-full',
    wolf: 'enemy-wolf-full',
    spider: species === 19 ? 'enemy-queen-full' : 'enemy-spider-full',
    wraith: 'enemy-wraith-full',
    ogre: 'enemy-ogre-full',
    golem: 'enemy-golem-full',
    dragon: 'enemy-dragon-full',
  };
  return sprites[form] ?? 'sentinel-full';
}
export function foeArt(enemy: Enemy) {
  const sprite = foeSprite(enemy.species);
  return `<img class="pixel-actor enemy-pixel ${sprite === 'sentinel-full' ? 'legacy-facing' : 'facing-left'} ${enemy.isBoss ? 'boss-art' : enemy.isElite ? 'elite-art' : 'minion-art'}" data-enemy-art="${sprite}" src="${pixel(sprite)}" alt="">`;
}
