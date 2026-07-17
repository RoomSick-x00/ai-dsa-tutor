// screenshot-step1-2.mjs
import { chromium } from 'playwright';
import path from 'path';

const SCRATCH_DIR = 'C:\\Users\\mailp\\.gemini\\antigravity\\brain\\31399811-8720-431e-9ba7-53855223db02\\scratch';
const BASE_URL = 'http://localhost:3001';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 }); // Wider viewport to see the 1200px container width clearly

// ── Landing page ────────────────────────────────────────────────────────────
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_layout_landing.png') });
console.log('✓ ss_layout_landing.png');

// ── Select card and submit to enter Chat ─────────────────────────────────────
await page.locator('button[aria-pressed]').first().click();
await page.waitForTimeout(200);

await page.fill('textarea', 'Explain binary search concept.');
await page.click('button[type="submit"]');

// Let it wait to show the chat layout
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_layout_chat.png') });
console.log('✓ ss_layout_chat.png');

await browser.close();
console.log('Done.');
