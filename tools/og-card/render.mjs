// The link-preview card and the home-screen icon, rendered from the real brand assets:
//   node tools/og-card/render.mjs            (needs a local server on :8813 serving the repo root,
//                                             and Playwright: UAT_PLAYWRIGHT=/path/to/playwright)
// card.html lays the wand logo, the Oxanium wordmark, the subtitle and a still of the mist
// out at 600x315 CSS px and is captured at 2x -> assets/crankmagic/og-card.jpg (1200x630).
// A link preview (iMessage, Slack, Twitter) is a static image: the mist cannot animate there.
import {writeFileSync} from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");
const BASE = process.env.OG_BASE || "http://127.0.0.1:8813/tools/og-card/";
const browser = await chromium.launch({executablePath: process.env.UAT_CHROMIUM || undefined});
async function shot(file, w, h, scale, format, out) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: scale});
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await page.goto(BASE + file, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2200);
  const fonts = await page.evaluate(() => ({satoshi: document.fonts.check("14px Satoshi"), oxanium: document.fonts.check("40px CrankOxanium")}));
  const {data} = await cdp.send("Page.captureScreenshot", {format, quality: format === "jpeg" ? 90 : undefined, clip: {x: 0, y: 0, width: w, height: h, scale}});
  writeFileSync(out, Buffer.from(data, "base64")); console.log(out, JSON.stringify(fonts));
  await ctx.close();
}
await shot("card.html", 600, 315, 2, "jpeg", "assets/crankmagic/og-card.jpg");
await shot("icon.html", 180, 180, 1, "png", "assets/crankmagic/apple-touch-icon.png");
await browser.close();
