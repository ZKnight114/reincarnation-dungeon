/** Shared combat tuning. Keep frozen skill recipes stable when balancing live saves. */
export const HERO_SHIELD_CAP = 0.3;
export const ENEMY_SHIELD_CAP = 0.5;
export const PERIODIC_SHIELD_SCALE = 0.65;

export const shieldActionScale = (side: 'hero' | 'enemy', cooldown: number) =>
  side === 'hero' && cooldown > 0 ? PERIODIC_SHIELD_SCALE : 1;
