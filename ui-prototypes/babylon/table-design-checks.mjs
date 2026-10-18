/* The table designs (tables.js), proven: every design builds on desktop and phone sizes; its sides and base exist as
   meshes; from the default 40-degree view a ray through the table's front edge hits a side, an edge or a leg, never the top
   alone; the glass top is translucent; the medieval straps exist; the choice is remembered per device. Then the mutation:
   with the side parts retagged as tops (the page served with 'side' replaced), the sides check must fail.
   Run from the repository root with UAT_PLAYWRIGHT and UAT_CHROME set; it starts its own read-only server. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {previewServer} from './server.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || 'playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const shots = process.env.UAT_SHOTS || path.resolve(HERE, '../../docs/play-overhaul/screenshots');
let checks = 0; const ok = (v, m) => {assert.ok(v, m); checks++;};
const server = previewServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath: process.env.UAT_CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const designs = ['medieval-banded', 'colonial-inlay', 'glass-future', 'tavern-plank', 'felt-card', 'stone-dais', 'obsidian-glass'];
async function open({width, height, design, mutate = false}) {
  const ctx = await browser.newContext({viewport: {width, height}, hasTouch: width < 700, isMobile: width < 700, reducedMotion: 'reduce'});
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (mutate) await page.route('**/tables.js', async route => {const r = await route.fetch(); await route.fulfill({response: r, body: (await r.text()).replaceAll("'side'", "'top'"), headers: {'content-type': 'text/javascript'}});});
  if (design) await page.addInitScript(d => {try {localStorage.setItem('cm-lab-table-design', d);} catch {}}, design);
  await page.goto(base + '/', {waitUntil: 'load'});
  await page.waitForFunction(() => globalThis.tabletopLab?.tableInfo, null, {timeout: 60000});
  await page.waitForTimeout(400);
  return {page, ctx, errors};
}
/* Rays through the band where the table's front edge and base show: a grid across the lower fifth of the canvas. */
const frontEdge = async (page) => page.evaluate(() => {const c = document.querySelector('#table'); const hits = []; for (let fx = .15; fx <= .85; fx += .025) for (let fy = .7; fy <= .98; fy += .02) hits.push(globalThis.tabletopLab.pickTablePart(c.clientWidth * fx, c.clientHeight * fy)); return hits;});
for (const design of designs) {
  for (const [width, height] of [[1400, 900], [390, 844]]) {
    const {page, ctx, errors} = await open({width, height, design});
    const info = await page.evaluate(() => globalThis.tabletopLab.tableInfo());
    ok(errors.length === 0, `${design} ${width}: no page errors (${errors[0] || ''})`);
    ok(info.design === design, `${design} ${width}: the remembered design is built`);
    const parts = p => info.parts.filter(x => x.part === p);
    ok(parts('top').length >= 1, `${design} ${width}: has a top`);
    ok(parts('side').length >= 2, `${design} ${width}: has side faces (${parts('side').length})`);
    if (width > 700) {
      ok(parts('leg').length >= 1, `${design}: has a base on desktop (${parts('leg').length} leg meshes)`);
      const hits = await frontEdge(page);
      const seen = [...new Set(hits.map(h => h?.part || 'none'))];
      ok(hits.some(h => h && h.part !== 'top'), `${design}: rays through the front band hit a side, edge, band or leg, not only the top (${seen.join(',')})`);
    } else ok(parts('leg').length === 0, `${design}: the phone variant draws no legs`);
    if (design === 'glass-future') ok(Math.min(...parts('top').map(p => p.alpha)) < 1, 'glass-future: the top is translucent');
    if (design === 'medieval-banded') ok(parts('band').length >= 4, `medieval-banded: at least four straps (${parts('band').length})`);
    await page.screenshot({path: path.join(shots, `table-design-${width > 700 ? 'desktop' : 'phone'}-${design}.png`)});
    await ctx.close();
  }
}
/* Remembered per device: choose through the chooser, reload, same design. */
{
  const {page, ctx} = await open({width: 1400, height: 900, design: null});   // nothing remembered: the default, then the chooser
  await page.click('#camera-toggle'); await page.selectOption('#table-design', 'felt-card'); await page.waitForTimeout(300);
  await page.reload({waitUntil: 'load'}); await page.waitForFunction(() => globalThis.tabletopLab?.tableInfo, null, {timeout: 60000});
  ok((await page.evaluate(() => globalThis.tabletopLab.tableInfo().design)) === 'felt-card', 'the chooser\'s choice survives a reload');
  await ctx.close();
}
/* The mutation: sides retagged as tops must fail the sides check. */
{
  const {page, ctx} = await open({width: 1400, height: 900, design: 'colonial-inlay', mutate: true});
  const info = await page.evaluate(() => globalThis.tabletopLab.tableInfo());
  let failed = false; try {assert.ok(info.parts.filter(x => x.part === 'side').length >= 2);} catch {failed = true;}
  ok(failed, 'with the side parts retagged, the sides check fails');
  await ctx.close();
}
await browser.close(); server.close();
console.log(`table-design-checks: ${checks} checks passed -- seven designs on desktop and phone, sides and base present and visible from the front edge, glass translucent, straps present, choice remembered, mutation caught.`);
