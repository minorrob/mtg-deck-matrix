/* THE CARD-STATE TAXONOMY (docs/card-states.md; Rob, 2026-09-26). One definition, in the model: a stage
 * (Watching, To buy, Ordered, Owned), a deck and a role (Target, Substitute, Upgrade) at any stage, and
 * two facts (in the box, for trade). This suite pins:
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

/* 1. The table. */
const table = [
  ["Physical deck", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main", location: {kind: "deck", deckId: "d1"}}), {stage: "owned", deckId: "d1", role: "target", inBox: true}, "Target"],
  ["Reserved", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main"}), {stage: "owned", deckId: "d1", role: "target", inBox: false}, "Target"],
  ["Substitute", lot({location: {kind: "deck", deckId: "d2"}}), {stage: "owned", deckId: "d2", role: "substitute", inBox: true}, "Substitute"],
  ["Substitute, reserved elsewhere", lot({allocation: {deckId: "d1", slotId: "s"}, purpose: "main", location: {kind: "deck", deckId: "d2"}}), {stage: "owned", deckId: "d2", role: "substitute", inBox: true, reservedFor: "d1"}, "Substitute"],
  ["Owned upgrade", lot({allocation: {deckId: "d1", slotId: "u"}, purpose: "upgrade"}), {stage: "owned", deckId: "d1", role: "upgrade", inBox: false}, "Upgrade"],
  ["Bench", lot({}), {stage: "owned", deckId: "", role: "", inBox: false}, "Bench"],
  ["Bench, shortlisted (was Watched)", lot({shortlistedFor: ["d3"]}), {stage: "owned", deckId: "", role: "", inBox: false}, "Bench"],
  ["Bench, for trade", lot({offer: "available"}), {stage: "owned", deckId: "", role: "", inBox: false, trade: "available"}, "Bench"],
  ["Ordered for a deck", lot({source: "ordered", location: null, allocation: {deckId: "d1", slotId: "s"}, purpose: "main"}), {stage: "ordered", deckId: "d1", role: "target", inBox: false}, "Ordered"],
  ["Ordered", lot({source: "ordered", location: null}), {stage: "ordered", deckId: "", role: "", inBox: false}, "Ordered"],
  ["Watched copy", lot({source: "watching", location: null}), {stage: "watching", deckId: "", role: "", inBox: false}, "Watching"],
  ["To buy (a deck's need)", {kind: "need", deckId: "d1", purpose: "main"}, {stage: "buy", deckId: "d1", role: "target", inBox: false}, "To buy"],
  ["To buy (a committed upgrade)", {kind: "need", deckId: "d1", purpose: "upgrade"}, {stage: "buy", deckId: "d1", role: "upgrade", inBox: false}, "To buy"],
  ["Draft list", {kind: "draft", deckId: "d9", purpose: "main"}, {stage: "watching", deckId: "d9", role: "target", inBox: false}, "Watching"],
  ["Suggestion (an option)", {kind: "option", deckId: "d1", purpose: "upgrade"}, {stage: "watching", deckId: "d1", role: "upgrade", inBox: false}, "Watching"],
  ["Bracket option", {kind: "option", deckId: "d1", purpose: "bracket"}, {stage: "watching", deckId: "d1", role: "upgrade", inBox: false}, "Watching"],
  ["Wanted (the To Buy list)", {kind: "entry", groupId: M.WANT_LIST}, {stage: "buy", deckId: "", role: "", inBox: false}, "To buy"],
  ["Planned (another group)", {kind: "entry", groupId: "group:live:upgrades"}, {stage: "watching", deckId: "", role: "", inBox: false}, "Watching"],
];
for (const [name, rec, want, label] of table) {
  const st = M.cardState(rec);
  eq(pick(st), want, `${name} maps to ${JSON.stringify(want)}`);
  eq(M.stateLabel(st), label, `${name} wears "${label}"`);
}
assert.throws(() => M.cardState({kind: "fold"}), /not fold/); checks++;
eq(M.STAGES.map((x) => x.label), ["Watching", "To buy", "Ordered", "Owned"], "the stages, in their order");
eq(M.ROLES.map((x) => x.label), ["Target", "Substitute", "Upgrade"], "the roles");

/* 2 and 3. Rob's library as committed. */
const live = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state;
/* The records a screen draws: copies and needs from the projection, the draft and option rows of each
   deck, and every group entry -- built as crankmagic-collection.js builds them. */
const records = [...M.projection(live)];
for (const d of live.decks.filter((x) => !x.archived)) for (const r of d.slots.filter((x) => d.status === "draft" || !x.committed)) records.push({kind: r.committed ? "draft" : "option", deckId: d.id, purpose: r.purpose, quantity: r.quantity, option: !!r.option});
for (const g of live.groups) for (const r of g.entries) records.push({...r, kind: "entry", groupId: g.id});
const labels = new Set(["Bench", ...M.STAGES.filter((x) => !x.owned).map((x) => x.label), ...M.ROLES.map((x) => x.label)]);
let bad = [];
for (const r of records) {
  const st = M.cardState(r);
  const why = !M.STAGES.some((x) => x.id === st.stage) ? "stage" : !!st.role !== !!st.deckId ? "role iff deck" : st.inBox && st.stage !== "owned" ? "in box but not owned"
    : st.role === "substitute" && !(st.stage === "owned" && st.inBox) ? "substitute not owned in a box" : !labels.has(M.stateLabel(st)) ? "label" : "";
  if (why) bad.push([why, r.kind, r.recordId || r.id]);
}
eq(bad.slice(0, 5), [], `every one of Rob's ${records.length} records maps under the rules (a role exactly with a deck, in the box only owned, a substitute owned and boxed, a label from the vocabulary)`);
const copies = (f) => records.filter((r) => f(M.cardState(r), r)).reduce((n, r) => n + (r.quantity || 1), 0);
const count = (f) => records.filter((r) => f(M.cardState(r), r)).length;
eq(copies((s) => s.stage === "owned" && s.role === "target" && s.inBox), 577, "577 owned targets in their deck's box");
eq(copies((s) => s.stage === "owned" && s.role === "target" && !s.inBox), 5, "5 owned targets not yet in the box (Ready to add)");
eq(copies((s) => s.stage === "owned" && s.role === "substitute"), 123, "123 substitutes");
eq(copies((s) => s.stage === "owned" && !s.deckId), 695, "695 on the Bench");
eq(copies((s) => s.stage === "ordered"), 6, "6 ordered");
eq(copies((s, r) => s.stage === "buy" && r.kind === "need"), 111, "111 copies to buy for decks");
eq(count((s, r) => s.stage === "buy" && r.kind === "entry"), 101, "the 101 on the To Buy list are To buy (Rob's decision 1)");
eq(count((s, r) => r.kind === "entry" && r.groupId === "group:live:upgrades" && s.stage === "watching"), 111, "the 111 Upgrade Path entries are Watching until they move onto their decks (decision 3)");
eq(count((s, r) => r.kind === "entry" && r.groupId !== M.WANT_LIST && s.stage === "watching" && !s.deckId), 124, "every other group entry is Watching with no deck: 124 (111 Upgrade Path, 13 in deck groups)");
eq(copies((s) => s.stage === "owned"), 1400, "and every owned copy is counted once: 577 + 5 + 123 + 695 = 1,400");

/* 4. The old status beside the new state. */
/* A copy reserved for one deck and standing in inside another wore Reserved with a "Substitute in D2" badge;
   the state says the same thing the other way up: a substitute in D2, reserved for D7. */
const agrees = {"Physical deck": (s) => s.stage === "owned" && s.role === "target" && s.inBox, "Reserved": (s, r) => s.stage === "owned" && (s.role === "target" && !s.inBox || r.standIn && s.role === "substitute" && s.reservedFor === r.allocation?.deckId),
  "Substitute": (s) => s.role === "substitute", "Bench": (s) => s.stage === "owned" && !s.deckId, "Ordered": (s) => s.stage === "ordered", "Watched": (s) => s.stage === "watching",
  "To buy": (s) => s.stage === "buy" && !!s.deckId, "Draft list": (s) => s.stage === "watching" && s.role === "target", "Suggestion": (s) => s.stage === "watching" && !!s.deckId, "Planned": (s) => s.stage === "watching" && !s.deckId};
const decided = {"Wanted": (s) => s.stage === "buy" && !s.deckId};
const differ = {};
for (const r of records) {
  const old = M.statusOf(r), st = M.cardState(r);
  if (agrees[old]?.(st, r)) continue;
  if (decided[old]?.(st)) { differ[old] = (differ[old] || 0) + 1; continue; }
  if (old === "Watched" && r.kind === "lot" && r.source === "owned" && st.stage === "owned" && !st.deckId) { differ["Watched (owned, shortlisted)"] = (differ["Watched (owned, shortlisted)"] || 0) + 1; continue; }
  assert.fail(`old status ${old} and new state ${JSON.stringify(pick(st))} disagree for ${r.recordId || r.id}`);
}
checks++;
eq(Object.keys(differ).sort(), ["Wanted"].concat(differ["Watched (owned, shortlisted)"] ? ["Watched (owned, shortlisted)"] : []).sort(), `old and new agree on every record except Rob's decisions: ${JSON.stringify(differ)}`);
console.log(`card-states: ${checks} checks passed — one taxonomy (stage, deck and role, in the box, for trade), every old status mapped, Rob's library counted.`);
