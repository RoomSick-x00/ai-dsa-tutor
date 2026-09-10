const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const iconLinks = await page.$$eval('link[rel="icon"]', els =>
    els.map(e => ({ rel: e.rel, href: e.getAttribute("href"), type: e.type }))
  );
  console.log("icon links:", JSON.stringify(iconLinks));
  // Render the favicon at large size + show what the tab icon looks like by loading the asset
  const href = iconLinks[0]?.href;
  const status = href ? (await page.request.get(href.startsWith("http") ? href : "http://localhost:3000" + href)).status() : 0;
  console.log("favicon fetch status:", status);
  await page.setContent(`<body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;height:100vh;gap:48px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <img src="${href}" width="96" height="96" style="image-rendering:auto;border-radius:12px"/>
      <span style="color:#8b949e;font-family:monospace;font-size:13px">favicon (96px)</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <img src="${href}" width="16" height="16"/>
      <span style="color:#8b949e;font-family:monospace;font-size:13px">tab size (16px)</span>
    </div>
  </body>`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/1-favicon.png" });
  await browser.close();
})();
