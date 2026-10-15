import type { Profession } from './types';
import { spriteUrl } from './assets';
export const pixel = spriteUrl;
export const actorArt = (profession: Profession) =>
  `<img class="pixel-actor hero-portrait" src="${pixel(profession + '-full')}" alt="">`;
export const actorMotion = (profession: Profession) =>
  `<span class="actor-sprite" style="background-image:url('${pixel(profession + '-motion')}')" aria-hidden="true"></span>`;
export const foeArt = () =>
  `<img class="pixel-actor enemy-pixel" src="${pixel('sentinel-full')}" alt="">`;
