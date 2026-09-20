import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

// Exercise the real route actions and Drizzle queries against SQLite. This small
// D1 adapter exposes the prepared-statement methods used by Drizzle.
const sqlite = new Database(":memory:");
const binding = {
  prepare(query: string) {
    return {
      bind(...args: any[]) {
        const statement = sqlite.query(query);
        return {
          async raw() { return statement.values(...args); },
          execute() { return { results: statement.all(...args), success: true }; },
          async all() { return this.execute(); },
          async run() { return { meta: statement.run(...args), success: true }; },
        };
      },
    };
  },
  async batch(statements: { execute: () => unknown }[]) {
    return sqlite.transaction(() => statements.map((statement) => statement.execute()))();
  },
};
const storedFiles = new Map<string, ArrayBuffer>();
let failUpload = false;
const attachmentBucket = {
  async put(key: string, body: ReadableStream) {
    if (failUpload) throw new Error("Simulated upload failure");
    storedFiles.set(key, await new Response(body).arrayBuffer());
  },
  async get(key: string) {
    const bytes = storedFiles.get(key);
    return bytes ? { body: bytes } : null;
  },
  async delete(keys: string | string[]) {
    for (const key of typeof keys === "string" ? [keys] : keys) storedFiles.delete(key);
  },
};
mock.module("cloudflare:workers", () => ({ env: { DB: binding, ATTACHMENTS: attachmentBucket } }));
mock.module("../app/auth.server", () => ({
  requireTripOwner: async () => ({ id: "test-user", name: "Test User", email: "test@example.com" }),
}));
const { action, loader, default: TripBoard } = await import("../app/routes/trip");
const { loader: attachmentLoader } = await import("../app/routes/attachment");
const { loader: placeSearchLoader } = await import("../app/routes/place-search");
const { loader: placePhotoLoader } = await import("../app/routes/place-photo");
const baseline = readFileSync(new URL("../migrations/0000_initial.sql", import.meta.url), "utf8");
const locationCategoriesMigration = readFileSync(new URL("../migrations/0003_location_categories.sql", import.meta.url), "utf8");
const expandedLocationCategoriesMigration = readFileSync(new URL("../migrations/0004_expand_location_categories.sql", import.meta.url), "utf8");
const locationCardCoversMigration = readFileSync(new URL("../migrations/0005_location_card_covers.sql", import.meta.url), "utf8");
const cityCardLocationsMigration = readFileSync(new URL("../migrations/0006_city_card_locations.sql", import.meta.url), "utf8");

beforeEach(() => {
  storedFiles.clear();
  failUpload = false;
  sqlite.exec("PRAGMA foreign_keys = OFF; DROP TABLE IF EXISTS accommodation_documents; DROP TABLE IF EXISTS accommodations; DROP TABLE IF EXISTS accommodation_places; DROP TABLE IF EXISTS trip_notes; DROP TABLE IF EXISTS trip_todos; DROP TABLE IF EXISTS city_card_locations; DROP TABLE IF EXISTS card_attachments; DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS day_city_groups; DROP TABLE IF EXISTS trip_days; DROP TABLE IF EXISTS trips; PRAGMA foreign_keys = ON;");
  sqlite.exec(baseline);
  sqlite.exec(locationCategoriesMigration);
  sqlite.exec(expandedLocationCategoriesMigration);
  sqlite.exec(locationCardCoversMigration);
  sqlite.exec(cityCardLocationsMigration);
  sqlite.exec("INSERT INTO trips(id,title) VALUES ('trip','Japan'),('other','Other'); INSERT INTO trip_days(id,trip_id,trip_date) VALUES ('day','trip','2026-09-14'),('next','trip','2026-09-15'),('foreign','other','2026-09-14'); INSERT INTO cards(id,trip_id,trip_day_id,title) VALUES ('legacy','trip','day','Breakfast');");
});
afterAll(() => sqlite.close());

