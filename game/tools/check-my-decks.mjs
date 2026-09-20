/* DOES FORGE KNOW EVERY CARD IN MY DECKS?
 *
 * The fixtures prove the resolver handles the shapes card names come in. They cannot prove that
 * THIS Forge checkout knows THESE decks, which is the only question that matters on the night.
 * This answers it from the committed library, offline, in a couple of seconds, without starting a
 * host or a game.
 *
 *   node game/tools/check-my-decks.mjs
 *
 * Every card OK means no deck in the library can fail at engine load for a name Forge lacks.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildForgeCardIndex} from '../contracts/forge-card-index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forgeRoot = process.env.CRANKMAGIC_FORGE_ROOT || resolve(root, '../forge');

let index;
try {
  index = buildForgeCardIndex(forgeRoot);
} catch (error) {
  console.error('Could not read the Forge card database.\n  ' + error.message);
  console.error('\nIf Forge lives somewhere else, point at it and run again:');
  console.error('  $env:CRANKMAGIC_FORGE_ROOT = "C:\\path\\to\\forge"');
  process.exit(1);
}
console.log(`Forge card database: ${index.scripts.toLocaleString('en-US')} card scripts, ${index.names.toLocaleString('en-US')} names`);
console.log(`Read from: ${forgeRoot}\n`);

const state = JSON.parse(readFileSync(resolve(root, 'data/live-state.json'))).payload.state;
const decks = Object.values(state.decks).filter((d) => !d.archived);
let missingTotal = 0;

for (const deck of decks) {
  const names = deck.slots.filter((s) => s.purpose === 'main')
    .map((s) => state.cards[s.cardId]?.name)
    .filter(Boolean);
  const missing = [...new Set(names)].filter((n) => !index.resolve(n));
  missingTotal += missing.length;
  const total = deck.slots.filter((s) => s.purpose === 'main').reduce((n, s) => n + s.quantity, 0);
  if (!missing.length) {
    console.log(`  OK    ${deck.name}  (${total} cards)`);
  } else {
    console.log(`  MISS  ${deck.name}  (${total} cards) - Forge has no card script for:`);
    for (const name of missing) {
      const near = index.suggest(name);
      console.log(`          ${name}${near.length ? `   did you mean: ${near.slice(0, 3).join(', ')}` : ''}`);
    }
  }
}

/* The names that broke the old filename-guessing check. They are here as a canary: if the ladder
 * ever regresses, this reports it on a machine with the real database rather than in a fixture. */
const CANARIES = ['Sol Ring', 'Malakir Rebirth // Malakir Mire', "Lim-D\u00fbl's Vault",
  '\u00c6therize', 'J\u00f6tun Grunt', 'Fire // Ice', 'Boseiju, Who Endures'];
const canaryMisses = CANARIES.filter((n) => !index.resolve(n));
console.log('\nAwkward names the old check got wrong:');
for (const name of CANARIES) console.log(`  ${index.resolve(name) ? 'OK  ' : 'MISS'}  ${name}`);

if (missingTotal || canaryMisses.length) {
  console.log(`\n\u2715 ${missingTotal} card(s) across your decks and ${canaryMisses.length} canary name(s) did not resolve.`);
  console.log('  Send this output back. A MISS means Forge names that card differently than expected.');
  process.exit(1);
}
console.log(`\n\u2713 Every card in all ${decks.length} decks resolves to a Forge card script.`);
