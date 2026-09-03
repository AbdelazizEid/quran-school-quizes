import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  // Serial execution: the suite shares one dev server, one dev Teacher, and
  // one Postgres (rate-limit windows, join codes, live sockets) — parallel
  // workers made shared-state specs flaky.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "ar",
  },
  // Playwright owns the test server: it starts `npm run dev` itself with the
  // dev-teacher Clerk fallback, so tests never hit real Clerk 401s and nobody
  // has to manage (or debug stale) dev servers by hand.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    // strict on purpose: a reused foreign server (real Clerk key) 401s every
    // API call silently; failing fast on a held port is easier to diagnose
    reuseExistingServer: false,
    env: { CLERK_SECRET_KEY: "placeholder" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } }, testIgnore: /host-flow/ },
  ],
});
