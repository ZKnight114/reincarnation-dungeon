import { itemResonanceTiers } from './resonances';
import type { Equipment, ResonanceKey } from './types';

export type ResonanceTiers = Record<ResonanceKey, number>;
// Both combat and the training estimate use these exact damage rules.
export function weaponEffect(
  item: Equipment,
  t: ResonanceTiers,
  hit: number,
  effects: { burn: boolean; chill: boolean; poison: boolean },
  power: number,
  enemyDefense: number,
) {
  const it = itemResonanceTiers(item, t),
    third = hit % 3 === 0;
  const attack = power * (1 + [0, 0.08, 0.15, 0.25][it.basic]);
  const armor =
    enemyDefense *
    Math.max(
      0.2,
      1 -
        (item.profession === 'rogue' ? [0, 0.15, 0.3, 0.45][t.rogue_mix] : 0) -
        [0, 0.1, 0.2, 0.3][it.master],
    );
  const base = (attack * 60) / (60 + armor * (item.damageType === 'magic' ? 0.5 : 1));
  const strike =
    item.branch === 'blade'
      ? t.cleave
      : item.branch === 'pole'
        ? t.flurry
        : item.branch === 'flame'
          ? t.eruption
          : item.branch === 'assassin'
            ? t.ambush
            : item.branch === 'archer'
              ? t.volley
              : 0;
  let extra = third
    ? [0, 0.25, 0.5, 0.8][strike] * item.potency + [0, 0.2, 0.35, 0.55][it.advanced]
    : 0;
  if (third) {
    if (item.branch === 'blade') extra += [0, 0.25, 0.4, 0.6][t.execution];
    if (item.branch === 'pole') extra += [0, 0.2, 0.35, 0.5][t.spear_storm];
    if (item.branch === 'archer') extra += [0, 0.2, 0.35, 0.5][t.rain_arrows];
  }
  if (effects.burn)
    extra +=
      [0, 0.12, 0.24, 0.4][t.inferno] +
      (item.profession === 'mage' ? [0, 0.12, 0.24, 0.4][t.mage_mix] : 0);
  if (effects.chill) extra += [0, 0.12, 0.24, 0.4][t.blizzard];
  if (effects.poison) extra += [0, 0.15, 0.3, 0.5][t.toxic_master];
  const splash =
    third &&
    ((strike === 3 && ['blade', 'flame', 'archer'].includes(item.branch)) ||
      (t.spear_storm === 3 && item.branch === 'pole') ||
      (t.rain_arrows === 3 && item.branch === 'archer'));
  return { power: attack, damage: base * (1 + extra), splash };
}
export function shieldMultiplier(item: Equipment, t: ResonanceTiers) {
  const tier =
    item.profession === 'warrior'
      ? t.bulwark
      : item.profession === 'mage'
        ? t.arcane_ward
        : t.shadow_guard;
  return (
    (1 + [0, 0.25, 0.5, 0.8][tier]) * (1 + [0, 0.15, 0.3, 0.5][itemResonanceTiers(item, t).basic])
  );
}
