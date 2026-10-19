import { firstFree, runBagCells, validateLayout } from './backpack';
import type { GameState, Placement } from './types';

export const OLD_SPEAR_CELLS: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];

/** Retain every item; a reshaped spear that cannot fit becomes loose equipment. */
export function normalizeActiveFootprints(s: GameState) {
  const changed = new Set(
    s.inventory.filter((i) => i.templateId === 'warrior_pole_4' && i.legacyCells).map((i) => i.id),
  );
  for (const i of [...s.inventory, ...s.run.starterOffers])
    if (i.templateId === 'warrior_pole_4') delete i.legacyCells;
  if (!changed.size) return;
  const open = runBagCells(s);
  const repair = (layout: Placement[]) => {
    const next = layout.filter((p) => !changed.has(p.id));
    for (const old of layout.filter((p) => changed.has(p.id))) {
      const p = !validateLayout(s.inventory, [...next, old], open)
        ? old
        : firstFree(s.inventory, next, old.id, open);
      if (p) next.push(p);
    }
    return next;
  };
  s.placements = repair(s.placements);
  s.draft = repair(s.draft);
}

export function migrateFootprints(s: GameState) {
  if (s.footprintRevision === 1) return;
  // Historical graduates and a fight already in progress keep their frozen layout.
  for (const i of [
    ...s.inventory,
    ...s.run.starterOffers,
    ...(s.run.dig?.equipment ?? []),
    ...s.meta.heroes.flatMap((h) => h.loadout?.equipment ?? []),
  ])
    if (i.templateId === 'warrior_pole_4') i.legacyCells = structuredClone(OLD_SPEAR_CELLS);
  if (s.phase !== 'combat') normalizeActiveFootprints(s);
  s.footprintRevision = 1;
}
