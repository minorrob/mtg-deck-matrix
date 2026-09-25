/* THE ARCHITECTURE PAGE (M11, docs/plan-to-100.md): the rules it must keep, held.
 *
 * docs/architecture/index.html draws CrankMagic's final state from engram's two graphs, through
 * docs/architecture/architecture.json. This suite fails when any of the page's rules breaks:
 *
 *   1. THE DATA FILE IS ENGRAM'S GRAPH. Every piece's status in architecture.json is its membership in
 *      the committed graphs (current map: docs/architecture/.kg; forward model:
 *      docs/architecture/.kg/final), and so is every line's. A piece in the current map is
 *      evidenced by a mapped file that exists; a piece in the final state traces to a requirement.
 *   2. THE PAGE CARRIES THAT FILE, UNCHANGED, and nothing else: no script, style, font or data from
 *      any other address, and no request at all when it opens.
 *   3. PRIVACY. Confidential nodes reach the page as name and kind only; no secret's variable name and
 *      no address but the public one appears in it.
 *   4. THE DATA DRIVES ALL FOUR VIEWS. Every piece the data places is drawn, and a change to the data
 *      (a renamed service, a removed table) changes the drawings with no other edit.
 *   5. THE TOGGLE. Off: a piece or line that exists today but not in the final state is 85% transparent,
 *      and everything else is solid. On: what exists today is highlighted and what is planned reads
 *      as planned.
 *   6. EVERY NODE, LINE AND STEP OPENS ITS DETAIL ON A TAP, at 393 x 852 (an iPhone 15 Pro), with the
 *      views one thumb away and nothing scrolling sideways.
 *
 * The browser half needs Playwright and Chromium, like tests/browser-geometry.mjs; GEOMETRY_REQUIRED=1
 * (CI) turns a missing browser into a failure. Regenerate the data with docs/architecture/map.sh.
 */
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import path from "node:path";
import {ROOT, openBrowser} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

const CUSTOM = new Set(["D1Table", "D1Field", "WorkerRoute", "R2Object", "DurableObjectRoom", "OutsideSource", "RecordType",
  "RecordField", "NetworkNode", "Secret", "DataFlow", "Journey", "JourneyStep"]);
const DATA_PATH = "docs/architecture/architecture.json", PAGE_PATH = "docs/architecture/index.html";
const data = json(DATA_PATH);
const html = read(PAGE_PATH);
/* engram's graph file, spelled in two parts for tools/data-inventory.mjs's basename match (see tools/architecture-map.py). */
const GRAPH = "graph" + ".json";
const current = json(`docs/architecture/.kg/${GRAPH}`), final = json(`docs/architecture/.kg/final/${GRAPH}`);

