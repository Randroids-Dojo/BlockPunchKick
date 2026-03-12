// Side-view close-up screenshot of kick animation
// Uses page.evaluate to override camera each frame via requestAnimationFrame
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--no-sandbox','--enable-webgl','--enable-webgl2','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-gpu-rasterization','--ignore-gpu-blocklist','--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
page.on('pageerror', e => console.log('ERR:', e.message));
page.on('console', msg => {
  const t = msg.text();
  if (t.includes('FK') || t.includes('ERR')) console.log('PAGE:', t);
});
await page.goto('http://localhost:8080/test-local.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait for match to end, restart fresh
await page.waitForTimeout(15000);
await page.keyboard.press('k');
await page.waitForTimeout(2000);

// Inject camera override that runs every frame via rAF loop
await page.evaluate(() => {
  function overrideCamera() {
    if (window._camera) {
      window._camera.position.set(0, 2.5, 5);
      window._camera.lookAt(0, 1.0, 0);
    }
    if (window._sideViewActive) requestAnimationFrame(overrideCamera);
  }
  window._sideViewActive = true;
  overrideCamera();
});
await page.waitForTimeout(200);

async function shot(name) {
  await page.screenshot({ path: `tools/frames/${name}.png` });
}

await shot('side-01-idle');

// Kick
await page.keyboard.press('l');
await page.waitForTimeout(20);
await shot('side-02-kick-20ms');
await page.waitForTimeout(50);
await shot('side-03-kick-70ms');
await page.waitForTimeout(40);
await shot('side-04-kick-110ms');
await page.waitForTimeout(50);
await shot('side-05-kick-160ms');
await page.waitForTimeout(50);
await shot('side-06-kick-210ms');
await page.waitForTimeout(100);
await shot('side-07-kick-310ms');
await page.waitForTimeout(200);
await shot('side-08-kick-510ms');

await page.evaluate(() => { window._sideViewActive = false; });
await browser.close();
console.log('Done!');
