import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { cards } from "./db/schema";
import { CARD_RANK_STEP } from "./card-rank";

/** Evaluate inside INSERT so concurrent appends see the latest committed tail. */
export function nextCardRank(tripId: string, tripDayId: string | SQL<string> | null) {
  return sql<number>`(SELECT COALESCE(MAX(${cards.position}) + ${CARD_RANK_STEP}, ${CARD_RANK_STEP})
    FROM ${cards} WHERE ${and(eq(cards.tripId, tripId), tripDayId === null ? isNull(cards.tripDayId) : eq(cards.tripDayId, tripDayId))})`;
}
