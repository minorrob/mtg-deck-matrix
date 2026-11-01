/* THE LOUNGE'S SCREENS (Rob, 2026-10-28; the Claude Design screens Pre-lobby, New game pop-up, Lobby with walkthrough), driven in a real
 * Chromium against a stood-in server, so each control is proven to do what the design says and to ask the server what the contract
 * (docs/ui-lane/lounge-contract.md) says:
 *
 *   1. The Pre-lobby: Live games (a row's menu by who is looking, the seats panels, run time that moves), the sortable Leaderboard,
 *      Start a game (Resume greyed until there is something to resume, Join greyed until a lobby has a seat), the Join pop-up, and a door the
 *      server has not opened saying so.
 *   2. The New game pop-up: its counts keep two to four seats, Observe is the admin's, a Veteran and a Hard wait for the server, a person is
 *      found by name or invited by email, and Submit sends the seats, the rules and the privacy, then opens the lobby.
 *   3. The Lobby: each seat says what it is, the organizer's controls ask the table to remove a seat, add an AI, edit an AI and end the
 *      game, the rules edit in place, and the tour walks ten steps for the organizer and the steps a guest can take.
 * The look against the three designs is checked by eye, with screenshots (AGENTS.md, "Mandatory visual acceptance"). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "lounge-ui", flag: "GEOMETRY_REQUIRED"});
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const H = (name, commander, mechanic) => ({name, commander, mechanic, ai: false});
const A = (name, commander, mechanic) => ({name, commander, mechanic, ai: true});
const now = Date.now();
const game = (tableId, location, organizer, commander, privacy, ai, human, open, sec, roster) => ({tableId, location, organizer, commander, privacy, ai, human, open, startedAt: location === "live" ? now - sec * 1000 : null, roster, mechanic: (roster.find((p) => p.name === organizer) || {}).mechanic || "", mine: organizer === "Rob"});
const GAMES = [
  game("g1", "live", "Rob", "Chulane, Teller of Tales", "private", 2, 1, 0, 4360, [H("Rob", "Chulane, Teller of Tales", "Bant value"), A("Sable", "Giada, Font of Hope", "Tribal · Angels"), A("Benny", "Sai, Master Thopterist", "Artifacts")]),
  game("g2", "lobby", "Avery", "Krenko, Mob Boss", "public", 1, 2, 1, 0, [H("Avery", "Krenko, Mob Boss", "Tribal · Goblins"), H("Casey", "Teysa Karlov", "Aristocrats"), A("June", "Ezuri, Renegade Leader", "Tribal · Elves")]),
  game("g3", "live", "Jordan", "Atraxa, Praetors' Voice", "public", 0, 4, 0, 2885, [H("Jordan", "Atraxa, Praetors' Voice", "Proliferate"), H("Taylor", "Lathril", "Elves"), H("Riley", "Meren", "Recursion"), H("Drew", "Yuriko", "Ninjas")]),
];
const ROWS = [["Rob", 14, 6, 1, 3], ["Avery", 11, 9, 0, 2], ["Jordan", 9, 4, 2, 0], ["Casey", 3, 2, 0, 5]].map(([name, wins, losses, ties, unfinished]) => ({name, wins, losses, ties, unfinished, you: name === "Rob"}));
const seat = (seatId, over) => ({seatId, kind: "human", name: `Seat ${seatId + 1}`, occupied: false, connected: false, ready: false, invited: false, you: false, mat: "felt", deck: null, ...over});
const deck = (name, commander) => ({name, commander: [commander], bracket: 3});
const lobby = (over = {}) => ({schema: "CrankTable@1", tableId: "lounge01", phase: "selecting", revision: 3, youAreHost: true, yourSeat: 0, countdownAt: null, launchError: null, matchId: null,
  blockers: [{seatId: 0, reason: "Seat 1 has no deck"}], rules: {startingLife: 40, bracketLimit: null, houseRules: false}, privacy: "private", away: [], rematch: null,
  seats: [seat(0, {name: "Rob", occupied: true, connected: true, you: true}),
    seat(1, {kind: "ai", name: "Sable", level: "normal", persona: "sable", occupied: true, connected: true, ready: true, deck: deck("Calling All Angels", "Giada, Font of Hope")}),
    seat(2, {kind: "ai", name: "Benny", level: "easy", persona: "benny", occupied: true, connected: true, ready: true, deck: deck("Keen Engineering", "Sai, Master Thopterist")}),
    seat(3, {})], ...over});

async function person({email = "rob@example.com", admin = true, routes = async () => {}, width = 1440, height = 1120} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(() => {localStorage.setItem("crankmagic-audio-muted", "true");});
  const page = await context.newPage();
  if (stub) await stub(page);
  const calls = [], errors = [];
  page.on("pageerror", (x) => errors.push(x.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email, group: admin ? "owner" : "member", admin}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/ai-seat`, (r) => r.fulfill({json: {open: false, levels: ["easy", "normal"]}}));
  await page.route(`${base}/api/tables/live`, (r) => r.fulfill({json: {games: GAMES}}));
  await page.route(`${base}/api/leaderboard`, (r) => r.fulfill({json: {rows: ROWS}}));
  await routes(page, calls);
  return {page, context, calls, errors};
}
const record = (calls) => async (route) => {
  const request = route.request();
  calls.push({method: request.method(), path: new URL(request.url()).pathname, body: request.postData() ? JSON.parse(request.postData()) : null});
  await route.fallback();
};

/* ---- 1. THE PRE-LOBBY ---- */
{
  const rob = await person({routes: async (page, calls) => {
    await page.route(`${base}/api/tables/g2/join`, (r) => r.fulfill({json: {table: {tableId: "g2", yourSeat: 1}}}));
    await page.route(`${base}/api/tables/g3/watch`, (r) => r.fulfill({status: 404, json: {error: "no"}}));
    await page.route(`${base}/api/tables/**`, record(calls));   /* last, so it sees every call first and passes it on */
  }});
  const {page} = rob;
  await page.goto(`${base}/index.html#game`);
  await page.locator(".cm-pl-row").first().waitFor({timeout: 30000});
  eq(await page.locator(".cm-pl-row").count(), 3, "Live games lists every table the server sends");
  eq(await page.locator(".cm-pl-loc").allTextContents(), ["Live", "Lobby", "Live"], "each says Live or Lobby");
  const run = async () => (await page.locator(".cm-pl-run").first().textContent()).trim();
  const first = await run();
  await page.waitForFunction((t) => document.querySelector(".cm-pl-run").textContent.trim() !== t, first, {timeout: 5000});
  ok(/^\d+:\d\d:\d\d$/.test(await run()), `a live game's run time moves (${first} to ${await run()})`);
  ok(/Not started/.test(await page.locator(".cm-pl-run").nth(1).textContent()), "a lobby has not started");
  /* A row's menu is by who is looking: the admin has Game logs and Quit game on every row. */
  await page.getByRole("button", {name: "Actions for Avery's game"}).click();
  eq(await page.locator(".cm-pl-menu [role=menuitem]").evaluateAll((els) => els.map((el) => el.firstChild.textContent.trim())), ["Join", "Watch", "Game logs", "Quit game"], "the admin's menu on a lobby: join, watch, logs, quit");
  await page.getByRole("button", {name: "Actions for Jordan's game"}).click();
  eq((await page.locator(".cm-pl-menu [role=menuitem]").allTextContents()).length, 3, "on a live game there is no request to join: watch, logs, quit");
  await page.getByRole("menuitem", {name: /^Watch/}).click();
  await page.locator(".cm-pl-toast").waitFor();
  ok(/not open on this server yet/.test(await page.locator(".cm-pl-toast").textContent()), "a door the server has not opened says so");
  /* The seats panels. */
  await page.getByRole("button", {name: "2 AI seats in Rob's game. Show players."}).click();
  eq(await page.locator(".cm-pl-info tbody tr").count(), 2, "an AI count opens that game's AI seats");
  ok(await page.locator(".cm-pl-info sup.cm-ai").count() === 2, "each AI is marked");
  await page.getByRole("button", {name: "Close"}).click();
  eq(await page.locator(".cm-pl-info").count(), 0, "and Close puts the panel away");
  /* The leaderboard. */
  eq(await page.locator(".cm-pl-lb tbody tr td:first-child").allTextContents(), ["Rob", "Avery", "Jordan", "Casey"], "the leaderboard starts by wins, most first");
  await page.getByRole("button", {name: "Sort by User name"}).click();
  eq(await page.locator(".cm-pl-lb tbody tr td:first-child").allTextContents(), ["Avery", "Casey", "Jordan", "Rob"], "User name sorts A to Z");
  await page.getByRole("button", {name: "Sort by User name"}).click();
  eq((await page.locator(".cm-pl-lb tbody tr td:first-child").first().textContent()), "Rob", "again, Z to A");
  ok(await page.locator(".cm-pl-lb th[aria-sort=descending]").count() === 1, "the sorted column says so to a screen reader");
  await page.getByRole("button", {name: "Sort by Unfinished"}).click();
  eq(await page.locator(".cm-pl-lb tbody tr td:last-child").allTextContents(), ["5", "3", "2", "0"], "Unfinished sorts too, most first");
  /* Start a game. */
  ok(await page.getByRole("button", {name: "Resume game"}).isDisabled(), "Resume game is greyed while there is nothing to resume");
  ok(!(await page.getByRole("button", {name: "Join existing game"}).isDisabled()), "Join existing game is on while a lobby has an open seat");
  await page.getByRole("button", {name: "Join existing game"}).click();
  eq(await page.locator(".cm-pl-joinrow").count(), 1, "the Join pop-up lists the lobbies with a seat");
  await page.locator(".cm-pl-joinrow .cm-pl-btn").click();
  await page.waitForFunction(() => location.hash.startsWith("#table") && location.hash.includes("id=g2"));
  ok(rob.calls.some((c) => c.method === "POST" && c.path === "/api/tables/g2/join" && JSON.stringify(c.body) === "{}") && !rob.calls.some((c) => c.path.endsWith("/request-join")), "Join takes the seat at the table's door (ROB-320): no code, no request for the host to answer, and the lobby opens");
  await page.goto(`${base}/index.html#game`);
  await page.locator(".cm-pl-row").first().waitFor({timeout: 30000});
  await page.getByRole("button", {name: "Join existing game"}).click();
  await page.locator("#cm-play-invite").fill("https://evil.example/api/join/x/y");
  await page.getByRole("button", {name: "Open invitation"}).click();
  ok(/complete CrankMagic invitation/.test(await page.locator("#cm-play-join-error").textContent()), "a link that is not CrankMagic's is refused in the pop-up");
  await page.keyboard.press("Escape");
  eq(await page.locator(".cm-pl-scrim").count(), 0, "Escape puts the pop-up away");
  ok(await page.locator(".cm-pl-chathead .cm-pl-soon").textContent().then((t) => /Coming soon/.test(t)) && await page.locator(".cm-pl-chatrow input").isDisabled(), "the Pre-lobby chat says Coming soon, and its box is off");
  eq(rob.errors, [], "no page errors");
  await rob.context.close();
}
/* A person who is not the admin sees Watch and, on a lobby, a request to join, and no logs or quit on another's game. */
{
  const jo = await person({email: "jo@example.com", admin: false});
  await jo.page.goto(`${base}/index.html#game`);
  await jo.page.locator(".cm-pl-row").first().waitFor({timeout: 30000});
  await jo.page.getByRole("button", {name: "Actions for Avery's game"}).click();
  eq((await jo.page.locator(".cm-pl-menu [role=menuitem]").allTextContents()).length, 2, "a member sees Join and Watch on another's lobby");
  await jo.page.getByRole("button", {name: "Actions for Rob's game"}).click();
  eq((await jo.page.locator(".cm-pl-menu [role=menuitem]").allTextContents()).length, 3, "and on a game that is theirs, Game logs and Quit game too");
  await jo.context.close();
}

