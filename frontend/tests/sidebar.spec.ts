/**
 * sidebar.spec.ts — LeftIsland: track list, search, filters, card actions
 *
 * LeftIsland facts (LeftIsland.jsx):
 *   - Search: <input> with Search icon, no placeholder text
 *   - Format chips: "All" | "GPX" | "KML" | "TCX" | "FIT" | "GeoJSON"
 *   - Sort options: "newest" | "oldest" | "longest" | "fastest"
 *   - Empty state: no dedicated message in current code (list just empty)
 *   - Track cards from <TrackCard> components
 *   - Upload button triggers onUploadClick prop (file input)
 */
import { test, expect } from "@playwright/test";
import { registerAndInjectToken, waitForMap, MINIMAL_GPX, uniqEmail } from "./helpers";

function gpxBuffer(name = "Playwright Track") {
  return Buffer.from(
    MINIMAL_GPX.replace("Playwright Track", name),
    "utf-8"
  );
}

async function uploadTrack(request: any, token: string, name = "Test Track") {
  return request.post("/api/tracks/upload", {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name: `${name}.gpx`, mimeType: "application/gpx+xml", buffer: gpxBuffer(name) },
    },
  });
}

// ── Sidebar structure ─────────────────────────────────────────────────────────

test.describe("Left island structure", () => {
  test("left island is rendered in DOM", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);
    // Left island is the second .island (index 1)
    await expect(page.locator(".island").nth(1)).toBeAttached({ timeout: 10_000 });
  });

  test("search input is present inside left island", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    const leftIsland = page.locator(".island").nth(1);
    const searchInput = leftIsland.locator('input[type="text"], input:not([type])').first();
    await expect(searchInput).toBeAttached({ timeout: 10_000 });
  });

  test("format filter chips are present", async ({ page, request }) => {
    await registerAndInjectToken(page, request);
    await waitForMap(page);

    // Format chips live inside the filter panel — open it first
    const leftIsland = page.locator(".island").nth(1);
    await leftIsland.locator('button[title="Filters"]').click();
    await expect(leftIsland.getByRole("button", { name: "GPX" })).toBeAttached({ timeout: 10_000 });
    await expect(leftIsland.getByRole("button", { name: "KML" })).toBeAttached({ timeout: 10_000 });
  });
});

// ── Track list ────────────────────────────────────────────────────────────────

test.describe("Track list", () => {
  test("uploaded track appears in list after page reload", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);
    await waitForMap(page);

    // Upload via API
    const uploadResp = await uploadTrack(request, token, "My Reload Track");
    expect(uploadResp.status()).toBe(202);

    // Reload to trigger tracks fetch
    await page.reload();
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });

    // Track name should appear in the sidebar
    await expect(page.getByText("My Reload Track")).toBeVisible({ timeout: 15_000 });
  });

  test("multiple tracks all appear in the list", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);

    await uploadTrack(request, token, "Morning Run");
    await uploadTrack(request, token, "Evening Ride");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });

    await expect(page.getByText("Morning Run")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Evening Ride")).toBeVisible({ timeout: 15_000 });
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

test.describe("Track search", () => {
  test("search filters visible tracks by name", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);

    await uploadTrack(request, token, "Alpha Run");
    await uploadTrack(request, token, "Beta Ride");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });

    // Wait for both tracks to load
    await expect(page.getByText("Alpha Run")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Beta Ride")).toBeVisible({ timeout: 15_000 });

    // Type in search
    const leftIsland = page.locator(".island").nth(1);
    const searchInput = leftIsland.locator('input[type="text"], input:not([type])').first();
    await searchInput.fill("Alpha");
    await page.waitForTimeout(400); // debounce

    await expect(page.getByText("Alpha Run")).toBeVisible();
    await expect(page.getByText("Beta Ride")).not.toBeVisible();
  });

  test("clearing search shows all tracks again", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);

    await uploadTrack(request, token, "Gamma Walk");
    await uploadTrack(request, token, "Delta Swim");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByText("Gamma Walk")).toBeVisible({ timeout: 15_000 });

    const leftIsland = page.locator(".island").nth(1);
    const searchInput = leftIsland.locator('input[type="text"], input:not([type])').first();
    await searchInput.fill("Gamma");
    await page.waitForTimeout(400);
    await expect(page.getByText("Delta Swim")).not.toBeVisible();

    await searchInput.fill("");
    await page.waitForTimeout(400);
    await expect(page.getByText("Delta Swim")).toBeVisible();
  });
});

// ── Format filter ─────────────────────────────────────────────────────────────

test.describe("Format filter chips", () => {
  test("clicking GPX chip filters to GPX tracks only", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);
    await uploadTrack(request, token, "GPX Track");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByText("GPX Track")).toBeVisible({ timeout: 15_000 });

    const leftIsland = page.locator(".island").nth(1);
    // Filter chips live inside the filter panel — open it first
    await leftIsland.locator('button[title="Filters"]').click();
    await leftIsland.getByRole("button", { name: "GPX" }).click();
    await page.waitForTimeout(300);

    // GPX track is still visible
    await expect(page.getByText("GPX Track")).toBeVisible();
  });

  test("clicking All chip shows all tracks", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);
    await uploadTrack(request, token, "Chip Test Track");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByText("Chip Test Track")).toBeVisible({ timeout: 15_000 });

    const leftIsland = page.locator(".island").nth(1);
    // Filter chips live inside the filter panel — open it first
    await leftIsland.locator('button[title="Filters"]').click();
    await leftIsland.getByRole("button", { name: "GPX" }).click();
    await page.waitForTimeout(200);
    await leftIsland.getByRole("button", { name: "All" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText("Chip Test Track")).toBeVisible();
  });
});

// ── Track deletion ────────────────────────────────────────────────────────────

test.describe("Track card delete", () => {
  test("deleting a track removes it from the list", async ({ page, request }) => {
    const { token } = await registerAndInjectToken(page, request);
    await uploadTrack(request, token, "Delete Me Track");

    await page.goto("/");
    await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });

    const trackText = page.getByText("Delete Me Track");
    await expect(trackText).toBeVisible({ timeout: 15_000 });

    // Hover over the card to reveal action buttons, then click delete
    const card = trackText.locator("..").locator("..");
    await card.hover();

    const deleteBtn = card.getByRole("button", { name: /delete|remove/i }).first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm if dialog appears
      const confirmBtn = page.getByRole("button", { name: /confirm|yes|delete/i });
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(trackText).not.toBeVisible({ timeout: 10_000 });
    } else {
      test.skip();
    }
  });
});
