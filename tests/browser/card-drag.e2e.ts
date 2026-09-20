import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureSignedIn } from "./auth";

async function createBoard(page: Page) {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Drag test ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  for (const date of ["2026-09-14", "2026-09-15"]) {
    await page.locator("#trip-date").fill(date);
    await page.getByRole("button", { name: "Add day", exact: true }).click();
    await expect(page.locator("#trip-date")).toHaveValue("");
  }
  const first = page.getByRole("region", { name: "Itinerary for Mon, Sep 14", exact: true });
  const second = page.getByRole("region", { name: "Itinerary for Tue, Sep 15", exact: true });
  const tokyo = first;
  for (const title of ["Breakfast", "Museum", "Dinner"]) {
    await tokyo.getByRole("button", { name: "Add card", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Add card", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  return { first, second, tokyo, kyoto: second };
}

async function drag(page: Page, handle: Locator, target: Locator, expectSaved = true) {
  await expect(handle).toBeEnabled();
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const end = await target.boundingBox();
  if (!start || !end) throw new Error("Missing drag target");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2, { steps: 3 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
  // Auto-scroll can move a target while the pointer crosses the board.
  const currentEnd = await target.boundingBox();
  if (currentEnd) await page.mouse.move(currentEnd.x + currentEnd.width / 2, currentEnd.y + currentEnd.height / 2);
  await expect(page.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  const saved = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.request().postData()?.includes("move-card") === true);
  await page.mouse.up();
  await saved;
  if (expectSaved) await expect(page.getByRole("status").filter({ hasText: "Move saved." })).toBeVisible();
}

test("Unscheduled supports ideas before adding days, editing, and moving in both directions", async ({ page }) => {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Unscheduled test ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  const parked = page.getByRole("region", { name: "Unscheduled cards", exact: true });
  await expect(parked.getByText("Drop cards here to plan them later.")).toBeVisible();
  await parked.getByRole("button", { name: "Add card", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("City section")).toHaveCount(0);
  await dialog.getByLabel("Title", { exact: true }).fill("Museum idea");
  await dialog.getByLabel("Description").fill("Check opening hours");
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await parked.getByRole("button", { name: "Museum idea", exact: true }).click();
  await expect(dialog.getByLabel("Description")).toHaveValue("Check opening hours");
  await dialog.getByLabel("Title", { exact: true }).fill("Art museum");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.locator("#trip-date").fill("2026-09-14");
  await page.getByRole("button", { name: "Add day", exact: true }).click();
  const day = page.getByRole("region", { name: "Itinerary for Mon, Sep 14", exact: true });
  await expect(day).toBeVisible();
  await drag(page, parked.getByRole("button", { name: "Move Art museum", exact: true }), day.getByRole("button", { name: "Add card", exact: true }));
  await page.reload();
  await expect(day.getByRole("button", { name: "Art museum", exact: true })).toBeVisible();

  await day.getByRole("button", { name: "Move Art museum", exact: true }).focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(parked.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  await page.keyboard.press("Space", { delay: 50 });
  await expect(parked.getByRole("button", { name: "Art museum", exact: true })).toBeVisible();
  await expect(parked.getByRole("button", { name: "Move Art museum", exact: true })).toBeFocused();
  await page.reload();
  await expect(parked.getByRole("button", { name: "Art museum", exact: true })).toBeVisible();
  await expect(day.locator(".trip-card-title")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(parked).toBeVisible();
  await parked.getByRole("button", { name: "Art museum", exact: true }).click();
  await expect(dialog.getByLabel("Description")).toHaveValue("Check opening hours");
});

test("mouse drag reorders cards and moves them between days", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { tokyo, second, kyoto } = await createBoard(page);
  await drag(page, tokyo.getByRole("button", { name: "Move Breakfast", exact: true }), tokyo.getByRole("button", { name: "Dinner", exact: true }));
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Breakfast", "Dinner"]);
  await page.reload();
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Breakfast", "Dinner"]);

  await drag(page, tokyo.getByRole("button", { name: "Move Breakfast", exact: true }), kyoto.getByRole("button", { name: "Add card", exact: true }));
  await expect(kyoto.locator(".trip-card-title")).toHaveText(["Breakfast"]);
  await page.reload();
  await expect(kyoto.locator(".trip-card-title")).toHaveText(["Breakfast"]);

  await drag(page, tokyo.getByRole("button", { name: "Move Dinner", exact: true }), second.getByRole("button", { name: "Add card", exact: true }));
  await expect(second.locator(".trip-card-title")).toHaveText(["Breakfast", "Dinner"]);
  await page.reload();
  await expect(second.locator(".trip-card-title")).toHaveText(["Breakfast", "Dinner"]);
  expect(errors).toEqual([]);
});

test("keyboard dragging changes order and days, and Escape cancels", async ({ page }) => {
  const { first, second, tokyo } = await createBoard(page);
  const handle = tokyo.getByRole("button", { name: "Move Breakfast", exact: true });
  await handle.focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".card-drop-slot[data-over]")).toContainText("Museum");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".card-drop-slot[data-over]")).toContainText("Dinner");
  await page.keyboard.press("Space", { delay: 50 });
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Breakfast", "Dinner"]);

  await handle.focus();
  await expect(handle).toBeEnabled();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(second.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Breakfast", "Dinner"]);

  await handle.focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(second.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  await page.keyboard.press("Space", { delay: 50 });
  await expect(second.getByRole("button", { name: "Breakfast", exact: true })).toBeVisible();
  await expect(first.getByRole("button", { name: "Breakfast", exact: true })).toHaveCount(0);
  await expect(second.getByRole("button", { name: "Move Breakfast", exact: true })).toBeFocused();
  await page.reload();
  await expect(second.getByRole("button", { name: "Breakfast", exact: true })).toBeVisible();
});

test("a rejected save restores the card and shows an error", async ({ page }) => {
  const { tokyo, kyoto } = await createBoard(page);
  await page.route(/\/trips\/[^/?]+\.data(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const form = new URLSearchParams(request.postData() ?? "");
    if (request.method() === "POST" && form.get("intent") === "move-card") {
      form.set("beforeCardId", "missing-card");
      await route.continue({ postData: form.toString() });
    } else {
      await route.continue();
    }
  });
  await drag(page, tokyo.getByRole("button", { name: "Move Breakfast", exact: true }), kyoto.getByRole("button", { name: "Add card", exact: true }), false);
  await expect(page.getByRole("alert")).toContainText("The drop position has changed. Please try again.");
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Breakfast", "Museum", "Dinner"]);
  await expect(kyoto.locator(".trip-card-title")).toHaveCount(0);
});

test("touch dragging reorders cards using the handle", async ({ page, context }) => {
  const { tokyo } = await createBoard(page);
  const handle = tokyo.getByRole("button", { name: "Move Breakfast", exact: true });
  const start = (await handle.boundingBox())!;
  const end = (await tokyo.getByRole("button", { name: "Add card", exact: true }).boundingBox())!;
  const session = await context.newCDPSession(page);
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 10, y }] });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ x: end.x + end.width / 2, y: end.y + end.height / 2 }],
  });
  await expect(tokyo.locator(".card-drop-slot[data-over]")).toContainText("Add card");
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Dinner", "Breakfast"]);
  await expect(page.getByRole("status").filter({ hasText: "Move saved." })).toBeVisible();
  await page.reload();
  await expect(tokyo.locator(".trip-card-title")).toHaveText(["Museum", "Dinner", "Breakfast"]);
});

