import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/web",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: "test-results/playwright.json" }]],
  use: {
    baseURL: process.env.ATHLETEN_WEB_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.ATHLETEN_WEB_URL ? undefined : {
    command: "pnpm dev:vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.test-only-placeholder",
    },
  },
});
