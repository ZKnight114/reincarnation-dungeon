import type { BattleRuntime, Skill } from './skill-types';

/** Display elapsed hero turns, independent of the source's position in the current queue. */
export function cooldownView(runtime: BattleRuntime, id: string, index: number, skill: Skill) {
  const key = `${id}:${index}`;
  const firedAt = runtime.flags[key + ':firedAt'];
  if (firedAt !== undefined) {
    const elapsed = Math.max(0, runtime.heroActions - firedAt);
    return {
      remaining: Math.max(0, skill.cooldown - elapsed),
      progress: Math.min(1, elapsed / skill.cooldown),
    };
  }
  // The first-use label counts waiting turns before the initial activation turn.
  // Pre-marker saves use this fallback until the next actual activation records firedAt.
  const timer = runtime.timers[key] ?? skill.initialDelay ?? 1;
  const remaining = Math.max(0, timer - 1);
  return {
    remaining,
    progress: Math.max(0, 1 - remaining / Math.max(1, (skill.initialDelay ?? skill.cooldown) - 1)),
  };
}
