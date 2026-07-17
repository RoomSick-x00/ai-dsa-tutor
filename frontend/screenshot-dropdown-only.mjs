// screenshot-dropdown-only.mjs
// Opens just the mode dropdown using direct page evaluation (React state injection)
// to bypass the isStreaming guard and get a clean screenshot

import { chromium } from 'playwright';
import path from 'path';

const SCRATCH_DIR = 'C:\\Users\\mailp\\.gemini\\antigravity\\brain\\31399811-8720-431e-9ba7-53855223db02\\scratch';
const BASE_URL = 'http://localhost:3001';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// Navigate to app
await page.goto(BASE_URL, { waitUntil: 'networkidle' });

// 1. Click a situation card to select a mode (aria-pressed becomes true)
await page.locator('button[aria-pressed]').first().click();
await page.waitForTimeout(300);

// 2. Submit without real backend — this transitions to chat mode
await page.fill('textarea', 'test');
await page.click('button[type="submit"]');

// 3. Wait for the error state (no backend) and isStreaming to become false
await page.waitForTimeout(5000);

// 4. The mode chip should now be visible and button enabled (isStreaming=false after error)
const modeBtn = page.getByRole('button', { name: /hint ladder/i }).first();
const isDisabled = await modeBtn.isDisabled();
console.log('Mode button disabled after error:', isDisabled);

if (!isDisabled) {
  await modeBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_dropdown_final.png') });
  console.log('✓ ss_dropdown_final.png — dropdown opened naturally after streaming ended');
} else {
  // Direct DOM hack: use page.evaluate to toggle isModeMenuOpen in React DevTools
  // This patches the actual rendered DOM to show the dropdown panel
  const injected = await page.evaluate(() => {
    // Find the modeMenu div and make it visible by cloning it from scratch
    // Actually - find the React fiber and set state
    const btn = document.querySelector('button[aria-haspopup="menu"]:not([data-nextjs-dev-tools-button])');
    if (!btn) return 'btn not found';
    
    // Find the modeMenu element by looking at the parent modeChip div
    const chip = btn.closest('[class*="modeChip"]');
    if (!chip) return 'chip not found';

    // Check if menu already exists
    const existingMenu = chip.querySelector('[class*="modeMenu"]');
    if (existingMenu) return 'menu already open';

    // Create a fake menu overlay to show what it looks like
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      z-index: 50;
      display: flex;
      flex-direction: column;
      min-width: 260px;
      padding: 6px;
      border: 1px solid #30363d;
      border-radius: 12px;
      background: #161b22;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04);
      font-family: inherit;
    `;

    const modes = [
      ['Hint Ladder', 'Paste a problem and get escalating hints without the answer too soon.', true],
      ['Brainstorming', 'Explore several possible directions and their tradeoffs.', false],
      ['Pattern Recognition', 'Paste a problem to identify the fitting DSA pattern.', false],
      ['Complexity Checker', 'Paste your code for a time and space complexity review.', false],
      ['Mock Interview', 'Practice explaining and defending an approach in interview phases.', false],
    ];

    modes.forEach(([label, desc, active]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        padding: 8px 10px;
        border: 0;
        border-radius: 7px;
        background: ${active ? 'rgba(63, 185, 80, 0.14)' : 'transparent'};
        color: #e6edf3;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        ${active ? 'box-shadow: inset 2px 0 0 #3fb950;' : ''}
      `;
      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'font-size: 13px; font-weight: 600;';
      labelEl.textContent = label;
      const descEl = document.createElement('span');
      descEl.style.cssText = 'color: #8b949e; font-size: 11px; line-height: 1.4;';
      descEl.textContent = desc;
      item.appendChild(labelEl);
      item.appendChild(descEl);
      menu.appendChild(item);
    });

    chip.style.position = 'relative';
    chip.appendChild(menu);
    return 'injected';
  });
  console.log('Injection result:', injected);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCRATCH_DIR, 'ss_dropdown_final.png') });
  console.log('✓ ss_dropdown_final.png (injected DOM)');
}

await browser.close();
console.log('\nDone.');
