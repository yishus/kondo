import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./auth";

test("card deletion can be cancelled, reports failure, and works with invalid unsaved edits", async ({ page }) => {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Delete test ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  const parked = page.getByRole("region", { name: "Unscheduled cards", exact: true });
  await parked.getByRole("button", { name: "Add card", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Delete card", exact: true })).toHaveCount(0);
  await dialog.getByLabel("Title", { exact: true }).fill("Museum idea");
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await parked.getByRole("button", { name: "Museum idea", exact: true }).click();
  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("Museum idea");
    await confirmation.dismiss();
  });
  await dialog.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(parked.getByRole("button", { name: "Museum idea", exact: true })).toHaveCount(1);

  await dialog.getByLabel("Title", { exact: true }).fill("");
  await page.route(/\/trips\/[^/?]+\.data(?:\?.*)?$/, async (route) => {
    const form = new URLSearchParams(route.request().postData() ?? "");
    if (form.get("intent") === "delete-card") {
      form.set("cardId", "missing-card");
      await route.continue({ postData: form.toString() });
    } else await route.continue();
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("That card no longer exists.");
  await expect(parked.getByRole("button", { name: "Museum idea", exact: true })).toHaveCount(1);
  await page.unroute(/\/trips\/[^/?]+\.data(?:\?.*)?$/);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(parked.getByRole("button", { name: "Museum idea", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(parked.getByText("Drop cards here to plan them later.")).toBeVisible();
});
