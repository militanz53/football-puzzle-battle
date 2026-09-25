import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the MVP 0.1 match (§29, §40). Rounds run on the real 3 s
// reveal clock, so a test takes one to two minutes.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts/test-results",
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/artifacts/html-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    // §33: mobile-first at a 390 px reference width.
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