/* ---- 2. THE NEW GAME POP-UP ---- */
{
  const rob = await person({routes: async (page, calls) => {
    await page.route(`${base}/api/ai-seat`, (r) => r.fulfill({json: {open: true, levels: ["easy", "normal"]}}));
    await page.route(/\/api\/users\/search/, (r) => {
      const q = (new URL(r.request().url()).searchParams.get("q") || "").toLowerCase();
      r.fulfill({json: {users: ["Avery Chen", "Jordan Park", "Sam Ortiz"].filter((u) => !q || u.toLowerCase().includes(q)).map((u) => ({name: u, handle: `@${u.split(" ")[0].toLowerCase()}`}))}});
    });
    await page.route(`${base}/api/tables`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      calls.push({method: "POST", path: "/api/tables", body: JSON.parse(route.request().postData())});
      await route.fulfill({json: {table: lobby({tableId: "lounge01"})}});
    });
    await page.route(`${base}/api/tables/lounge01`, (r) => r.fulfill({json: {table: lobby(), now: Date.now()}}));
    await page.route(`${base}/api/tables/lounge01/**`, async (route) => {
      calls.push({method: route.request().method(), path: new URL(route.request().url()).pathname, body: route.request().postData() ? JSON.parse(route.request().postData()) : null});
      await route.fulfill({json: {table: lobby()}});
    });
    await page.addInitScript(() => localStorage.setItem("cm-table-setup", JSON.stringify({owner: "rob@example.com", hostName: "Rob"})));
  }});
  const {page} = rob;
  await page.goto(`${base}/index.html#game`);
  await page.locator(".cm-pl-row").first().waitFor({timeout: 30000});
  await page.getByRole("button", {name: "Start a new game"}).click();
  await page.locator(".cm-ng-dialog").waitFor();
  const counts = () => page.evaluate(() => ({humans: document.querySelector("[data-ng=humans][aria-checked=true]")?.dataset.n || null, ai: document.querySelector("[data-ng=ai][aria-checked=true]")?.dataset.n, off: [...document.querySelectorAll("[data-ng=ai]:disabled")].map((x) => x.dataset.n)}));
  eq(await counts(), {humans: "1", ai: "3", off: ["0", "4"]}, "it opens on you and three AIs; none and four AIs cannot be, with you alone");
  ok(await page.locator(".cm-ng-sum").textContent().then((t) => /You · 3 AI · 4 of 4 seats/.test(t)), "its heading counts the seats");
  await page.locator("[data-ng=humans][data-n='3']").click();
  eq(await counts(), {humans: "3", ai: "1", off: ["2", "3", "4"]}, "with three people, one AI at most fits");
  await page.locator("[data-ng=humans][data-n='1']").click();
  /* Observe is the admin's: AI seats play, you watch. */
  await page.locator("[data-ng=observe]").click();
  eq(await page.locator("[data-ng=humans]:disabled").count(), 4, "while observing, the human counts are off");
  ok(await page.locator(".cm-ng-row.is-host").count() === 0, "and there is no seat for you");
  ok(Number((await counts()).ai) >= 2 && (await counts()).off.includes("0") && (await counts()).off.includes("1"), "an observed game has at least two AIs");
  await page.locator("[data-ng=observe]").click();
  /* Hard and Veteran wait for the server; Veteran for the AI door. */
  await page.locator("[data-ng=toggle-diff][data-row='0']").click();
  ok(await page.locator("[data-ng=pick-diff][data-id=Hard]").isDisabled() && !(await page.locator("[data-ng=pick-diff][data-id=Veteran]").isDisabled()) && !(await page.locator("[data-ng=pick-diff][data-id=Easy]").isDisabled()), "Hard waits for the server's say, a Veteran is open to this person, Easy always");
  await page.locator("[data-ng=pick-diff][data-row='0'][data-id=Easy]").hover();
  await page.locator("[data-ng=pick-diff][data-row='0'][data-id=Veteran]").hover();
  ok(/AI model/.test(await page.locator(".cm-ng-peek").textContent()), "hovering a difficulty reads what it means");
  await page.locator("[data-ng=pick-diff][data-row='0'][data-id=Easy]").click();
  await page.locator("[data-ng=toggle-pers][data-row='1']").click();
  await page.locator("[data-ng=pick-pers][data-row='1'][data-id=june]").hover();
  ok(/casual|Salt −1/.test(await page.locator(".cm-ng-peek").textContent()), "hovering a personality reads its blurb and dials");
  await page.locator("[data-ng=pick-pers][data-row='1'][data-id=june]").click();
  eq(await page.locator("[data-ng-field=ainame][data-row='1']").inputValue(), "June", "an AI's name follows its personality until the person writes their own");
  /* A person by name or by email. */
  await page.locator("[data-ng=humans][data-n='2']").click();
  ok(await page.locator("[data-ng=submit]").isDisabled() && /needs a player/.test(await page.locator(".cm-ng-foot p").textContent()), "a person's seat without a person waits");
  await page.locator("[data-ng-field=query][data-row='0']").fill("av");
  await page.locator(".cm-ng-list [role=option]").first().waitFor();
  eq(await page.locator(".cm-ng-list [role=option] b").allTextContents(), ["Avery Chen"], "typing finds registered players by name");
  await page.locator(".cm-ng-list [role=option]").first().click();
  ok(!(await page.locator("[data-ng=submit]").isDisabled()), "a chosen player makes the seat whole");
  await page.locator("[data-ng-field=kind][data-row='0']").selectOption("new");
  ok(await page.locator("[data-ng=submit]").isDisabled() && /needs a name and email/.test(await page.locator(".cm-ng-foot p").textContent()), "a new user needs a name and an email");
  await page.locator("[data-ng-field=name][data-row='0']").fill("Maya");
  await page.locator("[data-ng-field=email][data-row='0']").fill("maya@example.com");
  ok(!(await page.locator("[data-ng=submit]").isDisabled()), "and has them");
  /* The rules and the privacy. */
  await page.locator("[data-ng-field=life]").fill("30");
  await page.locator("[data-ng-field=bracket]").selectOption("3");
  await page.locator("[data-ng=house]").click();
  await page.locator("[data-ng=privacy][data-id=Public]").click();
  eq(await page.locator("[data-ng=ai][aria-checked=true]").getAttribute("data-n"), "2", "two people and two AIs fill the four seats");
  await page.locator("[data-ng=submit]").click();
  await page.waitForFunction(() => /#table\?id=lounge01/.test(location.hash), null, {timeout: 20000});
  const made = rob.calls.find((c) => c.path === "/api/tables" && c.method === "POST");
  eq(made.body.hostName, "Rob", "Submit sends the organizer's name");
  eq(made.body.privacy, "public", "and the privacy");
  eq(made.body.seats.map((s) => [s.kind, s.name, s.level || null, s.persona || null]), [["human", "Maya", null, null], ["ai", "Sable", "easy", "sable"], ["ai", "June", "normal", "june"]], "the seats: a person by name and email, then each AI with its level and personality");
  eq(made.body.seats[0].email, "maya@example.com", "a new user's email goes with their seat");
  const rules = rob.calls.find((c) => c.path === "/api/tables/lounge01/rules");
  eq([rules.body.startingLife, rules.body.bracketLimit, rules.body.houseRules, rules.body.privacy], [30, 3, true, "public"], "then the table's rules: life, bracket limit, house rules and privacy");
  eq(await page.locator(".cm-ng-dialog").count(), 0, "the pop-up is gone and the lobby is open");
  eq(rob.errors, [], "no page errors");
  await rob.context.close();
}
/* Without the user directory the typed name stands; without the admin there is no Observe; Escape and Tab behave as a window's do. */
{
  const jo = await person({email: "jo@example.com", admin: false, routes: async (page) => {
    await page.route(/\/api\/users\/search/, (r) => r.fulfill({status: 404, json: {error: "no"}}));
    await page.addInitScript(() => localStorage.setItem("cm-table-setup", JSON.stringify({owner: "jo@example.com", hostName: "Jo"})));
  }});
  const {page} = jo;
  await page.goto(`${base}/index.html#game`);
  await page.locator(".cm-pl-row").first().waitFor({timeout: 30000});
  await page.getByRole("button", {name: "Start a new game"}).click();
  await page.locator(".cm-ng-dialog").waitFor();
  eq(await page.locator("[data-ng=observe]").count(), 0, "Observe AI game is the admin's alone");
  await page.locator("[data-ng=humans][data-n='2']").click();
  /* FITTED TO THE WINDOW (ROB-384; Rob, 2026-11-01: "reactive to the visible browser dimensions with appropriate padding"): at
     1400x900 its foot ran 27px off the screen. At each size the title and Submit are in the window with a margin, Submit is the
     thing at its own middle (hit-tested by hand: a Playwright click scrolls to what it presses, so it would pass a hidden one),
     and on a short window only the body scrolls; a menu opened on the last row is scrolled into the body's view. */
  const was = page.viewportSize();
  for (const [width, height] of [[1400, 900], [1280, 720], [1024, 640], [390, 844], [1280, 560]]) {
    await page.setViewportSize({width, height});
    await page.waitForTimeout(150);
    const fit = await page.evaluate(() => {
      const d = document.querySelector(".cm-ng-dialog").getBoundingClientRect(), body = document.querySelector(".cm-ng-body");
      const submit = document.querySelector("[data-ng=submit]"), s = submit.getBoundingClientRect();
      return {top: d.top, bottom: d.bottom, left: d.left, right: d.right, h: innerHeight, w: innerWidth, layerScrolls: document.querySelector(".cm-ng-scrim").scrollHeight > innerHeight + 1,
        bodyScrolls: body.scrollHeight > body.clientHeight + 1, submitHit: document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2)?.closest("[data-ng=submit]") === submit};
    });
    const at = `New game at ${width}x${height}`;
    if (process.env.SHOTS) await page.screenshot({path: path.join(process.env.SHOTS, `new-game-${width}x${height}.png`)});
    ok(fit.top >= 8 && fit.bottom <= fit.h - 8 && fit.left >= 8 && fit.right <= fit.w - 8, `${at}: the whole window is on the screen, with a margin (${JSON.stringify(fit)})`);
    ok(fit.submitHit, `${at}: Submit is there to press`);
    ok(!fit.layerScrolls, `${at}: nothing behind it has to be scrolled to reach it`);
    if (height <= 640) ok(fit.bodyScrolls, `${at}: the seats and rules scroll inside it`);
  }
  await page.setViewportSize({width: 1024, height: 640});
  await page.locator(".cm-ng-body").evaluate((el) => {el.scrollTop = 0;});
  await page.locator("[data-ng=toggle-pers]").last().click();
  const menu = await page.evaluate(() => {const m = document.querySelector(".cm-ng-pop").getBoundingClientRect(), b = document.querySelector(".cm-ng-body").getBoundingClientRect(); return {menuTop: m.top, menuBottom: m.bottom, top: b.top, bottom: b.bottom};});
  const whole = menu.menuBottom - menu.menuTop <= menu.bottom - menu.top;
  ok(menu.menuTop >= menu.top - 1 && (whole ? menu.menuBottom <= menu.bottom + 1 : menu.menuTop <= menu.top + 1), `a menu opened on the last row is scrolled into the body's view (${JSON.stringify(menu)})`);
  await page.keyboard.press("Escape");
  await page.setViewportSize(was);
  await page.locator("[data-ng-field=query][data-row='0']").fill("Sam");
  await page.waitForFunction(() => !document.querySelector("[data-ng=submit]").disabled);
  ok(true, "with no user directory on the server, the name typed is the seat's person");
  for (let i = 0; i < 60; i += 1) await page.keyboard.press("Tab");
  ok(await page.evaluate(() => document.querySelector(".cm-ng-dialog").contains(document.activeElement)), "Tab stays inside the window");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  eq(await page.locator(".cm-ng-dialog").count(), 0, "Escape closes it");
  await jo.context.close();
}

