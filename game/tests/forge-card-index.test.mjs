import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildForgeCardIndex, loadForgeCardIndex, normalizeCardName, scriptNames, resetForgeCardIndexCache}
  from '../contracts/forge-card-index.mjs';

/* Forge transliterates a card's FILE name and keeps the printed name inside the script, which is
 * the whole reason reading Name: beats guessing a path. The fixture mirrors that: accented cards
 * sit in plainly-spelled files, and split and modal cards carry a second Name: after ALTERNATE. */
const CARDS = {
  's/sol_ring.txt': 'Name:Sol Ring\nManaCost:1\nTypes:Artifact\nOracle:{T}: Add {C}{C}.\n',
  'l/lim_duls_vault.txt': "Name:Lim-Dûl's Vault\nManaCost:U B\nTypes:Instant\nOracle:Look at the top five cards.\n",
  'a/aetherize.txt': 'Name:Ætherize\nManaCost:3 U\nTypes:Instant\nOracle:Return all attacking creatures.\n',
  'j/jotun_grunt.txt': 'Name:Jötun Grunt\nManaCost:1 W\nTypes:Creature Giant Soldier\nOracle:Cumulative upkeep.\n',
  'm/marton_stromgald.txt': 'Name:Márton Stromgald\nManaCost:2 R R\nTypes:Legendary Creature Human\nOracle:Attacking creatures get +1/+0.\n',
  'm/malakir_rebirth.txt': 'Name:Malakir Rebirth\nManaCost:B\nTypes:Instant\nAlternateMode:Modal\nOracle:Target creature gains a counter.\nALTERNATE\n\nName:Malakir Mire\nManaCost:no cost\nTypes:Land\nOracle:Enters tapped.\n',
  'f/fire_ice.txt': 'Name:Fire\nManaCost:1 R\nTypes:Instant\nAlternateMode:Split\nOracle:Deals 2 damage divided.\nALTERNATE\n\nName:Ice\nManaCost:1 U\nTypes:Instant\nOracle:Tap target permanent.\n',
  'b/boseiju_who_endures.txt': 'Name:Boseiju, Who Endures\nTypes:Legendary Land\nOracle:Channel.\n',
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'forge-fixture-'));
  for (const [path, text] of Object.entries(CARDS)) {
    const full = join(root, 'forge-gui/res/cardsfolder', path);
    mkdirSync(full.slice(0, full.lastIndexOf('/')), {recursive: true});
    writeFileSync(full, text);
  }
  return root;
}

test('every card the old filename guess missed now resolves', () => {
  const root = fixture();
  try {
    const index = buildForgeCardIndex(root);
    assert.equal(index.scripts, Object.keys(CARDS).length);

    /* The four failures that shipped a deck Forge could not load. Each one is a card whose
     * guessed path -- malakir_rebirth_malakir_mire, lim_dls_vault, therize, jtun_grunt -- does
     * not exist, and whose miss was then discarded by the only consumer of the answer. */
    for (const name of ['Malakir Rebirth // Malakir Mire', "Lim-Dûl's Vault", 'Ætherize', 'Jötun Grunt', 'Márton Stromgald']) {
      assert.ok(index.resolve(name), `${name} must resolve`);
    }

    // A double-faced card answers to either face and to the joined Scryfall name.
    for (const name of ['Malakir Rebirth', 'Malakir Mire', 'Malakir Rebirth // Malakir Mire']) {
      assert.equal(index.resolve(name).script, 'forge-gui/res/cardsfolder/m/malakir_rebirth.txt');
    }
    for (const name of ['Fire', 'Ice', 'Fire // Ice']) {
      assert.equal(index.resolve(name).script, 'forge-gui/res/cardsfolder/f/fire_ice.txt');
    }
    assert.equal(index.resolve('Sol Ring').matchedBy, 'exact');
    assert.equal(index.resolve('Boseiju, Who Endures').matchedBy, 'exact');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('a pasted list that drops the accents still resolves, and a card Forge lacks does not', () => {
  const root = fixture();
  try {
    const index = buildForgeCardIndex(root);
    /* People paste from places that strip diacritics. The normalized rung is for them, and it is
     * the LAST rung, so it can never shadow an exact name. */
    assert.equal(index.resolve("Lim-Dul's Vault").matchedBy, 'normalized');
    assert.equal(index.resolve('AEtherize').matchedBy, 'normalized');
    assert.equal(index.resolve('Jotun Grunt').matchedBy, 'normalized');
    assert.equal(index.resolve('Marton Stromgald').matchedBy, 'normalized');
    assert.equal(index.resolve('boseiju who endures').matchedBy, 'normalized');

    // The point of the whole exercise: a card the engine does not have must come back as absent.
    assert.equal(index.resolve('Nonexistent Cardname'), null);
    assert.equal(index.resolve('Sol Ringg'), null);
    assert.equal(index.resolve(''), null);
    assert.equal(index.resolve(null), null);

    assert.ok(index.suggest('Sol Rng').includes('sol ring'), 'a near miss should offer the real card');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('a missing or archived card database is reported, never guessed at', () => {
  const empty = mkdtempSync(join(tmpdir(), 'forge-empty-'));
  try {
    assert.throws(() => buildForgeCardIndex(empty), /No Forge card scripts/);

    // A zip is the packaging some Forge builds ship. Saying so beats reporting every card missing.
    mkdirSync(join(empty, 'forge-gui/res'), {recursive: true});
    writeFileSync(join(empty, 'forge-gui/res/cardsfolder.zip'), 'PK');
    assert.throws(() => buildForgeCardIndex(empty), /Extract it/);

    /* The deck catalog is assembled at import time, so a machine without Forge must still be able
     * to browse decks. The loader reports the state instead of taking the process down with it. */
    resetForgeCardIndexCache();
    const loaded = loadForgeCardIndex(empty);
    assert.equal(loaded.available, false);
    assert.match(loaded.reason, /Extract it/);
  } finally { rmSync(empty, {recursive: true, force: true}); resetForgeCardIndexCache(); }
});

test('name folding and Name: parsing', () => {
  assert.equal(normalizeCardName("Lim-Dûl's Vault"), 'lim dul s vault');
  assert.equal(normalizeCardName('Ætherize'), 'aetherize');
  assert.equal(normalizeCardName('Jötun Grunt'), 'jotun grunt');
  assert.equal(normalizeCardName('Malakir Rebirth // Malakir Mire'), 'malakir rebirth // malakir mire');
  assert.deepEqual(scriptNames(CARDS['f/fire_ice.txt']), ['Fire', 'Ice']);
  assert.deepEqual(scriptNames('Types:Land\nOracle:nothing\n'), []);
});
