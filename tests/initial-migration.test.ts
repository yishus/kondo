import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const migrationDir = new URL("../migrations/", import.meta.url);
const baseline = readFileSync(new URL("0000_initial.sql", migrationDir), "utf8");

test("the initial schema supports every feature and cascades only the deleted trip", () => {
  const db = new Database(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(baseline);
    db.exec(`
      INSERT INTO trips(id,title) VALUES ('trip','Japan'), ('other','Italy');
      INSERT INTO trip_days(id,trip_id,trip_date) VALUES ('day','trip','2026-10-01');
      INSERT INTO cards(id,trip_id,trip_day_id,title,type) VALUES
        ('location','trip','day','Museum','location'),
        ('city','trip','day','Tokyo','city'),
        ('transport','trip',NULL,'Train','transport'),
        ('other','other',NULL,'Idea','location');
      INSERT INTO card_attachments(id,card_id,filename,content_type,size) VALUES ('pdf','location','booking.pdf','application/pdf',100);
      INSERT INTO accommodation_places(id,trip_id,name) VALUES ('place','trip','Tokyo');
      INSERT INTO accommodations(id,place_id,name,kind) VALUES ('hotel','place','Hotel','hotel');
      INSERT INTO accommodation_documents(id,accommodation_id,filename,size) VALUES ('booking','hotel','stay.pdf',100);
      INSERT INTO trip_notes(trip_id,body) VALUES ('trip','Notes'), ('other','Keep');
      INSERT INTO trip_todos(id,trip_id,title) VALUES ('task','trip','Pack');
    `);
    expect(db.query("SELECT completed FROM trip_todos").values()).toEqual([[0]]);
    expect(() => db.exec("INSERT INTO trip_days(id,trip_id,trip_date) VALUES ('duplicate','trip','2026-10-01')")).toThrow();
    expect(() => db.exec("INSERT INTO cards(id,trip_id,title,type) VALUES ('invalid','trip','Test','invalid')")).toThrow();
    expect(() => db.exec("INSERT INTO trip_todos(id,trip_id,title) VALUES ('empty','trip',' ')")).toThrow();
    db.exec("DELETE FROM trips WHERE id = 'trip'");
    for (const table of ["trip_days", "card_attachments", "accommodation_places", "accommodations", "accommodation_documents", "trip_todos"]) {
      expect(db.query(`SELECT COUNT(*) FROM ${table}`).values()).toEqual([[0]]);
    }
    expect(db.query("SELECT id FROM trips").values()).toEqual([["other"]]);
    expect(db.query("SELECT id FROM cards").values()).toEqual([["other"]]);
    expect(db.query("SELECT body FROM trip_notes").values()).toEqual([["Keep"]]);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.close(); }
});
