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
 * and the model is Rob's too, within his rule (2026-10-09): "We will always be using sonnet or other lowest cost
 * models." Then: "change the model use to Haiku explicitly." AI_MODEL may name only a model in MODELS, Claude Haiku 5.5
 * when it is unset; a dearer one keeps the door shut. The privacy page says what goes to the AI before the browser offers the feature at all (docs/ai-door.md).
 *
 * WHAT IS SENT, AND WHAT COMES BACK. Only what the request carries: the deck's name, its commander(s), its card
 * names, the score and its measures, the strongest and weakest cards. No email, no library, no prices paid. The
 * answer comes back as structured output, and every card it names in [[double brackets]] must be a card that was
 * sent; an answer naming any other is not shown (docs/ai-agents.md: "every card named must be one that was sent").
 *
 * The Worker has no npm dependencies, so this calls the Messages API over fetch, as tools/generate-guides.mjs does.
 */

/* The models the door calls: Claude Haiku 5.5, the lowest-cost and Rob's choice, and Claude Sonnet 5.5, the dearest he
   allows. No server-side fallback is asked for, since it can re-run a declined request on a dearer model; a refusal is
   said plainly (422). */
export const DEFAULT_MODEL = "claude-haiku-5-5";
export const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";
const MAX_TOKENS = 2000;          // thinking included; the answer itself is three to five sentences
const TIMEOUT_MS = 30000;
/* List prices, US dollars per million tokens [input, output]. A model not listed is priced at the dearest rate,
   so an unknown model can only make the meter read high, never low. Claude Haiku 5.5's rate is for a prompt under
   100K tokens, which a request capped at 64 KB always is. */
export const PRICES = {"claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-opus-5": [5, 25], "claude-opus-4-8": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5]};
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
    model, max_tokens: MAX_TOKENS, system: SYSTEM,
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
  const model = String(env.AI_MODEL || DEFAULT_MODEL);
  if (!MODELS.includes(model)) throw new Closed("AI features are set to a model CrankMagic does not use, so they stay off.");
  return {key: env.ANTHROPIC_API_KEY, model, capPerson: person * 10000, capTotal: total * 10000};
}

/* ONE CALL THROUGH THE DOOR, for any feature: the caps on the worst case before a cent is spent, the call, its price,
   the log, and the refusals said plainly. Returns the answer's structured output, parsed, with `done(outcome)` to log
   it once the feature has judged it and `meter(extra)` for the person's meter. Throws Closed for anything the reader
   should see; everything spent is logged first. */
