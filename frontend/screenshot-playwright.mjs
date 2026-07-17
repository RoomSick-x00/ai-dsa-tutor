// screenshot-playwright.mjs
// Run from the frontend directory: node ./screenshot-playwright.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRATCH_DIR = 'C:\\Users\\mailp\\.gemini\\antigravity\\brain\\31399811-8720-431e-9ba7-53855223db02\\scratch';
const BASE_URL = 'http://localhost:3001';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// ── Screenshot 1: Landing page ──────────────────────────────────────────────
await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_01_landing.png') });
console.log('✓ ss_01_landing.png');

// ── Enter chat mode by clicking first situation card ─────────────────────────
const cards = page.locator('button[aria-pressed]');
await cards.first().click();
await page.waitForTimeout(300);

// ── Screenshot 2: After selecting a mode card ─────────────────────────────────
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_02_card_selected.png') });
console.log('✓ ss_02_card_selected.png');

// ── Submit to enter chat mode ─────────────────────────────────────────────────
await page.fill('textarea', 'What is binary search?');
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);

// ── Screenshot 3: Chat mode (mode chip visible, dropdown closed) ──────────────
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_03_chat_mode.png') });
console.log('✓ ss_03_chat_mode.png');

// ── Screenshot 4: Open the mode dropdown ─────────────────────────────────────
// Use first() to avoid strict-mode violation with Next.js dev tools button
const modeBtn = page.locator('button[aria-haspopup="menu"]').first();
if (await modeBtn.count() > 0) {
  // Wait for disabled state to clear (streaming may still be in progress)
  await page.waitForTimeout(2000);
  await modeBtn.click({ force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_04_dropdown_open.png') });
  console.log('✓ ss_04_dropdown_open.png  ← KEY: dropdown should show dark background, no OS chrome');
} else {
  console.log('⚠ mode button not found — still on landing?');
}

await browser.close();
console.log('\nAll done. Screenshots in:', SCRATCH_DIR);