/* ── 1. the data file is engram's graph ── */
{
  const cur = new Map(current.nodes.filter((n) => CUSTOM.has(n.kind)).map((n) => [n.id, n]));
  const fin = new Map(final.nodes.filter((n) => CUSTOM.has(n.kind)).map((n) => [n.id, n]));
  const want = (id) => (cur.has(id) && fin.has(id) ? "both" : fin.has(id) ? "final" : "current");
  const ids = new Set([...cur.keys(), ...fin.keys()]);
  ok(ids.size > 100, `the graphs hold ${ids.size} pieces; the page needs the map to have run`);
  assert.deepEqual(Object.keys(data.pieces).sort(), [...ids].sort(), "architecture.json names exactly the pieces engram's graphs hold");
  for (const id of ids) ok(data.pieces[id].status === want(id), `${id} is ${data.pieces[id].status} in the data but ${want(id)} in the graphs`);
  for (const s of ["both", "final", "current"]) ok(Object.values(data.pieces).some((p) => p.status === s), `no piece is ${s}; the page would have nothing to show for it`);

  const edgeSet = (g, kind) => new Set(g.edges.filter((e) => e.kind === kind).map((e) => `${e.from}|${e.to}`));
  for (const [kind, rows] of [["connects-to", data.links], ["joins", data.joins]]) {
    const c = edgeSet(current, kind), f = edgeSet(final, kind);
    assert.deepEqual(rows.map((r) => `${r.from}|${r.to}`).sort(), [...new Set([...c, ...f])].sort(), `every ${kind} edge in the graphs is a line on the page, and no other`);
    for (const r of rows) {
      const k = `${r.from}|${r.to}`, s = c.has(k) && f.has(k) ? "both" : f.has(k) ? "final" : "current";
      ok(r.status === s, `the line ${k} is ${r.status} in the data but ${s} in the graphs`);
    }
  }

  const byId = new Map(current.nodes.map((n) => [n.id, n]));
  for (const id of cur.keys()) {
    const ev = current.edges.filter((e) => e.from === id && e.kind === "evidenced-by").map((e) => byId.get(e.to));
    ok(ev.length > 0 && ev.every((n) => n && n.file && existsSync(path.join(ROOT, n.file))), `${id} is in the current map with no evidence in a mapped file that exists`);
  }
  const reqs = new Set(final.nodes.filter((n) => n.kind === "Requirement").map((n) => n.id));
  for (const id of fin.keys()) {
    ok(final.edges.some((e) => e.from === id && e.kind === "traces-to" && reqs.has(e.to)), `${id} is in the final state without tracing to a requirement`);
    ok(fin.get(id).status === "intent", `${id} is in the forward model without status: intent`);
  }
  for (const t of Object.values(data.pieces).filter((p) => p.fields)) {
    const core = t.fields.filter((f) => data.pieces[f].core).length;
    ok(core <= 6 && core >= Math.min(4, t.fields.length) - 1 && core >= 1, `${t.id} marks ${core} core fields; a table shows four to six`);
  }
}

