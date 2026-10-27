/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   ADMIN (Rob, Oct 26, 2026; crankmagic-sharing.js, crankmagic-app.js `tabbed`, cloud/sharing.mjs, cloud/access-invites.mjs).

     1. The Menu (the chip with the signed-in address) has Admin for the administrator and for nobody else.
     2. Admin is a window like Play's Settings: its sections down the left -- General and Share -- using its whole width.
     3. General says what this copy is set up to do, and carries the 3D camera glance (kept on the device).
     4. Share: Invitee name and Invitee email, each a field under its label, Send and Cancel. Send adds the address to
        Cloudflare Access for staging and production, confirms each, and only then emails the invitation, as HTML.
        A refused Access sends nothing and says so. Cancel closes the window.

   Cloudflare's API and the mail provider are stood in for; the Worker's own code (cloud/sharing.mjs) answers the page.
   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/admin-window.mjs
*/
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
import {social} from "../cloud/sharing.mjs";
import {createLibrary} from "../cloud/library.mjs";

const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
for (const f of ["0001_accounts", "0002_ai", "0003_sharing", "0004_mail_retries", "0005_access_invites"]) db.exec(readFileSync(path.join(ROOT, "cloud/migrations", f + ".sql"), "utf8"));
const st = (sql, args = []) => ({bind: (...a) => st(sql, a), first: async () => db.prepare(sql).get(...args) || null, all: async () => ({results: db.prepare(sql).all(...args)}), run: async () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}}), sync: () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}})});
const D = {prepare: (s) => st(s), batch: async (a) => {db.exec("BEGIN"); try {const out = a.map((x) => x.sync()); db.exec("COMMIT"); return out;} catch (e) {db.exec("ROLLBACK"); throw e;}}};
const lib = createLibrary(D), rob = await lib.user("rob@example.com"), friend = await lib.user("friend@example.com");

/* Two Access applications, each with its reusable Invited policy, as staging and production have. */
const apps = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"], policies = ["bbbbbbbb-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002"];
const names = ["CrankMagic staging", "CrankMagic Accounts"], domains = ["staging.crankmagic.com", "crankmagic.com/api/*"];
const policy = policies.map((id) => ({id, reusable: true, app_count: 1, name: "Invited", decision: "allow", include: [{email: {email: "rob@example.com"}}]}));
const mail = [];
let refuse = null;
const fetchImpl = async (url, args) => {
  if (url === "https://api.resend.com/emails") {mail.push(JSON.parse(args.body)); return Response.json({id: "mail-" + mail.length});}
  const a = apps.findIndex((x) => url.endsWith("/apps/" + x));
  if (a >= 0) return Response.json({success: true, result: {name: names[a], domain: domains[a], policies: [{id: policies[a]}]}});
  const i = policies.findIndex((x) => url.endsWith("/policies/" + x));
  if (i < 0) throw Error("unexpected call " + url);
  if (args.method === "PUT") {if (refuse === i) return Response.json({success: false}, {status: 403}); policy[i] = {...policy[i], ...JSON.parse(args.body)};}
  return Response.json({success: true, result: policy[i]});
};
const env = {DB: D, INVITE_ADMIN_ID: String(rob.id), RESEND_API_KEY: "test-only", SHARING_ENABLED: "on", ACCESS_INVITE_TOKEN: "test-only",
  ACCESS_INVITE_APP_IDS: apps.join(","), ACCESS_INVITE_POLICY_ID: policies.join(","), CLOUDFLARE_ACCOUNT_ID: "0".repeat(32), INVITE_LINK_ORIGIN: "https://crankmagic.com", AI_EVERYONE: "on"};

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const {browser, base, stub, close} = await openBrowser({name: "admin-window", flag: "GEOMETRY_REQUIRED"});
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("<head>", '<head><meta name="crankmagic-accounts" content="on">');

