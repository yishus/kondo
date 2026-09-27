import { sql } from "drizzle-orm";
import type { Database } from "./db.server";
import { cardSearchExpression, CARD_SEARCH_LIMIT, MAX_CARD_SEARCH_LENGTH, type CardSearchResponse, type CardSearchResult } from "./card-search";

export async function searchCards(db: Database, tripId: string, userId: string, rawQuery: string): Promise<CardSearchResponse> {
  const query = rawQuery.trim();
  const empty = { query, results: [], hasMore: false, error: null };
  if (query.length > MAX_CARD_SEARCH_LENGTH) return { ...empty, error: `Keep searches under ${MAX_CARD_SEARCH_LENGTH} characters.` };
  const expression = cardSearchExpression(query);
  if (!expression) return empty;
  const results = await db.all<CardSearchResult>(sql`
    SELECT c.id, snippet(card_search, -1, '', '', '…', 24) AS excerpt
    FROM card_search JOIN cards c ON c.rowid = card_search.rowid
    WHERE card_search MATCH ${expression} AND c.trip_id = ${tripId}
      AND EXISTS (SELECT 1 FROM trip_owners o WHERE o.trip_id = c.trip_id AND o.user_id = ${userId})
    ORDER BY bm25(card_search, 5, 1, 3, 3, 3), c.id
    LIMIT ${CARD_SEARCH_LIMIT + 1}
  `);
  return { query, results: results.slice(0, CARD_SEARCH_LIMIT), hasMore: results.length > CARD_SEARCH_LIMIT, error: null };
}
