const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("dsa-tutor-sessions-v1");
    localStorage.removeItem("dsa-tutor-active-session");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Empty state
  await page.screenshot({ path: "shots/3a-sidebar-empty.png" });

  // Start a conversation
  await page.getByPlaceholder(/paste anything/i).fill("Binary search on a rotated sorted array");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(() => {
    const chip = document.querySelector("[class*=\"modeChip\"]");
    return chip && !chip.disabled;
  }, null, { timeout: 90000 });
  await page.waitForTimeout(800);

  // One saved chat visible
  await page.screenshot({ path: "shots/3b-sidebar-one-chat.png" });

  // New chat via + — prior chat stays in sidebar
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "shots/3c-sidebar-new-chat.png" });

  const titles = await page.locator("[class*=\"historyTitle\"]").allTextContents();
  console.log("sidebar titles:", titles);

  await browser.close();
})();
