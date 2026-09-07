#!/usr/bin/env node
/* Costs the three Claude-powered features this app could carry, against the
   data the app actually ships. Every prompt below is assembled from the real
   files -- data/rung-lists.json for the hundred, data/deck-guides.json for the
   shape and for the output schema, data/commander-universe.json for the
   registry -- so the sizes are the sizes a real call would send, not a guess.

   Token counts are ESTIMATES. Claude's tokenizer is model-specific and the only
   accurate count comes from POST /v1/messages/count_tokens, which is free but
   needs an API key; there is none in this repo. The estimate divides characters
   by CHARS_PER_TOKEN and the report carries a +/-25% band. Do not substitute
   tiktoken -- it is OpenAI's tokenizer and undercounts Claude by 15-20%.

   Usage: node tools/claude-api-cost.mjs [--json]                             */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));

/* ---- the estimator ------------------------------------------------------ */

const CHARS_PER_TOKEN = 3.4;   /* leans low so token counts lean high */
const BAND = 0.25;
const tok = (s) => Math.round(s.length / CHARS_PER_TOKEN);

/* Prices are dollars per million tokens, from the model catalog. Cache reads
   are 0.1x input on every model here; cache writes are 1.25x. Batch halves
   everything, cache reads and writes included. */
const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5", in: 1, out: 5, cacheMin: 4096 },
  { id: "claude-sonnet-5", label: "Sonnet 5", in: 2, out: 10, cacheMin: 1024 },
  { id: "claude-opus-5", label: "Opus 5", in: 5, out: 25, cacheMin: 512 },
];

const cost = (m, inTok, outTok) => (inTok * m.in + outTok * m.out) / 1e6;
const money = (d) =>
  d >= 1 ? "$" + d.toFixed(2) : d >= 0.01 ? "$" + d.toFixed(3) : "$" + d.toFixed(5);

/* ---- the data the prompts are built from -------------------------------- */

const rungs = read("rung-lists.json");
const guides = read("deck-guides.json");
const universe = read("commander-universe.json");

const F = universe.fields;
const iName = F.indexOf("name"), iCi = F.indexOf("ci"), iMv = F.indexOf("mv");
const iType = F.indexOf("type"), iRank = F.indexOf("rank"), iCmd = F.indexOf("commander");

const guide = guides.decks.find((d) => d.id === "D1");

/* The worked example has to be one real deck end to end: the guide's commander
   and the hundred that commander actually leads. Variant ids and guide ids are
   different namespaces, so match on the commander sitting in the list. */
function hundredFor(commander) {
  let best = null;
  for (const rungsFor of Object.values(rungs.variants)) {
    const list = rungsFor.Tuned || rungsFor.Base;
    if (!Array.isArray(list) || !list.some((c) => c.name === commander)) continue;
    if (!best || list.length > best.length) best = list;
  }
  if (!best) throw new Error("no pinned hundred leads with " + commander);
  return best;
}
const hundred = hundredFor(guide.commander);
const deckList = hundred.map((c) => (c.quantity > 1 ? c.quantity + "x " : "") + c.name).join("\n");
const cardCount = hundred.reduce((n, c) => n + c.quantity, 0);
if (cardCount !== 100) throw new Error("worked example is " + cardCount + " cards, not 100");

/* ---- scenario 1: cards that do a specific thing ------------------------- */

const s1system = `You suggest Magic: the Gathering cards for a Commander deck.

Rules you must follow:
- Every card you name must be a real, Commander-legal card.
- Every card must be inside the deck's color identity.
- Never name a card already in the list you are given.
- Suggest at most 8. Fewer is fine. Say why each one does the job asked for, in
  one sentence, in terms of what happens at the table.
- You are advising, not deciding. The player owns the deck.`;

const s1user = `Commander: ${guide.commander}
Color identity: ${guide.colorIdentity.join("")}
Archetype: ${guide.archetype}
What the deck does: ${guide.whatItDoes}

The hundred as it stands:
${deckList}

What I need: something that protects my board from a wipe, and a second way to
draw cards that doesn't cost me the graveyard.
Budget per card: under $15.`;

const s1out = 8 * 150;  /* name + one sentence, x8 */

/* ---- scenario 2: which commander should I play -------------------------- */

const s2system = `You recommend Magic: the Gathering commanders. Name 5. For each:
the commander, its colors, one sentence on what the deck does, a difficulty of
Beginner/Intermediate/Advanced, and three cards that define it. Every name must
be a real card that can legally be a commander.`;

const s2userOpen = `I want to build a deck that plays creatures and goes wide, in
green and white, that a table of casual players will still enjoy losing to. I
have about $250 to spend and I have been playing for two years.`;

const commanders = universe.cards.filter((c) => c[iCmd]);
const shortlist = commanders
  .filter((c) => c[iRank] <= 3000 && /W/.test(c[iCi]) && /G/.test(c[iCi]))
  .map((c) => `${c[iName]} | ${c[iCi]} | ${c[iMv]}`)
  .join("\n");

const s2userGrounded = `${s2userOpen}

Choose only from this list, which is every Commander-legal commander in those
colors that the format actually plays:
${shortlist}`;

const s2out = 5 * 250;

/* ---- scenario 3: how to play this deck ---------------------------------- */

