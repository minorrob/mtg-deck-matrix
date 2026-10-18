/* Quick screenshot tool for PR artifacts */
import {readFile, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = process.argv[2] || "decks";
const outFile = process.argv[3] || "screenshot.png";
const width = Number(process.argv[4]) || 1400;
const height = Number(process.argv[5]) || 900;

const require_ = createRequire(import.meta.url);
const {chromium} = require_(process.env.UAT_PLAYWRIGHT || "playwright");

const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2"};

const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep)) {res.writeHead(403).end(); return;}
    res.writeHead(200, {"content-type": TYPES[path.extname(full)] || "application/octet-stream"}).end(await readFile(full));
  } catch {res.writeHead(404).end("not found");}
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({headless: true});
try {
  const phone = width < 640;
  const context = await browser.newContext({viewport: {width, height}, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, serviceWorkers: 'block'});
  const page = await context.newPage();
  
  /* Navigate to the target route */
  await page.goto(`${base}/index.html#${route}`);
  await page.waitForTimeout(2000);
  
  /* Take screenshot */
  await page.screenshot({path: outFile, fullPage: false});
  console.log(`Screenshot saved to ${outFile} (${width}x${height})`);
  
  await context.close();
} finally {
  await browser.close();
  server.close();
}
