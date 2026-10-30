/* THE OWNER'S AI MODEL (ROB-338; docs/program/admin-pane-contract.md; migration 0011_ai_settings.sql).
 *
 * Rob, 2026-10-30: "I would like to be able to change the model based on the models available to us from the API in the admin
 * pane." Which Claude model the AI door calls is, in order: the owner's stored choice (a row in ai_settings), else the AI_MODEL
 * variable, else the default (cloud/ai.mjs `settings`). It is read at each call, so a change is the next call's model, and it is
 * stored, so a restart keeps it. The change keeps what it replaced, one press away (`undo`).
 *
 * THE LIST COMES FROM ANTHROPIC (GET /v1/models, the Worker's own key): what this key can actually use. It is not the allow-list.
 * Rob's rule of 2026-10-09 ("We will always be using sonnet or other lowest cost models") is cloud/ai.mjs MODELS, and a model
 * may be chosen only if the API lists it AND MODELS allows it. The rest are shown, with why they cannot be chosen. A list that
 * does not load changes nothing: a model cannot be checked against it. NOTHING HERE IS VERIFIED AGAINST THE REAL API.
 *
 * The caller (cloud/worker.mjs) has already established that the person is the owner; nothing here asks who is asking.
 */
import {DEFAULT_MODEL, MODELS, Closed} from "./ai.mjs";

const MODELS_API = "https://api.anthropic.com/v1/models";
const VERSION = "2023-06-01";
const PAGES = 5, PAGE_SIZE = 1000, TIMEOUT_MS = 15000;
const missing = (error) => /no such table/i.test(String(error && error.message));
const NOTHING = " Nothing was changed.";

/** The owner's stored model, or null: no database, no row, or a database where migration 0011 is not applied yet. */
export async function storedModel(db) {
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT value FROM ai_settings WHERE key = 'model'").first();
    return row && typeof row.value === "string" && row.value ? row.value : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/** The models the API reports for this key: `{models: [{id, name}]}`, or `{models: [], error, status}` saying why not. */
export async function listModels(env, fetchImpl = fetch) {
  if (!env.ANTHROPIC_API_KEY) return {models: [], error: "AI features are not switched on here yet: there is no key to ask the API with.", status: 503};
  const found = [], seen = new Set();
  let after = "";
  for (let page = 0; page < PAGES; page += 1) {
    let response, json = null;
    try {
      response = await fetchImpl(`${MODELS_API}?limit=${PAGE_SIZE}${after ? `&after_id=${encodeURIComponent(after)}` : ""}`,
        {method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS), headers: {"x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": VERSION}});
      json = response.ok ? await response.json().catch(() => null) : null;
    } catch {response = null;}
    /* The provider's own error text is not passed on: it is not the reader's, and it can name account details. */
    if (!response || !response.ok || !json || !Array.isArray(json.data)) return {models: [], error: "The list of models could not be loaded from the API.", status: 502};
    for (const m of json.data) {
      if (!m || typeof m.id !== "string" || !m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      found.push({id: m.id, name: typeof m.display_name === "string" && m.display_name ? m.display_name : m.id});
    }
    if (!json.has_more || !json.last_id) break;
    after = String(json.last_id);
  }
  return {models: found};
}

const english = (ids) => ids.length === 2 ? ids.join(" and ") : ids.join(", ");

/**
 * @param {object} env  the Worker's environment (ANTHROPIC_API_KEY, AI_MODEL, DB)
 * @param {{now?: () => string, fetchImpl?: typeof fetch}} deps
 */
export function modelAdmin(env, {now = () => new Date().toISOString(), fetchImpl = fetch} = {}) {
  const db = env.DB;
  /* The row, or null; `table` false where migration 0011 is not applied. */
  async function row() {
    if (!db) return {table: false, row: null};
    try {
      return {table: true, row: await db.prepare("SELECT value, previous, updated_at AS updatedAt FROM ai_settings WHERE key = 'model'").first()};
    } catch (error) {
      if (missing(error)) return {table: false, row: null};
      throw error;
    }
  }
  const inForce = (stored) => stored ? {id: stored.value, source: "stored"} : env.AI_MODEL ? {id: String(env.AI_MODEL), source: "env"} : {id: DEFAULT_MODEL, source: "default"};

  /** What the pane shows. `list` is a list already read, so a change does not ask the API twice. */
  async function read(list = null) {
    const {table, row: stored} = await row();
    const found = list || await listModels(env, fetchImpl), model = inForce(stored);
    return {
      owner: true, model, previous: stored && stored.previous ? stored.previous : null, default: DEFAULT_MODEL,
      updatedAt: stored ? stored.updatedAt : null, storage: table ? "ready" : "missing",
      models: found.models.map((m) => MODELS.includes(m.id)
        ? {id: m.id, name: m.name, allowed: true, current: m.id === model.id}
        : {id: m.id, name: m.name, allowed: false, current: m.id === model.id,
          reason: `CrankMagic does not use this model: it is dearer than the models Rob allows (${english(MODELS)}).`}),
      ...(found.error ? {listError: found.error} : {}),
    };
  }

  const writable = async () => {
    const state = await row();
    if (!state.table) throw new Closed("Storing the model needs migration 0011 (ai_settings) applied to this database." + NOTHING, 503);
    return state.row;
  };
  const save = (value, previous, email) => db.prepare(
    "INSERT INTO ai_settings (key, value, previous, updated_at, updated_by) VALUES ('model', ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, previous = excluded.previous, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(value, previous, now(), String(email || "").trim().toLowerCase()).run();

  return {
    read,
    /** Choose the model. Throws Closed, saying what is wrong and what to do; changes nothing then. */
    async set(model, email) {
      const wanted = typeof model === "string" ? model.trim() : "";
      if (!wanted) throw new Closed("Choose a model from the list." + NOTHING, 400);
      const stored = await writable();
      const list = await listModels(env, fetchImpl);
      if (list.error) throw new Closed(`${list.error}${NOTHING} Try again in a moment.`, list.status);
      if (!list.models.some((m) => m.id === wanted)) throw new Closed(`The models API does not list that model for this key.${NOTHING} Choose one of: ${english(list.models.filter((m) => MODELS.includes(m.id)).map((m) => m.id)) || "(none the API lists)"}.`, 422);
      if (!MODELS.includes(wanted)) throw new Closed(`CrankMagic does not use that model: it only uses ${english(MODELS)}, the lowest-cost models.${NOTHING} Choose one of those.`, 422);
      /* The stored model chosen again changes nothing, so the undo still goes back to what it was. The first choice stores the model,
         even one the environment already names, so it outlasts a change of the environment; what it replaced is the previous. */
      const current = inForce(stored);
      if (!(stored && current.id === wanted)) await save(wanted, current.id === wanted ? null : current.id, email);
      return read(list);
    },
    /** One press back to the model before the last change; pressing again puts that change back. */
    async undo(email) {
      const stored = await writable();
      if (!stored || !stored.previous) throw new Closed("There is nothing to undo: the model has not been changed here." + NOTHING, 409);
      if (!MODELS.includes(stored.previous)) throw new Closed(`The model before the last change (${stored.previous}) is not one CrankMagic uses now.${NOTHING} Choose one from the list.`, 422);
      await save(stored.previous, stored.value, email);
      return read();
    },
  };
}
