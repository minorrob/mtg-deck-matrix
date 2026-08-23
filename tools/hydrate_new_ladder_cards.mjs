#!/usr/bin/env node
// Hydrate the new tuned2/enhance2/max2/funTuned/funMax/altTuned/altMax items with
// manaCost/typeLine/oracleText/keywords/colorIdentity/image/tcgplayerUrl/commanderLegal.
//
// Deliberately narrower than tools/audit-cards.mjs + tools/apply-card-audit.mjs: those two
// are global maintenance tools that re-fetch and refresh EVERY card referenced anywhere in
// data/buy-plans.json, across all 30 variants -- exactly what you want for a periodic full
// refresh, but not what this import needs. Running them for this import surfaced dozens of
// pre-existing, unrelated items (across variants this feature never touches) whose market
// price has drifted past a ceiling someone set earlier; that's real information, but it's
// an orthogonal, whole-app maintenance concern, not something this feature should силently
// fold in as a side effect. This script only ever touches the seven new categories: it
// fetches Scryfall data for names not already in data/cards.json (expected: the 41 names
// newly introduced by the win/fun/alt ladders), merges them in additively, and hydrates
// only items in those seven categories -- every existing category, every other variant, and
// every existing cards.json entry is left exactly as it was. It also deliberately leaves
// `price` as tools/import_budget_plan.py set it (the workbook's own Prices-sheet snapshot,
// the figure the workbook's cost totals were built from) rather than overwriting it with a
// possibly-different live Scryfall price.

import { readFile, writeFile } from "node:fs/promises";

const CARDS_PATH = new URL("../data/cards.json", import.meta.url);
const PLANS_PATH = new URL("../data/buy-plans.json", import.meta.url);
const NEW_CATEGORIES = ["tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];

const cardsDoc = JSON.parse(await readFile(CARDS_PATH, "utf8"));
const plansDoc = JSON.parse(await readFile(PLANS_PATH, "utf8"));

const byName = new Map(cardsDoc.cards.map((card) => [card.name.toLocaleLowerCase(), card]));
for (const card of cardsDoc.cards) for (const face of card.name.split(" // ")) byName.set(face.toLocaleLowerCase(), card);

const newCategoryNames = new Map(); // lowercase -> canonical display name
for (const plan of Object.values(plansDoc.plans)) {
  for (const category of NEW_CATEGORIES) {
    for (const item of plan[category] || []) {
      if (item.name) newCategoryNames.set(item.name.toLocaleLowerCase(), item.name);
    }
  }
}

const namesToFetch = [...newCategoryNames.values()].filter((name) => !byName.has(name.toLocaleLowerCase())).sort((a, b) => a.localeCompare(b));
console.log(`${newCategoryNames.size} distinct names across the new categories; ${namesToFetch.length} not already in cards.json.`);

const fetched = [];
const missing = [];
for (let i = 0; i < namesToFetch.length; i += 70) {
  const chunk = namesToFetch.slice(i, i + 70);
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "mtg-deck-matrix-audit/1.0" },
    body: JSON.stringify({ identifiers: chunk.map((name) => ({ name: name.split(" // ")[0] })) })
  });
  if (!response.ok) throw new Error(`Scryfall request failed: ${response.status}`);
  const result = await response.json();
  for (const card of result.data || []) {
    const oracleText = card.oracle_text || card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join("\n") || "";
    const image = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || "";
    fetched.push({
      name: card.name,
      manaCost: card.mana_cost || card.card_faces?.map((face) => face.mana_cost).filter(Boolean).join(" // ") || "",
      typeLine: card.type_line,
      oracleText,
      keywords: card.keywords || [],
      colorIdentity: card.color_identity || [],
      legalities: card.legalities || {},
      rarity: card.rarity,
      setName: card.set_name,
      setCode: card.set,
      image,
      price: Number(card.prices?.usd || card.prices?.usd_foil) || null,
      priceUpdated: new Date().toISOString().slice(0, 10),
      tcgplayerUrl: card.purchase_uris?.tcgplayer || `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`
    });
  }
  missing.push(...(result.not_found || []).map((entry) => entry.name));
  await new Promise((resolve) => setTimeout(resolve, 120));
}

if (missing.length) {
  console.error("Could not resolve on Scryfall (stopping without writing anything):", missing);
  process.exit(1);
}

fetched.sort((a, b) => a.name.localeCompare(b.name));
cardsDoc.cards.push(...fetched);
cardsDoc.cards.sort((a, b) => a.name.localeCompare(b.name));
for (const card of fetched) {
  byName.set(card.name.toLocaleLowerCase(), card);
  for (const face of card.name.split(" // ")) byName.set(face.toLocaleLowerCase(), card);
}
await writeFile(CARDS_PATH, `${JSON.stringify(cardsDoc, null, 2)}\n`);
console.log(`Added ${fetched.length} new entries to data/cards.json (${cardsDoc.cards.length} total).`);

let hydrated = 0;
const unresolved = [];
for (const plan of Object.values(plansDoc.plans)) {
  for (const category of NEW_CATEGORIES) {
    for (const item of plan[category] || []) {
      const data = byName.get(item.name.toLocaleLowerCase());
      if (!data) { unresolved.push(item.name); continue; }
      item.manaCost = data.manaCost;
      item.typeLine = data.typeLine;
      item.oracleText = data.oracleText;
      item.keywords = data.keywords;
      item.colorIdentity = data.colorIdentity;
      item.image = data.image;
      item.tcgplayerUrl = data.tcgplayerUrl;
      item.commanderLegal = data.legalities?.commander === "legal";
      hydrated++;
    }
  }
}
await writeFile(PLANS_PATH, `${JSON.stringify(plansDoc, null, 2)}\n`);
console.log(`Hydrated ${hydrated} new-category items across all plans.`);
if (unresolved.length) console.log("Could not hydrate (name not found even after fetch):", [...new Set(unresolved)]);