test("city and transport cards share one list, edit, and move independently", async ({ page }) => {
  const { first, second } = await createBoard(page);
  const dialog = page.getByRole("dialog");
  await first.getByRole("button", { name: "Add card", exact: true }).click();
  await dialog.getByLabel("Card type").selectOption("city");
  await dialog.getByLabel("City / area / region name").fill("Tokyo");
  await expect(dialog.getByLabel("Description")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await first.getByRole("button", { name: "Add card", exact: true }).click();
  await dialog.getByLabel("Card type").selectOption("transport");
  await dialog.getByLabel("Mode of transport").selectOption("subway");
  await dialog.getByLabel("Start location").fill("Tokyo Station");
  await expect(dialog.getByRole("button", { name: "Add card", exact: true })).toBeDisabled();
  await dialog.getByLabel("End location").fill("Shibuya");
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(first.locator(".trip-card-title")).toHaveText(["Breakfast", "Museum", "Dinner", "Tokyo", "Tokyo Station → Shibuya"]);
  await expect(first.locator('.trip-card[data-card-type="transport"]')).toContainText("Subway");
  await page.screenshot({ path: test.info().outputPath("flat-board.png"), fullPage: true });
  await first.getByRole("button", { name: "Tokyo Station → Shibuya", exact: true }).click();
  await expect(dialog.getByLabel("Mode of transport")).toHaveValue("subway");
  await dialog.getByLabel("End location").fill("Ginza");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await drag(page, first.getByRole("button", { name: "Move Tokyo", exact: true }), first.getByRole("button", { name: "Breakfast", exact: true }));
  await expect(first.locator(".trip-card-title")).toHaveText(["Tokyo", "Breakfast", "Museum", "Dinner", "Tokyo Station → Ginza"]);
  await drag(page, first.getByRole("button", { name: "Move Tokyo", exact: true }), second.getByRole("button", { name: "Add card", exact: true }));
  await drag(page, first.getByRole("button", { name: "Move Tokyo Station → Ginza", exact: true }), second.getByRole("button", { name: "Tokyo", exact: true }));
  await page.reload();
  await expect(first.locator(".trip-card-title")).toHaveText(["Breakfast", "Museum", "Dinner"]);
  await expect(second.locator(".trip-card-title")).toHaveText(["Tokyo Station → Ginza", "Tokyo"]);
  await second.getByRole("button", { name: "Tokyo", exact: true }).click();
  await dialog.getByLabel("City / area / region name").fill("Kanto");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await second.getByRole("button", { name: "Move Kanto", exact: true }).focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(first.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  await page.keyboard.press("Space", { delay: 50 });
  await expect(first.getByRole("button", { name: "Kanto", exact: true })).toBeVisible();
  await page.reload();
  await expect(second.locator(".trip-card-title")).toHaveText(["Tokyo Station → Ginza"]);
});
