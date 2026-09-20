import { expect, type Page } from "@playwright/test";

export async function ensureSignedIn(page: Page) {
  await page.goto("/");
  if (!new URL(page.url()).pathname.startsWith("/sign-in")) return;

  await createTestAccount(page, "Browser Test", "browser-test@example.com");
}

export async function createTestAccount(
  page: Page,
  name: string,
  email: string,
) {
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browser-password-123");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  const signupError = page.getByRole("alert");
  await expect.poll(async () =>
    new URL(page.url()).pathname === "/" || await signupError.isVisible(),
  ).toBe(true);
  if (new URL(page.url()).pathname === "/sign-up") {
    await expect(signupError).toContainText("couldn't create your account");
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("browser-password-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/$/);
}
