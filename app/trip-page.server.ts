import { env } from "cloudflare:workers";
import { createContext, type RouterContextProvider } from "react-router";

import { requireUser } from "./auth.server";
import { getDb } from "./db.server";
import { loadTripBoard } from "./trip-data.server";

// The two matched loaders share a promise only for this request. A subsequent
// navigation/revalidation checks the session and ownership again.
const tripPageContext = createContext<Map<string, ReturnType<typeof loadPage>> | null>(null);

async function loadPage(request: Request, tripId: string) {
  const currentUser = await requireUser(request);
  return { ...await loadTripBoard(getDb(env.DB), tripId, currentUser.id), currentUser };
}

export function getTripPage(context: Readonly<RouterContextProvider>, request: Request, tripId: string) {
  let pages = context.get(tripPageContext);
  if (!pages) {
    pages = new Map();
    context.set(tripPageContext, pages);
  }
  let page = pages.get(tripId);
  if (!page) {
    page = loadPage(request, tripId);
    pages.set(tripId, page);
  }
  return page;
}

export function isTripBoardRequest(request: Request, tripId: string) {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "").replace(/\/$/, "");
  return pathname === `/trips/${encodeURIComponent(tripId)}`;
}
