/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   CREATE GAME AND THE LOBBY, WITHOUT STEPS (ROB-320; docs/program/rob-320-invitations-contract.md §1, §2), in a browser against a stood-in server.

     1. Create game: a New user seat carries a name and an email, a CrankMagic user is picked by name (no address ever on the page); the
        owner alone is offered the group (Game Theory Insider with AI, or General), and what is chosen goes with the seat.
     2. The server's refusal (the cap, an unknown name) stays in the pop-up in words that say what to do; nothing opens.
     3. Guests whose invitation did not go are named once, with the way to send them again.
     4. The lobby asks the host for nothing: a guest's seat reads "invited, takes the seat on arrival" with no Invite, New link or
        Withdraw; Resend is there for the one that failed, and posts the retry.
     5. The email's link (#table?id=<id>&join=1) seats the person with no code, and the lobby opens.

   Visual: `UAT_SHOTS=<dir> node tests/create-game-invitations.mjs` writes the screens it checks. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "create-game-invitations", flag: "GEOMETRY_REQUIRED"});
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const shots = process.env.UAT_SHOTS;
const shot = async (page, name) => {if (shots) await page.screenshot({path: path.join(shots, `invites-${name}.png`)});};

const seat = (seatId, over) => ({seatId, kind: "human", name: `Seat ${seatId + 1}`, occupied: false, connected: false, ready: false, invited: false, you: false, mat: "felt", deck: null, ...over});
const lobby = (seats, over = {}) => ({schema: "CrankTable@1", tableId: "lounge01", phase: "selecting", revision: 3, youAreHost: true, yourSeat: 0, countdownAt: null, launchError: null, matchId: null,
  blockers: [{seatId: 0, reason: "Seat 1 has no deck"}], rules: {startingLife: 40, bracketLimit: null, houseRules: false}, privacy: "private", away: [], rematch: null, seats, ...over});
const guests = () => [seat(0, {name: "Rob", occupied: true, connected: true, you: true}), seat(1, {name: "Maya Cole", invited: true, held: true}), seat(2, {name: "Sam Ortiz", invited: true, held: true}),
  seat(3, {kind: "ai", name: "Sable", level: "normal", persona: "sable", occupied: true, connected: true, ready: true})];

