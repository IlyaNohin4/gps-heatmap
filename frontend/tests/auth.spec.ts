/**
 * auth.spec.ts — AuthModal: register, login, logout
 *
 * UI facts from AuthModal.jsx:
 *   - Title:    "GPS Heatmap"
 *   - Subtitle: "Sign in to track your adventures"
 *   - Tabs:     <button> "Login" | <button> "Register"
 *   - Submit:   "Sign in" (login tab) | "Create account" (register tab)
 *   - Errors:   react-toastify toast messages
 *   - Auth state stored in localStorage under key "gps_auth" (Zustand persist)
 *
 * API calls use relative paths → Vite proxy → backend:8000 (works in Docker).
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { uniqEmail, clearAuth, registerAndInjectToken } from "./helpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function expectModalVisible(page: Page) {
  // "Sign in to track your adventures" is the modal subtitle — always visible
  await expect(page.getByText("Sign in to track your adventures")).toBeVisible({
    timeout: 10_000,
  });
}

async function expectMapVisible(page: Page) {
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
}

// ── Auth modal appearance ─────────────────────────────────────────────────────

test.describe("Auth modal", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page);
    await page.goto("/");
  });

  test("shows modal when no token is stored", async ({ page }) => {
    await expectModalVisible(page);
    // "GPS Heatmap" appears both in the modal title and the TopIsland logo button;
    // the modal div is the second match — just assert at least one is visible.
    await expect(page.getByText("GPS Heatmap").first()).toBeVisible();
  });

  test("has Login and Register tab buttons", async ({ page }) => {
    await expectModalVisible(page);
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
  });

  test("login tab shows Sign in button", async ({ page }) => {
    await expectModalVisible(page);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("register tab shows Create account button", async ({ page }) => {
    await expectModalVisible(page);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});

// ── Registration ──────────────────────────────────────────────────────────────

test.describe("Registration", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page);
    await page.goto("/");
  });

  test("successful registration dismisses modal and shows map", async ({ page }) => {
    await expectModalVisible(page);
    await page.getByRole("button", { name: "Register" }).click();

    const email = uniqEmail("reg");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').first().fill("TestPass123");
    // Confirm password field (third input in register form)
    await page.locator('input[type="password"]').nth(1).fill("TestPass123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expectMapVisible(page);
  });

  test("duplicate email shows error toast", async ({ page, request }) => {
    const email = uniqEmail("dup");
    await request.post("/api/auth/register", { data: { email, password: "TestPass123" } });

    await expectModalVisible(page);
    await page.getByRole("button", { name: "Register" }).click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').first().fill("TestPass123");
    await page.locator('input[type="password"]').nth(1).fill("TestPass123");
    await page.getByRole("button", { name: "Create account" }).click();

    // Backend returns detail: "Email already registered"; toast shows it verbatim
    await expect(page.getByText("Email already registered")).toBeVisible({ timeout: 8_000 });
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page);
    await page.goto("/");
  });

  test("valid credentials dismiss modal and show map", async ({ page, request }) => {
    const email = uniqEmail("login");
    await request.post("/api/auth/register", { data: { email, password: "TestPass123" } });

    await expectModalVisible(page);
    await page.getByRole("button", { name: "Login" }).click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').first().fill("TestPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expectMapVisible(page);
  });

  test("wrong password shows error toast", async ({ page, request }) => {
    const email = uniqEmail("badpw");
    await request.post("/api/auth/register", { data: { email, password: "TestPass123" } });

    await expectModalVisible(page);
    await page.getByRole("button", { name: "Login" }).click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').first().fill("WrongPassword99");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Invalid credentials|Login failed/i)).toBeVisible({ timeout: 8_000 });
  });

  test("unknown email shows error toast", async ({ page }) => {
    await expectModalVisible(page);
    await page.getByRole("button", { name: "Login" }).click();
    await page.locator('input[type="email"]').fill("nobody_xyz@test.example");
    await page.locator('input[type="password"]').first().fill("TestPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Invalid credentials|Login failed/i)).toBeVisible({ timeout: 8_000 });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe("Logout", () => {
  test("clears session and shows modal again", async ({ page, request }) => {
    // Login via token injection
    await registerAndInjectToken(page, request);
    await page.goto("/");
    await expectMapVisible(page);

    // Open TopIsland settings panel and click Sign out
    // TopIsland toggle button is the first island in the top area
    const settingsToggle = page.locator(".island").first().getByRole("button").first();
    await settingsToggle.click();

    // "Sign out" button text comes from i18n key settings.sign_out → "Sign out"
    const signOutBtn = page.getByRole("button", { name: "Sign out" });
    await expect(signOutBtn).toBeVisible({ timeout: 5_000 });
    await signOutBtn.click();

    // Modal should reappear
    await expectModalVisible(page);

    // Zustand persist key should be gone
    const stored = await page.evaluate(() => localStorage.getItem("gps_auth"));
    const state = stored ? JSON.parse(stored) : null;
    expect(state?.state?.isAuthenticated).toBeFalsy();
  });
});