async function signedIn(person, {width = 1400, height = 900, readAdmin = person.id === rob.id} = {}) {
  const context = await browser.newContext({viewport: {width, height}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], adminReads = [];
  await page.addInitScript(()=>(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__adminFixtureC=C;}));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/index.html*", (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route("**/api/me", (r) => r.fulfill({json: {email: person.email, head: null, admin: readAdmin}}));
  await page.route("**/api/admin**",r=>{const req=r.request(),p=new URL(req.url()).pathname;adminReads.push({path:p,method:req.method()});
    if(!readAdmin)return r.fulfill({status:403,json:{error:'Only the verified read administrator can open this page.'}});
    if(req.method()!=='GET')return r.fulfill({status:405,json:{error:'Administration is read-only.'}});
    return r.fulfill({json:{readOnly:true,invitationsEnabled:true,features:[{key:'AI_COACH',value:'on',defaultValue:'off',source:'Worker configuration'}]}});
  });
  await page.route("**/api/library", (r) => r.fulfill({status: 503, json: {error: "offline in this suite"}}));
  await page.route("**/version.json*", (r) => r.fulfill({json: {commit: "0123456789abcdef", profile: "cloud-staging"}}));
  await page.route("**/api/social/**", async (route) => {
    const r = route.request();
    try {
      const result = await social(new Request(r.url(), {method: r.method(), ...(r.postData() ? {body: r.postData(), headers: {"content-type": "application/json"}} : {})}), env, person, {fetchImpl});
      await route.fulfill({json: result});
    } catch (e) {await route.fulfill({status: e.status || 500, json: {error: e.message}});}
  });
  await page.goto(base + "/index.html#decks");
  await page.waitForFunction(() => globalThis.__adminFixtureC?.adminReady && globalThis.__adminFixtureC?.sharingReady, null, {timeout: 30000});
  await page.evaluate(async()=>{await Promise.all([__adminFixtureC.adminReady,__adminFixtureC.sharingReady]);});
  return {page, context, errors, adminReads};
}
const openMenu = async (page) => {await page.locator("#cm-user-functions").click(); await page.locator("#cm-user-menu:popover-open").waitFor();};
const shots = process.env.UAT_SHOTS;
const shot = async (page, name) => {if (shots) await page.screenshot({path: path.join(shots, `admin-${name}.png`)});};
const box = (page, sel) => page.locator(sel).first().evaluate((el) => {const b = el.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width};});