async function submit(fields: Record<string, string>, tripId = "trip") {
  const result: any = await action({ params: { tripId }, request: new Request(`http://localhost/trips/${tripId}`, { method: "POST", body: new URLSearchParams(fields) }) } as any);
  return result.data ? { ...result.data, status: result.init.status } : { ...result, status: 200 };
}
async function board() {
  return loader({ params: { tripId: "trip" } } as any);
}
async function addCard(type: string, extra: Record<string, string> = {}) {
  expect((await submit({ intent: "add-card", tripDayId: "day", type, title: "Tokyo", ...extra })).ok).toBe(true);
  return (await board()).tripColumns.find((day) => day.id === (extra.tripDayId ?? "day"))!.cards.at(-1)!;
}

test("legacy locations remain on the root of the day", async () => {
  expect((await board()).tripColumns[1].cards[0]).toMatchObject({ id: "legacy", type: "location", title: "Breakfast", attachments: [] });
  expect((await board()).tripColumns[1]).not.toHaveProperty("cityGroups");
  expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("mixed card types save, edit, and render in one ordered list", async () => {
  const city = await addCard("city");
  const transport = await addCard("transport", { transportMode: "subway", startLocation: "Tokyo", endLocation: "Shibuya", departureTime: "06:30", arrivalTime: "07:00", serviceNumber: "G01", description: "Platform 3" });
  const location = await addCard("location", { title: "Mountain trail", locationCategory: "hike" });
  expect((await submit({ intent: "update-card", cardId: city.id, title: "Kanto" })).ok).toBe(true);
  expect((await submit({ intent: "update-card", cardId: transport.id, endLocation: "Ginza", transportMode: "train" })).ok).toBe(true);
  const loaderData = await board();
  expect(loaderData.tripColumns[1].cards.map((card) => card.title)).toEqual(["Breakfast", "Kanto", "Tokyo → Ginza", "Mountain trail"]);
  expect(loaderData.tripColumns[1].cards[2]).toMatchObject({ type: "transport", transportMode: "train", startLocation: "Tokyo", endLocation: "Ginza", departureTime: "06:30", description: "Platform 3" });
  expect(loaderData.tripColumns[1].cards.find((card) => card.id === location.id)).toMatchObject({ type: "location", locationCategory: "hike" });
  const router = createMemoryRouter([{ path: "/", element: createElement(TripBoard, { loaderData } as any) }]);
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  expect(html).toContain("Tokyo → Ginza");
  expect(html).toContain("G01");
  expect(html).toContain("Location · Hike");
  expect(html).not.toContain("Unassigned");
  router.dispose();
});

test("city cards move independently of adjacent locations and transport cards", async () => {
  const city = await addCard("city");
  const transport = await addCard("transport", { transportMode: "train", startLocation: "Tokyo", endLocation: "Kyoto" });
  expect((await move(city.id, "next")).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.map((card) => card.id)).toEqual(["legacy", transport.id]);
  expect((await move(transport.id, "unscheduled")).ok).toBe(true);
  expect((await move(city.id, "unscheduled", { fromDayId: "next", beforeCardId: transport.id })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards.map((card) => card.type)).toEqual(["city", "transport"]);
  expect((await submit({ intent: "delete-card", cardId: city.id })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards.map((card) => card.id)).toEqual([transport.id]);
});

test("city cards save multiple Google places with suggested and custom types", async () => {
  const initialLocations = [
    { googlePlaceId: "ChIJ_restaurant", googleMapsQuery: "Sushi Dai Tokyo", locationType: "Restaurants" },
    { googlePlaceId: "ChIJ_coffee", googleMapsQuery: "Glitch Coffee Tokyo", locationType: "Coffee" },
    { googlePlaceId: "ChIJ_record", googleMapsQuery: "Tower Records Shibuya", locationType: "Record shops" },
  ];
  const city = await addCard("city", { cityLocations: JSON.stringify(initialLocations) });
  expect(city.cityLocations.map(({ googlePlaceId, googleMapsQuery, locationType, position }) => ({ googlePlaceId, googleMapsQuery, locationType, position }))).toEqual(
    initialLocations.map((location, position) => ({ ...location, position })),
  );

  const loaderData = await board();
  const router = createMemoryRouter([{ path: "/", element: createElement(TripBoard, { loaderData } as any) }]);
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  expect(html).toContain("3 locations");
  expect(html).not.toContain("Map of 3 area locations");
  expect(html).not.toContain("Restaurants");
  expect(html).not.toContain("Record shops");
  router.dispose();

  const updatedLocations = [
    { ...initialLocations[2], locationType: "Music" },
    { googlePlaceId: "ChIJ_garden", googleMapsQuery: "Shinjuku Gyoen", locationType: "Interest" },
  ];
  expect((await submit({ intent: "update-card", cardId: city.id, title: "Tokyo", cityLocations: JSON.stringify(updatedLocations) })).ok).toBe(true);
  expect((await move(city.id, "next")).ok).toBe(true);
  expect((await board()).tripColumns[2].cards[0].cityLocations.map((location) => location.locationType)).toEqual(["Music", "Interest"]);
  expect((await submit({ intent: "delete-card", cardId: city.id })).ok).toBe(true);
  expect(sqlite.query("SELECT * FROM city_card_locations").all()).toEqual([]);
});

test("invalid city location lists are rejected without changing saved locations", async () => {
  const saved = [{ googlePlaceId: "ChIJ_saved", googleMapsQuery: "Saved cafe", locationType: "Coffee" }];
  const city = await addCard("city", { cityLocations: JSON.stringify(saved) });
  const attempts = [
    "not json",
    JSON.stringify([{ ...saved[0], locationType: "" }]),
    JSON.stringify([{ ...saved[0], googleMapsQuery: "" }]),
    JSON.stringify([saved[0], saved[0]]),
  ];
  for (const cityLocations of attempts) {
    expect((await submit({ intent: "update-card", cardId: city.id, title: "Tokyo", cityLocations })).status).toBe(400);
  }
  expect((await board()).tripColumns[1].cards.find((card) => card.id === city.id)?.cityLocations).toMatchObject(saved);
});

test("rejects invalid types, empty names, incomplete transport, and foreign days", async () => {
  const before = sqlite.query("SELECT * FROM cards ORDER BY id").all();
  for (const extra of [
    { type: "invalid" }, { type: "city", title: " " },
    { type: "transport", transportMode: "teleport", startLocation: "Tokyo", endLocation: "Kyoto" },
    { type: "transport", transportMode: "train", startLocation: "Tokyo" },
    { type: "transport", transportMode: "train", endLocation: "Kyoto" },
    { type: "transport", transportMode: "train", startLocation: "Tokyo", endLocation: "Kyoto", departureTime: "25:00" },
    { type: "location", locationCategory: "invalid" },
    { tripDayId: "foreign" },
  ]) expect((await submit({ intent: "add-card", tripDayId: "day", title: "Test", ...extra } as Record<string, string>)).ok).toBe(false);
  expect((await submit({ intent: "update-card", cardId: "legacy", type: "city", title: "Tokyo" })).status).toBe(400);
  expect((await submit({ intent: "update-card", cardId: "legacy", title: "Wrong trip" }, "other")).status).toBe(404);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
});

async function move(cardId: string, tripDayId: string, extra: Record<string, string> = {}) {
  return submit({ intent: "move-card", cardId, fromDayId: "day", tripDayId, ...extra });
}

function seedMoreCards() {
  sqlite.exec("INSERT INTO cards(id,trip_id,trip_day_id,title,description,position) VALUES ('lunch','trip','day','Lunch','Reservation',1),('dinner','trip','day','Dinner','',2)");
}

test("cards reorder forward, backward, and to the end, with contiguous saved positions", async () => {
  seedMoreCards();
  expect((await move("legacy", "day", { beforeCardId: "dinner" })).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.map((card) => card.id)).toEqual(["lunch", "legacy", "dinner"]);
  expect((await move("dinner", "day", { beforeCardId: "lunch" })).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.map((card) => card.id)).toEqual(["dinner", "lunch", "legacy"]);
  expect((await move("dinner", "day")).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.map((card) => card.id)).toEqual(["lunch", "legacy", "dinner"]);
  expect(sqlite.query("SELECT position FROM cards ORDER BY position").values()).toEqual([[0], [1], [2]]);
});

test("cards move to empty days without losing content", async () => {
  seedMoreCards();
  expect((await move("lunch", "next")).ok).toBe(true);
  expect((await board()).tripColumns[2].cards[0]).toMatchObject({ id: "lunch", description: "Reservation" });
  expect((await move("legacy", "next", { beforeCardId: "lunch" })).ok).toBe(true);
  expect((await board()).tripColumns[2].cards.map((card) => card.id)).toEqual(["legacy", "lunch"]);
  expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("invalid, stale, and cross-trip drops leave all cards unchanged", async () => {
  seedMoreCards();
  const before = sqlite.query("SELECT * FROM cards ORDER BY id").all();
  const attempts = [
    move("legacy", "foreign"),
    move("legacy", "missing"),
    move("legacy", "next", { beforeCardId: "lunch" }),
    move("legacy", "day", { beforeCardId: "missing" }),
    move("legacy", "next", { fromDayId: "next" }),
    submit({ intent: "move-card", cardId: "legacy", fromDayId: "day", tripDayId: "foreign" }, "other"),
  ];
  for (const attempt of attempts) expect((await attempt).ok).toBe(false);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
  expect((await move("legacy", "day", { beforeCardId: "legacy" })).ok).toBe(true);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
});

test("a failure during reordering rolls back the card move and all positions", async () => {
  seedMoreCards();
  const before = sqlite.query("SELECT * FROM cards ORDER BY id").all();
  sqlite.exec("CREATE TRIGGER reject_reorder BEFORE UPDATE OF position ON cards WHEN NEW.id = 'dinner' BEGIN SELECT RAISE(ABORT, 'Simulated write failure'); END;");
  const result = await move("lunch", "next");
  expect(result.status).toBe(500);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
});

test("a trip without days can create, load, and edit unscheduled cards", async () => {
  sqlite.exec("INSERT INTO trips(id,title) VALUES ('empty','Undecided')");
  const load = () => loader({ params: { tripId: "empty" } } as any);
  expect((await load()).tripColumns).toEqual([{ id: "unscheduled", date: null, cards: [] }]);
  expect((await submit({ intent: "add-card", tripDayId: "unscheduled", title: "Maybe a museum", description: "Check opening hours" }, "empty")).ok).toBe(true);
  const card = (await load()).tripColumns[0].cards[0];
  expect((await submit({ intent: "update-card", cardId: card.id, title: "Art museum", description: card.description }, "empty")).ok).toBe(true);
  expect((await load()).tripColumns[0].cards[0]).toMatchObject({ title: "Art museum", description: "Check opening hours" });
  expect(sqlite.query("SELECT trip_id, trip_day_id FROM cards WHERE id = ?").get(card.id)).toEqual({ trip_id: "empty", trip_day_id: null });
  expect((await board()).tripColumns[0].cards).toEqual([]);
});

test("parking, reordering, and scheduling cards preserves content", async () => {
  seedMoreCards();
  expect((await submit({ intent: "update-card", cardId: "lunch", title: "Lunch", description: "Reservation" })).ok).toBe(true);
  expect((await move("lunch", "unscheduled")).ok).toBe(true);
  expect((await move("dinner", "unscheduled")).ok).toBe(true);
  expect((await move("dinner", "unscheduled", { fromDayId: "unscheduled", beforeCardId: "lunch" })).ok).toBe(true);
  const parked = (await board()).tripColumns[0].cards;
  expect(parked.map((card) => card.id)).toEqual(["dinner", "lunch"]);
  expect(parked[1]).toMatchObject({ title: "Lunch", description: "Reservation" });
  expect((await move("lunch", "day", { fromDayId: "unscheduled" })).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.find((card) => card.id === "lunch")).toMatchObject({ description: "Reservation" });
  expect(sqlite.query("SELECT position FROM cards WHERE trip_day_id IS NULL ORDER BY position").values()).toEqual([[0]]);
  expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("unscheduled cards reject stale moves and cross-trip access", async () => {
  await move("legacy", "unscheduled");
  expect((await submit({ intent: "add-card", tripDayId: "unscheduled", title: "Other idea" }, "other")).ok).toBe(true);
  const other = await loader({ params: { tripId: "other" } } as any);
  const foreignCard = other.tripColumns[0].cards[0];
  const before = sqlite.query("SELECT * FROM cards ORDER BY id").all();
  const attempts = [
    move("legacy", "day"),
    move("legacy", "foreign", { fromDayId: "unscheduled" }),
    move("legacy", "unscheduled", { fromDayId: "unscheduled", beforeCardId: foreignCard.id }),
    submit({ intent: "update-card", cardId: "legacy", title: "Invalid" }, "other"),
    submit({ intent: "move-card", cardId: "legacy", fromDayId: "unscheduled", tripDayId: "unscheduled" }, "other"),
  ];
  for (const attempt of attempts) expect((await attempt).ok).toBe(false);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
  expect((await move("legacy", "next", { fromDayId: "unscheduled" })).ok).toBe(true);
  expect((await loader({ params: { tripId: "other" } } as any)).tripColumns[0].cards).toEqual([foreignCard]);
});

test("card locations can be added, preserved during edits and moves, replaced, and removed", async () => {
  expect((await submit({ intent: "add-card", tripDayId: "unscheduled", title: "Museum", locationCategory: "place_of_interest", googlePlaceId: "ChIJ_museum", googleMapsQuery: "Museum Tokyo" })).ok).toBe(true);
  const card = (await board()).tripColumns[0].cards[0];
  expect(card).toMatchObject({ locationCategory: "place_of_interest", googlePlaceId: "ChIJ_museum", googleMapsQuery: "Museum Tokyo" });
  expect((await submit({ intent: "update-card", cardId: card.id, title: "Museum afternoon", locationCategory: "food" })).ok).toBe(true);
  expect((await move(card.id, "day", { fromDayId: "unscheduled" })).ok).toBe(true);
  expect((await board()).tripColumns[1].cards.find((item) => item.id === card.id)).toMatchObject({ locationCategory: "food", googlePlaceId: "ChIJ_museum", googleMapsQuery: "Museum Tokyo" });
  expect((await move(card.id, "unscheduled")).ok).toBe(true);
  expect((await submit({ intent: "update-card", cardId: card.id, title: "Garden", googlePlaceId: "ChIJ_garden", googleMapsQuery: "Garden Tokyo" })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0]).toMatchObject({ googlePlaceId: "ChIJ_garden", googleMapsQuery: "Garden Tokyo" });
  expect((await submit({ intent: "update-card", cardId: card.id, title: "Garden", locationCategory: "", googlePlaceId: "", googleMapsQuery: "" })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0]).toMatchObject({ locationCategory: null, googlePlaceId: null, googleMapsQuery: null });
});

test("invalid or cross-trip location edits leave the card unchanged", async () => {
  const before = sqlite.query("SELECT * FROM cards ORDER BY id").all();
  for (const location of [
    { googlePlaceId: "ChIJ_test" },
    { googleMapsQuery: "Tokyo" },
    { googlePlaceId: "javascript:alert(1)", googleMapsQuery: "Tokyo" },
    { googlePlaceId: "ChIJ_test", googleMapsQuery: "" },
    { googlePlaceId: "", googleMapsQuery: "Tokyo" },
    { googlePlaceId: "ChIJ_test", googleMapsQuery: "x".repeat(201) },
  ]) {
    expect((await submit({ intent: "update-card", cardId: "legacy", title: "Breakfast", ...location } as Record<string, string>)).status).toBe(400);
  }
  expect((await submit({ intent: "update-card", cardId: "legacy", title: "Breakfast", googlePlaceId: "ChIJ_test", googleMapsQuery: "Tokyo" }, "other")).status).toBe(404);
  expect(sqlite.query("SELECT * FROM cards ORDER BY id").all()).toEqual(before);
});

test("place search checks the trip and reports missing configuration without caching", async () => {
  for (const [tripId, status] of [["missing", 404], ["trip", 503]] as const) {
    const response = await placeSearchLoader({ params: { tripId }, request: new Request(`http://localhost/trips/${tripId}/places?q=Tokyo`) } as any);
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ places: [], error: expect.any(String) });
  }
});

test("place photo lookup is card-scoped, private, and reports missing configuration", async () => {
  expect((await submit({ intent: "add-card", tripDayId: "unscheduled", title: "Museum", googlePlaceId: "ChIJ_museum", googleMapsQuery: "Museum Tokyo" })).ok).toBe(true);
  const card = (await board()).tripColumns[0].cards[0];
  const response = await placePhotoLoader({
    params: { tripId: "trip", cardId: card.id },
    request: new Request("http://localhost/photo"),
  } as any);
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ photo: null, error: "A Google Maps photo is unavailable." });

  const foreign = await placePhotoLoader({
    params: { tripId: "other", cardId: card.id },
    request: new Request("http://localhost/photo"),
  } as any);
  expect(foreign.status).toBe(404);
});

async function saveFiles(files: File[], fields: Record<string, string> = {}, tripId = "trip") {
  const form = new FormData();
  for (const [key, value] of Object.entries({ intent: "update-card", cardId: "legacy", title: "Breakfast", ...fields })) form.set(key, value);
  for (const file of files) form.append("attachments", file);
  // Preserve empty-file names that Bun's multipart parser currently drops.
  // Browser tests exercise real multipart parsing in the Worker runtime.
  const request = { headers: new Headers(), formData: async () => form };
  const result: any = await action({ params: { tripId }, request } as any);
  return result.data ? { ...result.data, status: result.init.status } : { ...result, status: 200 };
}
const pdfFile = () => new File(["%PDF-1.4\nTest attachment\n%%EOF"], "booking.pdf", { type: "application/pdf" });
const jpgFile = () => new File([new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217])], "photo.jpg", { type: "image/jpeg" });

test("JPG and PDF attachments persist with cards, can be downloaded, and follow moves", async () => {
  const jpg = new File([new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217])], "photo.JPG", { type: "image/jpeg" });
  expect((await saveFiles([jpg, pdfFile()])).ok).toBe(true);
  const attachments = (await board()).tripColumns[1].cards[0].attachments;
  expect(attachments.map((file) => file.filename)).toEqual(["photo.JPG", "booking.pdf"]);
  const file = attachments[1];
  const response = await attachmentLoader({ params: { tripId: "trip", cardId: "legacy", attachmentId: file.id }, request: new Request("http://localhost/file?download=1") } as any);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect(await response.text()).toBe(await pdfFile().text());
  expect((await move("legacy", "unscheduled")).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0].attachments).toEqual(attachments);
  expect((await saveFiles([], { removeAttachmentId: file.id })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0].attachments).toHaveLength(1);
  expect(storedFiles.size).toBe(1);
  await expect(attachmentLoader({ params: { tripId: "trip", cardId: "legacy", attachmentId: file.id }, request: new Request("http://localhost/file") } as any)).rejects.toMatchObject({ status: 404 });
});

