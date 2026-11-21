import { test, expect } from "@playwright/test";

test.describe("AthleteN web public entry and authentication", () => {
  test("loads the application entry point without a blank screen", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /AthleteN - Taekwondo Edition/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    expect(pageErrors, "browser runtime errors").toEqual([]);
  });

  test("opens password recovery mode and exposes the email action", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password" }).click();
    await expect(page.getByRole("button", { name: "Send reset email" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveCount(0);
  });

  test("registration requires policy acceptance before enabling account creation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Register" }).click();
    const createAccount = page.getByRole("button", { name: "Create account" });
    await expect(createAccount).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(createAccount).toBeEnabled();
    await expect(page.getByLabel("Name")).toBeVisible();
  });

  test("reset-password deep link renders a recoverable authentication screen", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /AthleteN - Taekwondo Edition/i })).toBeVisible();
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
  });
});
