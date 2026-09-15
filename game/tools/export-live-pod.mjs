import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {snapshotLibraryDeck, forgeDeckText, canonical, sha256} from '../contracts/deck-snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] || resolve(root, 'game/.local/pod'));
const state = JSON.parse(readFileSync(resolve(root, 'data/live-state.json'))).payload.state;
const factsFile = JSON.parse(readFileSync(resolve(root, 'data/card-facts.json')));
const identities = JSON.parse(readFileSync(resolve(root, 'game/fixtures/live-identities.json'))).cards;
const revision = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const capturedAt = new Date().toISOString();
const snapshots = Object.values(state.decks).map(d => snapshotLibraryDeck(state, d.id, {facts: factsFile.cards, identities, sourceRevision: revision, capturedAt}));
mkdirSync(out, {recursive:true});
for (const deck of snapshots) {
  const id = deck.deckId.split(':').at(-1);
  writeFileSync(resolve(out, id + '.json'), JSON.stringify(deck, null, 2) + '\n');
  writeFileSync(resolve(out, id + '.dck'), forgeDeckText(deck));
}
const seatIds = ['D2', 'D6', 'D3', 'D5'];
const seats = seatIds.map((id, index) => ({seatId: index, deck: snapshots.find(d => d.deckId.endsWith(':' + id))}));
const pack = {schema:'CommanderPodPack@1', capturedAt, sourceRevision: revision,
  factsVersion: factsFile.generatedAt, seats, settings:{format:'Commander', startingLife:40, measured:false},
  coverageStatus:'unverified', podHash:sha256(canonical(seats.map(s => s.deck.gameplayHash)))};
writeFileSync(resolve(out, 'pod.json'), JSON.stringify(pack, null, 2) + '\n');
console.log(JSON.stringify({out, podHash:pack.podHash, decks:snapshots.map(d=>({name:d.name, total:d.total, library:d.library.reduce((n,c)=>n+c.quantity,0), hash:d.gameplayHash}))}, null, 2));
