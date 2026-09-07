#!/usr/bin/env node
/**
 * Write the "How to play it" guide for a deck that has none.
 *
 * Six decks have a guide, written by hand. The other forty-four variants have none, and
 * every deck somebody imports has none, and the panel is simply absent on all of them.
 * This is the tool that fills them in.
 *
 * IT DOES NOT RUN IN THE BROWSER, and that is the design rather than a limitation. There
 * is no API key in this repository and nowhere to keep one -- see
 * docs/claude-api-evaluation.md -- so the guide is generated here, on a machine that has a
 * key in its environment, checked, reviewed in a diff, and committed as data. The browser
 * fetches a file, exactly as it does today. No key ships, no request is made from a
 * reader's page, and a bad guide is a commit somebody declines rather than something a
 * stranger reads.
 *
 * WHAT IS ASKED AND WHAT IS COMPUTED. The shape -- lands, types, curve, average mana value
 * -- is computed here and handed to the model as fact. The model writes prose and nothing
 * else. Then guide-agent.js checks the prose against the hundred that was sent: a card
 * named in the guide that is not in the deck is an error, not a style note, and the guide
 * is asked for again.
 *
 *   node tools/generate-guides.mjs                  what would be sent, and what it costs
 *   node tools/generate-guides.mjs --deck 5o        one variant
 *   node tools/generate-guides.mjs --missing        only the decks with no guide (default)
 *   node tools/generate-guides.mjs --call           actually call, needs ANTHROPIC_API_KEY
 *   node tools/generate-guides.mjs --call --write   ...and update data/deck-guides.json
 *   node tools/generate-guides.mjs --show 5o        print the exact request body
 */

import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {createRequire} from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const Agent = require(join(ROOT, "guide-agent.js"));
const Engine = require(join(ROOT, "sim-engine.js"));

const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const CALL = has("--call");
const WRITE = has("--write");
const ONLY = valueOf("--deck") || valueOf("--show");
const SHOW = Boolean(valueOf("--show"));

/* ---- what the model is given, computed rather than asked for ------------- */

/* The shape, in the fields data/deck-guides.json already uses. Types come off the type
   line and the curve off the engine's own mana-value read, so a guide's numbers and the
   Shape panel's numbers are the same numbers. */
function shapeOf(cards, facts) {
  const shape = {lands: 0, creatures: 0, planeswalkers: 0, battles: 0, instants: 0,
    sorceries: 0, artifacts: 0, enchantments: 0, avgMv: 0, curve: {}};
  let spells = 0, mvSum = 0;
  for (const card of cards) {
    const fact = facts[card.name] || {};
    const type = fact.typeLine || "";
    const copies = Number(card.quantity || 1);
    const profile = Engine.classifyCard({
      name: card.name, quantity: copies, typeLine: type,
      manaCost: fact.manaCost || "", oracleText: fact.oracleText || ""
    });
    if (profile.isLand) { shape.lands += copies; continue; }
    spells += copies;
    mvSum += profile.cmc * copies;
    const bucket = Math.min(8, Math.round(profile.cmc));
    if (bucket >= 1) shape.curve[bucket] = (shape.curve[bucket] || 0) + copies;
    /* One card, one type bucket, most-specific first: an Artifact Creature is a creature
       to a player deciding what to keep, and counting it twice makes the eight figures
       add up to more than the deck. */
    if (/Creature/.test(type)) shape.creatures += copies;
    else if (/Planeswalker/.test(type)) shape.planeswalkers += copies;
    else if (/Battle/.test(type)) shape.battles += copies;
    else if (/Instant/.test(type)) shape.instants += copies;
    else if (/Sorcery/.test(type)) shape.sorceries += copies;
    else if (/Artifact/.test(type)) shape.artifacts += copies;
    else if (/Enchantment/.test(type)) shape.enchantments += copies;
  }
  shape.avgMv = Number((spells ? mvSum / spells : 0).toFixed(2));
  shape.curve = Object.fromEntries(Array.from({length: 8}, (_u, i) => [i + 1, shape.curve[i + 1] || 0]));
  return shape;
}

/* ---- the decks that could have one --------------------------------------- */

const rungs = read("data", "rung-lists.json");
/* CARD TEXT FROM BOTH FILES. data/card-facts.json covers 533 of the 1,272 distinct names
   across the fifty variants and data/cards.json covers the rest; using either alone leaves
   most cards with no mana cost, which silently reports an average mana value of 0.69 for a
   deck whose real curve peaks at three. Facts win where both have a card -- that file is
   the one the app itself reads. */
const facts = (() => {
  const merged = Object.create(null);
  const catalog = read("data", "cards.json");
  for (const card of (Array.isArray(catalog) ? catalog : catalog.cards)) merged[card.name] = card;
  const detailed = read("data", "card-facts.json").cards;
  for (const name of Object.keys(detailed)) merged[name] = detailed[name];
  return merged;
})();
const guides = read("data", "deck-guides.json");
const universe = read("data", "commander-universe.json");
const iName = universe.fields.indexOf("name");
const iCmd = universe.fields.indexOf("commander");
const iCi = universe.fields.indexOf("ci");
const registry = universe.cards.map((row) => row[iName]);
const commanderOf = new Map(universe.cards.filter((row) => row[iCmd]).map((row) => [row[iName], row[iCi] || ""]));

