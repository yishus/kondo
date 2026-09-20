import { expect, test } from "bun:test";
import { readAccommodation, stayNights } from "../app/accommodations";

function form(overrides: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ name: "Tokyo hotel", kind: "hotel", currency: "SGD", dateOptions: JSON.stringify([{ id: "first", checkIn: "2026-09-20", checkOut: "2026-09-23", totalCost: "420.50" }]), ...overrides })) result.set(key, value);
  return result;
}
test("nights count check-out exclusively across DST, leap years, and year boundaries", () => {
  expect(stayNights("2026-03-07", "2026-03-10")).toBe(3);
  expect(stayNights("2028-02-28", "2028-03-01")).toBe(2);
  expect(stayNights("2026-12-31", "2027-01-02")).toBe(2);
  expect(stayNights("2026-02-29", "2026-03-02")).toBe(0);
  expect(stayNights("2026-09-20", "2026-09-20")).toBe(0);
});
test("shortlists can omit quotes; confirmation must refer to a supplied option", () => {
  expect(readAccommodation(form({ dateOptions: "[]" })).value?.dateOptions).toEqual([]);
  expect(readAccommodation(form({ confirmedOptionId: "first" })).value?.confirmedOptionId).toBe("first");
  expect(readAccommodation(form({ confirmedOptionId: "other" })).error).toContain("existing date option");
});
test("reject malformed dates, duplicate options, and invalid costs", () => {
  const option = { id: "first", checkIn: "2026-09-20", checkOut: "2026-09-23", totalCost: "420.50" };
  for (const totalCost of ["-1", "NaN", "Infinity", "1e8", "1.234", "", "1000000000"]) expect(readAccommodation(form({ dateOptions: JSON.stringify([{ ...option, totalCost }]) })).error).toBeDefined();
  for (const checkOut of ["2026-09-19", "2026-09-20", "2026-02-30"]) expect(readAccommodation(form({ dateOptions: JSON.stringify([{ ...option, checkOut }]) })).error).toBeDefined();
  expect(readAccommodation(form({ dateOptions: JSON.stringify([option, option]) })).error).toContain("unique");
  expect(readAccommodation(form({ dateOptions: "null" })).error).toBeDefined();
});
test("free cancellation requires a real deadline and explicit time zone", () => {
  expect(readAccommodation(form({ freeCancellation: "on" })).error).toContain("deadline");
  expect(readAccommodation(form({ freeCancellation: "on", cancellationUntil: "2026-09-19T18:00", cancellationTimezone: "Invalid/Zone" })).error).toContain("time zone");
  const parsed = readAccommodation(form({ freeCancellation: "on", cancellationUntil: "2026-09-19T18:00", cancellationTimezone: "Asia/Tokyo" }));
  expect(parsed.value?.freeCancellation).toBe(true);
  expect(parsed.value?.cancellationTimezone).toBe("Asia/Tokyo");
  expect(readAccommodation(form({ cancellationUntil: "old", cancellationTimezone: "old" })).value?.cancellationUntil).toBe("");
});
