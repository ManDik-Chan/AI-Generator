import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;

export default defineConfig({
  testDir: "./tests/e2e/mobile",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(authState && existsSync(authState) ? { storageState: authState } : {}),
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "pnpm dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/login",
    env: {
      AI_BASE_URL: process.env.AI_BASE_URL ?? "http://127.0.0.1:9/v1",
      AI_API_KEY: process.env.AI_API_KEY ?? "playwright-mocked-provider",
      AI_MODEL: process.env.AI_MODEL ?? "playwright-mocked-model",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
