/* THE ROLE LENS on the committed live library (Phase D of the Discover / loop plan).
 * A deck and a role: the deck's cards in that role counted against the house minimum, the
 * candidates that could join them ranked by co-play, then ownership, then price, and the one
 * write -- Swap for... -- as an uncommitted option that leaves the hundred alone. The numbers
 * here are today's classifier's over today's live state; when either moves, the assertion
 * that moves says which. */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const R = require(path.join(ROOT, "crankmagic-rules.js"));
const Lens = require(path.join(ROOT, "crankmagic-lens.js"));
const M = require(path.join(ROOT, "collection-model.js"));
const Catalog = require(path.join(ROOT, "card-catalog.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8"));
const state = M.migrate(live.payload.state || live.payload);
const records = JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards;
const byName = new Map(records.map((c) => [Catalog.folded(c.name), c]));
const byOracle = new Map(records.map((c) => [c.oracleId, {...c, id: Catalog.key(c.name)}]));
/* The app reads a library card through the catalog: the record's facts under the reference's identity. */
const cardOf = (id) => { const ref = state.cards[id]; if (!ref) return null; const rec = byName.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id, roles: rec.roles || []} : ref; };
const deckNamed = (word) => state.decks.find((d) => d.name.includes(word));
const D6 = deckNamed("Krenko"), D5 = deckNamed("Shadrix"), D4 = deckNamed("Felothar");
const deps = {cardOf, coPlay: () => null, byOracle: (oid) => byOracle.get(oid) || null};

/* The vocabulary. */
eq(Lens.LENSES.map((l) => l.id), ["Removal", "Board wipe", "Protection", "Loop", "Tutor", "Ramp", "Draw"], "the seven lenses, in the plan's order");
eq(R.ROLE_MINIMUMS, {removal: 8, wipe: 2, ramp: 10, draw: 10}, "the house minimums live on the rules module");
eq(Lens.LENSES.map((l) => Lens.minimumOf(l)), [8, 2, null, null, null, 10, 10], "a lens reads its minimum from there, or has none");
ok(Lens.lensOf("removal") && Lens.lensOf("removal").id === "Removal", "a lens is found case-insensitively (the route carries it)");
eq(Lens.lens(state, D6, "Nope", deps), null, "an unknown lens is null, not a throw");

/* The deck's own cards in the role, against the minimum. */
const rem6 = Lens.lens(state, D6, "Removal", deps);
ok(rem6.have.every((h) => h.roles.includes("removal")), "every card listed carries the role");
ok(rem6.have.some((h) => h.name === "Chaos Warp" || h.name === "Abrade" || h.name === "Tweeze"), `D6's removal is the deck's own (${rem6.have.map((h) => h.name).join(", ")})`);
eq([rem6.count, rem6.min, rem6.under], [rem6.have.reduce((n, h) => n + h.quantity, 0), 8, rem6.count < 8], "the count is the copies, against the house 8");
const rem5 = Lens.lens(state, D5, "Removal", deps);
ok(rem5.count < 8 && rem5.under === true, `D5 is under the removal minimum (${rem5.count} / 8)`);
const wipe5 = Lens.lens(state, D5, "Board wipe", deps);
ok(wipe5.under === true && wipe5.min === 2, `D5 has no board wipe (${wipe5.count} / 2)`);
const ramp4 = Lens.lens(state, D4, "Ramp", deps);
ok(ramp4.count >= 10 && ramp4.under === false, `D4's ramp clears the minimum (${ramp4.count} / 10)`);
const loop6 = Lens.lens(state, D6, "Loop", deps);
ok(loop6.min === null && loop6.under === false && loop6.have.some((h) => h.name === "Thornbite Staff"), "Loop has no minimum and Thornbite Staff is one of D6's loop pieces");
ok(loop6.have.every((h) => h.roles.every((r) => ["untap", "copy", "blink", "sac-outlet"].includes(r))), "a lens row's roles are only the lens's own");