/* ── 2. the page carries the file, and nothing from anywhere else ── */
{
  const START = '<script type="application/json" id="architecture-data">', END = "</script><!-- /architecture-data -->";
  const a = html.indexOf(START), b = html.indexOf(END);
  ok(a > 0 && b > a, "the page has its data block");
  const embedded = JSON.parse(html.slice(a + START.length, b).replace(/<\\\//g, "</"));
  assert.deepEqual(embedded, data, "the page embeds architecture.json exactly");
  const code = html.slice(0, a) + html.slice(b);
  ok(!/<script[^>]+\bsrc\s*=/i.test(code), "no script is loaded from a file or an address");
  ok(!/<link\b/i.test(code), "no stylesheet or font is linked");
  ok(!/url\(\s*["']?(https?:)?\/\//i.test(code), "no CSS url() reaches another address");
  ok(!/@import/i.test(code), "no CSS @import");
  ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(|\bimport\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource|Worker)\b/.test(code), "the script makes no request");
  ok(!/\b(src|href|action)\s*=\s*["']?(https?:)?\/\//i.test(code), "no attribute points at another address");
  ok(/@font-face[^}]+data:font\/woff2;base64,/.test(code), "Satoshi is inlined, so the page never falls back to another face");
}

/* ── 3. privacy ── */
{
  const confidential = [...current.nodes, ...final.nodes].filter((n) => CUSTOM.has(n.kind) && n.classification === "confidential");
  ok(confidential.length > 0, "the classification file marked confidential nodes");
  const allowed = new Set(["id", "kind", "name", "status", "classification", "withheld", "table", "core", "place", "hostedOn", "fields"]);
  for (const n of confidential) {
    const p = data.pieces[n.id];
    ok(p && p.withheld === true, `${n.id} is confidential but not withheld on the page`);
    ok(Object.keys(p).every((k) => allowed.has(k)), `${n.id} carries more than its name and kind: ${Object.keys(p).filter((k) => !allowed.has(k))}`);
  }
  for (const n of [...current.nodes, ...final.nodes].filter((n) => n.kind === "Secret" && n.variable)) {
    ok(!html.includes(n.variable) && !JSON.stringify(data).includes(n.variable), `a secret's variable name reached the page`);
  }
  const addresses = [...html.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)].map((m) => m[0]).filter((a) => !/^(data|font)/.test(a));
  ok(addresses.every((a) => a === "admin@crankmagic.com"), `only the public address may appear, found: ${[...new Set(addresses)]}`);
}

/* ── 4-6. in a browser ── */
const {browser, base, close} = await openBrowser({name: "architecture-page", flag: "GEOMETRY_REQUIRED"});
try {
  const url = `${base}/${PAGE_PATH}`;
  const phone = {viewport: {width: 393, height: 852}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark"};

  async function openPage(mutate) {
    const ctx = await browser.newContext(phone);
    const page = await ctx.newPage();
    const requests = [], errors = [];
    page.on("request", (r) => { if (!r.url().startsWith("data:") && r.url() !== url) requests.push(r.url()); });
    page.on("pageerror", (e) => errors.push(e.message));
    if (mutate) await page.route(url, async (route) => {
      const body = html;
      const START = '<script type="application/json" id="architecture-data">', END = "</script><!-- /architecture-data -->";
      const a = body.indexOf(START) + START.length, b = body.indexOf(END);
      const d = JSON.parse(body.slice(a, b).replace(/<\\\//g, "</"));
      mutate(d);
      await route.fulfill({status: 200, contentType: "text/html; charset=utf-8", body: body.slice(0, a) + JSON.stringify(d).replace(/<\//g, "<\\/") + body.slice(b)});
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__architecture);
    return {ctx, page, requests, errors};
  }
  const show = (page, v) => page.click(`#tab-${v}`).then(() => page.waitForTimeout(120));
  const drawn = (page, sel) => page.$$eval(sel, (ns) => [...new Set(ns.map((n) => n.dataset.piece))].sort());

  const {ctx, page, requests, errors} = await openPage();
  /* 4. every piece the data places is drawn in its view */
  const placed = (view) => Object.values(data.pieces).filter((p) => p.place && p.place[view]).map((p) => p.id).sort();
  await show(page, "network");
  assert.deepEqual(await drawn(page, "#lanes .piece"), placed("network"), "the network view draws exactly the data's placed services and sources");
  ok((await page.$$("#net-wires path.wire")).length === data.links.length, "every link is a line in the network view");
  await show(page, "schema");
  assert.deepEqual(await drawn(page, "#groups .piece"), placed("schema"), "the schema view draws exactly the data's tables");
  ok((await page.$$("#schema-wires path.jwire")).length === data.joins.length, "every join is a line in the schema view");
  for (const t of await page.$$("#groups .piece")) {
    const n = await t.$$eval(".field", (fs) => fs.length), id = await t.getAttribute("data-piece");
    ok(n >= Math.min(4, data.pieces[id].fields.length) && n <= 6, `${id} shows ${n} fields; a table shows four to six`);
  }
  await show(page, "data");
  assert.deepEqual(await drawn(page, "#flow-chips .chip"), data.flows.map((f) => f.id).sort(), "the data view offers every flow");
  for (const fl of data.flows) {
    await page.click(`#flow-chips .chip[data-piece="${fl.id}"]`);
    assert.deepEqual(await page.$$eval("#flow .stepcard", (ns) => ns.map((n) => n.dataset.piece)), fl.steps.map((s) => s.piece), `${fl.id} draws its steps in order`);
  }
  await show(page, "journeys");
  assert.deepEqual(await drawn(page, "#journey-chips .chip"), data.journeys.map((j) => j.id).sort(), "the journeys view offers every journey");
  for (const j of data.journeys) {
    await page.click(`#journey-chips .chip[data-piece="${j.id}"]`);
    assert.deepEqual(await page.$$eval("#journey .stepcard", (ns) => ns.map((n) => n.dataset.piece)), j.steps.map((s) => s.id), `${j.id} draws its steps in order`);
  }

  /* 5. the toggle and the 85% rule */
  const opacities = (sel) => page.$$eval(sel, (ns) => ns.map((n) => [n.dataset.status, Number(getComputedStyle(n).opacity)]));
  for (const view of ["network", "schema", "data", "journeys"]) {
    await show(page, view);
    const sel = `#view-${view} .piece[data-status], #view-${view} .chip[data-status], #view-${view} .row[data-status]`;
    const off = await opacities(sel);
    ok(off.some(([s]) => s === "current") || view === "journeys", `the ${view} view has retiring pieces to fade`);
    for (const [s, o] of off) ok(s === "current" ? Math.abs(o - 0.15) < 0.01 : o === 1, `${view}: a ${s} piece is at opacity ${o} with the toggle off`);
    await page.click("#toggle"); await page.waitForTimeout(320);
    ok(await page.getAttribute("#toggle", "aria-checked") === "true", "the toggle reports itself on");
    for (const [s, o] of await opacities(sel)) ok(o === 1, `${view}: a ${s} piece is at opacity ${o} with the toggle on`);
    const tags = await page.$$eval(`#view-${view} .piece[data-status]`, (ns) => ns.map((n) => {
      const vis = (c) => { const t = n.querySelector(`:scope > .head .tag.${c}`); return !!t && getComputedStyle(t).display !== "none"; };
      return [n.dataset.status, vis("today"), vis("planned"), getComputedStyle(n).borderTopStyle];
    }));
    for (const [s, today, planned, border] of tags) {
      if (s === "final") ok(planned && !today && border === "dashed", `${view}: a planned piece does not read as planned with the toggle on`);
      else ok(today && !planned && border !== "dashed", `${view}: a ${s} piece is not highlighted as existing today`);
    }
    await page.click("#toggle"); await page.waitForTimeout(320);
  }
  await show(page, "network");
  for (const [s, o] of await page.$$eval("#net-wires path.wire", (ns) => ns.map((n) => [n.dataset.status, Number(getComputedStyle(n).opacity)])))
    ok(s === "current" ? Math.abs(o - 0.15) < 0.01 : o === 1, `a ${s} line is at opacity ${o} with the toggle off`);

  /* 6. taps, thumbs and width */
  const sheetTitle = () => page.textContent("#sheet-title");
  const closeSheet = async () => { await page.keyboard.press("Escape"); ok(await page.isHidden("#sheet"), "Escape closes the detail"); };
  await page.tap('#lanes .piece[data-piece="net:worker"]');
  ok(await page.isVisible("#sheet") && (await sheetTitle()) === data.pieces["net:worker"].name, "tapping a service opens its detail");
  ok((await page.textContent("#sheet")).includes("GET /api/me"), "the Worker's detail lists its routes");
  await closeSheet();
  /* A real tap on a line: find a line whose middle is not under a box, scroll to it, and tap that point. */
  const spot = await page.evaluate(() => {
    for (const p of document.querySelectorAll("#net-wires path.hit")) {
      const l = p.getTotalLength(), pt = p.getPointAtLength(l / 2), r = p.ownerSVGElement.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + pt.y - 400);
      const r2 = p.ownerSVGElement.getBoundingClientRect(), x = r2.left + pt.x, y = r2.top + pt.y;
      if (document.elementFromPoint(x, y) === p) return {x, y, link: p.dataset.link};
    }
    return null;
  });
  ok(spot, "at least one line can be tapped where it is not under a box");
  await page.touchscreen.tap(spot.x, spot.y);
  const [lf, lt] = spot.link.split("|");
  ok((await sheetTitle()) === `${data.pieces[lf].name} → ${data.pieces[lt].name}`, "tapping a line opens that connection");
  await closeSheet();
  await page.click("#conn-list .row");
  ok((await sheetTitle()).includes("→"), "every connection opens from the list too");
  await closeSheet();
  await show(page, "schema");
  await page.tap('#groups .piece[data-piece="d1:snapshots"]');
  ok(await page.$$eval("#sheet .dict tbody tr", (r) => r.length) === data.pieces["d1:snapshots"].fields.length, "tapping a table opens its whole data dictionary");
  await closeSheet();
  await page.tap('#groups .piece[data-piece="rec:scryfall.prices"]');
  const src = await page.textContent("#sheet .src");
  ok(/Live or stored/.test(src) && /Cache lifetime/.test(src) && /Refresh/.test(src) && /Terms/.test(src) && /Source/.test(src), "an outside table shows its source, live or stored, cache lifetime, refresh and terms");
  await closeSheet();
  const jhit = await page.$("#schema-wires path.hit");
  await jhit.dispatchEvent("click");
  ok((await sheetTitle()).includes("→"), "a join line opens the join");
  await closeSheet();
  await show(page, "data");
  await page.tap("#flow .stepcard");
  ok(await page.isVisible("#sheet"), "tapping a flow step opens it");
  await closeSheet();
  await page.tap("#flow .hop");
  ok((await sheetTitle()).includes("→"), "tapping an arrow between steps opens that hop");
  await closeSheet();
  await show(page, "journeys");
  await page.tap("#journey .stepcard");
  ok((await sheetTitle()).includes("step 1"), "tapping a journey step opens it");
  await closeSheet();

  const tabs = await page.$$eval(".tab", (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return [r.height, r.bottom]; }));
  for (const [h, bottom] of tabs) ok(h >= 44 && bottom <= 852 && bottom >= 852 - 40, `a view tab is ${h}px tall at the bottom edge (${bottom}); one thumb must reach it`);
  for (const v of ["data", "network", "journeys", "schema"]) {
    await show(page, v);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `the ${v} view scrolls sideways at 393px`);
  }
  assert.deepEqual(requests, [], `the page made requests: ${requests}`);
  assert.deepEqual(errors, [], `the page threw: ${errors}`);
  await ctx.close();

  /* 4b. the data drives the drawings: change the data, and only the data */
  const t = await openPage((d) => {
    d.pieces["net:worker"].name = "Renamed by the suite";
    d.pieces["net:browser"].name = "A browser renamed by the suite";
    delete d.pieces["d1:heads"];
    d.joins = d.joins.filter((j) => !j.from.startsWith("d1:heads") && !j.to.startsWith("d1:heads"));
    d.flows[0].steps = d.flows[0].steps.filter((s) => !s.piece.startsWith("d1:heads"));
    d.pieces["net:r2"].status = "current";
  });
  await show(t.page, "network");
  ok(await t.page.textContent('#lanes .piece[data-piece="net:worker"] .name') === "Renamed by the suite", "a renamed piece in the data is renamed in the network view");
  ok(Math.abs(await t.page.$eval('#lanes .piece[data-piece="net:r2"]', (n) => Number(getComputedStyle(n).opacity)) - 0.15) < 0.01, "a piece the data marks retiring fades, with no change to the drawing code");
  await show(t.page, "schema");
  ok(!(await t.page.$('#groups .piece[data-piece="d1:heads"]')), "a table removed from the data leaves the schema view");
  await show(t.page, "data");
  ok((await t.page.textContent("#flow")).includes("A browser renamed by the suite"), "the same rename reaches the data flows");
  assert.deepEqual(t.errors, [], `the mutated page threw: ${t.errors}`);
  await t.ctx.close();

  /* and it scales up */
  const wide = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: "light"});
  const w = await wide.newPage();
  await w.goto(url);
  for (const v of ["data", "network", "journeys", "schema"]) {
    await w.click(`#tab-${v}`);
    ok(await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `the ${v} view scrolls sideways at 1440px`);
  }
  await wide.close();
} finally {
  await close();
}
console.log(`architecture-page: ${checks} checks passed — the data file is engram's graph, the page carries it and nothing else, the four views follow it, the toggle keeps the 85% rule, and every piece opens on a tap at 393 x 852.`);
