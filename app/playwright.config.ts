import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    launchOptions: { downloadsPath: path.join(os.tmpdir(), "area-app-downloads") },
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", testIgnore: "**/pwa.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", testIgnore: "**/pwa.spec.ts", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "pwa", testMatch: "**/pwa.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4175/" } },
    { name: "pwa-pages", testMatch: "**/pwa.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4176/checkins-kids-roles/" } }
  ],
  webServer: [
    {
      command: "npm run dev -- --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      env: { VITE_SUPABASE_URL: "https://area-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }
    },
    {
      command: "npm run build && npm run preview -- --port 4175 --strictPort",
      url: "http://127.0.0.1:4175",
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" }
    },
    {
      command: "npm run build -- --base=/checkins-kids-roles/ --outDir node_modules\\.cache\\area-pages-dist && npm run preview -- --port 4176 --strictPort --base=/checkins-kids-roles/ --outDir node_modules\\.cache\\area-pages-dist",
      url: "http://127.0.0.1:4176/checkins-kids-roles/",
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" }
    }
  ]
});
