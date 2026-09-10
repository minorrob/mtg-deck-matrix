// Re-read data/cards.json from Scryfall: current prices, current legality, same cards.
//
//   node tools/refresh-cards.mjs
//
// WHY THIS IS NOT audit-cards.mjs. That tool builds the file from data/buy-plans.json --
// the shopping plans for the six reference decks, which were archived when the app moved
// to a clean start. It answers "what do these plans need?", and there are no plans now.
// This answers the question the shipped app actually has: the 2,000-odd cards already in
// the file are the ones every deck, test and picker leans on, and their PRICES and their
// LEGALITY are the two facts that go stale on their own. The set of names does not change;
// what is true about them does.
//
// THE ONE RULE. A card whose lookup fails keeps every value it had, and its name is
// printed at the end. A missing field and a wrong one look identical in JSON, and the
// difference is sometimes a whole bracket.

import {readFile, writeFile} from "node:fs/promises";

const FILE = new URL("../data/cards.json", import.meta.url);
const BATCH = 75;
const SPACING_MS = 120;                     // Scryfall asks for 50-100ms; 120 is polite.
const UA = {
  "User-Agent": "MtgDeckMatrix/1.0 (+https://github.com/minorrob/mtg-deck-matrix)",
  Accept: "application/json"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collection(identifiers) {
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {...UA, "Content-Type": "application/json"},
    body: JSON.stringify({identifiers})
  });
  if (!response.ok) throw new Error(`Scryfall responded ${response.status}`);
  return response.json();
}

/* The shape data/cards.json has held since it was first baked. Anything Scryfall does not
   answer for keeps the row it already had, untouched. */
function rowFrom(raw, prior) {
  const faces = raw.card_faces || [];
  const face = faces[0] || {};
  const prices = raw.prices || {};
  const usd = Number(prices.usd) || Number(prices.usd_etched) || Number(prices.usd_foil) || 0;
  const image = raw.image_uris?.normal || face.image_uris?.normal || prior.image || "";
  const {gameChanger: _wasGameChanger, ...carried} = prior;
  return {
    ...carried,
    name: raw.name,
    typeLine: raw.type_line || face.type_line || prior.typeLine || "",
    /* BOTH FACES, JOINED. A two-faced card has no oracle_text of its own -- the rules live
       on card_faces -- and taking only the front silently drops half of what the classifier
       reads, which turns a ramp creature into a plain one. The file has always stored both,
       separated the way Scryfall separates the name. */
    oracleText: raw.oracle_text ?? faces.map((f) => f.oracle_text).filter(Boolean).join(" // ") ?? prior.oracleText ?? "",
    manaCost: raw.mana_cost ?? face.mana_cost ?? prior.manaCost ?? "",
    colorIdentity: raw.color_identity || prior.colorIdentity || [],
    keywords: raw.keywords || prior.keywords || [],
    legalities: raw.legalities || prior.legalities || {},
    power: raw.power ?? face.power ?? prior.power ?? null,
    toughness: raw.toughness ?? face.toughness ?? prior.toughness ?? null,
    rarity: raw.rarity || prior.rarity || "",
    setCode: raw.set || prior.setCode || "",
    setName: raw.set_name || prior.setName || "",
    image,
    tcgplayerUrl: raw.purchase_uris?.tcgplayer || prior.tcgplayerUrl || "",
    // A price of zero is Scryfall saying it does not know, not saying the card is free.
    price: usd > 0 ? usd : (prior.price ?? 0),
    priceUpdated: usd > 0 ? new Date().toISOString().slice(0, 10) : prior.priceUpdated,
    // Written only when true, the way the file has always carried it: the readers all ask
    // Boolean(gameChanger), and 2,000 explicit falses is 50 KB every visitor downloads.
    ...(raw.game_changer ? {gameChanger: true} : {})
  };
}

const file = JSON.parse(await readFile(FILE, "utf8"));
const prior = new Map(file.cards.map((c) => [c.name.toLowerCase(), c]));
const names = file.cards.map((c) => c.name);
console.log(`refreshing ${names.length} cards from Scryfall…`);

const fresh = new Map();
let unreachable = [];

/* One pass over a list of names, resolving each answer back to the row it came from.
   `sentFor` maps the name we asked about to the name the file stores, because the two
   differ for a two-faced card asked about by its front face. */
async function pass(list, sentFor) {
  const missed = [];
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    try {
      const data = await collection(batch.map((name) => ({name})));
      for (const raw of data.data || []) {
        const answered = [raw.name, raw.name.split(" // ")[0], ...(raw.card_faces || []).map((f) => f.name)];
        const storedName = answered.map((n) => sentFor.get(n.toLowerCase())).find(Boolean);
        const was = storedName ? prior.get(storedName.toLowerCase()) : null;
        if (was) fresh.set(was.name.toLowerCase(), rowFrom(raw, was));
      }
      for (const miss of data.not_found || []) missed.push(miss.name || JSON.stringify(miss));
    } catch (error) {
      missed.push(...batch);
      console.warn(`  a batch failed (${error.message}) — those rows keep their prior values`);
    }
    process.stdout.write(`\r  ${Math.min(list.length, i + BATCH)} / ${list.length}`);
    await sleep(SPACING_MS);
  }
  process.stdout.write("\n");
  return missed;
}

const asked = new Map(names.map((n) => [n.toLowerCase(), n]));
unreachable = await pass(names, asked);

/* A CARD WITH TWO FACES IS FILED UNDER BOTH OF THEM. data/cards.json stores the full
   "Front // Back" name; Scryfall's collection lookup wants one face. Forty rows came back
   not-found on the first pass for exactly that reason, and forty rows that never refresh
   are forty legality records that quietly stop being true. Ask again by front face. */
const secondTry = unreachable.filter((n) => n.includes(" // "));
if (secondTry.length) {
  console.log(`asking again by front face for ${secondTry.length} two-faced cards…`);
  const byFace = new Map(secondTry.map((n) => [n.split(" // ")[0].toLowerCase(), n]));
  const stillMissing = await pass([...byFace.values()].map((n) => n.split(" // ")[0]), byFace);
  unreachable = unreachable.filter((n) => !n.includes(" // ")).concat(stillMissing);
}

const cards = file.cards.map((c) => fresh.get(c.name.toLowerCase()) || c);
let priceMoved = 0, legalityMoved = 0;
for (const c of cards) {
  const was = prior.get(c.name.toLowerCase());
  if (!was) continue;
  if ((was.price ?? 0) !== (c.price ?? 0)) priceMoved += 1;
  if (JSON.stringify(was.legalities || {}) !== JSON.stringify(c.legalities || {})) legalityMoved += 1;
}
const banned = cards.filter((c) => c.legalities?.commander && c.legalities.commander !== "legal");

await writeFile(FILE, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "Scryfall collection API",
  cards,
  missing: unreachable
}, null, 1) + "\n");   // one space, as the file has always been indented -- two adds 600 KB

console.log(`wrote data/cards.json — ${cards.length} cards, ${priceMoved} prices moved, ${legalityMoved} legality records changed`);
if (banned.length) console.log(`  not Commander-legal: ${banned.map((c) => c.name).join(", ")}`);
if (unreachable.length) console.log(`  kept prior values for ${unreachable.length}: ${unreachable.slice(0, 10).join(", ")}${unreachable.length > 10 ? "…" : ""}`);
