/** Leave room for inserts and moves without renumbering neighboring cards. */
export const CARD_RANK_STEP = 1024;

/** null means this gap needs rebalancing before another rank can fit. */
export function cardRankBetween(previous: number | null, next: number | null): number | null {
  const rank = next === null ? (previous ?? 0) + CARD_RANK_STEP
    : previous === null ? next / 2 : previous + (next - previous) / 2;
  return Number.isFinite(rank) && rank >= 0
    && (previous === null || rank > previous) && (next === null || rank < next) ? rank : null;
}
