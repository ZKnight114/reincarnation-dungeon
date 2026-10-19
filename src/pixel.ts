import { spriteUrl } from './assets';
import { ENEMIES } from './data';
import type { Enemy, Profession, HeroAppearance } from './types';
import { portraitUrl } from './character-parts';
import { ACTOR_APPEARANCE, ENEMY_ANCHORS } from './actor-appearance';
import { actorRig } from './motion';
export const pixel = spriteUrl;
export const actorArt = (profession: Profession, appearance?: HeroAppearance) =>
  `<img class="pixel-actor hero-portrait ${appearance ? 'composite-portrait' : ''}" ${appearance ? `data-gender="${appearance.gender}"` : ''} src="${portraitUrl(profession, appearance) ?? pixel(ACTOR_APPEARANCE[profession].image)}" alt="">`;
export const actorMotion = (profession: Profession) => {
  const appearance = ACTOR_APPEARANCE[profession];
  return appearance.motion?.source === appearance.image
    ? `<span class="actor-sprite" style="background-image:url('${pixel(appearance.motion.image)}')" aria-hidden="true"></span>`
    : '';
};
export const heroRig = (profession: Profession, appearance?: HeroAppearance) =>
  actorRig(
    actorArt(profession, appearance),
    'hero',
    appearance ? { center: [50, 50] } : ACTOR_APPEARANCE[profession].anchors,
    appearance ? '' : actorMotion(profession),
  );
export const foeRig = (enemy: Enemy) =>
  actorRig(foeArt(enemy), 'enemy', ENEMY_ANCHORS[foeSprite(enemy.species)]);
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
