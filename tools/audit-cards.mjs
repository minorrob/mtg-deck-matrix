import {readFile, writeFile} from "node:fs/promises";

const file = new URL("../data/buy-plans.json", import.meta.url);
const catalog = JSON.parse(await readFile(file, "utf8"));
const floorPriceFallbacks = new Map([
  ["swiftfoot boots", 0.75]
]);
const cards = new Map();
for (const plan of Object.values(catalog.plans)) {
  for (const card of [...(plan.startingShell || []), ...(plan.required || []), ...(plan.enhance || []), ...(plan.max || [])]) {
    if (!card.isFlexibleSlot && card.name) cards.set(card.name.toLocaleLowerCase(), card.name);
  }
}
for (const card of catalog.salvage || []) if (card.name) cards.set(card.name.toLocaleLowerCase(), card.name);

const names = [...cards.values()].sort((a, b) => a.localeCompare(b));
const records = [];
const missing = [];
for (let i = 0; i < names.length; i += 70) {
  const chunk = names.slice(i, i + 70);
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {"content-type": "application/json", "user-agent": "mtg-deck-matrix-audit/1.0"},
    body: JSON.stringify({identifiers: chunk.map((name) => ({name: name.split(" // ")[0]}))})
  });
  if (!response.ok) throw new Error(`Scryfall request failed: ${response.status}`);
  const result = await response.json();
  for (const card of result.data || []) {
    const oracleText = card.oracle_text || card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join("\n") || "";
    const image = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || "";
    const usd = Number(card.prices?.usd || card.prices?.usd_foil) || floorPriceFallbacks.get(card.name.toLocaleLowerCase()) || null;
    records.push({
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
      price: usd,
      priceUpdated: new Date().toISOString().slice(0, 10),
      tcgplayerUrl: card.purchase_uris?.tcgplayer || `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`
    });
  }
  missing.push(...(result.not_found || []).map((entry) => entry.name));
  await new Promise((resolve) => setTimeout(resolve, 120));
}

records.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(new URL("../data/cards.json", import.meta.url), `${JSON.stringify({generatedAt: new Date().toISOString(), source: "Scryfall collection API", cards: records, missing}, null, 2)}\n`);
console.log(JSON.stringify({requested: names.length, found: records.length, missing}, null, 2));