test("location cards can select, preserve, clear, and remove an uploaded JPG cover", async () => {
  expect((await saveFiles([jpgFile()], { coverAttachment: "upload:0" })).ok).toBe(true);
  let card = (await board()).tripColumns[1].cards[0];
  const photo = card.attachments[0];
  expect(card.coverAttachmentId).toBe(photo.id);

  const loaderData = await board();
  const router = createMemoryRouter([{ path: "/", element: createElement(TripBoard, { loaderData } as any) }]);
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  expect(html).toContain("Breakfast cover");
  expect(html).toContain(`/attachments/${photo.id}`);
  router.dispose();

  expect((await move("legacy", "unscheduled")).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0].coverAttachmentId).toBe(photo.id);
  expect((await saveFiles([], { coverAttachment: "" })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards[0].coverAttachmentId).toBeNull();
  expect((await saveFiles([], { coverAttachment: `existing:${photo.id}` })).ok).toBe(true);
  expect((await saveFiles([], { removeAttachmentId: photo.id })).ok).toBe(true);
  card = (await board()).tripColumns[0].cards[0];
  expect(card).toMatchObject({ coverAttachmentId: null, attachments: [] });

  expect((await saveFiles([pdfFile()], { coverAttachment: "upload:0" })).status).toBe(400);
  expect(storedFiles.size).toBe(0);
});

