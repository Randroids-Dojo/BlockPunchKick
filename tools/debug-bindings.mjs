// Debug kick animation playback - check weights, times, and bone binding
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--no-sandbox','--enable-webgl','--enable-webgl2','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-gpu-rasterization','--ignore-gpu-blocklist','--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
page.on('console', msg => {
  const t = msg.text();
  logs.push(t);
  console.log('PAGE:', t);
});
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:8080/test-local.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait for load + match restart
await page.waitForTimeout(15000);
await page.keyboard.press('k');
await page.waitForTimeout(2000);

// Trigger kick
console.log('--- Triggering kick ---');
await page.keyboard.press('l');
await page.waitForTimeout(1000);

await browser.close();
console.log('Done');
