/**
 * Shared helpers for Playwright E2E tests.
 *
 * API calls use relative paths ("/api/...") so they go through the Vite proxy
 * (frontend:5173 → backend:8000). This works both in Docker and locally.
 */
import { type Page, type APIRequestContext } from "@playwright/test";

export function uniqEmail(prefix = "e2e") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.example`;
}

/**
 * Register a user via the API and inject the token into localStorage in
 * Zustand's persist format so the app treats the user as authenticated.
 */
export async function registerAndInjectToken(
  page: Page,
  request: APIRequestContext,
  email?: string,
  password = "TestPass123"
): Promise<{ email: string; token: string }> {
  const userEmail = email ?? uniqEmail();
  const resp = await request.post("/api/auth/register", {
    data: { email: userEmail, password },
  });
  const { access_token } = await resp.json();

  // Must be on a real page origin before touching localStorage
  if (!page.url().startsWith("http")) {
    await page.goto("/");
  }

  // Inject in Zustand persist format — key is "gps_auth"
  await page.evaluate(
    ([token, mail]) => {
      localStorage.setItem(
        "gps_auth",
        JSON.stringify({ state: { token, user: { email: mail }, isAuthenticated: true }, version: 0 })
      );
    },
    [access_token, userEmail]
  );

  return { email: userEmail, token: access_token };
}

/** Clear auth state from localStorage (Zustand persist key).
 *  Must navigate to a real origin first — localStorage is inaccessible on about:blank. */
export async function clearAuth(page: Page) {
  if (!page.url().startsWith("http")) {
    await page.goto("/");
  }
  await page.evaluate(() => localStorage.removeItem("gps_auth"));
}

/** Navigate to "/" and wait until the Leaflet map container is visible. */
export async function waitForMap(page: Page) {
  await page.goto("/");
  await page.locator(".leaflet-container").waitFor({ state: "visible", timeout: 20_000 });
}

export const MINIMAL_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="playwright">
  <trk><name>Playwright Track</name><trkseg>
    <trkpt lat="48.8566" lon="2.3522"><time>2024-01-01T10:00:00Z</time><ele>35</ele></trkpt>
    <trkpt lat="48.8600" lon="2.3600"><time>2024-01-01T10:05:00Z</time><ele>40</ele></trkpt>
    <trkpt lat="48.8650" lon="2.3700"><time>2024-01-01T10:12:00Z</time><ele>50</ele></trkpt>
  </trkseg></trk>
</gpx>`;
