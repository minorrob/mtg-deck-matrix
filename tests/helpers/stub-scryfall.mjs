/* A stand-in Scryfall, shared by every test that drives the deck generator.
 *
 * It answers enough of the query grammar for the generator to build a real
 * hundred: boolean groups, `id<=`, `type:`, `otag:` for two tags so both the
 * tagged path and the oracle-text fallback get exercised, plus named,
 * collection and the TCGplayer product endpoint.
 *
 * Lifted out of tests/deck-generator.mjs unchanged when tests/deck-build.mjs
 * needed the same generator output to map from -- two tests wanting the same
 * fixture is exactly what a helper is for, and a second copy would drift.
 */
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Scryfall = require("../../scryfall-client.js");

// ---------------------------------------------------------------------------
// A stand-in Scryfall: enough of the query grammar to answer everything the
// generator asks, and nothing more. `otag:` only knows two tags so the pool
// fetch exercises both the tagged path and the oracle-text fallback in one run.
// ---------------------------------------------------------------------------
const KNOWN_TAGS = {
  ramp: (card) => /Add \{|search your library for a basic land/i.test(card.oracle_text || ""),
  removal: (card) => /destroy target|exile target/i.test(card.oracle_text || "")
};

function splitTop(text) {
  const chunks = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (char === "(" && !quoted) depth += 1;
    if (char === ")" && !quoted) depth -= 1;
    if (char === " " && !quoted && depth === 0) {
      if (current) chunks.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseQuery(text) {
  const chunks = splitTop(text.trim());
  const groups = [[]];
  chunks.forEach((chunk) => {
    if (chunk.toLowerCase() === "or") groups.push([]);
    else groups[groups.length - 1].push(chunk);
  });
  if (groups.length > 1) return {op: "or", parts: groups.map((group) => ({op: "and", parts: group.map(parseTerm)}))};
  return {op: "and", parts: groups[0].map(parseTerm)};
}

function parseTerm(chunk) {
  let text = chunk;
  let negate = false;
  if (text.startsWith("-")) {
    negate = true;
    text = text.slice(1);
  }
  if (text.startsWith("(") && text.endsWith(")")) return {op: "group", negate, node: parseQuery(text.slice(1, -1))};
  return {op: "term", negate, text};
}

function matchTerm(card, text) {
  const lower = text.toLowerCase();
  const value = (prefix) => text.slice(prefix.length).replace(/^"|"$/g, "").toLowerCase();
  if (lower === "legal:commander") return (card.legalities?.commander || "legal") === "legal";
  if (lower === "is:commander") return /legendary creature/i.test(card.type_line);
  if (lower.startsWith("id<=")) {
    const allowed = new Set(value("id<=").toUpperCase().split(""));
    return (card.color_identity || []).every((color) => allowed.has(color));
  }
  if (lower.startsWith("otag:")) {
    const tag = value("otag:");
    return KNOWN_TAGS[tag] ? KNOWN_TAGS[tag](card) : false;
  }
  if (lower.startsWith("oracle:") || lower.startsWith("o:")) {
    const needle = lower.startsWith("oracle:") ? value("oracle:") : value("o:");
    return String(card.oracle_text || "").toLowerCase().includes(needle);
  }
  if (lower.startsWith("type:") || lower.startsWith("t:")) {
    const needle = lower.startsWith("type:") ? value("type:") : value("t:");
    return String(card.type_line || "").toLowerCase().includes(needle);
  }
  if (lower.startsWith("set:")) return String(card.set || "").toLowerCase() === value("set:");
  const comparison = /^(cmc|mv|power|toughness|usd)(>=|<=|>|<|=)(\d+(?:\.\d+)?)$/.exec(lower);
  if (comparison) {
    const [, field, operator, rawValue] = comparison;
    const actual = field === "usd" ? Number(card.prices?.usd || 0) : field === "cmc" || field === "mv" ? Number(card.cmc || 0) : Number(card[field] || 0);
    const expected = Number(rawValue);
    if (operator === ">=") return actual >= expected;
    if (operator === "<=") return actual <= expected;
    if (operator === ">") return actual > expected;
    if (operator === "<") return actual < expected;
    return actual === expected;
  }
  return false;
}

function evaluateNode(node, card) {
  if (node.op === "or") return node.parts.some((part) => evaluateNode(part, card));
  if (node.op === "and") return node.parts.every((part) => evaluateNode(part, card));
  const result = node.op === "group" ? evaluateNode(node.node, card) : matchTerm(card, node.text);
  return node.negate ? !result : result;
}

function makeScryfallStub(cards) {
  const calls = [];
  const byName = new Map(cards.map((card) => [card.name.toLowerCase(), card]));
  const byProduct = new Map(cards.map((card) => [Number(card.tcgplayer_id), card]));
  const respond = (status, data) => ({ok: status < 400, status, json: async () => data});
  async function fetchImpl(url, init = {}) {
    calls.push({url, method: init.method || "GET"});
    const parsed = new URL(url);
    if (parsed.pathname === "/cards/search") {
      const query = parsed.searchParams.get("q") || "";
      const page = Number(parsed.searchParams.get("page") || 1);
      const node = parseQuery(query);
      const matched = cards.filter((card) => evaluateNode(node, card)).sort((a, b) => (a.edhrec_rank || 99999) - (b.edhrec_rank || 99999));
      const slice = matched.slice((page - 1) * 175, page * 175);
      if (!slice.length) return respond(404, {object: "error", status: 404, details: "No cards found"});
      return respond(200, {object: "list", total_cards: matched.length, has_more: matched.length > page * 175, data: slice});
    }
    if (parsed.pathname === "/cards/named") {
      const wanted = (parsed.searchParams.get("exact") || parsed.searchParams.get("fuzzy") || "").toLowerCase();
      const exact = byName.get(wanted);
      const fuzzy = exact || cards.find((card) => card.name.toLowerCase().includes(wanted)) || null;
      return fuzzy ? respond(200, fuzzy) : respond(404, {object: "error", status: 404});
    }
    if (parsed.pathname.startsWith("/cards/tcgplayer/")) {
      const card = byProduct.get(Number(parsed.pathname.split("/").pop()));
      return card ? respond(200, card) : respond(404, {object: "error", status: 404});
    }
    if (parsed.pathname === "/cards/collection") {
      const identifiers = JSON.parse(init.body || "{}").identifiers || [];
      const found = identifiers.map((entry) => byName.get(String(entry.name || "").toLowerCase())).filter(Boolean);
      const missing = identifiers.filter((entry) => !byName.get(String(entry.name || "").toLowerCase()));
      return respond(200, {object: "list", data: found, not_found: missing});
    }
    return respond(404, {object: "error", status: 404});
  }
  return {fetchImpl, calls};
}

function makeClient(cards) {
  const stub = makeScryfallStub(cards);
  let clock = 0;
  const client = Scryfall.createClient({
    fetchImpl: stub.fetchImpl,
    delayMs: 0,
    cache: (() => {
      const store = new Map();
      return {get: (key) => (store.has(key) ? store.get(key) : null), set: (key, value) => void store.set(key, value)};
    })(),
    now: () => (clock += 1),
    sleep: async () => undefined
  });
  return {client, calls: stub.calls};
}

export {makeScryfallStub, makeClient, parseQuery, evaluateNode};
