import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { getDb } from "../app/db.server";
import { accommodationAction, loadAccommodations } from "../app/accommodations.server";

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(readFileSync(new URL("../migrations/0000_initial.sql", import.meta.url), "utf8"));
  sqlite.exec("INSERT INTO trips(id,title) VALUES ('trip', 'Japan'), ('other', 'Other');");
  sqlite.exec("INSERT INTO accommodation_places VALUES ('tokyo', 'trip', 'Tokyo'), ('foreign', 'other', 'Other');");
  const binding = {
    prepare(query: string) { return { bind(...args: any[]) { const statement = sqlite.query(query); return {
      async raw() { return statement.values(...args); },
      execute() { return { results: statement.all(...args), success: true }; },
      async all() { return this.execute(); },
      async run() { return { meta: statement.run(...args), success: true }; },
    }; } }; },
    async batch(statements: { execute: () => unknown }[]) { return sqlite.transaction(() => statements.map((statement) => statement.execute()))(); },
  };
  const files = new Map<string, ArrayBuffer>();
  const bucket = {
    async put(key: string, stream: ReadableStream) { files.set(key, await new Response(stream).arrayBuffer()); },
    async delete(keys: string | string[]) { for (const key of typeof keys === "string" ? [keys] : keys) files.delete(key); },
  };
  const db = getDb(binding as unknown as D1Database);
  async function submit(fields: Record<string, string> = {}, file?: File, tripId = "trip") {
    const form = new FormData();
    for (const [key, value] of Object.entries({ intent: "add-candidate", placeId: "tokyo", name: "Tokyo hotel", kind: "hotel", currency: "SGD", dateOptions: '[{"id":"first","checkIn":"2026-10-01","checkOut":"2026-10-04","totalCost":"450"}]', ...fields })) form.set(key, value);
    if (file) form.set("document", file);
    const result = await accommodationAction(db, bucket as unknown as R2Bucket, tripId, new Request("http://localhost", { method: "POST", body: form }));
    return "data" in result ? { ...result.data, status: result.init?.status } : { ...result, status: 200 };
  }
  return { sqlite, files, bucket, submit, load: () => loadAccommodations(db, "trip") };
}
const pdf = (name = "booking.pdf") => new File(["%PDF-1.4\nBooking\n%%EOF"], name, { type: "application/pdf" });

test("booking saves, replacement, and destination deletion preserve scoped storage", async () => {
  const app = setup();
  try {
    expect((await app.submit({ confirmedOptionId: "first" }, pdf())).ok).toBe(true);
    const saved = (await app.load()).places[0].candidates[0];
    expect(saved.confirmedOptionId).toBe("first");
    expect(saved.document?.filename).toBe("booking.pdf");
    expect(app.files.size).toBe(1);
    expect((await app.submit({ intent: "save-candidate", accommodationId: saved.id }, pdf("replacement.pdf"))).ok).toBe(true);
    expect(app.files.size).toBe(1);
    expect((await app.load()).places[0].candidates[0].document?.filename).toBe("replacement.pdf");
    expect((await app.submit({ intent: "delete-candidate", accommodationId: saved.id }, undefined, "other")).status).toBe(404);
    expect((await app.submit({ intent: "add-candidate", placeId: "foreign" })).status).toBe(404);
    expect(app.files.size).toBe(1);
    expect((await app.submit({ intent: "delete-place" })).ok).toBe(true);
    expect(app.files.size).toBe(0);
    expect((await app.load()).places).toEqual([]);
    expect(app.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { app.sqlite.close(); }
});

test("failed replacement rolls back booking edits and retains the original PDF", async () => {
  const app = setup();
  try {
    await app.submit({}, pdf());
    const saved = (await app.load()).places[0].candidates[0];
    const oldKeys = [...app.files.keys()];
    app.sqlite.exec("CREATE TRIGGER fail_document BEFORE INSERT ON accommodation_documents BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
    const result = await app.submit({ intent: "save-candidate", accommodationId: saved.id, name: "Changed hotel" }, pdf("replacement.pdf"));
    expect(result.status).toBe(500);
    expect((await app.load()).places[0].candidates[0]).toEqual(saved);
    expect([...app.files.keys()]).toEqual(oldKeys);
    app.sqlite.exec("DROP TRIGGER fail_document");
    app.bucket.put = async () => { throw new Error("upload failed"); };
    expect((await app.submit({ intent: "save-candidate", accommodationId: saved.id, name: "Changed again" }, pdf())).status).toBe(500);
    expect((await app.load()).places[0].candidates[0]).toEqual(saved);
    expect([...app.files.keys()]).toEqual(oldKeys);
  } finally { app.sqlite.close(); }
});
