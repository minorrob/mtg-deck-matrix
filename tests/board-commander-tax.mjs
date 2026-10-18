/* COMMANDER TAX ON THE BOARD (ROB-29; crankmagic-board.js, the command zone).
 *
 * The board reads `commanderTax` from `CrankRoomView@1` (the engine field from ROB-12, on main). It highlights
 * only the commanders that are currently castable, and shows a small tax badge with the current tax. It never
 * decides for the player and never auto-casts. It renders only what the engine provides; the board doesn't
 * compute the tax.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

(async () => {
  console.log("Commander tax on the board");
  
  const {browser, base, close} = await openBrowser({name: "board-commander-tax", flag: "GEOMETRY_REQUIRED"});
  const boardCode = readFileSync(path.join(ROOT, "crankmagic-board.js"), "utf8");
  
  /* Test at desktop size. */
  let page = await browser.newPage({viewport: {width: 1280, height: 720}});
  await loadLiveState(page, base);
  await page.goto("about:blank");
  
  /* Load the board module and set up test helper. */
  await page.evaluate((code) => {
    const script = document.createElement("script");
    script.textContent = code;
    document.body.appendChild(script);
    
    /* Helper to render commandZone with fixture data. */
    globalThis.renderCommandZone = (fixture) => {
      globalThis.view = fixture.view;
      globalThis.sending = false;
      globalThis.picked = [];
      globalThis.selected = null;
      
      const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const optionsFor = (cardId) => (globalThis.view.decision ? globalThis.view.decision.options.filter((o) => o.cardId === cardId) : []);
      const verbFor = (o) => ({cast: "Cast", activate: "Activate"}[o.act] || o.act);
      const pictureOf = (n) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}&format=image&version=small`;
      const card = (c) => `<button type="button" class="cm-bcard" data-action="board-card" data-card="${c.cardId}"><span class="cm-bcard-name">${e(c.name)}</span></button>`;
      
      globalThis.e = e;
      globalThis.optionsFor = optionsFor;
      globalThis.verbFor = verbFor;
      globalThis.pictureOf = pictureOf;
      globalThis.card = card;
      
      eval(document.body.lastChild.textContent.match(/function commandZone\(zone\) \{[\s\S]+?^  \}/m)[0]);
      
      const zone = globalThis.view.state.players[0].zones.Command;
      const html = commandZone(zone);
      const container = document.createElement("div");
      container.innerHTML = html;
      container.id = "test-result";
      document.body.appendChild(container);
      return container;
    };
  }, boardCode);
  
  /* Case 1: Commander with tax = 0, castable (has mana, is main phase). */
  let result = await page.evaluate(() => {
    renderCommandZone({view: {
      schema: "CrankRoomView@1",
      seat: 0,
      decision: {kind: "priority", options: [{index: 0, act: "pass"}, {index: 1, act: "cast", cardId: 1001}]},
      state: {phase: "main1", players: [{playerId: 0, zones: {
        Command: {count: 1, cards: [{cardId: 1001, name: "Commander A", commander: true, commanderKey: "0:1001", commanderTax: 0, types: ["Creature"], power: 3, toughness: 3, controller: 0, owner: 0, counters: {}, damage: 0, tapped: false}]}
      }}]}
    }});
    
    const figure = document.querySelector("[data-zone='command']");
    const cardEl = figure.querySelector("[data-action='board-card']");
    const taxBadge = cardEl.querySelector(".cm-commander-tax");
    return {
      hasCard: !!cardEl,
      isBright: cardEl.classList.contains("is-bright"),
      hasTaxBadge: !!taxBadge,
      ariaLabel: cardEl.getAttribute("aria-label")
    };
  });
  
  ok(result.hasCard, "Commander card rendered");
  ok(result.isBright, "Commander with tax 0 is bright when castable");
  eq(result.hasTaxBadge, false, "No tax badge when tax is 0");
  ok(!result.ariaLabel.includes("commander tax"), "aria-label has no tax mention when tax is 0");
  
  /* Case 2: Commander with tax = 2, castable. */
  result = await page.evaluate(() => {
    document.getElementById("test-result")?.remove();
    renderCommandZone({view: {
      schema: "CrankRoomView@1",
      seat: 0,
      decision: {kind: "priority", options: [{index: 0, act: "pass"}, {index: 1, act: "cast", cardId: 1001}]},
      state: {phase: "main1", players: [{playerId: 0, zones: {
        Command: {count: 1, cards: [{cardId: 1001, name: "Commander A", commander: true, commanderKey: "0:1001", commanderTax: 2, types: ["Creature"], power: 3, toughness: 3, controller: 0, owner: 0, counters: {}, damage: 0, tapped: false}]}
      }}]}
    }});
    
    const figure = document.querySelector("[data-zone='command']");
    const cardEl = figure.querySelector("[data-action='board-card']");
    const taxBadge = cardEl.querySelector(".cm-commander-tax");
    return {
      hasCard: !!cardEl,
      isBright: cardEl.classList.contains("is-bright"),
      hasTaxBadge: !!taxBadge,
      taxText: taxBadge ? taxBadge.textContent : null,
      ariaLabel: cardEl.getAttribute("aria-label")
    };
  });
  
  ok(result.hasCard, "Commander card with tax rendered");
  ok(result.isBright, "Commander with tax 2 is bright when castable");
  ok(result.hasTaxBadge, "Tax badge present when tax = 2");
  eq(result.taxText, "{2}", "Tax badge shows {2}");
  ok(result.ariaLabel.includes("commander tax {2}"), "aria-label includes commander tax {2}");
  
  /* Case 3: Commander with tax = 4, not castable (no cast option). */
  result = await page.evaluate(() => {
    document.getElementById("test-result")?.remove();
    renderCommandZone({view: {
      schema: "CrankRoomView@1",
      seat: 0,
      decision: {kind: "priority", options: [{index: 0, act: "pass"}]},
      state: {phase: "main1", players: [{playerId: 0, zones: {
        Command: {count: 1, cards: [{cardId: 1001, name: "Commander A", commander: true, commanderKey: "0:1001", commanderTax: 4, types: ["Creature"], power: 3, toughness: 3, controller: 0, owner: 0, counters: {}, damage: 0, tapped: false}]}
      }}]}
    }});
    
    const figure = document.querySelector("[data-zone='command']");
    const cardEl = figure.querySelector("[data-action='board-card']");
    const taxBadge = cardEl.querySelector(".cm-commander-tax");
    return {
      hasCard: !!cardEl,
      isBright: cardEl.classList.contains("is-bright"),
      hasTaxBadge: !!taxBadge,
      taxText: taxBadge ? taxBadge.textContent : null,
      ariaLabel: cardEl.getAttribute("aria-label")
    };
  });
  
  ok(result.hasCard, "Commander with tax 4 rendered");
  eq(result.isBright, false, "Commander not bright when not castable");
  ok(result.hasTaxBadge, "Tax badge present when tax = 4");
  eq(result.taxText, "{4}", "Tax badge shows {4}");
  ok(result.ariaLabel.includes("commander tax {4}"), "aria-label includes commander tax {4}");
  
  /* Case 4: Partner commanders with different taxes and castability. */
  result = await page.evaluate(() => {
    document.getElementById("test-result")?.remove();
    renderCommandZone({view: {
      schema: "CrankRoomView@1",
      seat: 0,
      decision: {kind: "priority", options: [{index: 0, act: "pass"}, {index: 1, act: "cast", cardId: 1002}]},
      state: {phase: "main1", players: [{playerId: 0, zones: {
        Command: {count: 2, cards: [
          {cardId: 1001, name: "Partner A", commander: true, commanderKey: "0:1001", commanderTax: 2, types: ["Creature"], power: 2, toughness: 2, controller: 0, owner: 0, counters: {}, damage: 0, tapped: false},
          {cardId: 1002, name: "Partner B", commander: true, commanderKey: "0:1002", commanderTax: 4, types: ["Creature"], power: 3, toughness: 3, controller: 0, owner: 0, counters: {}, damage: 0, tapped: false}
        ]}
      }}]}
    }});
    
    const figure = document.querySelector("[data-zone='command']");
    const cards = figure.querySelectorAll("[data-action='board-card']");
    return {
      cardCount: cards.length,
      first: {
        isBright: cards[0].classList.contains("is-bright"),
        hasTaxBadge: !!cards[0].querySelector(".cm-commander-tax"),
        taxText: cards[0].querySelector(".cm-commander-tax")?.textContent,
        ariaLabel: cards[0].getAttribute("aria-label")
      },
      second: {
        isBright: cards[1].classList.contains("is-bright"),
        hasTaxBadge: !!cards[1].querySelector(".cm-commander-tax"),
        taxText: cards[1].querySelector(".cm-commander-tax")?.textContent,
        ariaLabel: cards[1].getAttribute("aria-label")
      }
    };
  });
  
  eq(result.cardCount, 2, "Both partners rendered");
  eq(result.first.isBright, false, "Partner A not castable");
  ok(result.first.hasTaxBadge, "Partner A has tax badge");
  eq(result.first.taxText, "{2}", "Partner A shows {2}");
  ok(result.first.ariaLabel.includes("commander tax {2}"), "Partner A aria-label has tax");
  ok(result.second.isBright, "Partner B is castable");
  ok(result.second.hasTaxBadge, "Partner B has tax badge");
  eq(result.second.taxText, "{4}", "Partner B shows {4}");
  ok(result.second.ariaLabel.includes("commander tax {4}"), "Partner B aria-label has tax");
  
  await shot(page, "commander-tax-desktop");
  await page.close();
  
  /* Case 5: Empty command zone. */
  page = await browser.newPage({viewport: {width: 390, height: 844}});
  await loadLiveState(page, base);
  await page.goto("about:blank");
  await page.evaluate((code) => {
    const script = document.createElement("script");
    script.textContent = code;
    document.body.appendChild(script);
    
    globalThis.renderCommandZone = (fixture) => {
      globalThis.view = fixture.view;
      globalThis.sending = false;
      globalThis.picked = [];
      globalThis.selected = null;
      
      const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const optionsFor = (cardId) => (globalThis.view.decision ? globalThis.view.decision.options.filter((o) => o.cardId === cardId) : []);
      const verbFor = (o) => ({cast: "Cast", activate: "Activate"}[o.act] || o.act);
      const pictureOf = (n) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}&format=image&version=small`;
      const card = (c) => `<button type="button" class="cm-bcard" data-action="board-card" data-card="${c.cardId}"><span class="cm-bcard-name">${e(c.name)}</span></button>`;
      
      globalThis.e = e;
      globalThis.optionsFor = optionsFor;
      globalThis.verbFor = verbFor;
      globalThis.pictureOf = pictureOf;
      globalThis.card = card;
      
      eval(document.body.lastChild.textContent.match(/function commandZone\(zone\) \{[\s\S]+?^  \}/m)[0]);
      
      const zone = globalThis.view.state.players[0].zones.Command;
      const html = commandZone(zone);
      const container = document.createElement("div");
      container.innerHTML = html;
      container.id = "test-result";
      document.body.appendChild(container);
      return container;
    };
  }, boardCode);
  
  result = await page.evaluate(() => {
    renderCommandZone({view: {
      schema: "CrankRoomView@1",
      seat: 0,
      decision: {kind: "priority", options: [{index: 0, act: "pass"}]},
      state: {phase: "main1", players: [{playerId: 0, zones: {
        Command: {count: 0, cards: []}
      }}]}
    }});
    
    const figure = document.querySelector("[data-zone='command']");
    const cardEl = figure.querySelector("[data-action='board-card']");
    const empty = figure.querySelector(".cm-bcard.is-empty");
    return {
      hasCard: !!cardEl,
      hasEmpty: !!empty,
      count: figure.querySelector("figcaption b").textContent
    };
  });
  
  eq(result.hasCard, false, "No commander card in empty zone");
  ok(result.hasEmpty, "Empty placeholder shown");
  eq(result.count, "0", "Count shows 0");
  
  await shot(page, "commander-tax-mobile");
  await page.close();
  
  console.log(`  ${checks} checks passed`);
  await close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
