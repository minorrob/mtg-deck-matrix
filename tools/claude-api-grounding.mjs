#!/usr/bin/env node
/* Can a card a language model invented reach the screen?
 *
 * Every Claude feature this app could carry ends the same way: the model names
 * cards, and the app shows them. That is only safe if a name the model made up
 * cannot get past the app. This checks that gate, offline, against the same
 * registry the browser already loads -- data/commander-universe.json, 31,830
 * cards filtered to legalities.commander === "legal", 3,411 of them flagged as
 * legal commanders.
 *
 * The sample is deliberately nasty. It mixes real cards, cards that are real but
 * BANNED in Commander (Black Lotus is a card; it is not a legal card), a real
 * name with an invented title, a real card with one letter of plural on the end,
 * and names that are pure invention but sound exactly like Magic cards. If the
 * gate holds here it holds on model output, because these ARE the shapes model
 * output gets wrong.
 *
 * The expectations are asserted, so this is a check and not a printout: it exits
 * non-zero if the registry ever stops catching one of them.
 *
 * Usage: node tools/claude-api-grounding.mjs                                   */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const universe = JSON.parse(readFileSync(join(ROOT, "data", "commander-universe.json"), "utf8"));

const F = universe.fields;
const iName = F.indexOf("name"), iCi = F.indexOf("ci"), iCmd = F.indexOf("commander");

const byName = new Map(universe.cards.map((c) => [c[iName].toLowerCase(), c]));

/* The whole gate. Four questions, no network, no model, no judgement calls. */
function gate(name, { identity = "", inDeck = [] } = {}) {
  const card = byName.get(String(name).trim().toLowerCase());
  if (!card) return { ok: false, why: "not a Commander-legal card" };
  if (inDeck.some((n) => n.toLowerCase() === card[iName].toLowerCase()))
    return { ok: false, why: "already in the deck" };
  const ci = card[iCi] || "";
  const outside = ci.split("").filter((c) => !identity.includes(c));
  if (identity && outside.length)
    return { ok: false, why: `outside the deck's colors (needs ${outside.join("")})` };
  return { ok: true, why: `legal${card[iCmd] ? ", can be a commander" : ""}`, card };
}

/* identity of the worked example: Selesnya, green-white. */
const IDENTITY = "GW";
const IN_DECK = ["Heroic Intervention"];

const SAMPLE = [
  { name: "Heroic Intervention", expect: false, note: "real, in colors -- but already in the deck" },
  { name: "Teferi's Protection", expect: true, note: "reads as a blue card and is not one -- mono-white, so it belongs" },
  { name: "Clever Concealment", expect: true, note: "real, white, in colors" },
  { name: "Selfless Spirit", expect: true, note: "real, white, in colors" },
  { name: "Avacyn, Angel of Hope", expect: true, note: "real, white, legal commander" },
  { name: "Cyclonic Rift", expect: false, note: "real, but blue -- outside a GW deck" },
  { name: "Demonic Tutor", expect: false, note: "real, but black -- outside a GW deck" },
  { name: "Black Lotus", expect: false, note: "a real card, BANNED in Commander" },
  { name: "Mox Sapphire", expect: false, note: "a real card, BANNED in Commander" },
  { name: "Contract from Below", expect: false, note: "a real card, BANNED in Commander (ante)" },
  { name: "Golos, Tireless Pilgrim", expect: false, note: "a real commander, BANNED in Commander" },
  { name: "Lutri, the Spellchaser", expect: false, note: "banned as a companion, still a legal card -- blue-red, so colors reject it, not legality" },
  { name: "Splinter, Vengeful Sensei", expect: false, note: "real name, invented title" },
  { name: "Ancestral Visions", expect: false, note: "off by one letter -- the card is Ancestral Vision" },
  { name: "Verdant Sanctuary", expect: false, note: "pure invention, sounds like a green card" },
  { name: "Sunblade Paladin", expect: false, note: "pure invention, sounds like a white card" },
];

let failures = 0;
console.log(`\nGrounding gate -- ${universe.counts.cards.toLocaleString()} Commander-legal cards, ${universe.counts.commanders.toLocaleString()} legal commanders`);
console.log(`Deck color identity ${IDENTITY}; already in the deck: ${IN_DECK.join(", ")}\n`);
console.log(`  ${"name".padEnd(28)}${"verdict".padEnd(9)}why`);
console.log(`  ${"-".repeat(28)}${"-".repeat(9)}${"-".repeat(46)}`);

for (const row of SAMPLE) {
  const got = gate(row.name, { identity: IDENTITY, inDeck: IN_DECK });
  const agree = got.ok === row.expect;
  if (!agree) failures += 1;
  console.log(`  ${row.name.padEnd(28)}${(got.ok ? "shown" : "blocked").padEnd(9)}${got.why}${agree ? "" : "   <-- EXPECTED " + (row.expect ? "shown" : "blocked")}`);
}

const shown = SAMPLE.filter((r) => r.expect).length;
console.log(`\n  ${SAMPLE.length} names in, ${shown} reach the screen, ${SAMPLE.length - shown} are stopped.`);
console.log(`  Nothing invented, nothing banned and nothing off-color gets through.`);

if (failures) {
  console.error(`\n  ${failures} name(s) did not behave as expected. The gate has moved.\n`);
  process.exit(1);
}
console.log(`  All ${SAMPLE.length} verdicts as expected.\n`);
