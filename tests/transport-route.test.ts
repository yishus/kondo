import { expect, test } from "bun:test";

import { buildTransitRoutePlan, googleTransitDirectionsUrl } from "../app/transport-route";

const now = new Date("2026-09-20T12:00:00");

test("builds scheduled train and subway route plans", () => {
  const train = buildTransitRoutePlan({
    mode: "train",
    date: "2026-09-21",
    departureTime: "08:15",
    arrivalTime: "09:45",
    now,
  });
  expect(train.ok).toBe(true);
  if (train.ok) {
    expect(train.preferredMode).toBe("TRAIN");
    expect(train.timeField).toBe("departureTime");
    expect(train.requestTime.getHours()).toBe(8);
    expect(train.requestTime.getMinutes()).toBe(15);
  }

  const subway = buildTransitRoutePlan({
    mode: "subway",
    date: "2026-09-21",
    departureTime: "",
    arrivalTime: "10:30",
    now,
  });
  expect(subway.ok).toBe(true);
  if (subway.ok) {
    expect(subway.preferredMode).toBe("SUBWAY");
    expect(subway.timeField).toBe("arrivalTime");
  }
});

test("requires a scheduled day and time inside Google's transit window", () => {
  expect(buildTransitRoutePlan({ mode: "train", date: null, departureTime: "08:00", arrivalTime: "", now })).toEqual({
    ok: false,
    error: "Move this card to a trip day before previewing its route.",
  });
  expect(buildTransitRoutePlan({ mode: "subway", date: "2026-09-21", departureTime: "", arrivalTime: "", now })).toEqual({
    ok: false,
    error: "Add a departure or arrival time to preview a scheduled transit route.",
  });
  expect(buildTransitRoutePlan({ mode: "train", date: "2026-09-01", departureTime: "08:00", arrivalTime: "", now }).ok).toBe(false);
  expect(buildTransitRoutePlan({ mode: "subway", date: "2027-01-01", departureTime: "08:00", arrivalTime: "", now }).ok).toBe(false);
});

test("builds a key-free Google Maps transit directions link", () => {
  const url = new URL(googleTransitDirectionsUrl("Tokyo Station", "Shibuya Station"));
  expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
  expect(url.searchParams.get("origin")).toBe("Tokyo Station");
  expect(url.searchParams.get("destination")).toBe("Shibuya Station");
  expect(url.searchParams.get("travelmode")).toBe("transit");
});
