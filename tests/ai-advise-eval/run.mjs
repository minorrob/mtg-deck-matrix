/* THE ADVISOR EVAL (AI-4, docs/plan-to-done-2026-09-30.md): the agent run on Rob's seven decks, scored against his
 * rubric, on each model asked for -- the evidence for AI_MODEL_advise. IT SPENDS: it calls the Messages API with a
 * key of Rob's, so it runs only when asked, never from runtests.sh (which takes tests/*.mjs, not this folder).
 *
 *   ANTHROPIC_API_KEY=... node tests/ai-advise-eval/run.mjs --yes [--models claude-haiku-5-5,claude-sonnet-5-5] [--decks D1,D2]
 *
 * Each deck's brief is the box reading (cloud/advise-brief.mjs): what is physically in the box, the substitutes holding
 * their seats, and the candidates the code finds. The model chooses up to ten swaps; the answer is checked for
 * grounding and scored: sound (the rubric's pair), near (a rubric card in, for another card out), refused, ungrounded.
 * It prints a table and writes tests/ai-advise-eval/results/<stamp>.json (not committed), with the tokens and the
 * cost at list prices. Nothing is sent but the brief: no address, no price paid, no library beyond the deck's own. */
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../../schema/index.mjs";
import * as B from "../../cloud/advise-brief.mjs";
import {adviseBody, MODELS as DOOR_MODELS, PRICES} from "../../cloud/ai.mjs";

const args = process.argv.slice(2), flag = (name) => {const i = args.indexOf(name); return i < 0 ? null : args[i + 1] || "";};
const key = process.env.ANTHROPIC_API_KEY || "";
if (!args.includes("--yes") || !key) {
  console.error("ai-advise-eval: this spends money. Run it with --yes and ANTHROPIC_API_KEY set (Rob's key, never committed).");
  process.exit(2);
}
/* The models the AI door may call (cloud/ai.mjs MODELS), its default first; and its list prices, per million tokens. */
const MODELS = (flag("--models") || DOOR_MODELS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "collection-model.js")), Catalog = require(path.join(ROOT, "card-catalog.js"));
const state = M.migrate(JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state);
const records = JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards, byName = new Map(records.map((c) => [Catalog.folded(c.name), c]));
const cardOf = (id) => {const ref = state.cards[id]; if (!ref) return null; const rec = byName.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id, roles: rec.roles || []} : {...ref, roles: []};};
const rubric = JSON.parse(readFileSync(path.join(ROOT, "tests/ai-advise-eval/rubric.json"), "utf8")).decks;
const only = (flag("--decks") || "").split(",").filter(Boolean);
const decks = state.decks.filter((d) => rubric[d.id] && (!only.length || only.some((x) => d.id.endsWith(":" + x))));

/* The request is the one the Worker sends (cloud/ai.mjs adviseBody): its instruction, a stable prefix that prompt
   caching makes nearly free, and the answer's schema -- so the eval measures what is shipped. */

const results = [];
for (const model of MODELS) for (const deck of decks) {
  const brief = B.buildBrief({state, deckId: deck.id, cardOf, basis: "box"});
  const body = adviseBody(brief, model);
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {method: "POST", headers: {"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}, body: JSON.stringify(body)});
  const json = await res.json();
  if (!res.ok) {results.push({model, deck: deck.name, error: json.error ? json.error.message : String(res.status)}); console.log(`${model} ${deck.name}: ${res.status}`); continue;}
  const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let answer = null; try {answer = JSON.parse(text);} catch {answer = {changes: [], keep: [], summary: ""};}
  const checked = B.checkAnswer(brief, answer), s = B.score(rubric[deck.id], checked);
  const u = json.usage || {}, [pi, po] = PRICES[model] || [10, 50];
  const cost = ((u.input_tokens || 0) * pi + (u.cache_read_input_tokens || 0) * pi / 5 + (u.output_tokens || 0) * po) / 1e6;
  results.push({model, deck: deck.name, score: s, cost, ms: Date.now() - t0, usage: u, changes: checked.changes, ungrounded: checked.ungrounded, summary: checked.summary});
  console.log(`${model.padEnd(20)} ${deck.name.padEnd(26)} sound ${s.hits}/${s.possible}  near ${s.near}  refused ${s.refused}  ungrounded ${s.ungrounded}  $${cost.toFixed(4)}`);
}
const dir = path.join(ROOT, "tests/ai-advise-eval/results");
mkdirSync(dir, {recursive: true});
const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, "-") + ".json");
writeFileSync(file, JSON.stringify({models: MODELS, results}, null, 2) + "\n");
console.log(`ai-advise-eval: ${results.length} runs -> ${path.relative(ROOT, file)}`);
