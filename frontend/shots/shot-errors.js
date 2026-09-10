const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Mock /chat to return a Gemini-style 502 high-demand error
  await page.route("**/chat", (route) => {
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Model is experiencing high demand. Please retry shortly." }),
    });
  });

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: /Stuck on a problem/i }).click();
  await page.locator("textarea").fill("Two Sum problem");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(1200);

  const errorText = await page.locator("[class*=\"error\"]").innerText();
  console.log("user-facing error:", errorText);
  await page.screenshot({ path: "shots/4-friendly-error.png" });

  await browser.close();
})();
