const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const modeChip = page.locator('button[class*="modeChip"]');
  const waitForIdle = async () => {
    await modeChip.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const chip = document.querySelector('button[class*="modeChip"]');
      return chip && !chip.disabled;
    }, null, { timeout: 90000 });
    await page.waitForTimeout(500);
  };
  await waitForIdle();

  // 1. Start a hint_ladder conversation
  await page.getByPlaceholder(/paste anything/i).fill("Two Sum — given an array, return indices of two numbers adding to target.");
  await page.getByRole("button", { name: "Send" }).click();
  await waitForIdle();

  // 2. Switch to Brainstorming via mode menu -> conversation must persist
  await modeChip.click();
  await page.getByRole("button", { name: /Brainstorming/ }).click();
  await page.waitForTimeout(600);
  const keptAfterSharedSwitch = await page.locator('[class*="message"]').count();
  await page.screenshot({ path: "shots/2a-shared-switch-keeps-context.png" });

  // 3. Switch into Mock Interview -> fresh session
  await modeChip.click();
  await page.getByRole("button", { name: /Mock Interview/ }).click();
  await page.waitForTimeout(600);
  const clearedAfterInterviewSwitch = await page.locator('[class*="message"]').count();
  await page.screenshot({ path: "shots/2b-interview-fresh.png" });

  // 4. Open mode menu during interview -> other modes disabled with reason
  await modeChip.click();
  await page.waitForTimeout(400);
  const disabledItems = [];
  const items = page.locator('[class*="modeMenuItem"]');
  for (let i = 0; i < await items.count(); i++) {
    const it = items.nth(i);
    disabledItems.push({
      text: (await it.locator('[class*="modeMenuLabel"]').innerText()).trim(),
      disabled: await it.isDisabled(),
      title: await it.getAttribute("title"),
    });
  }
  await page.screenshot({ path: "shots/2c-interview-locked-modes.png" });
  await page.keyboard.press("Escape");
  console.log("messages kept after shared-group switch:", keptAfterSharedSwitch);
  console.log("messages after entering interview:", clearedAfterInterviewSwitch);
  console.log("menu items during interview:", JSON.stringify(disabledItems, null, 2));

  // 5. Simulate the interview finishing: set interviewFinished + Discussion phase in localStorage, reload
  const sessions = JSON.parse(await page.evaluate(() => localStorage.getItem("dsa-tutor-sessions-v1")));
  const activeId = await page.evaluate(() => localStorage.getItem("dsa-tutor-active-session"));
  const patched = sessions.map((s) =>
    s.id === activeId ? { ...s, interviewFinished: true, mockInterview: { ...s.mockInterview, phase: "Discussion" }, secondsRemaining: 0 } : s
  );
  await page.evaluate((data) => localStorage.setItem("dsa-tutor-sessions-v1", JSON.stringify(data)), patched);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // 6. Switch back to a shared mode -> pre-interview conversation resumes
  await modeChip.click();
  await page.getByRole("button", { name: /Hint Ladder/ }).click();
  await page.waitForTimeout(600);
  const resumedMessages = await page.locator('[class*="message"]').count();
  await page.screenshot({ path: "shots/2d-after-interview-resumes-context.png" });
  console.log("messages after interview finished + switch back to Hint Ladder:", resumedMessages);

  await browser.close();
})();