async function ask({ai, who, feature, body, maxTokens, config, fetchImpl, declined}) {
  /* The worst case: every input character a token, and the whole output allowance. */
  const worst = costMicros(config.model, JSON.stringify(body).length, maxTokens);
  const spent = await ai.spent(who.email);
  const meter = (extra = 0) => ({spentCents: Math.round((spent.mine + extra) / 10000 * 100) / 100, capCents: config.capPerson / 10000});
  if (spent.mine + worst > config.capPerson) throw new Closed(`You have reached your AI spend cap for the last 24 hours (${meter().spentCents}¢ of ${meter().capCents}¢). Try again tomorrow.`, 429);
  if (spent.all + worst > config.capTotal) throw new Closed("CrankMagic has reached its AI spend cap for the last 24 hours. Try again tomorrow.", 429);

  let response;
  try {
    response = await fetchImpl(API, {method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {"content-type": "application/json", "x-api-key": config.key, "anthropic-version": VERSION},
      body: JSON.stringify(body)});
  } catch {
    await ai.log({email: who.email, feature, model: config.model, input: 0, output: 0, micros: 0, outcome: "error"});
    throw new Closed("The AI service did not answer in time. Nothing was spent. Try again in a moment.", 504);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    /* The provider's own error text is not passed on: it is not the reader's, and it can name account details. */
    await ai.log({email: who.email, feature, model: config.model, input: 0, output: 0, micros: 0, outcome: "error"});
    throw new Closed(response.status === 429 || response.status === 529 ? "The AI service is busy. Nothing was spent. Try again in a minute." : "The AI service had a problem. Nothing was spent.", 502);
  }
  const spend = spendOf(json, config.model);
  const done = async (outcome) => ai.log({email: who.email, feature, model: spend.model, input: spend.input, output: spend.output, micros: spend.micros, outcome});
  if (json.stop_reason === "refusal") {await done("refused"); throw new Closed(declined, 422);}
  const text = (Array.isArray(json.content) ? json.content : []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
  let answer = null;
  try {answer = JSON.parse(text);} catch {}
  if (!answer || typeof answer !== "object" || json.stop_reason === "max_tokens") {await done("error"); throw new Closed("The AI's answer came back incomplete, so it is not shown.", 502);}
  return {answer, spend, done, meter};
}

/* Explain a score: through the door, then grounded in the deck. `who` has already passed Access and the allowlist. */
export async function explain({ai, who, input, config, fetchImpl = fetch}) {
  const req = readRequest(input);
  const {answer, spend, done, meter} = await ask({ai, who, feature: "explain", body: buildBody(req, config.model), maxTokens: MAX_TOKENS, config, fetchImpl,
    declined: "The AI declined to explain this one."});
  const explanation = String(answer.explanation || "").trim();
  if (!explanation) {await done("error"); throw new Closed("The AI's answer came back incomplete, so it is not shown.", 502);}
  const check = grounded(explanation, req.deck.cards);
  if (!check.ok) {await done("ungrounded"); throw new Closed("The AI's answer named a card that is not in this deck, so it is not shown.", 502);}
  await done("ok");
  return {explanation, cards: check.named, model: spend.model, meter: meter(spend.micros)};
}

/* THE COACH (X13; AI-1 in docs/plan-to-done-2026-09-30.md). A person at a table asks; the Worker has the table build
 * that person's brief (game/room/coach-brief.mjs: their hand, the public board, their deck as a list -- never another
 * hand or a library's order), and the Coach answers through the same door, on the same caps and log, as `coach`.
 *
 *   Brevity (Rob, 2026-10-09): the instruction is the control -- "very concise 1-3 sentences and aim for no more than 1
 *   sentence" -- and nothing measures the answer afterward. COACH_MAX_TOKENS is a cost ceiling only, well above three
 *   sentences and the schema, so it never cuts an answer.
 *   Grounding: every card the answer names, every play's card, every id it would highlight and the seat it calls the
 *   threat must be in the brief. An answer that names anything else is not shown, and is logged as ungrounded.
 */
export const COACH_MAX_TOKENS = 1200;
const QUESTION_MAX = 300;
const TABLE_ID = /^[a-z0-9]{8,40}$/;
export const COACH_SYSTEM = [
  "You are the CrankMagic Coach, beside a person playing a game of Commander.",
  "The user message holds the game as that person may see it, as JSON: their hand and what each card can do now, every public zone, the stack, the step, recent history and their deck as a list; then their question.",
  "You do not see any other player's hand or the order of any library, and you never guess at them.",
  "Answer in very concise sentences: one to three at most, and aim for one. No preamble, no restating the question, no lists. Each play's why is one short sentence.",
  "Name only cards and players in the game you are given, and write every card name in the answer inside double square brackets, like [[Sol Ring]].",
  "You advise and never act: suggest plays the person can make with what they have now.",
  "In show, put the ids of the cards your answer is about, from the ids you are given only. Give a threat only when one player is clearly the danger.",
  "Do not quote prices.",
].join(" ");
const COACH_SCHEMA = {
  type: "object",
  properties: {
    answer: {type: "string"},
    plays: {type: "array", items: {type: "object", properties: {card: {type: "string"}, action: {type: "string"}, why: {type: "string"}}, required: ["card", "action", "why"], additionalProperties: false}},
    threat: {type: "object", properties: {seat: {type: "string"}, why: {type: "string"}}, required: ["seat", "why"], additionalProperties: false},
    show: {type: "array", items: {type: "integer"}},
  },
  required: ["answer", "plays", "show"],
  additionalProperties: false,
};

/** The question, bounded: which table, and what is asked. */
export function readQuestion(input) {
  const tableId = typeof input?.tableId === "string" ? input.tableId : "";
  if (!TABLE_ID.test(tableId)) throw new Closed("Ask the Coach from a table.", 400);
  const question = typeof input?.question === "string" ? input.question.trim() : "";
  if (!question) throw new Closed("Ask the Coach a question.", 400);
  if (question.length > QUESTION_MAX) throw new Closed(`A question for the Coach is at most ${QUESTION_MAX} characters.`, 400);
  return {tableId, question};
}

export function coachBody(brief, question, model) {
  return {
    model, max_tokens: COACH_MAX_TOKENS, system: COACH_SYSTEM,
    output_config: {effort: "low", format: {type: "json_schema", schema: COACH_SCHEMA}},
    messages: [{role: "user", content: JSON.stringify({game: brief, question})}],
  };
}

/** What an answer may name: every card the brief carries (by id and by name, the deck list's names included) and every seat. */
export function briefFacts(brief) {
  const ids = new Set(), names = new Set(), seats = new Set((brief.players ?? []).map((p) => p.name));
  const add = (c) => {if (c && c.name) {if (Number.isInteger(c.id)) ids.add(c.id); names.add(String(c.name).toLowerCase());}};
  for (const p of brief.players ?? []) for (const zone of ["battlefield", "graveyard", "exile", "command"]) for (const c of p[zone] ?? []) add(c);
  for (const c of brief.hand ?? []) add(c);
  for (const e of brief.stack ?? []) add(e);
  for (const line of brief.deck?.cards ?? []) names.add(String(line).replace(/^\d+ /, "").toLowerCase());
  return {ids, names, seats};
}

/** Every name, play, id and seat an answer uses, checked against the brief. */
export function coachGrounded(answer, facts) {
  const strangers = [];
  for (const m of String(answer.answer ?? "").matchAll(/\[\[([^\]]{1,200})\]\]/g)) if (!facts.names.has(m[1].trim().toLowerCase())) strangers.push(m[1].trim());
  for (const p of answer.plays ?? []) {const card = String(p.card ?? "").replace(/^\[\[|\]\]$/g, "").trim(); if (!facts.names.has(card.toLowerCase())) strangers.push(card);}
  for (const id of answer.show ?? []) if (!facts.ids.has(id)) strangers.push(`card #${id}`);
  if (answer.threat && !facts.seats.has(answer.threat.seat)) strangers.push(`seat ${answer.threat.seat}`);
  return {ok: strangers.length === 0, strangers};
}

