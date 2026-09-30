/* THE ADVISOR EVAL'S RUBRIC, from the committed library (AI-4, docs/plan-to-done-2026-09-30.md).
 *
 *   node tests/ai-advise-eval/make-rubric.mjs      writes tests/ai-advise-eval/rubric.json
 *
 * The sound swaps are Rob's own intent as his workbook holds it: each substitute in a deck's box, out, for the card
 * whose seat it holds, in (the Master sheet's Target against Actual and its Dn-Buy columns, through the sync). The
 * refused swaps start empty: they are his afternoon (the plan: "the rubric is an afternoon of his, before AI-4 is
 * judged"). A rebuild keeps every refusal already written, per deck. */
import {readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../../schema/index.mjs";

const require = createRequire(import.meta.url);
const B = require(path.join(ROOT, "advise-brief.js")), M = require(path.join(ROOT, "collection-model.js")), Catalog = require(path.join(ROOT, "card-catalog.js"));
const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8"));
const state = M.migrate(live.payload.state || live.payload);
const cardOf = (id) => state.cards[id] || null;
const target = path.join(ROOT, "tests/ai-advise-eval/rubric.json");
let prior = null;
try { prior = JSON.parse(readFileSync(target, "utf8")); } catch { /* the first run */ }
const decks = B.rubricOf(state, cardOf);
for (const [id, d] of Object.entries(decks)) if (prior && prior.decks && prior.decks[id]) d.refuse = prior.decks[id].refuse || [];
writeFileSync(target, JSON.stringify({schema: "CrankAdviseRubric@1", source: "data/live-state.json (MtG - Master - 9.30 through the sync)",
  note: "sound: each substitute in a box, out, for the card whose seat it holds, in -- Rob's own intent. refuse: the swaps he would not make; his to add.", decks}, null, 2) + "\n");
console.log(`rubric: ${Object.values(decks).reduce((n, d) => n + d.sound.length, 0)} sound swaps over ${Object.keys(decks).length} decks -> ${path.relative(ROOT, target)}`);
void Catalog;