test("attachment validation rejects unsupported, disguised, oversized, and excessive files before saving", async () => {
  const invalid = [
    [new File(["text"], "notes.txt")],
    [new File(["not a PDF"], "fake.pdf", { type: "application/pdf" })],
    [new File(["not a JPG"], "fake.jpg", { type: "image/jpeg" })],
    [new File([], "empty.pdf")],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg")],
    Array.from({ length: 6 }, pdfFile),
  ];
  for (const files of invalid) expect((await saveFiles(files, { title: "Changed" })).status, files.map((file) => file.name).join(", ")).toBe(400);
  expect(storedFiles.size).toBe(0);
  expect((await board()).tripColumns[1].cards[0]).toMatchObject({ title: "Breakfast", attachments: [] });
  expect((await submit({ intent: "update-card", cardId: "legacy", title: "Breakfast", attachments: "" })).ok).toBe(true);
});

test("attachments are scoped to their card and trip", async () => {
  await saveFiles([pdfFile()]);
  const file = (await board()).tripColumns[1].cards[0].attachments[0];
  for (const params of [
    { tripId: "other", cardId: "legacy", attachmentId: file.id },
    { tripId: "trip", cardId: "missing", attachmentId: file.id },
  ]) await expect(attachmentLoader({ params, request: new Request("http://localhost/file") } as any)).rejects.toMatchObject({ status: 404 });
  expect((await saveFiles([], { removeAttachmentId: file.id }, "other")).status).toBe(404);
  expect((await saveFiles([], { removeAttachmentId: "missing" })).status).toBe(400);
  expect(storedFiles.size).toBe(1);
});