/* Ask the Coach: through the door, then grounded in the brief. `who` has passed Access and the allowlist; `brief` is the
   table's own, for that person's seat. */
export async function coach({ai, who, brief, question, config, fetchImpl = fetch}) {
  const {answer, spend, done, meter} = await ask({ai, who, feature: "coach", body: coachBody(brief, question, config.model), maxTokens: COACH_MAX_TOKENS, config, fetchImpl,
    declined: "The Coach declined to answer that one."});
  const text = String(answer.answer ?? "").trim();
  if (!text) {await done("error"); throw new Closed("The Coach's answer came back incomplete, so it is not shown.", 502);}
  const check = coachGrounded(answer, briefFacts(brief));
  if (!check.ok) {await done("ungrounded"); throw new Closed("The Coach's answer named something that is not on your table or in your deck, so it is not shown.", 502);}
  await done("ok");
  const plays = (answer.plays ?? []).map((p) => ({card: String(p.card).replace(/^\[\[|\]\]$/g, "").trim(), action: String(p.action ?? "").trim(), why: String(p.why ?? "").trim()}));
  return {answer: text, plays, ...(answer.threat ? {threat: {seat: answer.threat.seat, why: String(answer.threat.why ?? "").trim()}} : {}), show: answer.show ?? [], model: spend.model, meter: meter(spend.micros)};
}
