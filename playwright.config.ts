import { defineConfig, devices } from '@playwright/test';

const productionURL = process.env.ENGLISH90_TEST_URL;
if (productionURL && productionURL !== 'https://english90.imrtech.xyz') throw new Error('Unexpected production test origin.');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: productionURL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: productionURL ? undefined : { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
});
