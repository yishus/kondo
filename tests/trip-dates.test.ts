import { expect, test } from "bun:test";
import { getTripPeriod } from "../app/trip-dates";

const today = "2026-09-20";

test("groups dated trips into current, upcoming, and past periods", () => {
  expect(getTripPeriod("2026-09-20", "2026-09-20", today)).toBe("current");
  expect(getTripPeriod("2026-09-18", "2026-09-22", today)).toBe("current");
  expect(getTripPeriod("2026-09-21", "2026-09-24", today)).toBe("upcoming");
  expect(getTripPeriod("2026-09-10", "2026-09-19", today)).toBe("past");
});

test("keeps trips without dates available for upcoming planning", () => {
  expect(getTripPeriod(null, null, today)).toBe("upcoming");
});
