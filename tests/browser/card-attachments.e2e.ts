import { expect, test } from "@playwright/test";
import { ensureSignedIn } from "./auth";

test("create a card with JPG/PDF files, download, move, cancel removal, and remove", async ({ page }) => {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Attachments ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  const parked = page.getByRole("region", { name: "Unscheduled cards", exact: true });
  await parked.getByRole("button", { name: "Add card", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Tickets and photo");
  const jpg = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  const pdf = Buffer.from("%PDF-1.4\nTest booking\n%%EOF");
  await dialog.getByLabel("Add files", { exact: true }).setInputFiles([
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") },
    { name: "booking.pdf", mimeType: "application/pdf", buffer: pdf },
  ]);
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(parked).toContainText("2 attachments");
  await page.reload();
  await parked.getByRole("button", { name: "Tickets and photo", exact: true }).click();
  const photo = dialog.getByRole("link", { name: "photo.jpg", exact: true });
  const photoUrl = (await photo.getAttribute("href"))!;
  const file = dialog.getByRole("link", { name: "booking.pdf", exact: true });
  const fileUrl = (await file.getAttribute("href"))!;
  const response = await page.request.get(fileUrl);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(await response.body()).toEqual(pdf);
  const photoResponse = await page.request.get((await photo.getAttribute("href"))!);
  expect(photoResponse.headers()["content-type"]).toBe("image/jpeg");
  expect(await photoResponse.body()).toEqual(Buffer.from(jpg, "base64"));
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download booking.pdf", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("booking.pdf");

  await dialog.getByRole("button", { name: "Remove booking.pdf", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await parked.getByRole("button", { name: "Tickets and photo", exact: true }).click();
  await expect(file).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.locator("#trip-date").fill("2026-09-14");
  await page.getByRole("button", { name: "Add day", exact: true }).click();
  const day = page.getByRole("region", { name: "Itinerary for Mon, Sep 14", exact: true });
  await expect(day).toBeVisible();
  await parked.getByRole("button", { name: "Move Tickets and photo", exact: true }).focus();
  await page.keyboard.press("Space", { delay: 50 });
  await expect(page.locator(".trip-card-overlay")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(day.locator(".card-drop-slot[data-over]")).toHaveCount(1);
  await page.keyboard.press("Space", { delay: 50 });
  await expect(day).toContainText("2 attachments");
  await page.reload();
  await day.getByRole("button", { name: "Tickets and photo", exact: true }).click();
  await expect(file).toBeVisible();
  await dialog.getByRole("button", { name: "Remove booking.pdf", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(day).toContainText("1 attachment");
  expect((await page.request.get(fileUrl)).status()).toBe(404);
  await day.getByRole("button", { name: "Tickets and photo", exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(day.getByRole("button", { name: "Tickets and photo", exact: true })).toHaveCount(0);
  expect((await page.request.get(photoUrl)).status()).toBe(404);
  await page.reload();
  await expect(day.locator(".trip-card-title")).toHaveCount(0);
});

test("unsupported files are rejected and clearing them allows saving", async ({ page }) => {
  await ensureSignedIn(page);
  await page.getByLabel("Add a new trip").fill(`Attachment validation ${Date.now()}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Packing");
  await dialog.getByLabel("Add files", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Notes") });
  await expect(dialog.getByRole("alert")).toContainText("JPG or PDF");
  await dialog.getByRole("button", { name: "Clear selected files", exact: true }).click();
  await dialog.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Packing", exact: true })).toBeVisible();
});
