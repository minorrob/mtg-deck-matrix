/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CrankFeedback@1: WHAT A REPORT IS (the feedback loop, PR 1; docs/feedback-loop/PLAN-2026-10-26.html, section 1).
 *
 * One module for both ends of the wire. The feedback sheet in the browser builds a report and bounds it with
 * `boundReport`; the Worker reads what arrives with `readReport`, which refuses anything over the bounds by name
 * (cloud/feedback.mjs, POST /api/feedback). The states a report moves through, and what each move must carry, are here
 * too, so the triage agent, the release workflow and the owner's admin view all read one definition.
 *
 * Bounded by construction: the text is 2,000 characters, a screenshot 1 MiB of WebP, the console 20 lines. There is no
 * field for a card, a hand or a zone: a report carries where the person was and what they saw on their own screen's
 * record (the match, the turn, the decision), never another seat's cards. Who sent it is never read from the report:
 * the Worker takes the reporter from the Access token and nothing else.
 *
 * Loads as a classic script (it sets `globalThis.CrankFeedback`) and as a module (`import schema from
 * "../feedback-schema.js"` gives the same object): the Worker bundles it, the pages fetch it.
 */
(() => {
  const SCHEMA = "CrankFeedback@1";
  const LIMITS = Object.freeze({text: 2000, screenshotBytes: 1_048_576, consoleLines: 20, consoleLine: 500, route: 200, short: 40, label: 80, name: 150, line: 300});
  const KINDS = Object.freeze(["bug", "enhancement"]);
  const GROUPS = Object.freeze(["owner", "insider", "general"]);
  /* The states, in the one order a report moves through them: each step is the next and no other. */
  const STATES = Object.freeze(["new", "triaged", "approved", "in-progress", "released", "notified"]);
  /* What a move into each state must carry, so a row never says "triaged" without its issue, "released" without the
     commit that released it, or "notified" without the message that told the person. */
  const REQUIRES = Object.freeze({triaged: "issue", released: "release", notified: "messageId"});
  const COMMIT = /^[0-9a-f]{7,40}$/;
  /* A Linear issue key: the team's prefix and a number. */
  const ISSUE = /^[A-Z][A-Z0-9]{0,9}-[0-9]{1,8}$/;
  const SCREENSHOT = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/;

  class FeedbackInvalid extends Error {
    constructor(why) {super(why); this.name = "FeedbackInvalid";}
  }
  const refuse = (why) => {throw new FeedbackInvalid(why);};

  /* One line of text, normalized: no control characters, one space where there were several, trimmed. `multiline`
     keeps the person's line breaks (the report's own text). */
  const clean = (value, {multiline = false} = {}) => {
    let s = String(value).normalize("NFC").replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "");
    s = multiline ? s.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
    return s.trim();
  };
  /* A string field as the Worker reads it: refused over its limit, absent when empty and not required. */
  const text = (value, limit, what, {required = false, multiline = false} = {}) => {
    if (value === undefined || value === null || value === "") {if (required) refuse(`${what} is missing`); return undefined;}
    if (typeof value !== "string") refuse(`${what} is not text`);
    const s = clean(value, {multiline});
    if (!s) {if (required) refuse(`${what} is missing`); return undefined;}
    if (s.length > limit) refuse(`${what} is ${s.length.toLocaleString("en-US")} characters; ${limit.toLocaleString("en-US")} is the most`);
    return s;
  };
  const whole = (value, what, {min = 0, max = 1_000_000_000} = {}) => {
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || value < min || value > max) refuse(`${what} is not a whole number between ${min} and ${max}`);
    return value;
  };
  const object = (value, what) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "object" || Array.isArray(value)) refuse(`${what} is not an object`);
    return value;
  };
  const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  /* The bytes a base64 string decodes to. */
  const decodedBytes = (b64) => Math.floor(b64.length * 3 / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

  /**
   * Read a report as the Worker takes it: every field checked against the schema, unknown fields dropped, anything
   * over a bound refused by name. Never reads who sent it.
   * @throws {FeedbackInvalid}
   */
  function readReport(input) {
    const r = object(input, "the report") || refuse("the report is missing");
    if (r.schema !== undefined && r.schema !== SCHEMA) refuse(`the report is ${String(r.schema).slice(0, 40)}, not ${SCHEMA}`);
    if (!KINDS.includes(r.kind)) refuse(`the kind must be one of ${KINDS.join(", ")}`);
    const page = object(r.page, "the page") || refuse("the page is missing");
    const build = object(r.build, "the build") || refuse("the build is missing");
    const device = object(r.device, "the device") || refuse("the device is missing");
    const viewport = object(device.viewport, "the viewport") || refuse("the viewport is missing");
    const commit = text(build.commit, 40, "the build's commit", {required: true});
    if (!COMMIT.test(commit) && commit !== "unreleased") refuse("the build's commit is not a commit hash (or \"unreleased\")");
    const out = {
      schema: SCHEMA,
      kind: r.kind,
      text: text(r.text, LIMITS.text, "the report's text", {required: true, multiline: true}),
      page: drop({
        route: text(page.route, LIMITS.route, "the page's route", {required: true}),
        screen: text(page.screen, LIMITS.label, "the page's screen"),
        view: text(page.view, LIMITS.short, "the page's view"),
      }),
      build: drop({commit, profile: text(build.profile, LIMITS.short, "the build's profile", {required: true})}),
      device: drop({
        viewport: {width: whole(viewport.width, "the viewport's width", {min: 1, max: 20000}) ?? refuse("the viewport's width is missing"), height: whole(viewport.height, "the viewport's height", {min: 1, max: 20000}) ?? refuse("the viewport's height is missing")},
        pixelRatio: device.pixelRatio === undefined ? undefined : (typeof device.pixelRatio === "number" && device.pixelRatio >= 0.1 && device.pixelRatio <= 10 ? Math.round(device.pixelRatio * 100) / 100 : refuse("the pixel ratio is not a number between 0.1 and 10")),
        pointer: text(device.pointer, LIMITS.short, "the pointer"),
        browser: text(device.browser, LIMITS.label, "the browser"),
        reducedMotion: device.reducedMotion === undefined ? undefined : (typeof device.reducedMotion === "boolean" ? device.reducedMotion : refuse("reduced motion is not true or false")),
        theme: text(device.theme, LIMITS.short, "the theme"),
      }),
    };
    const game = object(r.game, "the game");
    if (game) {
      const g = drop({
        tableId: text(game.tableId, LIMITS.label, "the table id"),
        matchId: text(game.matchId, LIMITS.label, "the match id"),
        turn: whole(game.turn, "the turn", {max: 100000}),
        step: text(game.step, LIMITS.short, "the step"),
        seat: text(game.seat, LIMITS.short, "the seat"),
        decisionId: text(game.decisionId, LIMITS.label, "the decision id"),
        lastLine: text(game.lastLine, LIMITS.line, "the last history line"),
      });
      if (Object.keys(g).length) out.game = g;
    }
    const deck = object(r.deck, "the deck");
    if (deck) {
      const d = drop({id: text(deck.id, LIMITS.label, "the deck id"), name: text(deck.name, LIMITS.name, "the deck name"), card: text(deck.card, LIMITS.name, "the card under the pointer")});
      if (Object.keys(d).length) out.deck = d;
    }
    if (r.console !== undefined && r.console !== null) {
      if (!Array.isArray(r.console)) refuse("the console is not a list of lines");
      if (r.console.length > LIMITS.consoleLines) refuse(`the console has ${r.console.length} lines; ${LIMITS.consoleLines} is the most`);
      const lines = r.console.map((line, i) => text(line, LIMITS.consoleLine, `console line ${i + 1}`)).filter(Boolean);
      if (lines.length) out.console = lines;
    }
    if (r.screenshot !== undefined && r.screenshot !== null && r.screenshot !== "") {
      if (typeof r.screenshot !== "string") refuse("the screenshot is not text");
      const m = SCREENSHOT.exec(r.screenshot);
      if (!m) refuse("the screenshot is not a WebP data URL");
      const bytes = decodedBytes(m[1]);
      if (bytes > LIMITS.screenshotBytes) refuse(`the screenshot is ${bytes.toLocaleString("en-US")} bytes; ${LIMITS.screenshotBytes.toLocaleString("en-US")} is the most`);
      out.screenshot = r.screenshot;
    }
    return out;
  }

  /**
   * Bound a draft to the schema's limits, for the sheet before it sends: text and lines cut to their limits, the
   * console to its last lines (the latest errors are the ones that matter), a screenshot over its size dropped. What
   * comes back passes `readReport` when the required fields are there; it does not check them.
   */
  function boundReport(draft) {
    const d = draft && typeof draft === "object" ? draft : {};
    const cut = (v, n) => (typeof v === "string" ? clean(v).slice(0, n) : undefined);
    const out = {
      schema: SCHEMA,
      kind: KINDS.includes(d.kind) ? d.kind : "bug",
      text: typeof d.text === "string" ? clean(d.text, {multiline: true}).slice(0, LIMITS.text) : "",
      page: drop({route: cut(d.page?.route, LIMITS.route), screen: cut(d.page?.screen, LIMITS.label), view: cut(d.page?.view, LIMITS.short)}),
      build: drop({commit: COMMIT.test(String(d.build?.commit || "")) ? d.build.commit : "unreleased", profile: cut(d.build?.profile, LIMITS.short) || "unknown"}),
      device: drop({
        viewport: {width: Math.min(20000, Math.max(1, Math.round(Number(d.device?.viewport?.width) || 1))), height: Math.min(20000, Math.max(1, Math.round(Number(d.device?.viewport?.height) || 1)))},
        pixelRatio: typeof d.device?.pixelRatio === "number" ? Math.min(10, Math.max(0.1, Math.round(d.device.pixelRatio * 100) / 100)) : undefined,
        pointer: cut(d.device?.pointer, LIMITS.short), browser: cut(d.device?.browser, LIMITS.label),
        reducedMotion: typeof d.device?.reducedMotion === "boolean" ? d.device.reducedMotion : undefined, theme: cut(d.device?.theme, LIMITS.short),
      }),
    };
    if (d.game && typeof d.game === "object") out.game = drop({
      tableId: cut(d.game.tableId, LIMITS.label), matchId: cut(d.game.matchId, LIMITS.label),
      turn: Number.isInteger(d.game.turn) && d.game.turn >= 0 ? Math.min(d.game.turn, 100000) : undefined,
      step: cut(d.game.step, LIMITS.short), seat: cut(d.game.seat, LIMITS.short), decisionId: cut(d.game.decisionId, LIMITS.label), lastLine: cut(d.game.lastLine, LIMITS.line),
    });
    if (d.deck && typeof d.deck === "object") out.deck = drop({id: cut(d.deck.id, LIMITS.label), name: cut(d.deck.name, LIMITS.name), card: cut(d.deck.card, LIMITS.name)});
    if (Array.isArray(d.console)) {
      const lines = d.console.map((l) => cut(typeof l === "string" ? l : (l && l.message) || "", LIMITS.consoleLine)).filter(Boolean).slice(-LIMITS.consoleLines);
      if (lines.length) out.console = lines;
    }
    if (typeof d.screenshot === "string") {
      const m = SCREENSHOT.exec(d.screenshot);
      if (m && decodedBytes(m[1]) <= LIMITS.screenshotBytes) out.screenshot = d.screenshot;
    }
    for (const k of Object.keys(out)) if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && !Object.keys(out[k]).length) delete out[k];
    return out;
  }

  /** The state after `state`, or null at the end. */
  const nextState = (state) => {const i = STATES.indexOf(state); return i >= 0 && i + 1 < STATES.length ? STATES[i + 1] : null;};

  /**
   * Read what the agent or the release workflow sends to move a row: a state (the next one, checked by the store
   * against the row), and the facts a move carries. Unknown fields are dropped; a wrong one is refused by name.
   * @throws {FeedbackInvalid}
   */
  function readPatch(input) {
    const p = object(input, "the change") || refuse("the change is missing");
    const out = {};
    if (p.state !== undefined) {if (!STATES.includes(p.state)) refuse(`the state must be one of ${STATES.join(", ")}`); out.state = p.state;}
    if (p.issue !== undefined) {const s = text(p.issue, 20, "the issue", {required: true}); if (!ISSUE.test(s)) refuse("the issue is not a Linear key (TEAM-123)"); out.issue = s;}
    if (p.pr !== undefined) out.pr = whole(p.pr, "the PR number", {min: 1, max: 100_000_000}) ?? refuse("the PR number is missing");
    if (p.release !== undefined) {const s = text(p.release, 40, "the release", {required: true}); if (!COMMIT.test(s)) refuse("the release is not a commit hash"); out.release = s;}
    if (p.messageId !== undefined) out.messageId = text(p.messageId, 120, "the message id", {required: true});
    if (!Object.keys(out).length) refuse("the change changes nothing");
    if (out.state && REQUIRES[out.state] && out[REQUIRES[out.state]] === undefined) refuse(`a move to ${out.state} must carry ${({issue: "the issue", release: "the release commit", messageId: "the message id"})[REQUIRES[out.state]]}`);
    return out;
  }

  /** Whether a row in `from` may move to `to`: only the next state, never a skip, never back, never to itself. */
  const mayMove = (from, to) => nextState(from) === to;

  const CrankFeedback = Object.freeze({SCHEMA, LIMITS, KINDS, GROUPS, STATES, REQUIRES, FeedbackInvalid, readReport, boundReport, readPatch, nextState, mayMove});
  if (typeof module === "object" && module && module.exports) module.exports = CrankFeedback;
  globalThis.CrankFeedback = CrankFeedback;
})();