const schema = Object.keys(guide).filter((k) => k !== "id" && k !== "label").join(", ");
const s3system = `You write how-to-play guides for Commander decks, for a player
who has the deck in front of them and has never played it.

Return one JSON object with these fields: ${schema}.
Ground every claim in the list you are given: name the cards. Do not invent
cards, and do not describe a card that is not in the list. Where you count
something ("eleven cards discard"), the count must be right.`;

const s3user = `Commander: ${guide.commander}
Color identity: ${guide.colorIdentity.join("")}
Measured shape: ${JSON.stringify(guide.shape)}

The hundred:
${deckList}`;

const s3out = JSON.stringify({ ...guide, id: undefined, label: undefined }).length;

/* ---- the report --------------------------------------------------------- */

const SCENARIOS = [
  {
    key: "cards-for-a-need",
    title: "1. Cards that do a specific thing",
    system: s1system, user: s1user, outChars: s1out,
    per: "per question asked", volume: 200,
    note: "Sent once per question. Names validated against the 31,830-card registry before anything renders.",
  },
  {
    key: "pick-a-commander-open",
    title: "2a. Which commander (model picks, app validates)",
    system: s2system, user: s2userOpen, outChars: s2out,
    per: "per question asked", volume: 50,
    note: "No candidate list sent. Any name that is not a legal commander in the registry is dropped and re-asked.",
  },
  {
    key: "pick-a-commander-grounded",
    title: "2b. Which commander (shortlist sent in the prompt)",
    system: s2system, user: s2userGrounded, outChars: s2out,
    per: "per question asked", volume: 50,
    note: `Shortlist is ${shortlist.split("\n").length} GW commanders ranked inside the top 3,000. Cannot name a card that is not on it.`,
  },
  {
    key: "how-to-play",
    title: "3. How to play this deck",
    system: s3system, user: s3user, outChars: s3out,
    per: "per deck, once", volume: 50,
    note: "Output is the deck-guides.json record the viewer already renders. Generated once per deck and cached; a deck's hundred changes rarely.",
  },
];

const rows = SCENARIOS.map((s) => {
  const inTok = tok(s.system) + tok(s.user);
  const outTok = Math.round(s.outChars / CHARS_PER_TOKEN);
  return { ...s, inChars: s.system.length + s.user.length, inTok, outTok };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ charsPerToken: CHARS_PER_TOKEN, band: BAND, models: MODELS, rows }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log(`\nClaude API cost model -- mtg-deck-matrix`);
console.log(`Prompts assembled from the shipped data. Token counts estimated at`);
console.log(`${CHARS_PER_TOKEN} chars/token; treat every figure as +/-${BAND * 100}%. Confirm exactly, for`);
console.log(`free, with POST /v1/messages/count_tokens once a key exists.\n`);

for (const r of rows) {
  console.log(`--- ${r.title}`);
  console.log(`    ${r.note}`);
  console.log(`    input  ${lpad(r.inChars.toLocaleString(), 8)} chars  ~${lpad(r.inTok.toLocaleString(), 7)} tokens`);
  console.log(`    output ${lpad(r.outChars.toLocaleString(), 8)} chars  ~${lpad(r.outTok.toLocaleString(), 7)} tokens`);
  console.log(`    ${pad("", 18)}${MODELS.map((m) => lpad(m.label, 14)).join("")}`);
  const one = MODELS.map((m) => lpad(money(cost(m, r.inTok, r.outTok)), 14)).join("");
  const hundred = MODELS.map((m) => lpad(money(cost(m, r.inTok, r.outTok) * 100), 14)).join("");
  const batch = MODELS.map((m) => lpad(money(cost(m, r.inTok, r.outTok) * 100 * 0.5), 14)).join("");
  const whole = MODELS.map((m) => lpad(money(cost(m, r.inTok, r.outTok) * r.volume * 0.5), 14)).join("");
  console.log(`    ${pad("one call", 18)}${one}`);
  console.log(`    ${pad("100 calls", 18)}${hundred}`);
  console.log(`    ${pad("100, batched", 18)}${batch}`);
  console.log(`    ${pad(`all ${r.volume}, batched`, 18)}${whole}`);
  const cacheable = MODELS.filter((m) => tok(r.system) >= m.cacheMin).map((m) => m.label);
  console.log(`    system prompt is ~${tok(r.system)} tokens: cacheable on ${cacheable.length ? cacheable.join(", ") : "no model here (all minimums are higher)"}`);
  console.log();
}

const worst = rows.reduce((a, b) => (a.inTok + a.outTok > b.inTok + b.outTok ? a : b));
console.log(`Largest single call is "${worst.title.replace(/^\d+\w*\.\s*/, "")}" at`);
console.log(`~${(worst.inTok + worst.outTok).toLocaleString()} tokens, ${money(cost(MODELS[2], worst.inTok, worst.outTok))} on Opus 5.\n`);

const everything = rows.reduce((sum, r) => sum + cost(MODELS[2], r.inTok, r.outTok) * r.volume, 0);
console.log(`Every scenario at its stated volume, all on Opus 5, standard tier: ${money(everything)}`);
console.log(`The same, batched:                                                ${money(everything * 0.5)}\n`);
