import { assetEntries } from './assets';
import { appearanceLayers } from './character-parts';
import { ACTOR_APPEARANCE } from './actor-appearance';
import { spriteName } from './backpack';
import { foeSprite } from './pixel';
import type { Equipment, GameState, Trainee, HeroRecord } from './types';

export type HomeView = 'guild' | 'roster' | 'library' | 'guild-tree' | 'expedition';
const homeIcons = [
  'settings',
  'dungeon',
  'adventurers',
  'guild',
  'trial',
  'energy',
  'gold',
  'medal',
  'guild-bonus',
  'library',
];
const homeSkins = [
  'secondary-normal',
  'secondary-pressed',
  'primary-normal',
  'primary-pressed',
  'disabled',
  'selected',
];

/** Plan before writing image markup: composites and head crops must never use fallback art. */
export function screenAssetNames(s: GameState, view: HomeView, catalogue: string[]) {
  const names = new Set<string>([
    'guild-home',
    'buttonLong_beige',
    'panel_beigeLight',
    ...homeIcons.map((key) => 'ui/icons/' + key),
    ...homeSkins.map((key) => 'ui/skins/' + key),
    ...['primary', 'secondary', 'disabled'].map((key) => 'ui/buttons/light-' + key),
    'ui/panels/light-guild',
    'ui/panels/light-event',
    'ui/insets/light',
    'ui/insets/dark',
    'ui/controls/back',
    'ui/controls/close',
    'ui/controls/check',
  ]);
  const prefix = (value: string) =>
    catalogue.filter((key) => key.startsWith(value)).forEach((key) => names.add(key));
  const items = (equipment: Equipment[]) =>
    equipment.forEach((item) => {
      const key = spriteName(item);
      if (key) names.add(key);
    });
  const hero = (h: Trainee | HeroRecord | null) => {
    if (!h) return;
    if (h.appearance) appearanceLayers(h.profession, h.appearance).forEach((key) => names.add(key));
    else {
      const art = ACTOR_APPEARANCE[h.profession];
      names.add(art.image);
      if (art.motion) names.add(art.motion.image);
    }
    if ('loadout' in h && h.loadout) items(h.loadout.equipment);
  };
  if (s.phase === 'home') {
    if (view === 'guild') return [...names];
    prefix('ui/');
    if (view === 'roster' || view === 'expedition') s.meta.heroes.forEach(hero);
    if (view === 'library' || view === 'roster') prefix('tomes/');
    if (view === 'expedition') {
      prefix('expedition/');
      prefix('enemy-');
      names.add('sentinel-full');
    }
    return [...names];
  }
  prefix('ui/');
  if (s.phase === 'chapter') {
    Object.values(ACTOR_APPEARANCE).forEach((art) => names.add(art.image));
    return [...names];
  }
  hero(s.run.trainee);
  if (s.phase === 'tome') prefix('tomes/');
  if (!['configure', 'tome'].includes(s.phase)) {
    names.add('ruins-ui');
    items(s.inventory);
    items(s.run.starterOffers);
    items(s.run.dig?.equipment ?? []);
    if (s.enemy) names.add(foeSprite(s.enemy.species));
    if (s.run.encounter) names.add(foeSprite(s.run.encounter.species));
    // Trial candidates appear together before choosing the opponent.
    if (s.phase === 'event') {
      prefix('enemy-');
      names.add('sentinel-full');
    }
    if (s.phase === 'summary')
      hero(s.meta.heroes.find((h) => h.id === s.run.summary?.heroId) ?? null);
  }
  return [...names];
}
export function visibleAssets(s: GameState, view: HomeView = 'guild') {
  const entries = assetEntries();
  const needed = new Set(
    screenAssetNames(
      s,
      view,
      entries.map((entry) => entry.name),
    ),
  );
  return [...new Set(entries.filter((entry) => needed.has(entry.name)).map((entry) => entry.url))];
}
export const initialHomeView = (s: GameState): HomeView =>
  s.phase === 'home' && s.meta.expedition?.run ? 'expedition' : 'guild';