/* Candidates: never a card already in the hundred, always in the role, inside the colours. */
const main6 = new Set(D6.slots.filter((r) => r.purpose === "main").map((r) => r.cardId));
ok(rem6.candidates.length > 0, `D6 removal has candidates (${rem6.candidates.length})`);
ok(rem6.candidates.every((c) => !main6.has(c.cardId)), "no candidate is already in the hundred");
ok(rem6.candidates.every((c) => c.roles.includes("removal")), "every candidate carries the role");
const krenko = cardOf(D6.commanders[0]);
ok(rem6.candidates.every((c) => (cardOf(c.cardId).colorIdentity || []).every((x) => krenko.colorIdentity.includes(x))), "every candidate is inside the commander's colour identity");
ok(rem6.candidates.every((c) => ["bench", "ordered", "buy", "upgrade", "played"].every((s) => c.sources.includes(s) || true) && c.sources.length >= 1), "every candidate names where it comes from");
ok(rem6.candidates.some((c) => c.sources.includes("bench")) , "the bench supplies some");
/* Ranking: co-play first (none here), then owned before ordered before not owned, then price. */
const order = {owned: 0, ordered: 1, none: 2};
ok(rem6.candidates.every((c, i, a) => i === 0 || order[a[i - 1].owned] <= order[c.owned]), "owned copies rank before ordered before not owned");
const sameOwn = rem6.candidates.filter((c) => c.owned === rem6.candidates[0].owned);
ok(sameOwn.every((c, i, a) => i === 0 || (a[i - 1].price === null ? Infinity : a[i - 1].price) <= (c.price === null ? Infinity : c.price)), "within one ownership band the cheaper card ranks first");
/* Co-play, when the pairs are there, outranks ownership. */
const first = rem6.candidates[0], last = rem6.candidates[rem6.candidates.length - 1];
const coDeps = {...deps, coPlay: () => new Map([[cardOf(last.cardId).oracleId, {inclusion: 0.4, synergy: 0.1, decks: 1000}]])};
const withCo = Lens.lens(state, D6, "Removal", coDeps);
eq(withCo.candidates[0].cardId, last.cardId, "a card the commander's real decks run ranks first, whatever the ownership");
eq(withCo.candidates[0].coPlay, {inclusion: 0.4, synergy: 0.1, decks: 1000}, "and carries the co-play figures");
ok(first.cardId !== last.cardId && withCo.candidates.some((c) => c.cardId === first.cardId), "the rest keep their order beneath it");
/* A neighbour the co-play row names that is not in the library arrives through byOracle. */
const outsider = records.find((c) => (c.roles || []).includes("removal") && (c.colorIdentity || []).every((x) => x === "R") && !Object.values(state.cards).some((s) => s.name === c.name));
if (outsider) {
  const far = Lens.lens(state, D6, "Removal", {...deps, coPlay: () => new Map([[outsider.oracleId, {inclusion: 0.2, synergy: 0, decks: 10}]])});
  const row = far.candidates.find((c) => c.name === outsider.name);
  ok(row && row.sources.includes("played") && row.owned === "none", `${outsider.name}: a co-play neighbour outside the library is a candidate, not owned`);
}
/* Determinism. */
eq(JSON.stringify(Lens.lens(state, D6, "Removal", deps)), JSON.stringify(rem6), "the same inputs give the same rows");

/* THE ONE WRITE: an uncommitted option on the replaced slot; the hundred untouched. */
const cand = rem6.candidates[0];
const slot = rem6.have[0];
const cmd = Lens.swapCommand(D6, slot.slotId, cardOf(cand.cardId), "Removal");
eq([cmd.type, cmd.deckId, cmd.replaces, cmd.reserve, cmd.option.purpose, cmd.option.cardId, cmd.option.quantity], ["option", D6.id, slot.slotId, false, "upgrade", cand.cardId, slot.quantity], "the swap is the option command, uncommitted");
ok(/Role lens · Removal/.test(cmd.option.optionWhy), "and says where it came from");
M.setRecordSource((id) => { const ref = state.cards[id]; const rec = ref && byName.get(Catalog.folded(ref.name)); return rec ? {...rec, id} : null; });
const before = M.deck(state, D6.id).slots.filter((r) => r.purpose === "main").length;
const after = M.apply(state, {id: "lens-swap-1", confirmed: true, ...cmd});
const d6After = M.deck(after.state, D6.id);
eq(d6After.slots.filter((r) => r.purpose === "main").length, before, "the main hundred is unchanged");
const added = d6After.slots.find((r) => r.purpose === "upgrade" && r.cardId === cand.cardId && r.replaces === slot.slotId);
ok(added && added.committed === false, "the candidate is linked to the slot as an uncommitted upgrade option");
ok(after.state.lots.length === state.lots.length, "no copy was reserved or acquired");
M.setRecordSource(null);
assert.throws(() => Lens.swapCommand(D6, "slot:nope", cardOf(cand.cardId), "Removal"), /main-deck slot/, "a slot that is not a main slot is refused");

console.log(`crankmagic-lens: ${checks} checks passed — D6 removal ${rem6.count} / 8 with ${rem6.candidates.length} candidates, D5 ${rem5.count} / 8 under, the swap leaves the hundred alone.`);
