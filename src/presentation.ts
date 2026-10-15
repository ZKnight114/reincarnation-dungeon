import type { JourneyEntry } from './types';

export function journeyGroups(entries: JourneyEntry[]) {
  const groups: { event: number; entries: JourneyEntry[] }[] = [];
  for (const entry of entries) {
    let group = groups.find((g) => g.event === entry.event);
    if (!group) {
      group = { event: entry.event, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
