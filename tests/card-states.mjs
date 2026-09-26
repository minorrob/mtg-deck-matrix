/* THE CARD-STATE TAXONOMY (docs/card-states.md; Rob, 2026-09-26). One definition, in the model: a stage
 * (Watching, To buy, Ordered, Owned), a deck and a role at any stage -- Target or Substitute in the box, Upgrade
 * or Reserved outside it -- and two facts (in the box, for trade). A deck is playable when nothing for it is
 * reserved. This suite pins:
 *
 *   1. every mapping in the definition's table, on records built for the purpose;
 *   2. the rules that make it one taxonomy -- a role exactly when there is a deck, in the box only when
 *      owned, a substitute always owned and in a box, a label from the vocabulary and nowhere else;
 *   3. Rob's library as committed, every record mapped, and the counts the proposal gave him;
 *   4. the old status beside the new state, record by record: they agree except where Rob decided
 *      otherwise, and each difference is named.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require = createRequire(import.meta.url), M = require("../collection-model.js");

let checks = 0;
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const pick = (st) => ({stage: st.stage, deckId: st.deckId, role: st.role, inBox: st.inBox, ...(st.reservedFor ? {reservedFor: st.reservedFor} : {}), ...(st.trade ? {trade: st.trade} : {})});
const lot = (x) => ({kind: "lot", source: "owned", location: {kind: "bench", box: ""}, allocation: null, offer: "none", purpose: "", ...x});

/* 1. The table. A synthetic library's seats: d1's box is full, d3's box is short but a substitute holds seat "s",
   d9 is a draft with nothing in its box, and d4 owns the group "group:live:D4". */
