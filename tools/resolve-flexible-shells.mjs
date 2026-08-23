import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PLANS_PATH = path.join(ROOT, "data", "buy-plans.json");
const CARDS_PATH = path.join(ROOT, "data", "cards.json");

const data = JSON.parse(fs.readFileSync(PLANS_PATH, "utf8"));
const cards = JSON.parse(fs.readFileSync(CARDS_PATH, "utf8")).cards;
const cardsByName = new Map(cards.map((card) => [card.name, card]));

const LARGE_PLAN_CONFIG = {
  "1a": { donors: ["6c", "6e", "5e", "3e"], phrases: ["saproling", "fungus", "token", "sacrifice", "dies", "graveyard"], creatures: 30 },
  "1c": { donors: ["2e", "5d", "5f", "1o"], phrases: ["gain life", "lifelink", "life total", "whenever you gain", "defender"], creatures: 28 },
  "2o": { donors: ["1a", "3e", "6e", "3f"], phrases: ["-1/-1 counter", "wither", "proliferate", "sacrifice", "dies", "counter"], creatures: 28 },
  "2a": {
    donors: ["6f", "6o", "4a", "4e"],
    phrases: ["gain control", "opponent's library", "opponent owns", "cast that card", "under your control", "copy target"],
    creatures: 26,
    strategyMinimum: 6,
    strategyPatterns: [
      /\bgain control\b/,
      /opponent'?s library/,
      /opponent owns/,
      /graveyard[^.]{0,180}under your control/,
      /enchant creature card in a graveyard/,
      /opponent chooses a creature card in their graveyard/,
      /\bcopy target\b/,
      /\bbecomes? a copy\b/,
      /(?:create|becomes?)[^.]{0,90}\bcopy\b/,
      /enter(?:s|ing)[^.]{0,160}trigger[^.]{0,100}additional time/,
      /\bcast that card\b/
    ],
    rejectPatterns: [
      /\b(?:proliferate|infect|wither)\b/,
      /(?:\+1\/\+1|-1\/-1|charge|arrowhead) counters?/,
      /double the number of each kind of counter/
    ]
  },
  "2b": { donors: ["1a", "6c", "6e", "1c"], phrases: ["sacrifice", "dies", "graveyard", "each opponent", "destroy target creature"], creatures: 26 },
  "2e": { donors: ["1c", "4o", "4a", "2c"], phrases: ["gain life", "lifelink", "can't attack", "unless their controller pays", "enchantment", "life total"], creatures: 22 },
  "3o": { donors: ["3f", "3c", "3e", "5e"], phrases: ["landfall", "land enters", "land card", "basic land", "token", "elemental"], creatures: 28 },
  "3c": { donors: ["3f", "3e", "6d", "6f"], phrases: ["landfall", "land enters", "land card", "basic land", "additional land", "draw a card"], creatures: 28 },
  "3d": { donors: ["5e", "1o", "1c", "3c"], phrases: ["enchantment", "constellation", "aura", "token", "gain life"], creatures: 18 },
  "3f": {
    donors: ["3o", "3c", "3e", "6d"],
    phrases: ["landfall", "land enters", "land card", "basic land", "additional land", "elemental", "token"],
    creatures: 30,
    strategyMinimum: 30,
    defaultRoleCards: ["Omnath, Locus of Rage", "Decimate", "Hull Breach"],
    rolePatterns: {
      interaction: [/enchanted permanent is a colorless forest land/]
    },
    strategyPatterns: [
      /\blandfall\b/,
      /\bland enters\b/,
      /\bland cards?\b/,
      /\bbasic land\b/,
      /\badditional land\b/,
      /search your library[^.]{0,90}\bland\b/,
      /put (?:a|that|the) land card[^.]*onto the battlefield/,
      /\belemental\b/
    ],
    rejectNames: [
      "Advanced Reconstruction",
      "Aetherflux Reservoir",
      "Fungal Plots",
      "Inspiring Call",
      "Kruphix's Insight",
      "Perpetual Timepiece",
      "Rampart Architect",
      "Relic Retriever",
      "Splinterfright",
      "Staff of Compleation",
      "Troll Negotiations"
    ],
    rejectPatterns: [
      /\bproliferate\b/,
      /\+1\/\+1 counters?/,
      /\bpay 50 life\b/,
      /creatures? (?:you control )?with defender/,
      /enchantment cards? from among/,
      /cards? (?:left|leave) your graveyard/
    ]
  },
  "4o": { donors: ["4a", "4b", "5d", "2e"], phrases: ["flying", "flyer", "attacking creature", "vigilance", "lifelink"], creatures: 32 },
  "4a": { donors: ["4e", "6f", "4o", "4b"], phrases: ["enters", "exile another", "return it to the battlefield", "blink", "leave the battlefield"], creatures: 30 },
  "4b": { donors: ["4a", "4o", "2c", "5c"], phrases: ["artifact", "vehicle", "equipment", "thopter", "construct"], creatures: 22 },
  "4e": { donors: ["4a", "6f", "4c", "3c"], phrases: ["enters", "exile another", "return it to the battlefield", "blink", "leave the battlefield"], creatures: 30 },
  "5c": { donors: ["5f", "5d", "1c", "4b"], phrases: ["knight", "equipment", "equipped", "attach", "first strike", "double strike"], creatures: 30 },
  "5d": { donors: ["4o", "1c", "5c", "5f"], phrases: ["angel", "flying", "lifelink", "vigilance"], creatures: 30 },
  "5e": { donors: ["1a", "3d", "1o", "3o"], phrases: ["token", "populate", "create a", "creature enters", "gain life"], creatures: 28 },
  "5f": { donors: ["5c", "1c", "5d", "1o"], phrases: ["knight", "equipment", "equipped", "vigilance", "token"], creatures: 30 },
  "6o": { donors: ["6e", "6f", "3e", "6c"], phrases: ["graveyard", "mill", "permanent card", "return target", "sacrifice", "enters"], creatures: 28 },
  "6d": { donors: ["3c", "6f", "3f", "2c"], phrases: ["add mana", "mana of any", "x mana", "draw", "untap", "land"], creatures: 26 },
  "6e": { donors: ["6o", "6c", "3e", "1a"], phrases: ["graveyard", "mill", "dredge", "return target creature", "reanimate", "dies"], creatures: 30 },
  "6f": { donors: ["4e", "6o", "3e", "2a"], phrases: ["enters", "when this creature enters", "return it to the battlefield", "landfall", "draw"], creatures: 30 }
};

