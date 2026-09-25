/* YOUR LIBRARY IN THE CLOUD (Stage 2; docs/plan-account-cloud.md). Signing in is optional: signed out, the
 * workshop is exactly what it was, a library in this browser. Signed in, the library also saves itself to
 * the cloud a few seconds after each change and comes back on any device the person signs in on.
 *
 * INERT UNLESS ASKED FOR. Nothing here runs unless the page is marked
 * <meta name="crankmagic-accounts" content="on">, which only tools/release-pages.mjs writes, and only for a
 * profile that has a cloud behind it -- so main's own pages and the production release are untouched until
 * Rob says (merge as we go, behind the switch; Rob, 2026-09-24).
 *
 * What travels is the app's own backup -- checksummed, and verified on the way back exactly as Restore
 * verifies a file -- gzipped by the browser. Which way it travels is cloud-sync.js's decision; this file
 * carries it out, and when both sides changed it asks, and keeps the side not chosen in the cloud.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  if (document.querySelector('meta[name="crankmagic-accounts"]')?.content !== "on") return;
  const S = globalThis.CrankCloudSync, {esc: e, notice, actions, button} = C;
  if (!S) return;
  const META = "cloud-sync", device = S.deviceLabel(navigator.userAgent);
  let who = {checked: false, email: null}, running = false, again = false, timer = null, status = "";
  /* What the Menu chip says: when this device last matched the cloud, or what is in the way. */
  let syncedAt = null, trouble = "";

  /* The API. A person who is not signed in meets Access's redirect to its sign-in page, which a fetch must not
     follow; `manual` turns it into an opaque answer that reads as "signed out". */
  async function api(method, path, body) {
    const response = await fetch(path, {method, credentials: "same-origin", redirect: "manual", cache: "no-store",
      headers: body === undefined ? {} : {"content-type": "application/json", "x-crankmagic": "sync"},
      body: body === undefined ? undefined : JSON.stringify(body)});
    if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
      const error = Error("You are signed out of your cloud library."); error.signedOut = true; throw error;
    }
    const value = await response.json().catch(() => ({}));
    if (response.status === 409) {const error = Error(value.error || "The cloud library changed."); error.conflict = true; error.head = value.head; throw error;}
    if (!response.ok) throw Error(value.error || `The cloud library answered ${response.status}.`);
    return value;
  }

  async function packed() {
    const data = await C.repo.exportData(), copy = await C.E.backup(data);
    return {revision: data.state.revision, checksum: copy.checksum, device, body: S.toBase64(await S.gzip(JSON.stringify(copy)))};
  }
  async function unpacked(id) {
    const {version} = await api("GET", `/api/library/versions/${id}`);
    return {version, payload: await C.E.readBackup(await S.gunzip(S.fromBase64(version.body)))};
  }
  const remember = (headId, syncedRevision) => C.repo.writeMeta(META, {email: who.email, headId, syncedRevision, at: new Date().toISOString()});

  async function save(parent, {force = false} = {}) {
    const upload = await packed();
    const {head} = await api("PUT", "/api/library", {...upload, parent, force});
    await remember(head.id, upload.revision);
    status = `Saved to your cloud library ${S.ago(head.savedAt)}.`;
    syncedAt = new Date().toISOString(); trouble = "";
  }
  /* The stored library, never the page's copy of it: another tab may have changed it a moment ago, and a
     decision or a save made from a stale copy is exactly how a library gets overwritten. */
  const stored = () => C.repo.getState();
  async function bringIn(head, summary) {
    const {payload} = await unpacked(head.id);
    const replaced = await C.repo.replace(payload, (await stored()).revision, {id: `cloud:${head.id}`, type: "cloud", summary});
    await C.refresh();
    await remember(head.id, replaced.revision);
    status = `Up to date with your cloud library (saved on ${head.device}, ${S.ago(head.savedAt)}).`;
    syncedAt = new Date().toISOString(); trouble = "";
  }

  /* One pass: ask the cloud for its head, decide, act. A change made while a pass is running runs another. */
  async function sync(reason) {
    if (!who.email) return;
    if (running) {again = true; return;}
    running = true; draw();
    try {
      const {head} = await api("GET", "/api/library");
      const record = await C.repo.meta(META);
      const next = S.decide({head, sync: record, email: who.email, state: await stored()});
      if (next.action === "save") await save(next.parent);
      else if (next.action === "pull") {await bringIn(head, `Brought in your library from the cloud (saved on ${head.device})`); notice("Your library was brought up to date from the cloud.");}
      else if (next.action === "ask") await ask(head);
      else {status = head ? `Up to date with your cloud library (saved ${S.ago(head.savedAt)}).` : "Nothing saved to the cloud yet."; syncedAt = new Date().toISOString(); trouble = "";}
    } catch (error) {
      if (error.signedOut) {who = {checked: true, email: null}; status = "";}
      else if (error.conflict) {again = true;}
      else {status = `Not saved to the cloud: ${error.message}`; trouble = "Not saved to the cloud"; if (reason === "manual") notice(status, true, {action: {label: "Retry", run: () => sync("manual")}});}
    } finally {
      running = false; draw();
      if (again) {again = false; setTimeout(() => sync("again"), 500);}
    }
  }
  const soon = () => {clearTimeout(timer); timer = setTimeout(() => sync("change"), 3000);};

  /* BOTH SIDES CHANGED. The person chooses; the side not chosen is kept in the cloud for thirty days. */
  async function ask(head) {
    const cloud = await unpacked(head.id), mine = await stored(), here = C.M.counters(mine), there = C.M.counters(cloud.payload.state);
    /* Counts alone can match when each side added a different deck, so the decks only one side has are named. */
    const names = (state) => new Set(state.decks.filter((d) => !d.archived).map((d) => d.name));
    const mineNames = names(mine), cloudNames = names(cloud.payload.state);
    const only = (a, b) => [...a].filter((n) => !b.has(n)).slice(0, 5);
    const line = (label, state, counts, when, alone) => `<li><strong>${e(label)}</strong> — ${state.decks.length} deck${state.decks.length === 1 ? "" : "s"} · ${counts.owned} owned · ${counts.toBuy} to buy · changed ${e(when)}${alone.length ? `<br><span class="cm-muted">Only here: ${alone.map(e).join(", ")}</span>` : ""}</li>`;
    C.modal("Which library do you want to keep?",
      `<p>Your library changed on this device and on another since they last matched.</p><ul class="cm-account-choices">`
      + line(`This device (${device})`, mine, here, S.ago(mine.updatedAt), only(mineNames, cloudNames))
      + line(`The cloud (saved on ${head.device})`, cloud.payload.state, there, S.ago(head.savedAt), only(cloudNames, mineNames))
      + `</ul><p class="cm-muted">The one you do not keep stays in your cloud library for 30 days.</p>`
      + `<div class="cm-form-footer">${button("Use the cloud's", "account-keep-cloud", {head: head.id})}${button("Keep this device's", "account-keep-here", {head: head.id}, true)}</div>`);
    status = "Waiting for you to choose which library to keep."; trouble = "Choose which library to keep";
  }
  actions["account-keep-here"] = async (el) => {
    C.$("#cm-dialog").close();
    await save(el.dataset.head, {force: true});
    notice("Kept this device's library. The cloud's previous version is held for 30 days.");
    draw();
  };
  actions["account-keep-cloud"] = async (el) => {
    C.$("#cm-dialog").close();
    const {head} = await api("GET", "/api/library");
    await api("POST", "/api/library/kept", {...await packed(), parent: head.id});
    await bringIn(head, `Took the cloud's library (saved on ${head.device}); this device's is kept in the cloud for 30 days`);
    notice("Took the cloud's library. This device's version is held in the cloud for 30 days.");
    draw();
  };

  actions["account-sign-in"] = () => {location.href = `/api/auth/login?to=${encodeURIComponent(location.hash || "#decks")}`;};
  actions["account-sign-out"] = () => {location.href = "/cdn-cgi/access/logout";};
  actions["account-sync"] = () => sync("manual");

  /* THE MENU'S FIRST SECTION, AND THE CHIP THAT OPENS IT (r3, 06-global-menu). The chip at the rail's
     foot says who is signed in and whether the library has reached the cloud; the Account section
     says it in full, with Sync now; Sign out is the Menu's last entry, in red, away from everything
     a reader means to press. */
  function draw() {
    const menu = C.$("#cm-user-menu");
    if (!menu) return;
    let box = C.$("#cm-account");
    if (!box) {box = document.createElement("div"); box.id = "cm-account"; box.className = "cm-account"; menu.prepend(box);}
    box.innerHTML = who.email
      ? `<p>Account</p><p class="cm-account-who">Signed in as ${e(who.email)}</p>${status ? `<p class="cm-account-status">${e(status)}</p>` : ""}`
        + `<button type="button" data-action="account-sync">Sync now</button><hr>`
      : `<p>Account</p><button type="button" data-action="account-sign-in">Sign in to keep your library in the cloud</button><hr>`;
    let out = C.$("#cm-account-out");
    if (who.email && !out) {out = document.createElement("div"); out.id = "cm-account-out"; out.innerHTML = `<hr><button type="button" class="cm-danger" data-action="account-sign-out">Sign out</button>`; menu.append(out);}
    if (!who.email && out) out.remove();
    chip();
    settings();
    danger();
  }
  /* Settings › Account (r3, 70-settings) says the same in full, with Sign out beside it. */
  function settings() {
    const box = C.$("#cm-settings-account");
    if (!box) return;
    if (!who.checked) {box.innerHTML = `<p class="cm-muted">Checking whether you are signed in…</p>`; return;}
    box.innerHTML = who.email
      ? `<p class="cm-account-who">Signed in as ${e(who.email)}</p>${status ? `<p class="cm-account-status cm-muted">${e(status)}</p>` : ""}`
        + `<div class="cm-settings-row">${button("Sync now", "account-sync")}${button("Sign out", "account-sign-out")}</div>`
      : `<p>Signed out. Sign in and the library saves itself to the cloud and follows you to any device you sign in on.</p><div class="cm-settings-row">${button("Sign in", "account-sign-in", {}, true)}</div>`;
  }
  C.drawAccount = () => {settings(); danger();};

  /* DELETE ACCOUNT (R3.3b; r3, 74-confirm-delete). The person types the address they are signed in as, the
     Worker checks it again, and everything the cloud holds for them goes in one step. This device's library
     is theirs and stays; the sign-in is Access's, removed by Rob on request, which the dialog says. Syncing
     stops before the request, and the page signs out after it, so nothing uploads the library straight back. */
  function danger() {
    const box = C.$("#cm-settings-delete");
    if (box) box.innerHTML = who.email ? button("Delete account…", "account-delete", {}, false, {cls: "cm-danger"}) : "";
  }
  actions["account-delete"] = () => {
    const email = who.email;
    if (!email) throw Error("Sign in first: there is no cloud account on this device to delete.");
    C.form("Delete your account",
      `<div class="cm-full">${C.note(`This erases your cloud library — the current version and every earlier one, from every device — and your account record. It cannot be undone. This device's own library stays; Clear all data removes that. To have your sign-in removed too, e-mail admin@crankmagic.com.`, true)}</div>`
      + C.field("Type your address to confirm", "confirm", "", `required autocomplete="off" placeholder="${e(email)}"`),
      async (v) => {
        if (String(v.confirm || "").trim().toLowerCase() !== email) throw Error(`Type the address exactly: ${email}`);
        clearTimeout(timer);
        const {deleted} = await api("DELETE", "/api/account", {confirm: v.confirm});
        who = {checked: true, email: null}; status = ""; syncedAt = null; trouble = "";
        await C.repo.writeMeta(META, {email: null, headId: null, syncedRevision: null, at: new Date().toISOString()});
        draw();
        notice(`Deleted your account and ${deleted.versions} saved version${deleted.versions === 1 ? "" : "s"} from the cloud. Signing you out…`);
        setTimeout(() => {location.href = "/cdn-cgi/access/logout";}, 2500);
      }, "Delete account").classList.add("cm-destructive");
  };
  function chip() {
    const button = C.$("#cm-user-functions");
    if (!button) return;
    const name = button.querySelector(".cm-chip-name"), line = button.querySelector(".cm-chip-status"), avatar = button.querySelector(".cm-chip-avatar");
    if (!name || !line || !avatar) return;
    button.classList.toggle("is-signed-in", Boolean(who.email));
    button.classList.toggle("is-trouble", Boolean(who.email && trouble && !running));
    if (!who.email) {name.textContent = "Menu"; line.textContent = "Signed out · saved on this device"; avatar.textContent = "☰"; return;}
    name.textContent = who.email;
    avatar.textContent = who.email.charAt(0).toUpperCase();
    line.textContent = running ? "Syncing…" : trouble || (syncedAt ? `Synced · ${S.ago(syncedAt)}` : "Not synced yet");
  }

  (async () => {
    try {const me = await api("GET", "/api/me"); who = {checked: true, email: me.email};}
    catch {who = {checked: true, email: null};}
    draw();
    if (!who.email) return;
    setInterval(chip, 30000);
    C.repo.subscribe((message) => {if (message && message.revision && !running) soon();});
    document.addEventListener("visibilitychange", () => {if (document.visibilityState === "visible") sync("focus");});
    addEventListener("online", () => sync("online"));
    sync("open");
  })();
});
