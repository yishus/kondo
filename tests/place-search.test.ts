import { afterEach, expect, spyOn, test } from "bun:test";
import { googleMapsUrl } from "../app/card-location";
import { getPlacePhoto } from "../app/place-photo.server";
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

test("place photos are resolved on demand without exposing the server key", async () => {
  const fetch = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ photos: [{
      name: "places/ChIJ_test/photos/photo_1",
      googleMapsUri: "https://www.google.com/maps/place/photo-source",
    }] }))
    .mockResolvedValueOnce(Response.json({ photoUri: "https://lh3.googleusercontent.com/place-photo" }));
  const result = await getPlacePhoto("ChIJ_test", "secret-key");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places/ChIJ_test");
  expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ "X-Goog-Api-Key": "secret-key", "X-Goog-FieldMask": "photos" });
  const mediaUrl = new URL(String(fetch.mock.calls[1][0]));
  expect(mediaUrl.pathname).toBe("/v1/places/ChIJ_test/photos/photo_1/media");
  expect(mediaUrl.searchParams.get("maxWidthPx")).toBe("1200");
  expect(mediaUrl.searchParams.get("skipHttpRedirect")).toBe("true");
  expect(result).toEqual({ status: 200, body: { error: null, photo: {
    imageUrl: "https://lh3.googleusercontent.com/place-photo",
    googleMapsUri: "https://www.google.com/maps/place/photo-source",
  } } });
  expect(JSON.stringify(result)).not.toContain("secret-key");
});

test("place photo lookup handles missing photos, configuration, and unsafe URLs", async () => {
  const fetch = spyOn(globalThis, "fetch");
  expect((await getPlacePhoto("bad/place", "key")).status).toBe(400);
  expect((await getPlacePhoto("ChIJ_test", undefined)).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();

  fetch.mockResolvedValueOnce(Response.json({ photos: [] }));
  expect(await getPlacePhoto("ChIJ_test", "key")).toEqual({ status: 200, body: { photo: null, error: null } });
  fetch.mockResolvedValueOnce(Response.json({ photos: [{
    name: "places/ChIJ_test/photos/photo_1", googleMapsUri: "javascript:alert(1)",
  }] }));
  expect(await getPlacePhoto("ChIJ_test", "key")).toEqual({ status: 200, body: { photo: null, error: null } });
});
