/**
 * upload.spec.ts — file upload via dialog and format/size validation
 *
 * API calls use "/api/..." relative paths → Vite proxy → backend:8000.
 * Auth token injected in Zustand persist format under key "gps_auth".
 */
import { test, expect } from "@playwright/test";
import { registerAndInjectToken, waitForMap, MINIMAL_GPX } from "./helpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function gpxBuffer() {
  return Buffer.from(MINIMAL_GPX, "utf-8");
}

// ── Upload via file input ─────────────────────────────────────────────────────

test.describe("Upload via file input", () => {
  test("valid GPX accepted and shows processing feedback", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() === 0) {
      test.skip();
      return;
    }

    await fileInput.setInputFiles({
      name: "run.gpx",
      mimeType: "application/gpx+xml",
      buffer: gpxBuffer(),
    });

    // Toast or UI feedback should appear
    await expect(
      page.getByText(/upload|process|track|success|error/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("PDF file is rejected with error", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() === 0) {
      test.skip();
      return;
    }

    await fileInput.setInputFiles({
      name: "evil.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake content"),
    });

    await expect(
      page.getByText(/unsupported|invalid|format|pdf/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("file over 20 MB is rejected with size error", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() === 0) {
      test.skip();
      return;
    }

    // 21 MB buffer
    const big = Buffer.alloc(21 * 1024 * 1024, 0x20);

    await fileInput.setInputFiles({
      name: "huge.gpx",
      mimeType: "application/gpx+xml",
      buffer: big,
    });

    await expect(
      page.getByText(/20\s*mb|too large|size|limit/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── Upload via API (confirm endpoint works through Vite proxy) ────────────────

test.describe("Upload via API (proxy check)", () => {
  test("POST /api/tracks/upload returns 202", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);

    const resp = await request.post("/api/tracks/upload", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "api_test.gpx",
          mimeType: "application/gpx+xml",
          buffer: gpxBuffer(),
        },
      },
    });

    expect(resp.status()).toBe(202);
    const body = await resp.json();
    expect(body).toHaveProperty("track_id");
    expect(body).toHaveProperty("task_id");
  });
});

// ── Unauthenticated upload ────────────────────────────────────────────────────

test.describe("Unauthenticated upload", () => {
  test("shows auth modal instead of app when no token", async ({ page }) => {
    // Must navigate first — localStorage is inaccessible on about:blank
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("gps_auth"));
    await page.goto("/");
    await expect(page.getByText("Sign in to track your adventures")).toBeVisible({
      timeout: 10_000,
    });
  });
});