function deckFor(id, list) {
  const cards = list.map((card) => ({name: card.name, quantity: card.quantity}));
  const commander = cards.map((c) => c.name).find((name) => commanderOf.has(name)) || "";
  const ci = (commanderOf.get(commander) || "").split("");
  return {
    id, label: commander || id, commander, colorIdentity: ci,
    cards, shape: shapeOf(cards, facts)
  };
}

const candidates = [];
for (const [id, byRung] of Object.entries(rungs.variants)) {
  const list = byRung.Tuned || byRung.Base;
  if (!Array.isArray(list)) continue;
  if (ONLY && id !== ONLY) continue;
  candidates.push(deckFor(id, list));
}
const done = new Set(guides.decks.map((g) => g.commander));
const wanted = has("--all") ? candidates : candidates.filter((d) => !done.has(d.commander));

if (!wanted.length) {
  console.log("Nothing to write: every variant's commander already has a guide. --all to redo them.");
  process.exit(0);
}

/* ---- what it would cost -------------------------------------------------- */

const CHARS_PER_TOKEN = 3.4;
const PRICE = {in: 5, out: 25};   // claude-opus-5, dollars per million
const tok = (s) => Math.round(s.length / CHARS_PER_TOKEN);

if (SHOW) {
  console.log(JSON.stringify(Agent.request(wanted[0]), null, 2));
  process.exit(0);
}

let inTokens = 0;
for (const deck of wanted) {
  inTokens += tok(Agent.SYSTEM) + tok(Agent.userText(deck));
}
const outTokens = wanted.length * 1700;
const cost = (inTokens * PRICE.in + outTokens * PRICE.out) / 1e6;
console.log(`${wanted.length} deck${wanted.length === 1 ? "" : "s"} with no guide.`);
console.log(`~${inTokens.toLocaleString()} tokens in, ~${outTokens.toLocaleString()} out on ${Agent.MODEL}.`);
console.log(`About $${cost.toFixed(2)} at list, $${(cost / 2).toFixed(2)} batched. Token counts are estimates;`);
console.log(`confirm exactly and for free with POST /v1/messages/count_tokens.\n`);

if (!CALL) {
  wanted.slice(0, 8).forEach((deck) => {
    console.log(`  ${deck.id.padEnd(5)} ${(deck.commander || "(no commander found)").padEnd(34)}` +
      `${deck.cards.length} entries · ${deck.shape.lands} lands · avg mv ${deck.shape.avgMv}`);
  });
  if (wanted.length > 8) console.log(`  … and ${wanted.length - 8} more`);
  console.log(`\nNothing was sent. --call to generate, --show <id> to see one request body.`);
  process.exit(0);
}

/* ---- the call ------------------------------------------------------------ */

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error("ANTHROPIC_API_KEY is not set. There is no key in this repository and there");
  console.error("should not be one; export it in the shell that runs this.");
  process.exit(2);
}

async function ask(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  /* stop_reason "refusal" arrives as a 200 with no usable content; handle it before
     reading content, or the failure looks like a parse error. */
  if (data.stop_reason === "refusal") throw new Error("the model declined this request");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return {guide: JSON.parse(text), usage: data.usage || {}};
}

const written = [];
let spent = {input: 0, output: 0};
for (const deck of wanted) {
  process.stdout.write(`  ${deck.id} ${deck.commander} … `);
  let answer = null;
  let problems = null;
  for (let attempt = 1; attempt <= 2 && !answer; attempt += 1) {
    const body = Agent.request(deck);
    if (attempt === 2) {
      /* The second ask is the first one plus what was wrong with the answer. Cheaper than
         a human re-reading it, and the errors are specific enough to act on. */
      body.messages.push({role: "assistant", content: JSON.stringify(problems.guide)});
      body.messages.push({role: "user", content:
        "That guide names cards this deck does not contain, or states a count that is not " +
        "in the shape figures. Fix exactly these and change nothing else:\n" +
        problems.errors.map((e) => "- " + e).join("\n")});
    }
    let result;
    try { result = await ask(body); }
    catch (error) { console.log(`failed: ${error.message}`); break; }
    spent.input += Number(result.usage.input_tokens || 0);
    spent.output += Number(result.usage.output_tokens || 0);
    const checked = Agent.check(result.guide, deck, registry);
    if (!checked.errors.length) { answer = result.guide; problems = checked; break; }
    problems = {guide: result.guide, errors: checked.errors};
    if (attempt === 2) console.log(`still wrong after a second ask: ${checked.errors[0]}`);
  }
  if (!answer) continue;
  written.push(Agent.merge(answer, deck));
  console.log(`ok${problems.review.length ? ` (${problems.review.length} to glance at)` : ""}`);
  problems.review.forEach((note) => console.log(`      · ${note}`));
}

const billed = (spent.input * PRICE.in + spent.output * PRICE.out) / 1e6;
console.log(`\n${written.length} of ${wanted.length} written. ` +
  `${spent.input.toLocaleString()} tokens in, ${spent.output.toLocaleString()} out — $${billed.toFixed(3)}.`);

if (!WRITE) {
  console.log("Nothing saved. --write to merge into data/deck-guides.json.");
  process.exit(0);
}
const merged = guides.decks.filter((g) => !written.some((w) => w.commander === g.commander)).concat(written);
writeFileSync(join(ROOT, "data", "deck-guides.json"),
  JSON.stringify({...guides, generatedAt: new Date().toISOString(), decks: merged}, null, 1) + "\n");
console.log(`wrote data/deck-guides.json — ${merged.length} guides.`);
