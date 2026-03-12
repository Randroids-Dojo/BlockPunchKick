// High-res close-up screenshot tool matching the user's phone-like crop
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--no-sandbox','--enable-webgl','--enable-webgl2','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-gpu-rasterization','--ignore-gpu-blocklist','--disable-web-security'],
});
// High res viewport
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:8080/test-local.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait for match to end, restart fresh
await page.waitForTimeout(15000);
await page.keyboard.press('k');
await page.waitForTimeout(2000);

// Zoom in a lot on the player
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(500);

// Helper: take a cropped screenshot of just the player area
async function playerCloseup(name) {
  // Take full screenshot first, then we'll read it
  await page.screenshot({ path: `tools/frames/${name}.png` });
}

await playerCloseup('01-idle');

// Kick
await page.keyboard.press('l');
await page.waitForTimeout(10);
await playerCloseup('02-kick-10ms');
await page.waitForTimeout(30);
await playerCloseup('03-kick-40ms');
await page.waitForTimeout(30);
await playerCloseup('04-kick-70ms');
await page.waitForTimeout(30);
await playerCloseup('05-kick-100ms');
await page.waitForTimeout(30);
await playerCloseup('06-kick-130ms');
await page.waitForTimeout(30);
await playerCloseup('07-kick-160ms');
await page.waitForTimeout(50);
await playerCloseup('08-kick-210ms');
await page.waitForTimeout(100);
await playerCloseup('09-kick-310ms');
await page.waitForTimeout(200);
await playerCloseup('10-kick-510ms');

await browser.close();
console.log('Done!');