test("failed uploads or database writes preserve the card and clean up new files", async () => {
  failUpload = true;
  expect((await saveFiles([pdfFile()], { title: "Changed" })).status).toBe(500);
  failUpload = false;
  sqlite.exec("CREATE TRIGGER reject_attachment BEFORE INSERT ON card_attachments BEGIN SELECT RAISE(ABORT, 'Simulated attachment failure'); END;");
  expect((await saveFiles([pdfFile()], { title: "Changed" })).status).toBe(500);
  expect(storedFiles.size).toBe(0);
  expect((await board()).tripColumns[1].cards[0]).toMatchObject({ title: "Breakfast", attachments: [] });
});

test("deleting a scheduled card removes attachments and preserves the rest of the day", async () => {
  seedMoreCards();
  await saveFiles([pdfFile()], {});
  expect((await submit({ intent: "delete-card", cardId: "legacy" })).ok).toBe(true);
  const day = (await board()).tripColumns[1];
  expect(day.cards.map((card) => card.id)).toEqual(["lunch", "dinner"]);
  expect(sqlite.query("SELECT * FROM card_attachments").all()).toEqual([]);
  expect(storedFiles.size).toBe(0);
  expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("deleting an unscheduled card is scoped to its trip and handles missing cards", async () => {
  await move("legacy", "unscheduled");
  await saveFiles([pdfFile()]);
  expect((await submit({ intent: "delete-card", cardId: "legacy" }, "other")).status).toBe(404);
  expect((await board()).tripColumns[0].cards).toHaveLength(1);
  expect(storedFiles.size).toBe(1);
  expect((await submit({ intent: "delete-card", cardId: "legacy" })).ok).toBe(true);
  expect((await board()).tripColumns[0].cards).toEqual([]);
  expect((await submit({ intent: "delete-card", cardId: "legacy" })).status).toBe(404);
  expect(storedFiles.size).toBe(0);
});

test("a failed card deletion preserves the card and attachments", async () => {
  await saveFiles([pdfFile()]);
  sqlite.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON cards BEGIN SELECT RAISE(ABORT, 'Simulated delete failure'); END;");
  expect((await submit({ intent: "delete-card", cardId: "legacy" })).status).toBe(500);
  expect((await board()).tripColumns[1].cards[0].attachments).toHaveLength(1);
  expect(storedFiles.size).toBe(1);
});