const SMALL_PLAN_CARDS = {
  "2c": ["Hardened Scales", "Kami of Whispered Hopes", "Ozolith, the Shattered Spire", "Inspiring Call", "Staff of Compleation", "The Ozolith"],
  "3e": ["Fabled Passage", "World Shaper", "Scute Swarm", "Currency Converter"],
  "4c": ["Wall of Roots", "Crashing Drawbridge", "Weathered Sentinels", "Walking Bulwark", "Tower Defense", "Bedrock Tortoise"],
  "6c": ["Angel of Indemnity", "Primary Research", "Sevinne's Reclamation", "Serra Paragon", "Teshar, Ancestor's Apostle", "Selfless Spirit", "Remorseful Cleric", "Blood Artist", "Poison-Tip Archer", "Deadly Dispute", "Fungal Plots", "Yavimaya Elder", "Underrealm Lich", "World Shaper", "Victimize", "Dredge the Mire"]
};

const OPTION_KEYS = ["required", "upgrade", "enhance", "max"];
const BASIC_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);
const WORD_STOP = new Set(["a", "an", "and", "as", "at", "be", "by", "card", "cards", "control", "for", "from", "if", "in", "into", "it", "its", "of", "on", "or", "other", "that", "the", "their", "then", "this", "to", "up", "when", "whenever", "with", "you", "your"]);

