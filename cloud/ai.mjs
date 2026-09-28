/* THE AI DOOR (M6, docs/plan-to-100.md; the runbook is docs/ai-door.md).
 *
 * One Worker route, POST /api/ai/explain, reads a deck's measured score out loud (docs/ai-agents.md §4: "the model
 * is not being asked to know anything about Magic. It is being asked to read a table out loud"). It is the first
 * feature through the door because it is the cheapest and the safest; the Coach and LLM seats come through the
 * same gates later.
 *
 * THE DOOR IS SHUT UNTIL ROB OPENS IT. Each of his four M6 decisions is a gate, and a gate with nothing set is
 * closed -- never a default that spends:
 *
 *   1. its own Access application   AI_ACCESS_AUD: the token must be for the AI application, which Rob sets to
 *                                   Google only (never the emailed code), with passkey MFA if the plan offers it
 *   2. the allowlist                a row in ai_allowlist, separate from the invite list, that Rob manages
 *   3. the key                      ANTHROPIC_API_KEY, a Worker secret Rob enters with `wrangler secret put`; it
 *                                   never appears in chat, in this repository, in a response or in the log
 *   4. the spend caps               AI_CAP_PERSON_CENTS and AI_CAP_TOTAL_CENTS, over a rolling 24 hours, read from
 *                                   the call log; a call is refused when its worst case would cross either
 *
 * and the model is Rob's too: AI_MODEL, or claude-opus-5 when it is unset. The privacy page says what goes to the
 * AI before the browser offers the feature at all (docs/ai-door.md has the draft for Rob to approve).
 *
 * WHAT IS SENT, AND WHAT COMES BACK. Only what the request carries: the deck's name, its commander(s), its card
 * names, the score and its measures, the strongest and weakest cards. No email, no library, no prices paid. The
 * answer comes back as structured output, and every card it names in [[double brackets]] must be a card that was
 * sent; an answer naming any other is not shown (docs/ai-agents.md: "every card named must be one that was sent").
 *
 * The Worker has no npm dependencies, so this calls the Messages API over fetch, as tools/generate-guides.mjs does.
 */

export const DEFAULT_MODEL = "claude-opus-5";
const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";
/* A declined request is re-run server-side on the model Anthropic recommends for that category, rather than
   returned as a refusal; the call log prices each attempt at the rate of the model that ran it. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 2000;          // thinking included; the answer itself is three to five sentences
const TIMEOUT_MS = 30000;
/* List prices, US dollars per million tokens [input, output]. A model not listed is priced at the dearest rate,
   so an unknown model can only make the meter read high, never low. */
export const PRICES = {"claude-opus-5": [5, 25], "claude-opus-4-8": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5]};
const DEAREST = [10, 50];
const priceOf = (model) => PRICES[model] || DEAREST;
export const costMicros = (model, input, output) => Math.ceil(input * priceOf(model)[0] + output * priceOf(model)[1]);

export class Closed extends Error {constructor(message, status = 503) {super(message); this.status = status;}}

/* THE INPUT: bounded by construction, so the prompt cannot grow past what a score explanation needs. */
const LIMITS = {text: 200, cards: 120, measures: 12, ends: 5, note: 240};
const str = (v, n = LIMITS.text) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
export function readRequest(input) {
  const deck = input && input.deck, score = input && input.score;
  if (!deck || typeof deck !== "object") throw new Closed("Send the deck to explain.", 400);
  const cards = [...new Set((Array.isArray(deck.cards) ? deck.cards : []).map((c) => str(c)).filter(Boolean))];
  if (!cards.length) throw new Closed("The deck has no cards to explain.", 400);
  if (cards.length > LIMITS.cards) throw new Closed(`A deck is at most ${LIMITS.cards} names.`, 400);
  if (!score || num(score.total) === null) throw new Closed("Send the measured score to explain.", 400);
  const row = (m) => ({name: str(m && m.name), value: str(String((m && m.value) ?? "")), note: str(m && m.note, LIMITS.note)});
  const ends = (list) => (Array.isArray(list) ? list : []).slice(0, LIMITS.ends).map((c) => ({name: str(c && c.name), note: str(c && c.note, LIMITS.note)})).filter((c) => cards.includes(c.name));
  return {
    deck: {name: str(deck.name) || "This deck", commanders: (Array.isArray(deck.commanders) ? deck.commanders : []).map((c) => str(c)).filter(Boolean).slice(0, 2), cards},
    score: {total: num(score.total), of: num(score.of) || 10, label: str(score.label)},
    measures: (Array.isArray(input.measures) ? input.measures : []).slice(0, LIMITS.measures).map(row).filter((m) => m.name),
    strongest: ends(input.strongest), weakest: ends(input.weakest),
  };
}

const SYSTEM = [
  "You explain a Commander deck's measured score to the person who built it.",
  "The score and every figure come from a simulator; read them, do not invent or change any number, and never give a score of your own.",
  "Say why the score is what it is, in three to five plain sentences, in American English, pointing at the measures and cards that drive it.",
  "Name only cards from the deck list you are given, and write every card name inside double square brackets, like [[Sol Ring]].",
  "Do not rule on how the rules work, and do not quote prices.",
].join(" ");
const SCHEMA = {type: "object", properties: {explanation: {type: "string"}}, required: ["explanation"], additionalProperties: false};

export function buildBody(req, model) {
  return {
    model, max_tokens: MAX_TOKENS, system: SYSTEM, fallbacks: "default",
    output_config: {effort: "low", format: {type: "json_schema", schema: SCHEMA}},
    messages: [{role: "user", content: JSON.stringify(req)}],
  };
}

