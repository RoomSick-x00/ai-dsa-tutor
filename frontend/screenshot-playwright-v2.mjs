// screenshot-playwright-v2.mjs
// Takes screenshots specifically targeting the mode dropdown
// Does NOT need the backend to be running — just opens landing, selects mode card,
// then directly manipulates the DOM to open the dropdown for screenshot purposes.

import { chromium } from 'playwright';
import path from 'path';

const SCRATCH_DIR = 'C:\\Users\\mailp\\.gemini\\antigravity\\brain\\31399811-8720-431e-9ba7-53855223db02\\scratch';
const BASE_URL = 'http://localhost:3001';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// ── Go to app ────────────────────────────────────────────────────────────────
await page.goto(BASE_URL, { waitUntil: 'networkidle' });

// ── Select "Stuck on a problem" card to set mode, then type and submit ────────
await page.click('button[aria-pressed]');
await page.waitForTimeout(200);

// Fill textarea and submit without needing backend
await page.fill('textarea', 'What is binary search?');

// We need to be in chat mode. Submitting triggers setHasStarted(true) + sendMessage
// Even if backend fails, the UI transitions to chat mode.
// But don't actually submit — just hack the page into chat mode via script
// by clicking the submit button while the backend is offline (error will show, mode switcher still appears)
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);  // give it time to fail and show error state

// Take screenshot of the chat mode with mode chip visible
await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_chat_with_modechip.png') });
console.log('✓ ss_chat_with_modechip.png');

// ── Now click the mode button (it should NOT be disabled since streaming failed) ─
// Find the mode button by its text content "Hint Ladder"
const modeBtn = page.getByRole('button', { name: /hint ladder/i }).first();
const isBtnVisible = await modeBtn.isVisible();
const isBtnDisabled = await modeBtn.isDisabled();
console.log(`Mode button visible: ${isBtnVisible}, disabled: ${isBtnDisabled}`);

if (isBtnVisible && !isBtnDisabled) {
  await modeBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_dropdown_v2.png') });
  console.log('✓ ss_dropdown_v2.png  ← KEY SCREENSHOT');
} else if (isBtnVisible) {
  // Force click even if disabled — we just need to see the dropdown visually
  console.log('Button is disabled, forcing click...');
  await modeBtn.evaluate((el) => el.removeAttribute('disabled'));
  await modeBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_dropdown_v2.png') });
  console.log('✓ ss_dropdown_v2.png (forced) ← KEY SCREENSHOT');
} else {
  // Directly inject the open state via keyboard shortcut or evaluate
  console.log('Button not found by text, trying evaluate...');
  await page.evaluate(() => {
    // Find the button with aria-haspopup and click it programmatically
    const btn = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'))
      .find(b => !b.dataset.nextjsDevToolsButton);
    if (btn) {
      btn.removeAttribute('disabled');
      btn.click();
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_dropdown_v2.png') });
  console.log('✓ ss_dropdown_v2.png (via evaluate)');
}

await browser.close();
console.log('\nDone. Screenshots in:', SCRATCH_DIR);
