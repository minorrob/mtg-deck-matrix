import {readFile, writeFile} from "node:fs/promises";

const plansUrl = new URL("../data/buy-plans.json", import.meta.url);
const cardsUrl = new URL("../data/cards.json", import.meta.url);
const plans = JSON.parse(await readFile(plansUrl, "utf8"));
const audited = JSON.parse(await readFile(cardsUrl, "utf8"));
const byName = new Map(audited.cards.map((card) => [card.name.toLocaleLowerCase(), card]));
for (const card of audited.cards) for (const face of card.name.split(" // ")) byName.set(face.toLocaleLowerCase(), card);
const illegal = [];
const wrongTypes = [];
const LEGALITY_REPLACEMENTS = new Map([
  ["1b|1b-upgrade-2-high-alert", "Bedrock Tortoise"],
  ["1b|1b-upgrade-4-tetsuko-umezawa-fugitive", "Belligerent Brontodon"],
  ["2o|shell-plains", "Swamp"],
  ["4b|4b-upgrade-1-thopter-foundry", "Sai, Master Thopterist"],
  ["6d|6d-upgrade-2-villainous-wealth", "Helix Pinnacle"]
]);
const STRATEGY_COPY = {
  "1b|1b-upgrade-2-high-alert": "A second toughness-to-damage body makes the defender plan resilient when Felothar is removed.",
  "1b|1b-upgrade-4-tetsuko-umezawa-fugitive": "Another legal toughness payoff that turns the wall line into real combat pressure.",
  "4b|4b-upgrade-1-thopter-foundry": "Every historic spell creates another flying artifact body, while spare artifacts can become cards.",
  "6d|6d-upgrade-2-villainous-wealth": "An unusual alternate win condition that converts Kruphix's stored colorless mana into tower counters over several turns."
};

for (const [variantId, plan] of Object.entries(plans.plans)) {
  const commander = (plan.startingShell || []).find((card) => card.isCommander);
  const commanderData = commander && byName.get(commander.name.toLocaleLowerCase());
  const identity = new Set(commanderData?.colorIdentity || []);
  for (const collectionName of ["startingShell", "required", "enhance", "max"]) {
    for (const card of plan[collectionName] || []) {
      if (card.isFlexibleSlot) continue;
      const replacementKey = `${variantId}|${card.id}`;
      const replacement = LEGALITY_REPLACEMENTS.get(replacementKey);
      if (replacement) card.name = replacement;
      const data = byName.get(card.name.toLocaleLowerCase());
      if (!data) continue;
      if (card.typeLine && card.typeLine !== data.typeLine) wrongTypes.push({variantId, name: card.name, from: card.typeLine, to: data.typeLine});
      const previousPrice = Number(card.price) || null;
      card.name = data.name;
      card.manaCost = data.manaCost;
      card.typeLine = data.typeLine;
      card.oracleText = data.oracleText;
      card.keywords = data.keywords;
      card.colorIdentity = data.colorIdentity;
      card.image = data.image;
      card.tcgplayerUrl = data.tcgplayerUrl;
      card.commanderLegal = data.legalities?.commander === "legal";
      if (collectionName !== "startingShell") {
        if (!card.ceiling && previousPrice) card.ceiling = previousPrice;
        card.price = data.price;
        card.priceUpdated = audited.generatedAt.slice(0, 10);
      }
      if (STRATEGY_COPY[replacementKey]) {
        card.purpose = STRATEGY_COPY[replacementKey];
        card.why = STRATEGY_COPY[replacementKey];
        card.whyPrimary = STRATEGY_COPY[replacementKey];
        if (card.brief) card.brief.fit = STRATEGY_COPY[replacementKey];
      }
      const offColor = data.colorIdentity.filter((color) => !identity.has(color));
      if (data.legalities?.commander !== "legal" || offColor.length) illegal.push({variantId, commander: commander?.name, card: data.name, commanderLegal: data.legalities?.commander, offColor});
    }
  }
  const overBudgetEnhance = (plan.enhance || []).filter((card) => Number(card.price) > 10);
  if (overBudgetEnhance.length) {
    plan.enhance = plan.enhance.filter((card) => Number(card.price) <= 10);
    plan.max = [...(plan.max || []), ...overBudgetEnhance.map((card) => ({...card, category: "max", stage: "Maxxed"}))];
  }
}

plans.cardAudit = {source: audited.source, generatedAt: audited.generatedAt, cardsVerified: audited.cards.length, wrongTypesCorrected: wrongTypes.length, legalityIssues: illegal};
await writeFile(plansUrl, `${JSON.stringify(plans, null, 2)}\n`);
console.log(JSON.stringify({wrongTypesCorrected: wrongTypes.length, illegalCount: illegal.length, illegal, wrongTypes: wrongTypes.slice(0, 30)}, null, 2));
