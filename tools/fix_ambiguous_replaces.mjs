#!/usr/bin/env node
// Post-process data/buy-plans.json after tools/import_budget_plan.py: neutralize any new
// (tuned2/enhance2/max2/funTuned/funMax/altTuned/altMax) item whose `replaces` name is
// ambiguous across categories.
//
// lineup-model.js's byName map resolves a `replaces` string to whichever entry with that
// exact name appears FIRST in collectionEntries' fixed category order (shell always wins;
// otherwise first-registered non-shell entry wins, see lineup-model.js buildModel/byName).
// That was safe for the original five hand-curated categories, but the new ladders
// routinely propose the same well-known staple in more than one independent chain for the
// same deck (confirmed: e.g. "Golgari Grave-Troll" generated as both a tuned2 item and an
// unrelated funTuned item for deck 1o) -- when that happens, any THIRD item whose `replaces`
// names that now-ambiguous card silently resolves against the WRONG twin's chain instead of
// the one it was actually diffed against, which can make checking it clear the wrong slot
// group entirely, or fail to clear the card it was generated to replace.
//
// Fix: for every new item, replay the exact resolution lineup-model.js would perform and
// confirm it lands on the predecessor category this item's OWN ladder rung expects (its
// immediate predecessor rung, or a shell card if that rung had no diff of its own). If it
// resolves anywhere else, the name is ambiguous for this reference -- clear `replaces` (and
// the why-text that was tied to the now-invalid pairing) so the item stands as its own root
// instead of silently misbehaving. This mirrors the same "stand alone rather than fabricate
// a pairing" choice already used for the alt-commander row-shuffling artifacts.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");

const PLANS_PATH = new URL("../data/buy-plans.json", import.meta.url);
const doc = JSON.parse(readFileSync(PLANS_PATH, "utf8"));

// category -> its expected immediate predecessor category ("shell" covers both the literal
// shell AND any pre-existing curated category, since a rung with no diff of its own simply
// inherits from whatever came before it further up the existing chain).
const EXPECTED_PREDECESSOR = {
  tuned2: null, // predecessor is Base -- could be shell OR any pre-existing category
  enhance2: "tuned2",
  max2: "enhance2",
  funTuned: null,
  funMax: "funTuned",
  altTuned: null,
  altMax: "altTuned",
};
const NEW_CATEGORIES = Object.keys(EXPECTED_PREDECESSOR);

let totalChecked = 0;
let totalCleared = 0;
const clearedReport = {};

for (const [variantId, plan] of Object.entries(doc.plans)) {
  const model = Lineup.buildModel(plan);
  const cleared = [];

  for (const category of NEW_CATEGORIES) {
    const expected = EXPECTED_PREDECESSOR[category];
    for (const item of plan[category] || []) {
      if (!item.replaces) continue;
      totalChecked++;
      const entry = model.byId.get(String(item.id));
      if (!entry) continue; // shouldn't happen, defensive
      const predecessor = entry.predecessorId ? model.byId.get(entry.predecessorId) : null;
      if (!predecessor) continue; // already unresolved on its own -- nothing to fix here

      // Resolving to a pre-existing category (shell/tuned/upgrade/enhance/max) is always
      // fine, at every rung: a rung can legitimately inherit straight from Base or an
      // existing curated pick when its own immediate predecessor rung had no diff at that
      // card. Only a resolution INTO one of the new ladders needs checking against what
      // this specific rung expects.
      if (!NEW_CATEGORIES.includes(predecessor.kind)) continue;

      const isCorrect = expected === null
        ? false // a Base-level rung (tuned2/funTuned/altTuned) should never resolve into
                 // ANY new-category item -- there's nothing upstream of Base to find there
        : predecessor.kind === expected;

      if (!isCorrect) {
        cleared.push({ id: item.id, name: item.name, category, hadReplaces: item.replaces, resolvedTo: `${predecessor.kind}:${predecessor.item.name}` });
        item.replaces = "";
        item.why = "";
        item.purpose = "";
        item.whyPrimary = "";
        if (item.brief) delete item.brief.fit;
        totalCleared++;
      }
    }
  }

  if (cleared.length) clearedReport[variantId] = cleared;
}

writeFileSync(PLANS_PATH, `${JSON.stringify(doc, null, 2)}\n`);

console.log(`Checked ${totalChecked} new-category items with a replaces value.`);
console.log(`Cleared ${totalCleared} ambiguous replaces references (item stands as its own root instead):`);
console.log(JSON.stringify(clearedReport, null, 2));
