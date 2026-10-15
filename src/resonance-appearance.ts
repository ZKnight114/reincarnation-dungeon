// Resonance rank is separate from the three contribution-triggered effect tiers.
export const RESONANCE_RANK_NAMES = ['低阶', '进阶', '高阶'] as const;
export const resonanceRankClass = (rank: 1 | 2 | 3) => `resonance-rank-${rank}`;
export const resonanceRankName = (rank: 1 | 2 | 3) => RESONANCE_RANK_NAMES[rank - 1];
