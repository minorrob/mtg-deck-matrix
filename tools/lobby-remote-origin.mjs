/* THE WEB COPY, ACTUALLY DRIVEN.
 *
 * Rob hit this on https://minorrob.github.io/... and a local server cannot reproduce it, because
 * 127.0.0.1 and localhost are both "local" by definition. So this serves the repository from disk
 * under a hostname that is neither, by fulfilling every request in the browser itself. That is a
 * real page on a real remote origin as far as the app is concerned, which is the only way to know
 * the branch works rather than assume it from reading the ternary.
 */
import {readFile} from "node:fs/promises";
import path from "node:path";

import {fileURLToPath} from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const runner = await import(new URL("../tests/uat/browser-runner.mjs", import.meta.url).href);
const {browser, close} = await runner.openBrowser({name: "pages-origin", flag: "GEOMETRY_REQUIRED"});

const TYPES = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2"};

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, deviceScaleFactor: 1});
  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "crankmagic.example") return route.abort();
    /* /api/* does not exist on a web host -- which is the whole point */
    if (url.pathname.startsWith("/api/")) return route.fulfill({status: 404, body: "" });
    const rel = decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
    try {
      const body = await readFile(path.join(ROOT, rel));
      route.fulfill({status: 200, contentType: TYPES[path.extname(rel).toLowerCase()] || "application/octet-stream", body});
    } catch { route.fulfill({status: 404, body: ""}); }
  });

  await page.goto("http://crankmagic.example/index.html#game");
  await page.locator("#cm-main").waitFor({timeout: 30000});
  await page.waitForTimeout(4000);

  const seen = await page.evaluate(() => {
    const b = document.querySelector(".cm-host-offline-banner");
    const launch = document.querySelector(".cm-table-launch");
    const btn = document.querySelector(".cm-table-launch-row [data-action]");
    return {
      origin: location.origin,
      banner: b ? (b.querySelector("h3") || {}).textContent : "(NO BANNER — this was the bug)",
      recheck: b ? !!b.querySelector("#host-recheck") : null,
      launch: launch ? launch.textContent.trim() : "(no launch box)",
      button: btn ? btn.textContent.trim() : "(no button)",
    };
  });
  console.log(JSON.stringify(seen, null, 2));

  /* and that pressing Start says something a person can act on */
  const start = page.locator('[data-action="lobby-start-now"]');
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(800);
    const toast = await page.evaluate(() => {
      const t = document.querySelector(".cm-toast");
      return t ? t.textContent.trim() : "(no notice)";
    });
    console.log("Start says: " + toast);
  }
  await context.close();
} finally { await close(); }