/* ---- 3. THE LOBBY ---- */
for (const guest of [false, true]) {
  const who = guest ? "a guest" : "the organizer";
  const table = guest
    ? lobby({youAreHost: false})
    : lobby();
  if (guest) {table.seats[0] = {...table.seats[0], you: false}; table.seats[3] = seat(3, {kind: "human", name: "Maya", occupied: true, connected: true, you: true}); table.yourSeat = 3;}
  const me = await person({routes: async (page, calls) => {
    await page.route(`${base}/api/tables/lounge01`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.route(`${base}/api/tables/lounge01/**`, async (route) => {
      calls.push({method: route.request().method(), path: new URL(route.request().url()).pathname, body: route.request().postData() ? JSON.parse(route.request().postData()) : null});
      await route.fulfill({json: {table}});
    });
  }});
  const {page, calls} = me;
  await page.goto(`${base}/index.html#table?id=lounge01`);
  await page.locator(".cm-lb-grid .cm-lobby-seat").first().waitFor({timeout: 30000});
  const titles = (await page.locator(".cm-lobby-seat h3").allTextContents()).map((t) => t.replace(/ai$/, ""));
  eq(titles, guest ? ["Seat 1 · Rob · Host", "Seat 2 · Sable", "Seat 3 · Benny", "Seat 4 · You"] : ["Seat 1 · You · Host", "Seat 2 · Sable", "Seat 3 · Benny", "Seat 4 · Open"], `${who}: each seat is headed by who sits there`);
  eq(await page.locator(".cm-lobby-seat[data-seat='1'] .cm-seat-tags span").allTextContents(), ["AI", "Normal", "The salty one"], `${who}: an AI seat says AI, its difficulty and its personality`);
  ok(/Plays the table like a grudge/.test(await page.locator(".cm-lobby-seat[data-seat='1'] .cm-seat-summary").textContent()), `${who}: and a line on what that personality is`);
  const rules = await page.locator(".cm-table-rules dt").allTextContents();
  eq(rules, ["Starting life", "Bracket limit", "Seats", "Privacy", "House rules"], `${who}: Table rules lists life, bracket, seats, privacy and House rules (no invitation or dropped-player rows)`);
  ok(/^(Yes|No)$/.test(await page.locator(".cm-table-rules div:last-child dd").textContent()), `${who}: House rules reads Yes or No`);
  ok(!/set by/i.test(await page.locator(".cm-table-head").textContent()), `${who}: the heading no longer says who set the rules`);
  if (!guest) {
    const head = await page.evaluate(() => {const h = document.querySelector(".cm-table-head").getBoundingClientRect(), b = document.querySelector(".cm-table-rules-edit").getBoundingClientRect(); return b.right >= h.right - 2;});
    ok(head, "Edit sits at the top right of Table rules");
  }
  ok(/^\d+ to Ready Up$/.test((await page.locator(".cm-table-launch").textContent()).trim()) || /ready|Start|Waiting/i.test(await page.locator(".cm-table-launch").textContent()), `${who}: the launch line counts "N to Ready Up", without "Launches when all are ready"`);
  ok(!/Launches when/.test(await page.locator(".cm-table-center").textContent()), `${who}: "Launches when all are ready" is gone`);
  eq(await page.locator("[data-action=table-edit-ai]").count(), 2, `${who}: every AI seat has Edit AI, for anyone seated`);
  eq(await page.locator("[data-action=table-seat-remove]").count(), guest ? 0 : 2, `${who}: Remove seat is the organizer's`);
  eq(await page.locator("[data-action=table-seat-add-ai]").count(), guest ? 0 : 1, `${who}: Add an AI is the organizer's, on an open seat`);
  ok(await page.locator(".cm-pl-btn", {hasText: "Lobby tour"}).count() === 1 && await page.locator("a.cm-lb-leave").getAttribute("href") === "#game", `${who}: Lobby tour and Leave lobby are in the head`);
  ok(/^Play$/.test(await page.locator("#matrix-v2 [data-nav=game][aria-current=page]").textContent().then((t) => t.trim())), `${who}: Play is the lit page in the rail`);
  if (!guest) {
    await page.locator("[data-action=table-seat-remove][data-seat='2']").click();
    await page.waitForFunction(() => true);
    ok(calls.some((c) => c.path === "/api/tables/lounge01/seat" && c.body.op === "remove" && c.body.seatId === 2), "Remove seat asks the table to clear that seat");
    await page.locator("[data-action=table-seat-add-ai][data-seat='3']").click();
    await page.waitForTimeout(400);
    const add = calls.find((c) => c.body && c.body.op === "add-ai");
    ok(add && add.body.seatId === 3 && add.body.level === "normal" && add.body.persona === "marcus", "Add an AI asks for the next unused personality at Normal");
    await page.locator("[data-seat='1'] [data-action=table-edit-ai]").click();
    eq(await page.locator(".cm-lb-edit").count(), 1, "Edit AI opens the seat's editor in place");
    const front = await page.evaluate(() => {const r = document.querySelector(".cm-lb-edit").getBoundingClientRect(), hit = document.elementFromPoint(r.left + 20, r.top + r.height / 2); return !!hit && !!hit.closest(".cm-lb-edit");});
    ok(front, "the editor is in front of the table's rules, not behind them");
    await page.locator(".cm-lb-edit [data-edit-ai=level]").selectOption("hard");
    await page.waitForTimeout(300);
    ok(calls.some((c) => c.body && c.body.op === "edit-ai" && c.body.seatId === 1 && c.body.level === "hard"), "changing a difficulty asks the table to edit that AI");
    await page.locator("[data-action=table-edit-ai-done]").click();
    eq(await page.locator(".cm-lb-edit").count(), 0, "Done closes the editor");
    /* The rules, in place. */
    await page.locator("[data-action=table-rules]").click();
    await page.locator("#cm-table-rules-form").waitFor();
    await page.fill("#cm-table-rules-form [name=startingLife]", "25");
    await page.selectOption("#cm-table-rules-form [name=privacy]", "public");
    await page.selectOption("#cm-table-rules-form [name=houseRules]", "1");
    await page.click("[data-action=table-rules-save]");
    await page.waitForTimeout(300);
    const saved = calls.find((c) => c.path === "/api/tables/lounge01/rules");
    eq([saved.body.startingLife, saved.body.privacy, saved.body.houseRules], [25, "public", true], "the rules edit in the middle panel and save life, privacy and house rules");
    /* End game asks once. */
    await page.locator("[data-action=table-end-ask]").click();
    ok(await page.locator(".cm-lb-confirm").textContent().then((t) => /End this game for everyone\?/.test(t)), "End game asks once");
    await page.locator("[data-action=table-end-keep]").click();
    ok(!calls.some((c) => c.path === "/api/tables/lounge01/end"), "Keep the game ends nothing");
    await page.locator("[data-action=table-end-ask]").click();
    await page.locator("[data-action=table-end]").click();
    await page.waitForFunction(() => /^#game/.test(location.hash));
    ok(calls.some((c) => c.path === "/api/tables/lounge01/end"), "End game asks the table to end, and Play is where it leaves you");
  }
  /* The tour. */
  await page.goto(`${base}/index.html#table?id=lounge01`);
  await page.locator(".cm-lb-grid .cm-lobby-seat").first().waitFor({timeout: 30000});
  await page.getByRole("button", {name: "Lobby tour"}).click();
  const steps = Number(/of (\d+)/.exec(await page.locator(".cm-tour-top p").textContent())[1]);
  eq(steps, guest ? 7 : 10, `${who}'s tour has ${guest ? "the steps a guest can take" : "ten steps"}`);
  eq(await page.locator("#cm-lobby-tour-title").textContent(), "Welcome to the lobby", `${who}: it opens on a welcome`);
  ok(await page.locator("[data-tour-act=back]").isDisabled(), `${who}: Back waits on the first step`);
  const names = [];
  for (let i = 1; i < steps; i += 1) {
    await page.locator("[data-tour-act=next]").click();
    names.push(await page.locator("#cm-lobby-tour-title").textContent());
    ok(await page.locator(".cm-tour-spot").count() === 1, `${who}: step ${i + 1} rings the control it names`);
  }
  eq(names, guest ? ["Choose your deck", "Choose your mat", "Ready up", "Assign the AI a deck", "Tune the AI", "The host starts"] : ["Choose your deck", "Choose your mat", "Ready up", "Assign the AI a deck", "Tune the AI", "Change the game rules", "Remove a seat", "Start the game", "End the game"], `${who}: the steps, in order`);
  ok(await page.locator("[data-tour-act=next]").textContent().then((t) => t.trim() === "Done"), `${who}: the last one says Done`);
  await page.locator("[data-tour-act=next]").click();
  eq(await page.locator(".cm-tour").count(), 0, `${who}: Done ends the tour`);
  await page.getByRole("button", {name: "Lobby tour"}).click();
  await page.keyboard.press("Escape");
  eq(await page.locator(".cm-tour").count(), 0, `${who}: Escape ends it too`);
  eq(me.errors, [], `${who}: no page errors`);
  await me.context.close();
}
await close();
console.log(`lounge-ui: ${checks} checks passed — the Pre-lobby, the New game pop-up and the Lobby with its tour, against a stood-in server.`);
