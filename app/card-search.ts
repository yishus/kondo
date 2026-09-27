export const MAX_CARD_SEARCH_LENGTH = 200;
export const CARD_SEARCH_LIMIT = 50;

// Treat input as words, never as FTS operators or column filters. Prefixes make
// partially typed place names useful; every word must appear somewhere on a card.
export function cardSearchExpression(query: string) {
  const words = query.normalize("NFC").match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
  return [...new Set(words)].map((word) => `"${word}"*`).join(" AND ");
}

export type CardSearchResult = { id: string; excerpt: string };
export type CardSearchResponse = {
  query: string;
  results: CardSearchResult[];
  hasMore: boolean;
  error: string | null;
};