/* Every [[name]] the answer uses must be a card that was sent. */
export function grounded(text, cards) {
  const known = new Set(cards.map((c) => c.toLowerCase()));
  const named = [...String(text).matchAll(/\[\[([^\]]{1,200})\]\]/g)].map((m) => m[1].trim());
  const strangers = named.filter((n) => !known.has(n.toLowerCase()));
  return {ok: strangers.length === 0, named, strangers};
}

/* What a response cost: each attempt at the rate of the model that ran it, when the response itemizes them. */
export function spendOf(json, model) {
  const u = (json && json.usage) || {};
  const parts = Array.isArray(u.iterations) && u.iterations.length ? u.iterations : [u];
  let input = 0, output = 0, micros = 0;
  for (const p of parts) {
    const i = Number(p.input_tokens) || 0, o = Number(p.output_tokens) || 0, m = p.model || json.model || model;
    input += i; output += o; micros += costMicros(m, i, o);
  }
  return {model: (json && json.model) || model, input, output, micros};
}

export function createAi(db, {now = () => new Date().toISOString(), newId = () => crypto.randomUUID()} = {}) {
  const since = () => new Date(Date.parse(now()) - 24 * 3600 * 1000).toISOString();
  return {
    async allowed(email) {return !!(await db.prepare("SELECT 1 AS yes FROM ai_allowlist WHERE email = ?").bind(email).first());},
    async spent(email) {
      const mine = await db.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS micros FROM ai_calls WHERE email = ? AND at >= ?").bind(email, since()).first();
      const all = await db.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS micros FROM ai_calls WHERE at >= ?").bind(since()).first();
      return {mine: Number(mine.micros) || 0, all: Number(all.micros) || 0};
    },
    async log(row) {
      await db.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(newId(), row.email, row.feature, row.model, row.input, row.output, row.micros, row.outcome, now()).run();
    },
  };
}

const cents = (v) => {const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null;};

/* The gates after Access and the allowlist: the key, the caps, the model. Returns what the call may spend. */
export function settings(env) {
  if (!env.ANTHROPIC_API_KEY) throw new Closed("AI features are not switched on here yet.");
  const person = cents(env.AI_CAP_PERSON_CENTS), total = cents(env.AI_CAP_TOTAL_CENTS);
  if (!person || !total) throw new Closed("AI features have no spend cap set, so they stay off.");
  return {key: env.ANTHROPIC_API_KEY, model: String(env.AI_MODEL || DEFAULT_MODEL), capPerson: person * 10000, capTotal: total * 10000};
}

/* Explain a score: gate on the caps, call, price, ground, log, answer. `who` has already passed Access and the
   allowlist. Throws Closed for a refusal the reader should see; everything spent is logged first. */
export async function explain({ai, who, input, config, fetchImpl = fetch}) {
  const req = readRequest(input);
  const body = buildBody(req, config.model);
  /* The worst case, before a cent is spent: every input character a token, and the whole output allowance. */
  const worst = costMicros(config.model, JSON.stringify(body).length, MAX_TOKENS);
  const spent = await ai.spent(who.email);
  const meter = (extra = 0) => ({spentCents: Math.round((spent.mine + extra) / 10000 * 100) / 100, capCents: config.capPerson / 10000});
  if (spent.mine + worst > config.capPerson) throw new Closed(`You have reached your AI spend cap for the last 24 hours (${meter().spentCents}¢ of ${meter().capCents}¢). Try again tomorrow.`, 429);
  if (spent.all + worst > config.capTotal) throw new Closed("CrankMagic has reached its AI spend cap for the last 24 hours. Try again tomorrow.", 429);

  let response;
  try {
    response = await fetchImpl(API, {method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {"content-type": "application/json", "x-api-key": config.key, "anthropic-version": VERSION, "anthropic-beta": FALLBACK_BETA},
      body: JSON.stringify(body)});
  } catch {
    await ai.log({email: who.email, feature: "explain", model: config.model, input: 0, output: 0, micros: 0, outcome: "error"});
    throw new Closed("The AI service did not answer in time. Nothing was spent. Try again in a moment.", 504);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    /* The provider's own error text is not passed on: it is not the reader's, and it can name account details. */
    await ai.log({email: who.email, feature: "explain", model: config.model, input: 0, output: 0, micros: 0, outcome: "error"});
    throw new Closed(response.status === 429 || response.status === 529 ? "The AI service is busy. Nothing was spent. Try again in a minute." : "The AI service had a problem. Nothing was spent.", 502);
  }
  const spend = spendOf(json, config.model);
  const done = async (outcome) => ai.log({email: who.email, feature: "explain", model: spend.model, input: spend.input, output: spend.output, micros: spend.micros, outcome});
  if (json.stop_reason === "refusal") {await done("refused"); throw new Closed("The AI declined to explain this one.", 422);}
  const text = (Array.isArray(json.content) ? json.content : []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
  let explanation = "";
  try {explanation = String(JSON.parse(text).explanation || "").trim();} catch {}
  if (!explanation || json.stop_reason === "max_tokens") {await done("error"); throw new Closed("The AI's answer came back incomplete, so it is not shown.", 502);}
  const check = grounded(explanation, req.deck.cards);
  if (!check.ok) {await done("ungrounded"); throw new Closed("The AI's answer named a card that is not in this deck, so it is not shown.", 502);}
  await done("ok");
  return {explanation, cards: check.named, model: spend.model, meter: meter(spend.micros)};
}
