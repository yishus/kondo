import { afterEach, expect, spyOn, test } from "bun:test";
import { googleMapsUrl } from "../app/card-location";
import { searchPlaces } from "../app/place-search.server";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("search requests only result fields and keeps the key out of the response", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ places: [{
    id: "ChIJ_museum", displayName: { text: "Ghibli Museum" }, formattedAddress: "Mitaka, Tokyo",
    attributions: [{ provider: "Provider", providerUri: "https://example.com" }],
  }] }));
  const result = await searchPlaces(" Ghibli Museum Tokyo ", "test-server-key");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
  expect(init?.headers).toMatchObject({ "X-Goog-Api-Key": "test-server-key", "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.attributions" });
  expect(JSON.parse(init?.body as string)).toEqual({ textQuery: "Ghibli Museum Tokyo", pageSize: 5 });
  expect(result).toEqual({ status: 200, body: { error: null, places: [{
    id: "ChIJ_museum", name: "Ghibli Museum", address: "Mitaka, Tokyo", attributions: [{ provider: "Provider", uri: "https://example.com" }],
  }] } });
  expect(JSON.stringify(result)).not.toContain("test-server-key");
});

test("missing key and invalid queries do not make paid requests", async () => {
  const fetch = spyOn(globalThis, "fetch");
  expect((await searchPlaces("Tokyo", undefined)).status).toBe(503);
  expect((await searchPlaces(" ", "key")).status).toBe(400);
  expect((await searchPlaces("x".repeat(201), "key")).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

test("empty results, upstream failures, and timeouts are handled safely", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}));
  expect((await searchPlaces("Missing place", "key")).body).toEqual({ error: null, places: [] });
  fetch.mockResolvedValueOnce(Response.json({ error: { message: "Private upstream diagnostic" } }, { status: 403 }));
  const failed = await searchPlaces("Tokyo", "key");
  expect(failed.status).toBe(502);
  expect(JSON.stringify(failed)).not.toContain("Private upstream diagnostic");
  fetch.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
  expect((await searchPlaces("Tokyo", "key")).status).toBe(502);
});

test("Maps links encode search text and target the selected place ID", () => {
  const url = new URL(googleMapsUrl("ChIJ_test", "Café & garden / 東京"));
  expect(url.origin).toBe("https://www.google.com");
  expect(url.pathname).toBe("/maps/search/");
  expect(url.searchParams.get("api")).toBe("1");
  expect(url.searchParams.get("query")).toBe("Café & garden / 東京");
  expect(url.searchParams.get("query_place_id")).toBe("ChIJ_test");
});
