import { spriteUrl } from './assets';

export type UIIcon =
  | 'guild'
  | 'adventurers'
  | 'dungeon'
  | 'library'
  | 'guild-bonus'
  | 'recruit'
  | 'backpack'
  | 'reforge'
  | 'settings'
  | 'trial'
  | 'gold'
  | 'medal'
  | 'energy'
  | 'attack'
  | 'hp'
  | 'defense';
export const uiIcon = (name: UIIcon, className = '') =>
  `<img class="ui-icon ${className}" src="${spriteUrl('ui/icons/' + name)}" alt="" aria-hidden="true">`;
export const uiControl = (
  name: 'back' | 'close' | 'plus' | 'minus' | 'play' | 'pause' | 'speed' | 'check' | 'lock',
) => `<img class="ui-control" src="${spriteUrl('ui/controls/' + name)}" alt="" aria-hidden="true">`;
export const tomeArt = (id: string) =>
  `<img class="tome-art" src="${spriteUrl('tomes/' + id)}" alt="" aria-hidden="true">`;
