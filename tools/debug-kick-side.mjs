// Side-view close-up screenshot of kick animation
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--no-sandbox','--enable-webgl','--enable-webgl2','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-gpu-rasterization','--ignore-gpu-blocklist','--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:8080/test-local.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait for match to end, restart fresh
await page.waitForTimeout(15000);
await page.keyboard.press('k');
await page.waitForTimeout(2000);

// Enable side view
await page.evaluate(() => { window._sideView = true; });
await page.waitForTimeout(500);

async function shot(name) {
  await page.screenshot({ path: `tools/frames/${name}.png` });
}

await shot('side-01-idle');

// Kick
await page.keyboard.press('l');
await page.waitForTimeout(20);
await shot('side-02-kick-20ms');
await page.waitForTimeout(40);
await shot('side-03-kick-60ms');
await page.waitForTimeout(40);
await shot('side-04-kick-100ms');
await page.waitForTimeout(40);
await shot('side-05-kick-140ms');
await page.waitForTimeout(40);
await shot('side-06-kick-180ms');
await page.waitForTimeout(40);
await shot('side-07-kick-220ms');
await page.waitForTimeout(100);
await shot('side-08-kick-320ms');
await page.waitForTimeout(200);
await shot('side-09-kick-520ms');

await browser.close();
console.log('Done!');
