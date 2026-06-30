/**
 * map.spec.ts — Leaflet map rendering, tile layers, visualization toggles
 */
import { test, expect } from "@playwright/test";
import { registerAndInjectToken, waitForMap } from "./helpers";

// ── Map renders ───────────────────────────────────────────────────────────────

test.describe("Map renders", () => {
  test("Leaflet container is visible after login", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("tile requests are made on load", async ({ page, request }) => {
    const tileRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".tile.") || url.match(/\/\d+\/\d+\/\d+\.png/)) {
        tileRequests.push(url);
      }
    });

    await registerAndInjectToken(page, request);
    await waitForMap(page);
    await page.waitForTimeout(3_000);

    expect(tileRequests.length).toBeGreaterThan(0);
  });

  test("custom zoom controls are visible in right island", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);
    // zoomControl={false} — Leaflet's built-in control is disabled.
    // Custom zoom buttons live in RightIsland with title="Zoom in" / "Zoom out".
    await expect(page.locator('button[title="Zoom in"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[title="Zoom out"]')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Right island — layer controls ─────────────────────────────────────────────

test.describe("Right island layer controls", () => {
  test("right island is rendered in DOM", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);
    // RightIsland renders as the third .island element (Top, Left, Right, Bottom)
    await expect(page.locator(".island").nth(2)).toBeAttached({ timeout: 10_000 });
  });

  test("tile layer options are accessible after opening right island", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    // Click the "Map layers" button (Layers icon) to open the tile layer popover
    await page.locator('button[title="Map layers"]').click();

    // After opening, tile layer names from LAYER_OPTIONS should appear
    await expect(
      page.getByText(/OpenStreetMap|OpenTopo|CyclOSM|Satellite|CartoDB/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Visualization mode toggles ─────────────────────────────────────────────────

test.describe("Visualization mode toggles", () => {
  test("speed mode button is present and clickable", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    // Open the layers popover — it contains text buttons "Speed mode" and "Visit heatmap"
    await page.locator('button[title="Map layers"]').click();

    const speedBtn = page.getByRole("button", { name: "Speed mode" }).first();
    await expect(speedBtn).toBeVisible({ timeout: 8_000 });
    await speedBtn.click();
    // No crash = pass
  });

  test("heatmap mode button is present and clickable", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    await page.locator('button[title="Map layers"]').click();

    const heatBtn = page.getByRole("button", { name: "Visit heatmap" }).first();
    await expect(heatBtn).toBeVisible({ timeout: 8_000 });
    await heatBtn.click();
  });
});

// ── Public track page ─────────────────────────────────────────────────────────

test.describe("Public track page", () => {
  test("unknown token shows error without auth modal", async ({ page }) => {
    await page.goto("/track/this-token-does-not-exist");

    // Should show some error, NOT the auth modal subtitle
    await expect(page.getByText(/not found|404|invalid|error/i).first()).toBeVisible({
      timeout: 10_000,
    });
    // Auth modal should NOT appear on public route
    await expect(page.getByText("Sign in to track your adventures")).not.toBeVisible();
  });
});
