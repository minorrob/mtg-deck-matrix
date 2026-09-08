/* A Playwright harness that lets the app behave exactly as it does on the open web,
   in a sandbox with no egress. Scryfall is answered from data/cards.json (which was
   itself built from Scryfall) and card images from a 1x1 pixel; a name the catalog
   does not hold gets Scryfall's real 404 body, so the app's not-found path is the
   genuine one and not a stub of my own invention. */
import {readFileSync} from "node:fs";

const CARDS = JSON.parse(readFileSync("/home/user/mtg-deck-matrix/data/cards.json", "utf8")).cards;
const NOT_FOUND = readFileSync("/home/user/mtg-deck-matrix/tests/fixtures/scryfall-flavor-name.json", "utf8");
const byName = new Map(CARDS.map(c => [c.name.toLowerCase(), c]));
// Scryfall's named?exact= matches flavor names too -- that is how "Splinter, Vengeful
// Sensei" resolves to Ink-Eyes, Servant of Oni. The stub must do the same or it would
// fake a failure the real API does not produce.
for (const c of CARDS) if (c.flavorName) byName.set(c.flavorName.toLowerCase(), c);
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// data/cards.json shape -> Scryfall card shape, only the fields the app reads.
function scryfall(c) {
  return {
    object: "card", id: "local-" + encodeURIComponent(c.name), oracle_id: "oracle-" + encodeURIComponent(c.name),
    name: c.name, mana_cost: c.manaCost || "", type_line: c.typeLine || "", oracle_text: c.oracleText || "",
    keywords: c.keywords || [], color_identity: c.colorIdentity || [], colors: c.colorIdentity || [],
    power: c.power, toughness: c.toughness, cmc: 0, rarity: c.rarity || "common",
    set: (c.setCode || "").toLowerCase(), set_name: c.setName || "", collector_number: "1",
    legalities: c.legalities || {}, prices: {usd: String(c.price ?? 0)},
    image_uris: {small: c.image, normal: c.image, large: c.image},
    purchase_uris: {tcgplayer: c.tcgplayerUrl || ""}, scryfall_uri: "https://scryfall.com/", layout: "normal",
    game_changer: Boolean(c.gameChanger)
  };
}

export async function stubNetwork(page, log = []) {
  await page.route("**://api.scryfall.com/**", async route => {
    const url = new URL(route.request().url());
    log.push(url.pathname + url.search);
    if (url.pathname === "/cards/named") {
      const want = (url.searchParams.get("exact") || url.searchParams.get("fuzzy") || "").toLowerCase();
      const hit = byName.get(want);
      if (!hit) return route.fulfill({status: 404, contentType: "application/json", body: NOT_FOUND});
      return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(scryfall(hit))});
    }
    if (url.pathname === "/cards/collection") {
      const ids = JSON.parse(route.request().postData() || "{}").identifiers || [];
      const data = [], not_found = [];
      for (const id of ids) {
        const hit = byName.get(String(id.name || "").toLowerCase());
        hit ? data.push(scryfall(hit)) : not_found.push(id);
      }
      return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({object:"list", data, not_found})});
    }
    if (url.pathname === "/cards/autocomplete") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const hits = CARDS.filter(c => c.name.toLowerCase().includes(q)).slice(0, 20).map(c => c.name);
      return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({object:"catalog", data: hits})});
    }
    if (url.pathname === "/cards/search") {
      const q = (url.searchParams.get("q") || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
      const hits = CARDS.filter(c => c.name.toLowerCase().includes(q)).slice(0, 20).map(scryfall);
      return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({object:"list", data: hits, total_cards: hits.length})});
    }
    return route.fulfill({status: 404, contentType: "application/json", body: NOT_FOUND});
  });
  await page.route("**://cards.scryfall.io/**", r => r.fulfill({status:200, contentType:"image/png", body: PIXEL}));
  await page.route("**://svgs.scryfall.io/**", r => r.fulfill({status:200, contentType:"image/svg+xml", body:"<svg xmlns='http://www.w3.org/2000/svg'/>"}));
  await page.route("**://json.edhrec.com/**", r => r.fulfill({status:200, contentType:"application/json", body:"{}"}));
  return log;
}
