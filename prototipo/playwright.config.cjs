"use strict";
const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");
const os = require("node:os");
module.exports = defineConfig({
  testDir: path.join(__dirname, "tests"),
  testMatch: "**/*.spec.cjs",
  outputDir: path.join(__dirname, "test-results"),
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Keep browser downloads outside cloud-synced folders such as OneDrive.
    launchOptions: { downloadsPath: path.join(os.tmpdir(), "area-prototype-downloads") },
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: {
    command: "node server.cjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false
  }
});
