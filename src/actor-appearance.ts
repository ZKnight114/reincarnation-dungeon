import type { ActorAnchors } from './motion';
import type { Profession } from './types';

export interface ActorAppearance {
  image: string;
  /** Never reuse an old character's sprite sheet after replacing its static image. */
  motion?: { image: string; source: string };
  anchors?: ActorAnchors;
}

// Change the image key here when replacing art. All container motions still work.
// A sheet only plays when its source matches that image; otherwise use static-art movement.
export const ACTOR_APPEARANCE: Record<Profession, ActorAppearance> = {
  warrior: {
    image: 'warrior-full',
    motion: { image: 'warrior-motion', source: 'warrior-full' },
    anchors: { center: [50, 49.33] },
  },
  mage: {
    image: 'mage-full',
    motion: { image: 'mage-motion', source: 'mage-full' },
    anchors: { center: [50, 48.67] },
  },
  rogue: {
    image: 'rogue-full',
    motion: { image: 'rogue-motion', source: 'rogue-full' },
    anchors: { center: [50, 56.33] },
  },
};

/** Optional per-art calibration for unusually wide or tall enemies. No action changes needed. */
export const ENEMY_ANCHORS: Record<string, ActorAnchors> = {
  // Alpha bounds: bat [8,110,248,248], wraith [36,8,219,248], both 256 × 256.
  'enemy-bat-full': {
    center: [50, 46],
    flight: { centerY: 46, bodyOffset: 0, imageCenter: [0.5, 179 / 256] },
  },
  'enemy-wraith-full': {
    center: [50, 46],
    flight: { centerY: 46, bodyOffset: 0, imageCenter: [0.5, 0.5] },
  },
};