function normalized(text) {
  return String(text || "").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

function cardText(card) {
  return normalized([card.name, card.typeLine, card.oracleText, ...(card.keywords || [])].join(" "));
}

function broadType(card) {
  const type = card.typeLine || "";
  for (const family of ["Creature", "Planeswalker", "Battle", "Artifact", "Enchantment", "Instant", "Sorcery", "Land"]) {
    if (type.includes(family)) return family;
  }
  return "Other";
}

function isCreature(card) {
  return broadType(card) === "Creature";
}

function roleFlags(card) {
  const text = cardText(card);
  return {
    ramp: /\badd\b[^.]{0,35}(?:mana|\{[wubrgc]\})|search your library for [^.]{0,45}(?:basic )?land|put (?:a|that|the) land card[^.]*onto the battlefield|treasure token|spells? you cast cost .* less/.test(text),
    draw: /draw (?:a|one|two|three|x|that many|cards|a card)|put (?:one|that|those|the) cards?[^.]*into your hand|investigate|clue token/.test(text),
    interaction: /destroy (?:target|all|each)|exile (?:target|all)|counter target|return target [^.]*owner'?s hand|deals? [^.]* damage to (?:target|any target|each creature|each opponent)|target creature gets [+-]|creatures? [^.]*get[s]? -|(?:each opponent|each player) sacrifices|\bfight\b|tap target|target permanent[^.]*shuffle|goad target|can'?t block/.test(text),
    protect: /hexproof|indestructible|protection from|regenerate|phase out|prevent all damage|can'?t be countered|counter target spell that targets|return [^.]* you control to (?:its|their) owner'?s hand/.test(text)
  };
}

function tokenWords(card) {
  return new Set(cardText(card).match(/[a-z][a-z'-]{3,}/g)?.filter((word) => !WORD_STOP.has(word)) || []);
}

function overlapScore(a, b) {
  const left = tokenWords(a);
  const right = tokenWords(b);
  let count = 0;
  for (const word of left) if (right.has(word)) count += 1;
  return Math.min(9, count * 3);
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function allOptions(plan) {
  return OPTION_KEYS.flatMap((key) => plan[key] || []);
}

function normalizeKnownDuplicateRequirements() {
  for (const id of ["2c", "3e", "4c", "6c"]) {
    const plan = data.plans[id];
    plan.required = (plan.required || []).filter((card) => card.name !== plan.commander);
  }

  const quintorius = data.plans["5o"];
  const redundant = new Set(["Containment Construct", "Faithless Looting", "Sevinne's Reclamation", "Quintorius, Field Historian"]);
  quintorius.required = (quintorius.required || []).filter((card) => !redundant.has(card.name));
  const armory = quintorius.required.find((card) => card.name === "Open the Armory");
  const elspeth = quintorius.required.find((card) => card.name === "Elspeth, Sun's Champion");
  if (!armory || !elspeth) throw new Error("The Quintorius requirement normalization targets are missing.");
  armory.replaces = "Fateful Tempest";
  delete armory.replacesSlotId;
  elspeth.replaces = "Monologue Tax";
  delete elspeth.replacesSlotId;
}

function splitReaperBasics() {
  const plan = data.plans["2o"];
  const swamp = plan.startingShell.find((card) => card.name === "Swamp");
  if (!swamp) throw new Error("2o is missing its Swamp entry.");
  swamp.quantity = 12;

  for (const name of ["Forest", "Mountain"]) {
    if (plan.startingShell.some((card) => card.name === name)) continue;
    const metadata = cardsByName.get(name);
    if (!metadata) throw new Error(`Missing audited metadata for ${name}.`);
    plan.startingShell.splice(plan.startingShell.indexOf(swamp) + 1, 0, shellCardFrom(metadata, `shell-${name.toLowerCase()}`, false));
    plan.startingShell.find((card) => card.name === name).quantity = 12;
  }
  syncBaseCards(plan);
}

function shellCardFrom(card, id, wasFlexibleSlot = true) {
  return {
    id,
    name: card.name,
    quantity: 1,
    manaCost: card.manaCost || "",
    typeLine: card.typeLine || "",
    tags: [],
    isCommander: false,
    gameChanger: false,
    isFlexibleSlot: false,
    ...(wasFlexibleSlot ? { wasFlexibleSlot: true } : {}),
    image: card.image || "",
    oracleText: card.oracleText || "",
    keywords: card.keywords || [],
    colorIdentity: card.colorIdentity || [],
    tcgplayerUrl: card.tcgplayerUrl || "",
    commanderLegal: card.legalities?.commander === "legal",
    rarity: card.rarity || "",
    setName: card.setName || "",
    ...(Number.isFinite(Number(card.price)) ? { price: Number(card.price) } : {}),
    ...(card.priceUpdated ? { priceUpdated: card.priceUpdated } : {})
  };
}

function baseCardFrom(card) {
  return {
    id: card.id,
    name: card.name,
    quantity: card.quantity || 1,
    typeLine: card.typeLine || "",
    tags: card.tags || [],
    isCommander: Boolean(card.isCommander),
    gameChanger: Boolean(card.gameChanger),
    ...(card.wasFlexibleSlot ? { wasFlexibleSlot: true, isFlexibleSlot: false } : {})
  };
}

function syncBaseCards(plan) {
  const byId = new Map((plan.baseCards || []).map((card, index) => [card.id, { card, index }]));
  for (const shellCard of plan.startingShell) {
    const replacement = baseCardFrom(shellCard);
    const found = byId.get(shellCard.id);
    if (found) plan.baseCards[found.index] = replacement;
    else plan.baseCards.push(replacement);
  }
}

normalizeKnownDuplicateRequirements();
splitReaperBasics();

const globalMaxNames = new Set(Object.values(data.plans).flatMap((plan) => (plan.max || []).map((card) => card.name)));
const gameChangerNames = new Set(Object.values(data.plans).flatMap((plan) => ["startingShell", ...OPTION_KEYS].flatMap((key) => (plan[key] || []).filter((card) => card.gameChanger).map((card) => card.name))));
const excludedNames = new Set([
  ...(data.tier3Excluded || []).map((card) => card.name),
  ...(data.salvage || []).map((card) => card.name),
  ...globalMaxNames,
  ...gameChangerNames
]);

const donorOccurrences = new Map();
for (const [id, plan] of Object.entries(data.plans)) {
  const counts = new Map();
  const sourceCards = [
    ...(plan.startingShell || []).filter((card) => !card.isFlexibleSlot && !card.wasFlexibleSlot),
    ...(plan.required || []),
    ...(plan.enhance || [])
  ];
  for (const card of sourceCards) counts.set(card.name, (counts.get(card.name) || 0) + 1);
  donorOccurrences.set(id, counts);
}

function commanderIdentity(plan) {
  const commander = plan.startingShell.find((card) => card.isCommander) || cardsByName.get(plan.commander);
  if (!commander) throw new Error(`${plan.variantId} has no commander metadata.`);
  return new Set(commander.colorIdentity || []);
}

function legalCandidatePool(plan, config) {
  const identity = commanderIdentity(plan);
  const fixedNames = new Set(plan.startingShell.filter((card) => !card.isFlexibleSlot && !card.wasFlexibleSlot).map((card) => card.name));
  const optionNames = new Set(allOptions(plan).map((card) => card.name));
  const rejectedNames = new Set(config.rejectNames || []);
  return cards
    .filter((card) => card.legalities?.commander === "legal")
    .filter((card) => broadType(card) !== "Land")
    .filter((card) => (card.colorIdentity || []).every((color) => identity.has(color)))
    .filter((card) => !fixedNames.has(card.name) && !optionNames.has(card.name) && !excludedNames.has(card.name) && !rejectedNames.has(card.name))
    .filter((card) => !matchesAny(cardText(card), config.rejectPatterns))
    .map((card) => {
      const text = cardText(card);
      const roles = roleFlags(card);
      for (const [role, patterns] of Object.entries(config.rolePatterns || {})) {
        if (matchesAny(text, patterns)) roles[role] = true;
      }
      const strategy = matchesAny(text, config.strategyPatterns);
      let score = 0;
      for (const donor of config.donors) score += 12 * (donorOccurrences.get(donor)?.get(card.name) || 0);
      for (const phrase of config.phrases) if (text.includes(normalized(phrase))) score += 8;
      if (strategy) score += 8;
      score += 2 * Object.values(roles).filter(Boolean).length;
      const price = Number(card.price);
      if (Number.isFinite(price) && price <= 3) score += 2;
      if (Number.isFinite(price) && price > 15) score -= 6;
      return { card, score, roles, strategy };
    })
    .sort(candidateComparator);
}

function candidateComparator(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  const aPrice = Number.isFinite(Number(a.card.price)) ? Number(a.card.price) : Number.POSITIVE_INFINITY;
  const bPrice = Number.isFinite(Number(b.card.price)) ? Number(b.card.price) : Number.POSITIVE_INFINITY;
  if (aPrice !== bPrice) return aPrice - bPrice;
  return a.card.name.localeCompare(b.card.name);
}

function replacementReferences(plan, slots) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const slotByName = new Map(slots.map((slot) => [slot.name, slot]));
  const refs = new Map(slots.map((slot) => [slot.id, []]));
  const options = [...allOptions(plan), ...(data.tier3Excluded || []).filter((card) => card.variantId === plan.variantId)];

  for (const option of options) {
    const slot = (option.replacesSlotId && slotById.get(option.replacesSlotId)) || slotByName.get(option.replaces);
    if (!slot) continue;
    option.replacesSlotId = slot.id;
    refs.get(slot.id).push(option);
  }
  return { refs, options };
}

function canAddCandidate(entry, selected, selectedCreatures, desiredCreatures, totalSlots) {
  if (selected.has(entry.card.name)) return false;
  const creature = isCreature(entry.card);
  if (creature && selectedCreatures >= desiredCreatures) return false;
  const afterCount = selected.size + 1;
  const afterCreatures = selectedCreatures + (creature ? 1 : 0);
  const remainingSlots = totalSlots - afterCount;
  return desiredCreatures - afterCreatures <= remainingSlots;
}

function chooseLargePlan(plan, slots, config) {
  const pool = legalCandidatePool(plan, config);
  if (pool.length < slots.length) throw new Error(`${plan.variantId} has only ${pool.length} legal audited candidates for ${slots.length} slots.`);
  const { refs, options } = replacementReferences(plan, slots);
  const selected = new Map();
  const slotAssignments = new Map();
  let selectedCreatures = 0;

  for (const slot of slots) {
    const targets = refs.get(slot.id) || [];
    if (!targets.length) continue;
    const ranked = pool
      .filter((entry) => canAddCandidate(entry, selected, selectedCreatures, config.creatures, slots.length))
      .map((entry) => {
        let fit = 0;
        for (const target of targets) {
          if (broadType(entry.card) === broadType(target)) fit = Math.max(fit, 16);
          fit = Math.max(fit, overlapScore(entry.card, target));
        }
        return { entry, fit };
      })
      .sort((a, b) => b.fit - a.fit || candidateComparator(a.entry, b.entry));
    const chosen = ranked[0]?.entry;
    if (!chosen) throw new Error(`${plan.variantId} could not resolve referenced slot ${slot.id}.`);
    selected.set(chosen.card.name, chosen);
    slotAssignments.set(slot.id, chosen);
    if (isCreature(chosen.card)) selectedCreatures += 1;
  }

  const strategyCount = () => [...selected.values()].filter((entry) => entry.strategy).length;
  while (strategyCount() < (config.strategyMinimum || 0)) {
    const chosen = pool.find((entry) => entry.strategy && canAddCandidate(entry, selected, selectedCreatures, config.creatures, slots.length));
    if (!chosen) throw new Error(`${plan.variantId} cannot reach its ${config.strategyMinimum}-card core-strategy minimum.`);
    selected.set(chosen.card.name, chosen);
    if (isCreature(chosen.card)) selectedCreatures += 1;
  }

  const roleTargets = { ramp: 8, draw: 8, interaction: 8, protect: 3 };
  const defaultRoleCredits = (config.defaultRoleCards || []).map((name) => {
    const card = cardsByName.get(name);
    if (!card) throw new Error(`${plan.variantId} is missing default role-credit metadata for ${name}.`);
    return roleFlags(card);
  });
  const roleCount = (role) => [...selected.values()].filter((entry) => entry.roles[role]).length + defaultRoleCredits.filter((roles) => roles[role]).length;
  for (const [role, minimum] of Object.entries(roleTargets)) {
    while (roleCount(role) < minimum) {
      const chosen = pool.find((entry) => entry.roles[role] && canAddCandidate(entry, selected, selectedCreatures, config.creatures, slots.length));
      if (!chosen) {
        const available = pool.filter((entry) => entry.roles[role]);
        throw new Error(`${plan.variantId} cannot reach its ${minimum}-card ${role} minimum (pool ${available.length}, creatures ${available.filter((entry) => isCreature(entry.card)).length}, selected ${selected.size}/${selectedCreatures}).`);
      }
      selected.set(chosen.card.name, chosen);
      if (isCreature(chosen.card)) selectedCreatures += 1;
    }
  }

  while (selectedCreatures < config.creatures) {
    const chosen = pool.find((entry) => isCreature(entry.card) && canAddCandidate(entry, selected, selectedCreatures, config.creatures, slots.length));
    if (!chosen) throw new Error(`${plan.variantId} cannot reach ${config.creatures} creatures.`);
    selected.set(chosen.card.name, chosen);
    selectedCreatures += 1;
  }

  while (selected.size < slots.length) {
    const chosen = pool.find((entry) => canAddCandidate(entry, selected, selectedCreatures, config.creatures, slots.length));
    if (!chosen) throw new Error(`${plan.variantId} ran out of candidates at ${selected.size}/${slots.length}.`);
    selected.set(chosen.card.name, chosen);
    if (isCreature(chosen.card)) selectedCreatures += 1;
  }

  const unusedSlots = slots.filter((slot) => !slotAssignments.has(slot.id));
  const unassigned = [...selected.values()].filter((entry) => ![...slotAssignments.values()].some((assigned) => assigned.card.name === entry.card.name));
  for (let index = 0; index < unusedSlots.length; index += 1) slotAssignments.set(unusedSlots[index].id, unassigned[index]);

  applyAssignments(plan, slots, slotAssignments, options);
  return summarizeAssignment(plan, slots, config);
}

function chooseSmallPlan(plan, slots, names) {
  if (slots.length !== names.length) throw new Error(`${plan.variantId} expected ${names.length} flexible slots but found ${slots.length}.`);
  const identity = commanderIdentity(plan);
  const entries = names.map((name) => {
    const card = cardsByName.get(name);
    if (!card) throw new Error(`${plan.variantId} is missing audited metadata for ${name}.`);
    if (card.legalities?.commander !== "legal") throw new Error(`${name} is not Commander legal.`);
    if (!(card.colorIdentity || []).every((color) => identity.has(color))) throw new Error(`${name} is outside ${plan.variantId}'s color identity.`);
    return { card, score: 0, roles: roleFlags(card) };
  });
  const { options } = replacementReferences(plan, slots);
  const assignments = new Map(slots.map((slot, index) => [slot.id, entries[index]]));
  applyAssignments(plan, slots, assignments, options);
  return summarizeAssignment(plan, slots);
}

function applyAssignments(plan, slots, assignments, options) {
  const assignedBySlot = new Map();
  for (const slot of slots) {
    const entry = assignments.get(slot.id);
    if (!entry) throw new Error(`${plan.variantId} has no assignment for ${slot.id}.`);
    const replacement = shellCardFrom(entry.card, slot.id, true);
    const index = plan.startingShell.findIndex((card) => card.id === slot.id);
    plan.startingShell[index] = replacement;
    assignedBySlot.set(slot.id, replacement);
  }

  for (const option of options) {
    if (!option.replacesSlotId) continue;
    const replacement = assignedBySlot.get(option.replacesSlotId);
    if (replacement) option.replaces = replacement.name;
  }
  syncBaseCards(plan);
}

function summarizeAssignment(plan, slots, config = {}) {
  const cards = slots.map((slot) => plan.startingShell.find((card) => card.id === slot.id));
  const roles = { ramp: 0, draw: 0, interaction: 0, protect: 0 };
  for (const card of cards) {
    const flags = roleFlags(card);
    const text = cardText(card);
    for (const [role, patterns] of Object.entries(config.rolePatterns || {})) {
      if (matchesAny(text, patterns)) flags[role] = true;
    }
    for (const role of Object.keys(roles)) if (flags[role]) roles[role] += 1;
  }
  for (const name of config.defaultRoleCards || []) {
    const flags = roleFlags(cardsByName.get(name));
    for (const role of Object.keys(roles)) if (flags[role]) roles[role] += 1;
  }
  const strategyCount = cards.filter((card) => matchesAny(cardText(card), config.strategyPatterns)).length;
  const strategySummary = config.strategyMinimum ? `; strategy ${strategyCount}/${config.strategyMinimum}+` : "";
  return `${plan.variantId} ${plan.deckName}: ${cards.length} named; ${cards.filter(isCreature).length} creatures; roles ${roles.ramp}/${roles.draw}/${roles.interaction}/${roles.protect}${strategySummary}`;
}

const summaries = [];
for (const id of data.profileVariantIds) {
  const plan = data.plans[id];
  const slots = plan.startingShell.filter((card) => card.isFlexibleSlot || card.wasFlexibleSlot);
  if (!slots.length) continue;
  if (SMALL_PLAN_CARDS[id]) summaries.push(chooseSmallPlan(plan, slots, SMALL_PLAN_CARDS[id]));
  else if (LARGE_PLAN_CONFIG[id]) summaries.push(chooseLargePlan(plan, slots, LARGE_PLAN_CONFIG[id]));
  else throw new Error(`${id} has flexible slots but no resolution configuration.`);
}

function verify() {
  const errors = [];
  const unspecified = JSON.stringify(data).match(/Unspecified shell card|Unspecified card slot/g) || [];
  if (unspecified.length) errors.push(`${unspecified.length} unspecified labels remain`);

  for (const id of data.profileVariantIds) {
    const plan = data.plans[id];
    const identity = commanderIdentity(plan);
    const shellTotal = plan.startingShell.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    if (shellTotal !== 100) errors.push(`${id}: shell total is ${shellTotal}`);
    if (plan.startingShell.some((card) => card.isFlexibleSlot)) errors.push(`${id}: flexible slot remains`);
    if (plan.startingShell.filter((card) => card.isCommander).length !== 1) errors.push(`${id}: shell must have exactly one commander`);

    const seen = new Set();
    for (const card of plan.startingShell) {
      const metadata = cardsByName.get(card.name);
      if (!metadata) errors.push(`${id}: ${card.name} lacks audited metadata`);
      else {
        if (metadata.legalities?.commander !== "legal") errors.push(`${id}: ${card.name} is not Commander legal`);
        if (!(metadata.colorIdentity || []).every((color) => identity.has(color))) errors.push(`${id}: ${card.name} is outside commander identity`);
      }
      if (!BASIC_NAMES.has(card.name) && seen.has(card.name)) errors.push(`${id}: duplicate singleton ${card.name}`);
      seen.add(card.name);
    }

    const options = allOptions(plan);
    const optionNames = new Set();
    for (const option of options) {
      if (optionNames.has(option.name)) errors.push(`${id}: duplicate option ${option.name}`);
      optionNames.add(option.name);
    }
    const graphNames = new Set([...plan.startingShell.map((card) => card.name), ...options.map((card) => card.name)]);
    for (const option of options) {
      if (option.replaces && !graphNames.has(option.replaces)) errors.push(`${id}: ${option.name} replaces missing ${option.replaces}`);
    }

    const shellNames = new Set(plan.startingShell.map((card) => card.name));
    const optionByName = new Map(options.map((card) => [card.name, card]));
    for (const option of options) {
      const visited = new Set([option.name]);
      let target = option.replaces;
      while (target && !shellNames.has(target)) {
        if (visited.has(target)) {
          errors.push(`${id}: replacement cycle reaches ${target}`);
          break;
        }
        visited.add(target);
        target = optionByName.get(target)?.replaces;
      }
      if (option.replaces && !target) errors.push(`${id}: ${option.name}'s replacement chain has no shell terminus`);
    }

    const baseById = new Map((plan.baseCards || []).map((card) => [card.id, card]));
    for (const card of plan.startingShell.filter((item) => item.wasFlexibleSlot)) {
      if (baseById.get(card.id)?.name !== card.name) errors.push(`${id}: baseCards is not synced for ${card.id}`);
    }

    const tunedLineup = plan.startingShell.flatMap((card) => Array.from({ length: Number(card.quantity || 1) }, () => card.name));
    for (const card of plan.required || []) {
      const targetIndex = tunedLineup.indexOf(card.replaces);
      if (targetIndex < 0) errors.push(`${id}: required ${card.name} cannot replace ${card.replaces} in the default lineup`);
      else tunedLineup.splice(targetIndex, 1);
      tunedLineup.push(card.name);
    }
    if (tunedLineup.length !== 100) errors.push(`${id}: default tuned lineup has ${tunedLineup.length} cards`);
    const tunedSingletons = new Set();
    for (const name of tunedLineup) {
      if (!BASIC_NAMES.has(name) && tunedSingletons.has(name)) errors.push(`${id}: default tuned lineup duplicates ${name}`);
      tunedSingletons.add(name);
    }
  }

  for (const option of data.tier3Excluded || []) {
    const plan = data.plans[option.variantId];
    if (!plan) continue;
    const graphNames = new Set([...plan.startingShell.map((card) => card.name), ...allOptions(plan).map((card) => card.name)]);
    if (option.replaces && !graphNames.has(option.replaces)) errors.push(`${option.variantId}: excluded ${option.name} replaces missing ${option.replaces}`);
  }

  if (errors.length) throw new Error(`Verification failed:\n- ${errors.join("\n- ")}`);
}

verify();
fs.writeFileSync(PLANS_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Resolved ${summaries.length} plans and verified all ${data.profileVariantIds.length} exact 100-card shells.`);
for (const summary of summaries) console.log(`- ${summary}`);
