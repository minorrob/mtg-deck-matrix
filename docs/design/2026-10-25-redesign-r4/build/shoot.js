// node shoot.js <json list of {url, out, w, h, full}>
const { chromium } = require('playwright');
(async () => {
  const jobs = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  for (const j of jobs) {
    const ctx = await browser.newContext({ viewport: { width: j.w, height: j.h || 900 }, deviceScaleFactor: j.dpr || 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('requestfailed', r => errs.push('FAILED ' + r.url()));
    await page.goto(j.url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (j.fit) { const hh = await page.evaluate(() => document.documentElement.scrollHeight); await page.setViewportSize({ width: j.w, height: hh }); await page.waitForTimeout(100); }
    await page.screenshot({ path: j.out, fullPage: j.full !== false });
    if (errs.length) console.log(j.out, errs.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log('shot', jobs.length);
})();