async function person({email = "rob@example.com", owner = true, answer = {}, tableAnswer = () => lobby(guests())} = {}) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(() => {localStorage.setItem("crankmagic-audio-muted", "true");});
  const page = await context.newPage();
  if (stub) await stub(page);
  const calls = [], errors = [];
  page.on("pageerror", (x) => errors.push(x.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email, group: owner ? "owner" : "general", admin: owner}}));
  await page.route(`${base}/api/social/me`, (r) => r.fulfill({json: {name: owner ? "Rob" : "Jo", email, canInvite: true, isAdmin: owner, emailReady: true}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/ai-seat`, (r) => r.fulfill({json: {open: false, levels: ["easy", "normal"]}}));
  await page.route(`${base}/api/tables/live`, (r) => r.fulfill({json: {games: []}}));
  await page.route(`${base}/api/tables/mine`, (r) => r.fulfill({json: {tables: []}}));
  await page.route(`${base}/api/leaderboard`, (r) => r.fulfill({json: {rows: []}}));
  await page.route(/\/api\/users\/search/, (r) => r.fulfill({json: {users: [{name: "Sam Ortiz", handle: "sam-ortiz"}]}}));
  await page.route(`${base}/api/tables`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData());
    calls.push({method: "POST", path: "/api/tables", body});
    if (answer.refuse) return route.fulfill({status: answer.refuse.status, json: {error: answer.refuse.error}});
    await route.fulfill({status: 201, json: {table: lobby(guests()), invitations: answer.invitations || []}});
  });
  await page.route(`${base}/api/tables/lounge01`, (r) => r.fulfill({json: {table: tableAnswer(), now: Date.now()}}));
  await page.route(`${base}/api/tables/lounge01/**`, async (route) => {
    const request = route.request();
    calls.push({method: request.method(), path: new URL(request.url()).pathname, body: request.postData() ? JSON.parse(request.postData()) : null});
    if (new URL(request.url()).pathname.endsWith("/reinvite")) return route.fulfill({json: {invitation: {seatId: 1, name: "Maya Cole", status: "sent"}}});
    await route.fulfill({json: {table: tableAnswer()}});
  });
  await page.addInitScript((who) => localStorage.setItem("cm-table-setup", JSON.stringify({owner: who, hostName: "Rob"})), email);
  return {page, calls, errors, context};
}
const open = async (rob) => {
  await rob.page.goto(`${base}/index.html#game`);
  await rob.page.getByRole("button", {name: "Start a new game"}).waitFor({timeout: 30000});
  await rob.page.getByRole("button", {name: "Start a new game"}).click();
  await rob.page.locator(".cm-ng-dialog").waitFor();
  await rob.page.locator("[data-ng=humans][data-n='3']").click();
};
const fillGuests = async (page, {second = "new"} = {}) => {
  await page.locator("[data-ng-field=kind][data-row='0']").selectOption("new");
  await page.locator("[data-ng-field=name][data-row='0']").fill("Maya Cole");
  await page.locator("[data-ng-field=email][data-row='0']").fill("maya@example.com");
  await page.locator("[data-ng-field=query][data-row='1']").fill("sam");
  await page.locator(".cm-ng-list [role=option]").first().waitFor();
  await page.locator(".cm-ng-list [role=option]").first().click();
};

/* ---- 1. The owner: a group per new guest; the dropdown pick carries a name and no address ---- */
{
  const rob = await person();
  const {page} = rob;
  await open(rob);
  await fillGuests(page);
  eq(await page.locator("[data-ng-field=group][data-row='0'] option").allTextContents(), ["Game Theory Insider · AI", "General · no AI"], "the owner is offered Insider (AI) or General for a new guest");
  eq(await page.locator("[data-ng-field=group][data-row='0']").inputValue(), "insider", "Insider is the owner's default (Rob, 2026-10-29)");
  eq(await page.locator("[data-ng-field=group][data-row='1']").count(), 0, "and a CrankMagic user already has their group: nothing to choose");
  await shot(page, "create-owner");
  await page.locator("[data-ng-field=group][data-row='0']").selectOption("general");
  await page.locator("[data-ng=submit]").click();
  await page.waitForFunction(() => /#table\?id=lounge01/.test(location.hash), null, {timeout: 20000});
  const made = rob.calls.find((c) => c.path === "/api/tables").body;
  eq(made.seats.slice(0, 2), [{kind: "human", name: "Maya Cole", email: "maya@example.com", group: "general"}, {kind: "human", name: "Sam Ortiz", user: "Sam Ortiz"}], "Create game sends a typed guest's name, email and group, and a picked user by name alone");
  ok(!JSON.stringify(made).includes("sam@"), "no address of a CrankMagic user is on the page to send");
  ok(rob.calls.filter((c) => /\/invite$|request/.test(c.path)).length === 0, "and nothing else is asked of the organizer: no invite call, no request");
  eq(rob.errors, [], "no page errors");
  await rob.context.close();
}

/* ---- 1b. Anyone else: no group to choose ---- */
{
  const jo = await person({email: "jo@example.com", owner: false});
  await open(jo);
  await jo.page.locator("[data-ng-field=kind][data-row='0']").selectOption("new");
  eq(await jo.page.locator("[data-ng-field=group]").count(), 0, "a non-owner is not offered a group");
  await jo.page.locator("[data-ng-field=name][data-row='0']").fill("Maya Cole");
  await jo.page.locator("[data-ng-field=email][data-row='0']").fill("maya@example.com");
  await jo.page.locator("[data-ng-field=query][data-row='1']").fill("sam");
  await jo.page.locator(".cm-ng-list [role=option]").first().waitFor();
  await jo.page.locator(".cm-ng-list [role=option]").first().click();
  await jo.page.locator("[data-ng=submit]").click();
  await jo.page.waitForFunction(() => /#table\?id=lounge01/.test(location.hash), null, {timeout: 20000});
  eq("group" in jo.calls.find((c) => c.path === "/api/tables").body.seats[0], false, "and sends none (the server makes them General)");
  await jo.context.close();
}

/* ---- 2. A refusal stays in the pop-up ---- */
{
  const error = "You have already invited 5 people, the most one person can invite, so nothing was sent. Pick someone who already has a CrankMagic account (the dropdown), or ask the owner to invite this person or to raise the limit.";
  const rob = await person({answer: {refuse: {status: 409, error}}});
  await open(rob);
  await fillGuests(rob.page);
  await rob.page.locator("[data-ng=submit]").click();
  await rob.page.locator(".cm-ng-foot p.is-bad, .cm-ng-foot p").filter({hasText: "already invited 5 people"}).waitFor();
  eq([await rob.page.locator(".cm-ng-dialog").count(), /#table\?id=/.test(await rob.page.evaluate(() => location.hash))], [1, false], "the cap's refusal says what to do and the pop-up stays");
  await shot(rob.page, "create-refused");
  await rob.context.close();
}

/* ---- 3. A guest whose invitation did not go ---- */
{
  const rob = await person({answer: {invitations: [{seatId: 1, name: "Maya Cole", status: "sent"}, {seatId: 2, name: "Sam Ortiz", status: "failed", error: "Access did not admit this address."}]}});
  await open(rob);
  await fillGuests(rob.page);
  await rob.page.locator("[data-ng=submit]").click();
  await rob.page.waitForFunction(() => /#table\?id=lounge01/.test(location.hash), null, {timeout: 20000});
  const toast = rob.page.locator("#cm-notice, .cm-toast").filter({hasText: "Sam Ortiz's invitation did not go"});
  await toast.first().waitFor({timeout: 10000});
  ok(/Access did not admit this address/.test(await toast.first().textContent()) && /Resend/.test(await toast.first().textContent()) && !/Maya Cole's invitation did not go/.test(await toast.first().textContent()), "only the guest who failed is named, with the reason and where Resend is");
  await rob.context.close();
}

/* ---- 4. The lobby asks the host for nothing ---- */
{
  const rob = await person();
  await rob.page.goto(`${base}/index.html#table?id=lounge01`);
  await rob.page.locator(".cm-lobby-seat").first().waitFor({timeout: 30000});
  const text = await rob.page.locator(".cm-lobby-seat[data-seat='1']").innerText();
  ok(/Maya Cole is invited · takes the seat on arrival/.test(text), `a guest's seat reads that they are invited and take it on arrival (${text.replace(/\n/g, " | ")})`);
  const buttons = await rob.page.locator(".cm-lobby-seat[data-seat='1'] button[data-action]").evaluateAll((els) => els.map((el) => el.textContent.trim()));
  ok(!buttons.some((t) => /Invite a player|New link|Withdraw|Accept|Decline/.test(t)), `no Invite, New link, Withdraw or answer on it (${buttons})`);
  ok(buttons.includes("Resend"), "only Resend, for the one whose email failed");
  await shot(rob.page, "lobby-host");
  await rob.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-reinvite]").click();
  await rob.page.waitForFunction(() => /Invitation sent to Maya Cole/.test(document.body.textContent));
  eq(rob.calls.filter((c) => c.path.endsWith("/reinvite")).map((c) => c.body), [{seatId: 1}], "Resend posts the retry for that seat");
  await rob.context.close();
}

/* ---- 5. The email's link seats the guest, no code, no answer ---- */
{
  const sam = await person({email: "sam@example.com", owner: false, tableAnswer: () => lobby([seat(0, {name: "Rob", occupied: true, connected: true}), seat(1, {name: "Sam Ortiz", occupied: true, connected: true, you: true}), seat(2, {}), seat(3, {})], {youAreHost: false, yourSeat: 1})});
  await sam.page.goto(`${base}/index.html#table?id=lounge01&join=1`);
  await sam.page.locator(".cm-lobby-seat").first().waitFor({timeout: 30000});
  const joins = sam.calls.filter((c) => c.method === "POST" && c.path === "/api/tables/lounge01/join");
  eq(joins.map((c) => c.body), [{}], "the link posts join once, with no code");
  eq(await sam.page.evaluate(() => location.hash), "#table?id=lounge01", "and leaves the address clean (a reload does not join again)");
  ok(await sam.page.locator(".cm-lobby-seat[data-seat='1']").innerText().then((t) => /You/.test(t)), "the lobby opens with the guest in their seat");
  await shot(sam.page, "lobby-guest");
  eq(sam.errors, [], "no page errors");
  await sam.context.close();
}

await close();
console.log(`create-game-invitations: ${checks} checks passed`);
