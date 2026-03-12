// Take rapid-fire screenshots of the kick animation phases
// Waits for CPU to win the match, then restarts to get a clean state
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: [
    '--no-sandbox',
    '--enable-webgl',
    '--enable-webgl2',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    '--disable-web-security',
    '--allow-running-insecure-content',
  ],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

page.on('console', msg => {
  if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
});

await page.goto('http://localhost:8080/test-local.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait for model to load AND for CPU to win the entire match (2 rounds)
// At 120Hz sim, the CPU kills player fast. 15s should cover model load + 2 full rounds + KO anims
await page.waitForTimeout(15000);

// Check state — should show "Wins Match! Tap to play again"
await page.screenshot({ path: 'tools/frames/00-match-end.png' });
console.log('Match should be over');

// Press punch to restart the match
await page.keyboard.press('k');
await page.waitForTimeout(1000);  // Wait for reset to complete

// Now we should be in a fresh round with both fighters at full health
await page.screenshot({ path: 'tools/frames/01-fresh-idle.png' });
console.log('Fresh idle after reset');

// KICK! Press l immediately
await page.keyboard.press('l');

// Capture frames rapidly
for (let i = 0; i <= 20; i++) {
  await page.waitForTimeout(16);
  await page.screenshot({ path: `tools/frames/${String(i + 10).padStart(2,'0')}-kick.png` });
}
console.log('Captured kick sequence');

// Wait and get post kick
await page.waitForTimeout(500);
await page.screenshot({ path: 'tools/frames/35-post-kick.png' });
console.log('Post kick captured');

await browser.close();
console.log('Done!');
