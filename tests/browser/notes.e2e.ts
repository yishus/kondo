import { expect, test, type Page } from "@playwright/test";
import { ensureSignedIn } from "./auth";

async function createTrip(page: Page) {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Notes ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "To-do list" })).toBeVisible();
  return page.url();
}

test("to-dos and free-form notes persist independently across tabs and reloads", async ({ page }, testInfo) => {
  const url = await createTrip(page);
  const notes = page.getByLabel("Notes", { exact: true });
  const draft = "Packing ideas\n\nBring a raincoat.\n  Keep this indentation.";
  await notes.fill(draft);
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  for (const title of ["Check passport", "Book airport transfer"]) {
    await page.getByLabel("New to-do").fill(title);
    await page.getByRole("button", { name: "Add to-do", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: title, exact: true })).toBeVisible();
    await expect(page.getByLabel("New to-do")).toHaveValue("");
  }
  await page.getByRole("checkbox", { name: "Check passport", exact: true }).check();
  await expect(page.getByText("1 of 2 completed", { exact: true })).toBeVisible();
  await expect(notes).toHaveValue(draft);
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Notes saved.");
  await page.getByRole("link", { name: "Itinerary", exact: true }).click();
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect(notes).toHaveValue(draft);
  await page.reload();
  await expect(notes).toHaveValue(draft);
  await expect(page.getByRole("checkbox", { name: "Check passport", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Check passport", exact: true }).uncheck();
  await expect(page.getByText("0 of 2 completed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Book airport transfer", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("notes-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("notes-mobile.png"), fullPage: true });
  await notes.fill("");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Notes saved.");
  await page.reload();
  await expect(notes).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "Check passport", exact: true })).not.toBeChecked();
  await createTrip(page);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(notes).toHaveValue("");
  await page.goto(url);
  await expect(page.getByRole("checkbox", { name: "Check passport", exact: true })).toBeVisible();
});

test("notes actions reject invalid data and changes to another trip's to-dos", async ({ page }) => {
  const firstUrl = await createTrip(page);
  await page.getByLabel("New to-do").fill("Keep this task");
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Keep this task" })).toBeVisible();
  const todoId = await page.locator('input[name="todoId"]').inputValue();
  const secondUrl = await createTrip(page);
  for (const intent of ["toggle-todo", "delete-todo"]) {
    const response = await page.request.post(secondUrl, { form: { intent, todoId, completed: "true" } });
    expect(response.status()).toBe(404);
  }
  for (const form of [
    { intent: "add-todo", title: "   " },
    { intent: "add-todo", title: "x".repeat(501) },
    { intent: "save-notes", notes: "x".repeat(50001) },
    { intent: "toggle-todo", todoId, completed: "invalid" },
  ]) {
    expect((await page.request.post(firstUrl, { form })).status()).toBe(400);
  }
  await page.goto(firstUrl);
  await expect(page.getByRole("checkbox", { name: "Keep this task" })).not.toBeChecked();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("");
});
