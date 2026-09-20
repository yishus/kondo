import { expect, test, type Page } from "@playwright/test";
import { ensureSignedIn } from "./auth";

async function createTrip(page: Page) {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Location test ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  const column = page.getByRole("region", { name: "Unscheduled cards", exact: true });
  await column.getByRole("button", { name: "Add card", exact: true }).click();
  return { column, dialog: page.getByRole("dialog") };
}

test("search, attach, replace, cancel, and remove a card's Google Maps location", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/trips/*/places?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")!;
    queries.push(query);
    await route.fulfill({ json: { error: null, places: [{
      id: query.includes("garden") ? "ChIJ_garden" : "ChIJ_museum",
      name: query.includes("garden") ? "Garden" : "Ghibli Museum",
      address: "Tokyo, Japan", attributions: [],
    }] } });
  });
  const { column, dialog } = await createTrip(page);
  await dialog.getByLabel("Title", { exact: true }).fill("Afternoon visit");
  await dialog.getByLabel("Search for a place", { exact: true }).fill("Ghibli Museum Tokyo");
  expect(queries).toEqual([]);
  await dialog.getByLabel("Search for a place", { exact: true }).press("Enter");
  await dialog.getByRole("button", { name: "Ghibli Museum Tokyo, Japan", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "View on Google Maps" })).toHaveAttribute("href", /query_place_id=ChIJ_museum/);
  await expect(column.locator(".trip-card-title")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const link = column.getByRole("link", { name: "View Afternoon visit on Google Maps" });
  await expect(link).toHaveAttribute("href", /query_place_id=ChIJ_museum/);
  await expect(link).toHaveAttribute("target", "_blank");

  await column.getByRole("button", { name: "Afternoon visit", exact: true }).click();
  await dialog.getByLabel("Search for a different place").fill("garden Tokyo");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.getByRole("button", { name: "Garden Tokyo, Japan", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(link).toHaveAttribute("href", /query_place_id=ChIJ_garden/);

  await column.getByRole("button", { name: "Afternoon visit", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove location", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(link).toHaveAttribute("href", /query_place_id=ChIJ_garden/);

  await page.setViewportSize({ width: 390, height: 844 });
  await column.getByRole("button", { name: "Afternoon visit", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove location", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(link).toHaveCount(0);
  await expect(column.getByRole("button", { name: "Afternoon visit", exact: true })).toBeVisible();
  expect(queries).toEqual(["Ghibli Museum Tokyo", "garden Tokyo"]);
});

test("empty results and search failures do not prevent saving a card without a location", async ({ page }) => {
  let searches = 0;
  await page.route("**/trips/*/places?*", async (route) => {
    searches += 1;
    await route.fulfill(searches === 1
      ? { json: { error: null, places: [] } }
      : { status: 502, json: { error: "Could not search Google Maps. Please try again in a moment.", places: [] } });
  });
  const { column, dialog } = await createTrip(page);
  await dialog.getByLabel("Title", { exact: true }).fill("Undecided visit");
  await expect(dialog.getByRole("button", { name: "Search", exact: true })).toBeDisabled();
  await dialog.getByLabel("Search for a place", { exact: true }).fill("Missing place");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("No places found");
  await dialog.getByLabel("Search for a place", { exact: true }).fill("Different place");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not search Google Maps");
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(column.getByRole("button", { name: "Undecided visit", exact: true })).toBeVisible();
  await expect(column.getByRole("link")).toHaveCount(0);
});

test("editing the search text discards old results and closing discards an unsaved location", async ({ page }) => {
  await page.route("**/trips/*/places?*", async (route) => {
    await route.fulfill({ json: { error: null, places: [{ id: "ChIJ_museum", name: "Museum", address: "Tokyo", attributions: [] }] } });
  });
  const { column, dialog } = await createTrip(page);
  await dialog.getByLabel("Search for a place", { exact: true }).fill("Museum Tokyo");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Location search results" })).toBeVisible();
  await dialog.getByLabel("Search for a place", { exact: true }).fill("Museum Kyoto");
  await expect(dialog.getByRole("list", { name: "Location search results" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.getByRole("button", { name: "Museum Tokyo", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await column.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(dialog.getByLabel("Search for a place", { exact: true })).toHaveValue("");
});
