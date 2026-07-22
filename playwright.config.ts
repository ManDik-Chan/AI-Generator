import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(authState && (process.env.CI || existsSync(authState)));

if (process.env.CI && !authState) {
  throw new Error("CI requires PLAYWRIGHT_AUTH_STATE; global setup must create a signed-in isolated test account.");
}

export default defineConfig({
  testDir: "./tests/e2e/mobile",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: process.env.CI ? "./tests/e2e/global-setup.ts" : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(hasAuthState ? { storageState: authState } : {}),
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: process.env.CI ? "pnpm start --hostname 127.0.0.1" : "pnpm dev --hostname 127.0.0.1",
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
