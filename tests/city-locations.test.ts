import { expect, test } from "bun:test";

import { cityLocationTypeColor, MAX_CITY_LOCATIONS, readCityLocations } from "../app/city-locations";

function form(value?: unknown) {
  const data = new FormData();
  if (value !== undefined) data.set("cityLocations", typeof value === "string" ? value : JSON.stringify(value));
  return data;
}

test("area locations accept suggested and user-created types", () => {
  const locations = [
    { googlePlaceId: "ChIJ_one", googleMapsQuery: "Cafe Tokyo", locationType: "Coffee" },
    { googlePlaceId: "ChIJ_two", googleMapsQuery: "Vinyl Tokyo", locationType: "Record shops" },
  ];
  expect(readCityLocations(form(locations), "city")).toEqual({ ok: true, locations });
  expect(readCityLocations(form(locations), "location")).toEqual({ ok: true, locations: [] });
});

test("omitting the area location field preserves existing data", () => {
  const current = [{ googlePlaceId: "ChIJ_saved", googleMapsQuery: "Saved", locationType: "Interest" }];
  expect(readCityLocations(form(), "city", current)).toEqual({ ok: true, locations: current });
});

test("area location validation rejects duplicates, invalid fields, and excessive lists", () => {
  const valid = { googlePlaceId: "ChIJ_valid", googleMapsQuery: "Valid place", locationType: "Interest" };
  for (const value of [
    "not json",
    [{ ...valid, googlePlaceId: "bad place id" }],
    [{ ...valid, googleMapsQuery: "" }],
    [{ ...valid, locationType: "" }],
    [valid, valid],
    Array.from({ length: MAX_CITY_LOCATIONS + 1 }, (_, index) => ({ ...valid, googlePlaceId: `ChIJ_${index}` })),
  ]) expect(readCityLocations(form(value), "city").ok).toBe(false);
});

test("map colors are fixed for defaults and deterministic for custom types", () => {
  expect(cityLocationTypeColor("Restaurants")).toBe("#c93756");
  expect(cityLocationTypeColor("coffee")).toBe("#8b5e3c");
  expect(cityLocationTypeColor("Interest")).toBe("#3568c0");
  expect(cityLocationTypeColor("Record shops")).toBe(cityLocationTypeColor(" record shops "));
});
