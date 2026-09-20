import { expect, test } from "@playwright/test";

import { createTestAccount } from "./auth";

test("a trip owner can grant another registered user access by email", async ({
  browser,
  page,
  baseURL,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const firstEmail = "owner@example.com";
  const secondEmail = "coowner@example.com";
  await createTestAccount(page, "First Owner", firstEmail);
  await page.getByLabel("Add a new trip").fill(`Shared trip ${suffix}`);
  await page.getByRole("button", { name: "Add trip", exact: true }).click();
  await page.waitForURL(/\/trips\//);
  const tripUrl = page.url();

  const secondContext = await browser.newContext({ baseURL });
  const secondPage = await secondContext.newPage();
  try {
    await createTestAccount(secondPage, "Second Owner", secondEmail);
    const denied = await secondPage.goto(tripUrl);
    expect(denied?.status()).toBe(404);

    await page.getByText("Owners (1)", { exact: true }).click();
    await page.getByLabel("Add an owner by account email").fill(secondEmail);
    await page.getByRole("button", { name: "Add owner", exact: true }).click();
    await expect(page.getByText(`Second Owner · ${secondEmail}`, { exact: true })).toBeVisible();

    await secondPage.goto(tripUrl);
    await expect(secondPage.getByRole("heading", { name: `Shared trip ${suffix}` })).toBeVisible();
    await secondPage.goto("/");
    await expect(secondPage.getByRole("link", { name: `Shared trip ${suffix}` })).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