const ctx = {decks: new Map([["d1", {full: true, held: new Set()}], ["d2", {full: true, held: new Set()}], ["d3", {full: false, held: new Set(["s"])}], ["d9", {full: false, held: new Set()}]]), groups: new Map([["group:live:D4", "d4"]])};
const table = [
  ["Physical deck", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main", location: {kind: "deck", deckId: "d1"}}), {stage: "owned", deckId: "d1", role: "target", inBox: true}, "Target"],
  ["Reserved, its seat held (the box is full)", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main"}), {stage: "owned", deckId: "d1", role: "upgrade", inBox: false}, "To add"],
  ["Reserved, its seat empty", lot({allocation: {deckId: "d9", slotId: "s"}, purpose: "main"}), {stage: "owned", deckId: "d9", role: "reserved", inBox: false}, "To add"],
  ["Substitute", lot({location: {kind: "deck", deckId: "d2"}}), {stage: "owned", deckId: "d2", role: "substitute", inBox: true}, "Substitute"],
  ["Substitute, reserved elsewhere", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main", location: {kind: "deck", deckId: "d2"}}), {stage: "owned", deckId: "d2", role: "substitute", inBox: true, reservedFor: "d1"}, "Substitute"],
  ["Owned upgrade option", lot({allocation: {deckId: "d9", slotId: "u"}, purpose: "upgrade"}), {stage: "owned", deckId: "d9", role: "upgrade", inBox: false}, "To add"],
  ["Bench", lot({}), {stage: "owned", deckId: "", role: "", inBox: false}, "Bench"],
  ["Bench, shortlisted (was Watched)", lot({shortlistedFor: ["d3"]}), {stage: "owned", deckId: "", role: "", inBox: false}, "Bench"],
  ["Bench, for trade", lot({offer: "available"}), {stage: "owned", deckId: "", role: "", inBox: false, trade: "available"}, "Bench"],
  ["Ordered for a full deck", lot({source: "ordered", location: null, allocation: {deckId: "d1", slotId: "s"}, purpose: "main"}), {stage: "ordered", deckId: "d1", role: "upgrade", inBox: false}, "Ordered"],
  ["Ordered", lot({source: "ordered", location: null}), {stage: "ordered", deckId: "", role: "", inBox: false}, "Ordered"],
  ["Watched copy", lot({source: "watching", location: null}), {stage: "watching", deckId: "", role: "", inBox: false}, "Watching"],
  ["To buy, the box full: an upgrade", {kind: "need", deckId: "d1", slotId: "x", purpose: "main"}, {stage: "buy", deckId: "d1", role: "upgrade", inBox: false}, "To buy"],
  ["To buy, a substitute in its seat: an upgrade", {kind: "need", deckId: "d3", slotId: "s", purpose: "main"}, {stage: "buy", deckId: "d3", role: "upgrade", inBox: false}, "To buy"],
  ["To buy, its seat empty: reserved", {kind: "need", deckId: "d3", slotId: "y", purpose: "main"}, {stage: "buy", deckId: "d3", role: "reserved", inBox: false}, "To buy"],
  ["To buy (a committed upgrade option)", {kind: "need", deckId: "d9", slotId: "u", purpose: "upgrade"}, {stage: "buy", deckId: "d9", role: "upgrade", inBox: false}, "To buy"],
  ["Draft list", {kind: "draft", deckId: "d9", slotId: "s", purpose: "main"}, {stage: "watching", deckId: "d9", role: "reserved", inBox: false}, "Watching"],
  ["Suggestion (an option)", {kind: "option", deckId: "d1", purpose: "upgrade"}, {stage: "watching", deckId: "d1", role: "upgrade", inBox: false}, "Watching"],
  ["Bracket option", {kind: "option", deckId: "d1", purpose: "bracket"}, {stage: "watching", deckId: "d1", role: "upgrade", inBox: false}, "Watching"],
  ["Wanted (the To Buy list)", {kind: "entry", groupId: M.WANT_LIST}, {stage: "buy", deckId: "", role: "", inBox: false}, "To buy"],
  ["Planned (another group)", {kind: "entry", groupId: "group:live:upgrades"}, {stage: "watching", deckId: "", role: "", inBox: false}, "Watching"],
  ["Planned in a deck's own group", {kind: "entry", groupId: "group:live:D4"}, {stage: "watching", deckId: "d4", role: "upgrade", inBox: false}, "Watching"],
];
for (const [name, rec, want, label] of table) {
  const st = M.cardState(rec, ctx);
  eq(pick(st), want, `${name} maps to ${JSON.stringify(want)}`);
  eq(M.stateLabel(st), label, `${name} wears "${label}"`);
}
assert.throws(() => M.cardState({kind: "fold"}), /not fold/); checks++;
eq(M.STAGES.map((x) => x.label), ["Watching", "To buy", "Ordered", "Owned"], "the stages, in their order");
eq(M.ROLES.map((x) => x.label), ["Target", "Substitute", "Upgrade", "Reserved"], "the roles: two in the box, two outside it");

/* 2 and 3. Rob's library as committed. */
const live = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state;
/* The records a screen draws: copies and needs from the projection, the draft and option rows of each
   deck, and every group entry -- built as crankmagic-collection.js builds them. */
const records = [...M.projection(live)];
for (const d of live.decks.filter((x) => !x.archived)) for (const r of d.slots.filter((x) => d.status === "draft" || !x.committed)) records.push({kind: r.committed ? "draft" : "option", deckId: d.id, purpose: r.purpose, quantity: r.quantity, option: !!r.option});
for (const g of live.groups) for (const r of g.entries) records.push({...r, kind: "entry", groupId: g.id});
const labels = new Set(M.STATE_LABELS), read = M.stateReader(live);
let bad = [];
for (const r of records) {
  const st = read(r);
  const why = !M.STAGES.some((x) => x.id === st.stage) ? "stage" : !!st.role !== !!st.deckId ? "role iff deck" : st.inBox && st.stage !== "owned" ? "in box but not owned"
    : st.role === "substitute" && !(st.stage === "owned" && st.inBox) ? "substitute not owned in a box"
    : st.inBox && !["target", "substitute"].includes(st.role) ? "in the box, but not a target or substitute" : st.deckId && !st.inBox && !["upgrade", "reserved"].includes(st.role) ? "outside the box, but not an upgrade or reserved"
    : !labels.has(M.stateLabel(st)) ? "label" : "";
  if (why) bad.push([why, r.kind, r.recordId || r.id]);
}
eq(bad.slice(0, 5), [], `every one of Rob's ${records.length} records maps under the rules (a role exactly with a deck; in the box only owned, and then Target or Substitute; outside it Upgrade or Reserved; a label from the vocabulary)`);
const copies = (f) => records.filter((r) => f(read(r), r)).reduce((n, r) => n + (r.quantity || 1), 0);
const count = (f) => records.filter((r) => f(read(r), r)).length;
eq(copies((s) => s.stage === "owned" && s.role === "target" && s.inBox), 577, "577 owned targets in their deck's box");
eq(copies((s) => s.stage === "owned" && !!s.deckId && !s.inBox), 5, "5 owned copies for a deck, not yet in its box: To add (Ready to add)");
eq(copies((s) => s.stage === "owned" && s.role === "substitute"), 123, "123 substitutes");
eq(copies((s) => s.stage === "owned" && !s.deckId), 695, "695 on the Bench");
eq(copies((s) => s.stage === "ordered"), 6, "6 ordered");
eq(copies((s, r) => s.stage === "buy" && r.kind === "need"), 111, "111 copies to buy for decks");
eq(copies((s, r) => s.stage === "buy" && r.kind === "need" && s.role === "upgrade"), 111, "and all 111 are upgrades: every deck's box is full, so each replaces the substitute holding its seat");
eq(copies((s) => s.role === "reserved"), 0, "nothing is reserved: no deck has an empty seat");
eq(count((s, r) => s.stage === "buy" && r.kind === "entry"), 101, "the 101 on the To Buy list are To buy (Rob's decision 1)");
eq(count((s, r) => r.kind === "entry" && r.groupId === "group:live:upgrades" && s.stage === "watching" && !s.deckId), 111, "the 111 Upgrade Path entries are Watching, no deck, until the rebuild records their seats and removes them");
eq(count((s, r) => r.kind === "entry" && r.groupId !== M.WANT_LIST && r.groupId !== "group:live:upgrades" && s.stage === "watching" && !!s.deckId && s.role === "upgrade"), 13, "the 13 entries in D4's and D6's own groups are Watching upgrades for their decks");
eq(copies((s) => s.stage === "owned"), 1400, "and every owned copy is counted once: 577 + 5 + 123 + 695 = 1,400");
/* PLAYABLE (Rob, 2026-09-26): a deck plays when none of its records is reserved -- every seat holds a card. The
   model's own flag and the roles agree, deck by deck. */
for (const d of live.decks.filter((x) => !x.archived && x.status === "final")) eq(M.readiness(live, d).playable, !records.some((r) => { const st = read(r); return st.deckId === d.id && st.role === "reserved"; }), `${d.name}: playable exactly when nothing for it is reserved`);

/* 4. The old status beside the new state. */
/* A copy reserved for one deck and standing in inside another wore Reserved with a "Substitute in D2" badge;
   the state says the same thing the other way up: a substitute in D2, reserved for D7. */
const agrees = {"Physical deck": (s) => s.stage === "owned" && s.role === "target" && s.inBox, "Reserved": (s, r) => s.stage === "owned" && (!!s.deckId && !s.inBox || r.standIn && s.role === "substitute" && s.reservedFor === r.allocation?.deckId),
  "Substitute": (s) => s.role === "substitute", "Bench": (s) => s.stage === "owned" && !s.deckId, "Ordered": (s) => s.stage === "ordered", "Watched": (s) => s.stage === "watching",
  "To buy": (s) => s.stage === "buy" && !!s.deckId, "Draft list": (s) => s.stage === "watching" && !!s.deckId, "Suggestion": (s) => s.stage === "watching" && !!s.deckId, "Planned": (s) => s.stage === "watching" && (!s.deckId || s.role === "upgrade")};
const decided = {"Wanted": (s) => s.stage === "buy" && !s.deckId};
const differ = {};
for (const r of records) {
  const old = M.statusOf(r), st = read(r);
  if (agrees[old]?.(st, r)) continue;
  if (decided[old]?.(st)) { differ[old] = (differ[old] || 0) + 1; continue; }
  if (old === "Watched" && r.kind === "lot" && r.source === "owned" && st.stage === "owned" && !st.deckId) { differ["Watched (owned, shortlisted)"] = (differ["Watched (owned, shortlisted)"] || 0) + 1; continue; }
  assert.fail(`old status ${old} and new state ${JSON.stringify(pick(st))} disagree for ${r.recordId || r.id}`);
}
checks++;
eq(Object.keys(differ).sort(), ["Wanted"].concat(differ["Watched (owned, shortlisted)"] ? ["Watched (owned, shortlisted)"] : []).sort(), `old and new agree on every record except Rob's decisions: ${JSON.stringify(differ)}`);
/* 5. The workbook export's State column (step 2c): the same words, counted the same, on the Library sheet. */
{
  const E = require("../collection-exchange.js"), book = E.workbook(live), lib = book.sheets.find((x) => x.name === "Library");
  ok(lib.columns.some((c) => c.key === "state" && c.label === "State"), "the Library sheet has a State column");
  const q = (f) => lib.rows.filter(f).reduce((n, r) => n + r.quantity, 0);
  eq([q((r) => r.state === "Target"), q((r) => r.state === "To add · upgrade"), q((r) => r.state === "Substitute"), q((r) => r.state === "Bench"), q((r) => r.state === "Ordered")], [577, 5, 123, 695, 6], "and it counts 577 Target, 5 To add (upgrades), 123 Substitute, 695 Bench, 6 Ordered, as the Library does");
  ok(["Allocations", "Acquisition queue"].every((n) => book.sheets.find((x) => x.name === n).columns.some((c) => c.key === "state")), "Allocations and the Acquisition queue carry it too");
}
/* 6. The Table view's card-state piles take the drops their old labels took (step 2c). */
{
  const T = require("../crankmagic-tabletop.js"), pile = (label) => ({kind: "status", label});
  const benchCopy = {kind: "lot", source: "owned", location: {kind: "bench"}, allocation: null, quantity: 1};
  const reserved = {kind: "lot", source: "owned", location: {kind: "bench"}, allocation: {deckId: "d1", slotId: "s"}, quantity: 1};
  const watched = {kind: "lot", source: "watching", location: null, allocation: null, quantity: 1};
  const sent = {kind: "catalog", quantity: 1};
  eq(T.accepts(pile("Target"), [benchCopy]).action, "place", "a Bench copy dropped on Target goes into a deck's box, as on Physical deck");
  eq(T.accepts(pile("To add"), [benchCopy]).action, "reserve", "dropped on To add it is reserved for a deck, as on Reserved");
  eq(T.accepts(pile("Watching"), [benchCopy]).action, "source:watching", "dropped on Watching it becomes a watched card, as on Watched");
  eq(T.accepts(pile("To buy"), [reserved]).action, "release", "a reserved copy dropped on To buy is released, so its deck's need comes back");
  eq(T.accepts(pile("To buy"), [sent]).ok, false, "a card sent from Explore is refused, as on every status pile: it is not a copy you hold (file it in a group first)");
  eq(T.accepts(pile("To buy"), [watched]).action, "wanted:plan", "and so does a watched copy");
  eq(T.accepts(pile("To buy"), [benchCopy]).ok, false, "but an unreserved owned copy is refused: it is not to buy");
  eq(T.accepts(pile("Upgrade"), [benchCopy]).ok, false, "Upgrade is a role, not a pile: nothing is dropped on it");
}
console.log(`card-states: ${checks} checks passed — one taxonomy (stage, deck and role, in the box, for trade), every old status mapped, Rob's library counted.`);
