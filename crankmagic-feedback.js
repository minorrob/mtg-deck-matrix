/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SEND FEEDBACK: THE CONTROL AND THE SHEET (the feedback loop, PR 2; docs/feedback-loop/PLAN-2026-10-26.html, section 1;
 * the contract is docs/feedback-loop/CrankFeedback.md).
 *
 * One glyph on every page's head and in the board's profile strip during a game, and the Menu's Send Feedback: each opens
 * one small sheet. The person types what happened and picks bug or idea (two glyphs); everything else is gathered here,
 * not typed -- where they were (the route, the screen, the board's view), the build (version.json), the game the board
 * holds (table, match, turn, step, seat, the decision, the last history line; never another seat's cards), the deck page
 * they were on and the card under the pointer, the device, and the last 20 console errors. A screenshot is optional: the
 * browser's own capture where it can, else a picture chosen, encoded to WebP under 1 MiB. feedback-schema.js bounds the
 * report (boundReport) before it goes, and the Worker reads it the same way (POST /api/feedback, cloud/feedback.mjs).
 *
 * Where there is no account cloud (a local copy), the Menu's Send Feedback is the mailto it always was. Signed out on a
 * copy that has one, the sheet says so and offers Sign in: nothing is sent that cannot be answered.
 */
(() => {
  /* THE CONSOLE RING: the last 20 errors this page threw, kept from the moment this script runs (before the app starts),
     so a report carries the stack of what just went wrong. Messages only: never a card, a hand or a person. */
  const RING = 20, errors = [];
  const keep = (text) => {const s = String(text || "").replace(/\s+/g, " ").trim().slice(0, 500); if (!s) return; errors.push(s); if (errors.length > RING) errors.shift();};
  addEventListener("error", (event) => {if (event && typeof event.message === "string" && event.message) keep(`${event.message}${event.filename ? ` @ ${String(event.filename).split("/").pop()}:${event.lineno || 0}` : ""}`);});
  addEventListener("unhandledrejection", (event) => {const r = event && event.reason; keep(`Unhandled: ${r && r.message ? r.message : String(r)}`);});

  /* THE CARD UNDER THE POINTER, when a page shows one: its name, read from the element that names it, for the deck context. */
  let hovered = null;
  document.addEventListener("pointerover", (event) => {
    const el = event.target && event.target.closest ? event.target.closest("[data-card-name], [data-card]") : null;
    if (!el) return;
    const name = el.dataset.cardName || (el.querySelector && el.querySelector("img[alt]") || {}).alt || "";
    if (name) hovered = name;
  }, true);

  (globalThis.CrankFeatures ||= []).push(function (C) {
    const S = globalThis.CrankFeedback;
    if (!S) return;
    const {esc: e, actions, notice, modal, button: b} = C;
    const accountsOn = () => document.querySelector('meta[name="crankmagic-accounts"]')?.content === "on";
    const SCREENS = {welcome: "Home", decks: "Decks", cards: "Library", discover: "Explore", game: "Play", table: "Play", lab: "Lab", settings: "Settings", pull: "Planned Changes", change: "Planned Changes", buy: "Buy"};
    const browserName = (ua) => /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";

    /* THE BUILD: version.json, which every release carries (tools/release-pages.mjs); a copy without one is unreleased. */
    let build = null;
    async function buildInfo() {
      if (build) return build;
      try {
        const r = await fetch("version.json", {cache: "no-store"});
        if (r.ok) {const v = await r.json(); if (v && typeof v.commit === "string") build = {commit: v.commit, profile: String(v.profile || "release")};}
      } catch {}
      return build || (build = {commit: "unreleased", profile: "local"});
    }

    /** The report as it would go now: what the person typed, and everything the sheet gathers, bounded. */
    function draft({kind = "bug", text = "", screenshot} = {}) {
      const r = C.route(), st = C.state || {};
      const game = C.board && C.board.held ? C.board.held() : null;
      const deckId = r.params.get("deck") || "", deck = deckId ? (st.decks || []).find((d) => d.id === deckId) : null;
      return S.boundReport({
        kind, text,
        page: {route: location.hash || `#${r.view}`, screen: SCREENS[r.view] || r.view, view: game ? game.view : undefined},
        build: build || {commit: "unreleased", profile: "local"},
        game: game ? {tableId: game.tableId, matchId: game.matchId, turn: game.turn, step: game.step, seat: game.seat, decisionId: game.decisionId, lastLine: game.lastLine} : undefined,
        deck: deckId || hovered ? {id: deckId || undefined, name: deck ? deck.name : undefined, card: hovered || undefined} : undefined,
        device: {viewport: {width: innerWidth, height: innerHeight}, pixelRatio: devicePixelRatio, pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine", browser: browserName(navigator.userAgent),
          reducedMotion: document.documentElement.dataset.motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches, theme: C.themeChoice ? C.themeChoice() : undefined},
        console: errors.slice(),
        screenshot,
      });
    }

    /* A PICTURE AS WEBP UNDER 1 MiB: drawn to a canvas, the quality lowered, then the size halved, until it fits. */
    async function toWebp(source) {
      const bitmap = await createImageBitmap(source);
      let w = bitmap.width, h = bitmap.height;
      for (let pass = 0; pass < 6; pass++) {
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const q of [0.82, 0.6, 0.4]) {
          const url = canvas.toDataURL("image/webp", q);
          if (url.startsWith("data:image/webp") && S.boundReport({screenshot: url}).screenshot) return url;
        }
        w /= 2; h /= 2;
      }
      return null;
    }
    /* THE BROWSER'S OWN CAPTURE, where it offers one (the person picks this tab); one frame, then the capture ends. */
    async function capture() {
      const media = navigator.mediaDevices;
      if (!media || !media.getDisplayMedia) return null;
      const stream = await media.getDisplayMedia({video: {displaySurface: "browser"}, audio: false, preferCurrentTab: true, selfBrowserSurface: "include"});
      try {
        const video = document.createElement("video"); video.srcObject = stream; video.muted = true;
        await video.play();
        await new Promise((done) => (video.readyState >= 2 ? done() : video.addEventListener("loadeddata", done, {once: true})));
        return await toWebp(video);
      } finally {for (const t of stream.getTracks()) t.stop();}
    }

    const mailto = () => {const a = document.createElement("a"); a.href = C.feedbackLink(); a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();};

    /* THE SHEET. */
    let screenshot = null;
    function context(d) {
      const bits = [`<span title="Where you are">⌖ ${e(d.page.route)}</span>`, `<span title="Build">⚙ ${e(d.build.commit.slice(0, 8))}</span>`];
      if (d.game) bits.push(`<span title="The game the board holds">🎲 T${e(String(d.game.turn ?? "?"))}${d.game.step ? ` · ${e(d.game.step)}` : ""}</span>`);
      if (d.deck && (d.deck.name || d.deck.card)) bits.push(`<span title="Deck and card">🃏 ${e(d.deck.name || "")}${d.deck.card ? ` · ${e(d.deck.card)}` : ""}</span>`);
      bits.push(`<span title="Screen">🖥 ${d.device.viewport.width}×${d.device.viewport.height}</span>`);
      if (d.console) bits.push(`<span title="Console errors kept">⚠ ${d.console.length}</span>`);
      return bits.join(" · ");
    }
    async function open() {
      if (!accountsOn()) return mailto();
      if (C.signedIn && !C.signedIn()) {
        modal("Send feedback", `<div class="cm-feedback cm-feedback-signed-out">${C.note("You are signed out. Sign in and your feedback reaches CrankMagic with what it needs to act on it; or email it instead.", true)}<div class="cm-form-footer">${b("Email instead", "feedback-mail")}${b("Sign in", "account-sign-in", {}, true)}</div></div>`);
        return;
      }
      await buildInfo();
      screenshot = null;
      const canCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
      const d = modal("Send feedback", `<form class="cm-form cm-feedback" novalidate>
        <div class="cm-feedback-kind" role="radiogroup" aria-label="What kind of feedback">
          <label class="cm-feedback-tile"><input type="radio" name="kind" value="bug" checked><span class="cm-feedback-glyph" aria-hidden="true">🐞</span><span>Bug</span></label>
          <label class="cm-feedback-tile"><input type="radio" name="kind" value="enhancement"><span class="cm-feedback-glyph" aria-hidden="true">✦</span><span>Idea</span></label>
        </div>
        <textarea name="text" required maxlength="${S.LIMITS.text}" rows="5" placeholder="What happened? What should happen?" aria-label="What happened"></textarea>
        <div class="cm-feedback-shot">
          ${canCapture ? `<button type="button" class="v-button compact" data-feedback="capture" aria-label="Capture the screen" title="Capture the screen">📷</button>` : ""}
          <label class="v-button compact cm-feedback-upload" title="Add a picture"><span aria-hidden="true">⤒</span><span class="cm-sr-only">Add a picture</span><input type="file" accept="image/*" data-feedback="upload" hidden></label>
          <span class="cm-feedback-preview" hidden><img alt="The screenshot that will be sent" width="64" height="40"><button type="button" class="v-button compact" data-feedback="drop" aria-label="Remove the picture" title="Remove the picture">✕</button></span>
        </div>
        <p class="cm-feedback-context cm-muted" aria-label="Sent with the report">${context(draft())}</p>
        <p class="cm-error" hidden role="alert"></p>
        <div class="cm-form-footer">${b("Cancel", "close")}<button class="v-button primary" type="submit" aria-label="Send feedback" title="Send feedback">Send ➤</button></div>
      </form>`);
      const f = d.querySelector("form"), error = f.querySelector(".cm-error"), preview = f.querySelector(".cm-feedback-preview");
      const say = (m) => {error.textContent = m; error.hidden = !m;};
      const show = () => {preview.hidden = !screenshot; if (screenshot) preview.querySelector("img").src = screenshot; f.querySelector(".cm-feedback-context").innerHTML = context(draft({screenshot}));};
      const took = async (source, what) => {try {const url = await toWebp(source); if (!url) throw Error("That picture could not be made small enough to send."); screenshot = url; say("");} catch (err) {if (err && err.name === "NotAllowedError") return; say(`${what} did not work: ${err.message}`);} show();};
      f.addEventListener("click", async (event) => {
        const which = event.target.closest("[data-feedback]")?.dataset.feedback;
        if (which === "drop") {screenshot = null; show();}
        if (which === "capture") {try {const url = await capture(); if (url) {screenshot = url; say("");} show();} catch (err) {if (err && err.name !== "NotAllowedError") say(`The capture did not work: ${err.message}`);}}
      });
      f.querySelector("[data-feedback=upload]").addEventListener("change", (event) => {const file = event.target.files && event.target.files[0]; if (file) took(file, "That picture"); event.target.value = "";});
      f.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = f.text.value.trim();
        if (!text) {say("Say what happened, in a few words at least."); f.text.focus(); return;}
        const report = draft({kind: f.kind.value, text, screenshot});
        const sending = f.querySelector("[type=submit]"); sending.disabled = true; say("");
        try {
          const response = await fetch("/api/feedback", {method: "POST", credentials: "same-origin", redirect: "manual", cache: "no-store", headers: {"content-type": "application/json", "x-crankmagic": "feedback"}, body: JSON.stringify(report)});
          if (response.type === "opaqueredirect" || response.status === 401) throw Error("You are signed out. Sign in, then send it again.");
          const value = await response.json().catch(() => ({}));
          if (!response.ok) throw Error(value.error || `CrankMagic answered ${response.status}. Nothing was saved; try again in a moment.`);
          d.close();
          notice(`Feedback sent. Thank you${report.screenshot && value.feedback && value.feedback.screenshot === "dropped" ? " (the picture is not kept yet)" : ""}.`);
        } catch (err) {say(err.message); sending.disabled = false;}
      });
      f.text.focus();
    }

    actions["send-feedback"] = () => {open();};
    actions["feedback-mail"] = () => {document.getElementById("cm-dialog")?.close(); mailto();};
    /** The sheet for other modules and the suites: what would be sent now, and the ring of errors kept. */
    C.feedback = {draft, open, errors: () => errors.slice()};
  });
})();
