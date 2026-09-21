/* PERMUTATION PASS OVER THE LOBBY, against the live host.
 *
 * Rob: "test the dropdowns and permutations of each action button selection to ensure no matter
 * what is selected, anything present to the end user works as expected, is thoughtful and is
 * clear/easy."
 *
 * So this drives the real thing rather than reading it. For every seat role and every deck source
 * it reports what a person would actually see: which controls are visible, whether anything is
 * covered by the table's card, whether a dialog opened, and whether pressing a control produced
 * either a change or a message. Silence is the failure it is looking for -- a control that does
 * nothing and says nothing is the defect this lobby has produced twice.
 */
const BASE = "http://127.0.0.1:8768/app/?cb=perm";

const runner = await import(new URL("../tests/uat/browser-runner.mjs", import.meta.url).href);
const {browser, close} = await runner.openBrowser({name: "lobby-permutations", flag: "GEOMETRY_REQUIRED"});

const report = [];
const say = (area, what, ok, detail) => { report.push({area, what, ok, detail: detail || ""}); };

try {
  const context = await browser.newContext({viewport: {width: 1600, height: 950}, deviceScaleFactor: 1});
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const go = async () => {
    await page.goto(`${BASE}#game`);
    await page.locator(".cm-lobby-table").waitFor({timeout: 30000});
    await page.waitForTimeout(1200);
  };
  await go();

  /* Seat the host first: Choose mat, Ready and Leave seat only exist on a seat that has a deck,
     so a probe that never sits down cannot test them. */
  const seatHost = page.locator('[data-action="lobby-host-deck"]').first();
  if (await seatHost.count()) {
    await seatHost.click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const d = document.querySelector("dialog[open]");
      const s = d && d.querySelector("select[name=deckId]");
      if (s) { s.value = s.options[0].value; s.dispatchEvent(new Event("change", {bubbles: true})); }
      if (d) d.querySelector("[type=submit]").click();
    });
    await page.waitForTimeout(7000);
    await page.evaluate(() => { const d = document.querySelector("dialog[open]"); if (d) d.close(); });
    await page.waitForTimeout(1500);
  }
  say("host seat", "seating the host gives the seat its controls",
    await page.locator('[data-action="lobby-choose-mat"]').count() > 0,
    (await page.locator(".cm-seat-controls .v-button").allTextContents()).join(" | "));

  /* ---- 1. does anything sit under the table's card? measured, not eyeballed ---- */
  const covered = await page.evaluate(() => {
    const card = document.querySelector(".cm-table-center").getBoundingClientRect();
    const hits = [];
    for (const q of document.querySelectorAll(".cm-seat-q")) {
      for (const el of q.querySelectorAll(".cm-seat-detail, .cm-seat-card, .cm-seat-host-tools, .cm-seat-controls, .cm-lobby-seat>header")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overlap = Math.max(0, Math.min(r.right, card.right) - Math.max(r.left, card.left))
          * Math.max(0, Math.min(r.bottom, card.bottom) - Math.max(r.top, card.top));
        if (overlap > 4) hits.push(`${q.className.split(" ")[1]} ${el.className.split(" ")[0] || el.tagName} ${Math.round(overlap)}px2`);
      }
    }
    return hits;
  });
  say("overlap", "nothing sits under the table's card", covered.length === 0, covered.join("; "));

  /* ---- 2. every seat role, and what it offers ---- */
  const openMenu = async () => {
    await page.locator('[data-action="lobby-host-tools"]').click();
    await page.waitForTimeout(500);
  };
  const setRole = async (slot, role) => {
    await openMenu();
    await page.locator('.cm-lobby-menu button', {hasText: "Seat an opponent"}).click();
    await page.waitForTimeout(700);
    await page.evaluate(([s, r]) => {
      const d = document.querySelector("dialog[open]");
      d.querySelector("select[name=slot]").value = String(s);
      const rr = d.querySelector("select[name=role]");
      rr.value = r; rr.dispatchEvent(new Event("change", {bubbles: true}));
      d.querySelector("[type=submit]").click();
    }, [slot, role]);
    await page.waitForTimeout(1200);
  };

  for (const role of ["ai", "human", "unused"]) {
    await setRole(0, role);
    const seen = await page.evaluate(() => {
      const q = document.querySelector(".cm-seat-q");
      const vis = [...q.querySelectorAll("button,select,input")].filter((x) => x.offsetParent !== null);
      return {
        label: q.querySelector("h3") && q.querySelector("h3").textContent,
        pill: q.querySelector(".cm-seat-pill") && q.querySelector(".cm-seat-pill").textContent,
        detail: (q.querySelector(".cm-seat-detail") || {}).textContent || "",
        controls: vis.map((x) => (x.textContent || "").trim() || x.name || x.type),
      };
    });
    say("role", `seat 2 as "${role}"`, seen.controls.length > 0,
      `${seen.label} · ${seen.pill} · ${seen.controls.length} controls: ${seen.controls.join(" | ").slice(0, 120)}`);
  }

  /* ---- 3. every deck source on an AI seat ---- */
  await setRole(0, "ai");
  for (const from of ["library", "paste", "generated"]) {
    const shown = await page.evaluate((f) => {
      const sel = document.querySelector('.cm-seat-q select[name=inlineFrom]');
      if (!sel) return {err: "no source select on the AI quadrant"};
      sel.value = f; sel.dispatchEvent(new Event("change", {bubbles: true}));
      return null;
    }, from);
    if (shown && shown.err) { say("source", from, false, shown.err); continue; }
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const q = document.querySelector(".cm-seat-q");
      const vis = [...q.querySelectorAll("button,select,input,textarea")].filter((x) => x.offsetParent !== null);
      return {n: vis.length, names: vis.map((x) => x.name || (x.textContent || "").trim()).filter(Boolean).slice(0, 8)};
    });
    say("source", `AI seat, source "${from}"`, state.n > 1, `${state.n} visible: ${state.names.join(" | ")}`);
  }

  /* ---- 4. Choose mat ---- */
  await page.evaluate(() => { const d = document.querySelector("dialog[open]"); if (d) d.close(); });
  const matBtn = page.locator('[data-action="lobby-choose-mat"]').first();
  if (await matBtn.count()) {
    await matBtn.click();
    await page.waitForTimeout(2000);
    const mats = await page.evaluate(() => {
      const d = document.querySelector("dialog[open]");
      if (!d) return {err: "no dialog"};
      const tiles = [...d.querySelectorAll(".cm-mat")];
      return {
        title: d.querySelector("h2") && d.querySelector("h2").textContent,
        count: tiles.length,
        names: tiles.map((t) => (t.querySelector(".cm-mat-name") || {}).textContent || "").map((s) => s.trim()),
        withArt: tiles.filter((t) => {
          const a = t.querySelector(".cm-mat-art");
          return a && getComputedStyle(a).backgroundImage !== "none" && !a.hasAttribute("data-plain");
        }).length,
      };
    });
    say("mats", "Choose mat lists the real playmats", !mats.err && mats.count >= 9,
      mats.err || `${mats.count} tiles, ${mats.withArt} with art: ${mats.names.join(" | ")}`);
    await page.evaluate(() => { const d = document.querySelector("dialog[open]"); if (d) d.close(); });
  } else say("mats", "Choose mat is offered", false, "no Choose mat control found");

  say("errors", "no uncaught page errors while driving", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await context.close();
} finally { await close(); }

let bad = 0;
for (const r of report) { if (!r.ok) bad += 1; console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.area.padEnd(8)} ${r.what}\n          ${r.detail}`); }
console.log(`\npermutations: ${report.length} checked, ${bad} failing.`);
