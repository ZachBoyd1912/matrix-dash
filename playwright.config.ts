import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (decision 13). Boots the dev server and runs critical-journey
 * specs in a real browser — the layer that catches regressions unit tests +
 * curl miss (e.g. the static-prerender login loop: curl set the cookie header
 * manually, but a real browser + middleware + Secure cookies over localhost
 * reproduce it). MATRIX_DATA_DIR points the app at a throwaway DB so specs
 * never touch ~/MatrixDash.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Dev-mode first-compile of a route can take 10-20s; give assertions room.
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "MATRIX_DATA_DIR=.e2e-data PORT=3100 pnpm dev",
    url: "http://localhost:3100/login",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