try {
  /* ---- 1. Nobody else sees Admin, and the Worker refuses them anyway ---- */
  {
    const {page, context, errors} = await signedIn(friend);
    await openMenu(page);
    eq(await page.locator("#cm-user-menu [data-action=open-admin]").count(), 0, "a player who is not the administrator has no Admin in the Menu");
    eq(await page.locator("#cm-user-menu").getByRole("button",{name:"Settings",exact:true}).count(), 1, "and keeps the shared menu’s single Settings door");
    eq(await page.evaluate(async () => (await fetch("/api/social/admin")).status), 403, "and the Worker refuses Admin to them");
    eq(errors, [], `no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* ---- 2 and 3. The administrator: Admin, a window with General and Share ---- */
  {
    const {page, context, errors} = await signedIn(rob);
    await openMenu(page);
    await shot(page, "menu-1400");
    const admin = page.locator("#cm-user-menu [data-action=open-admin]");
    eq(await admin.count(),1,"the combined read administrator and invite owner has exactly one Admin action");
    eq((await admin.textContent()).trim(), "Admin", "the administrator's Menu has Admin");
    await admin.click();
    const dialog = page.locator("#cm-dialog[open].cm-admin-dialog");
    await dialog.waitFor();
    eq((await dialog.locator("#cm-dialog-title").textContent()).trim(), "Admin", "it opens a window named Admin");
    eq(await dialog.locator(".cm-tabbed-nav [role=tab]").evaluateAll((els) => els.map((el) => el.textContent.trim())), ["⚙General", "✉Share"], "its sections down the left: General and Share");
    eq(await dialog.locator("[data-action=admin-open-section]").count(),5,"the owner retains all five read-only operational sections inside General");
    const nav = await box(page, "#cm-dialog .cm-tabbed-nav"), panels = await box(page, "#cm-dialog .cm-tabbed-panels"), win = await box(page, "#cm-dialog");
    ok(nav.r <= panels.l && panels.r >= win.r - 40, `the tabs stand at the left and the section uses the rest of the window (${JSON.stringify({nav, panels, win})})`);
    await dialog.locator("[data-admin-general] dl").waitFor();
    const general = await dialog.locator("[data-admin-general]").innerText();
    for (const [what, re] of [["the administrator", /rob@example\.com/], ["the build", /01234567 · cloud-staging/], ["email ready", /Invitation email\s+✓ Ready/],
      ["both sign-ins", /Cloudflare Access\s+✓ Ready · 2 sign-ins/], ["the link's site", /https:\/\/crankmagic\.com/], ["AI for everyone signed in", /Everyone signed in/]])
      ok(re.test(general), `General shows ${what}`);
    ok(!/test-only/.test(general), "and never a secret");
    await shot(page, "general-1400");
    const look = dialog.locator("[data-admin-look]");
    eq([await look.getAttribute("min"), await look.getAttribute("max"), await look.inputValue()], ["0", "100", "50"], "General carries the 3D camera glance, a slider from 0% to 100%, at the 50% default");
    await look.fill("30");
    eq(await page.evaluate(() => localStorage.getItem("cm-look-strength")), "0.3", "and keeps it on this device");

    /* ---- 4. Share ---- */
    await dialog.getByRole("tab", {name: "Share"}).click();
    const name = dialog.getByLabel("Invitee name"), email = dialog.getByLabel("Invitee email");
    ok(await name.isVisible() && await email.isVisible(), "Share has Invitee name and Invitee email");
    const [nl, ni] = [await box(page, "#cm-dialog .cm-admin-form label:nth-of-type(1)"), await box(page, "#cm-dialog [name=name]")];
    ok(ni.t > nl.t, "each field sits under its label");
    eq(await dialog.locator(".cm-admin-form .cm-form-footer button").evaluateAll((els) => els.map((el) => el.textContent.trim())), ["Cancel", "Send"], "with Cancel and Send");
    /* refused by production's Access: nothing is emailed, and the window says what holds */
    refuse = 1;
    await name.fill("Sam Player"); await email.fill("sam@example.com");
    await dialog.getByRole("button", {name: "Send", exact: true}).click();
    await dialog.locator("[data-admin-steps] [data-state=fail]").first().waitFor();
    const refused = await dialog.locator("[data-admin-steps]").innerText();
    ok(/Access did not admit this address/.test(refused) && /Already admitted: staging\.crankmagic\.com/.test(refused) && /No email was sent/.test(refused), `a refusal says so, names what was admitted, and sends nothing (${refused.replace(/\n/g, " | ")})`);
    eq(mail.length, 0, "no email went");
    await shot(page, "share-refused-1400");
    refuse = null;
    await dialog.getByRole("button", {name: "Send", exact: true}).click();
    await page.waitForFunction(() => document.querySelectorAll("#cm-dialog [data-admin-steps] [data-state=done]").length === 3, null, {timeout: 10000});
    const steps = await dialog.locator("[data-admin-steps] li").allInnerTexts();
    eq(steps.map((x) => x.trim()), ["staging.crankmagic.com · already had access · confirmed", "crankmagic.com/api/* · added · confirmed", "Invitation emailed to sam@example.com"],
      "sent again: each sign-in is confirmed, then the email goes");
    eq(policy.map((p) => p.include.some((r) => r.email?.email === "sam@example.com")), [true, true], "the address is on staging's and production's policies");
    eq(mail.length, 1, "one email");
    await shot(page, "share-sent-1400");
    ok(mail[0].html.includes("Hi Sam Player,") && mail[0].html.includes("https://crankmagic.com/api/auth/login?to=%23welcome") && mail[0].text.includes("Hi Sam Player,"), "an HTML invitation with its text twin and the sign-in link");
    eq([await name.inputValue(), await email.inputValue()], ["", ""], "the fields are cleared for the next invitation");
    /* Cancel closes the window */
    await dialog.getByRole("button", {name: "Cancel", exact: true}).click();
    await page.waitForFunction(() => !document.getElementById("cm-dialog").open);
    ok(true, "Cancel closes Admin");
    eq(errors, [], `no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* The two verified roles remain separate; neither role implies the other permission. */
  for(const role of [{name:'read administrator only',person:friend,readAdmin:true,share:false},{name:'invite owner without read-admin',person:rob,readAdmin:false,share:true}]){
    const {page,context,errors,adminReads}=await signedIn(role.person,{readAdmin:role.readAdmin});
    await openMenu(page);
    eq(await page.locator('#cm-user-menu [data-action=open-admin]').count(),1,role.name+': exactly one shared Admin entry');
    eq(await page.locator('#cm-user-menu [data-action=invite-crankmagic]').count(),0,'invitations live in Admin Share rather than a duplicate account-menu action');
    await page.locator('#cm-user-menu [data-action=open-admin]').click();
    const dialog=page.locator('#cm-dialog[open].cm-admin-dialog');await dialog.waitFor();
    eq(await dialog.locator('[role=tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),role.share?['general','share']:['general'],role.name+': only independently authorized sections are offered');
    eq(await dialog.locator('[data-action=admin-open-section]').count(),role.readAdmin?5:0,role.name+': read-only doors follow /api/me.admin');
    eq(await dialog.locator('[data-admin-share]').count(),role.share?1:0,role.name+': Share follows the existing social canInvite permission');
    if(role.readAdmin){
      eq(await page.evaluate(async()=> (await fetch('/api/social/admin')).status),403,'read-admin alone does not gain the invitation owner’s social Admin endpoint');
      await dialog.getByRole('button',{name:'Feature switches',exact:true}).click();
      await page.waitForFunction(()=>!document.getElementById('cm-dialog').open&&location.hash==='#admin?section=features');
      await page.locator('.cm-table tbody').getByRole('rowheader',{name:'AI_COACH',exact:true}).waitFor();
      ok(await page.locator('#cm-main').getByText('Read-only. Changes are made in the Worker configuration.',{exact:true}).isVisible(),'a native operational door closes the window and opens the existing guarded read-only view');
      ok(adminReads.some(r=>r.path==='/api/admin/features')&&adminReads.every(r=>r.method==='GET'),'operational navigation performs reads only');
    }else{
      eq(await page.evaluate(async()=> (await fetch('/api/admin/features')).status),403,'an invitation owner without read-admin does not acquire read-only operational access');
      await dialog.getByRole('tab',{name:'Share',exact:true}).click();
      ok(await dialog.getByLabel('Invitee email').isVisible(),'the independently authorized invitation form remains usable');
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    eq(errors,[],role.name+': no uncaught page errors');await context.close();
  }

  /* ---- On a phone: the tabs across the top, nothing sideways ---- */
  {
    const {page, context, errors} = await signedIn(rob, {width: 390, height: 760});
    await openMenu(page);
    await page.locator("#cm-user-menu [data-action=open-admin]").click();
    await page.locator("#cm-dialog[open].cm-admin-dialog").waitFor();
    await page.locator("#cm-dialog [role=tab][data-tab=share]").click();
    const tabs = await page.locator("#cm-dialog .cm-tabbed-nav [role=tab]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    const fit = await page.evaluate(() => {const d = document.getElementById("cm-dialog").getBoundingClientRect(); return d.right <= innerWidth && d.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;});
    await shot(page, "share-390");
    ok(Math.abs(tabs[0] - tabs[1]) < 2 && fit, `390 wide: the tabs run across the top and the window fits (${tabs})`);
    ok(await page.locator("#cm-dialog [name=email]").isVisible() && await page.getByRole("button", {name: "Send", exact: true}).isVisible(), "and Share's fields and Send are in view");
    eq(errors, [], `no page error (${errors.join(" | ")})`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`admin-window: ${checks} checks passed -- Admin is in the Menu for the administrator alone and refused to anyone else; a window with General and Share down its left; General shows the setup and keeps the 3D camera glance; Share admits to staging and production, confirms each, then emails an HTML invitation, and a refusal sends nothing; Cancel closes; on a phone the tabs run across the top.`);
