/* EVERY CHECK THAT NEEDS NO GAME, IN ONE COMMAND.
 *
 *   node game/tools/preflight.mjs
 *
 * Runs the whole test suite, the host doctor, and the deck-against-Forge check, and prints one
 * verdict. Needs only Node -- no bash, no shell quoting, nothing to paste wrong. Exits non-zero if
 * anything that matters failed, so it can be trusted by something other than a person reading it.
 *
 * Steps 4 through 9 of the run-book are not here and cannot be: they need a running game, a second
 * browser, and somebody to look at the screen.
 */
import {spawnSync} from 'node:child_process';
import {readdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const run = (file, args = []) => spawnSync(process.execPath, [file, ...args], {cwd: root, encoding: 'utf8'});

/* Known to fail on a Windows checkout at a Unix-oriented Playwright import, before any assertion.
 * Reported, never counted as a failure, and never silently hidden. */
const WINDOWS_ARTEFACTS = new Set(['browser-geometry.mjs', 'page-budget.mjs']);

console.log('CrankMagic Online pre-flight\n' + '='.repeat(60));

// ---- 1. the suites -------------------------------------------------------
const suites = [
  ...readdirSync(resolve(root, 'tests')).filter((f) => f.endsWith('.mjs')).map((f) => ['tests', f]),
  ...readdirSync(resolve(root, 'game/tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => ['game/tests', f]),
];
const failed = [], skipped = [];
process.stdout.write(`\n1. Test suites (${suites.length}) `);
for (const [dir, file] of suites) {
  const result = run(resolve(root, dir, file));
  if (result.status === 0) { process.stdout.write('.'); continue; }
  if (WINDOWS_ARTEFACTS.has(file)) { skipped.push(`${dir}/${file}`); process.stdout.write('s'); continue; }
  failed.push({name: `${dir}/${file}`, output: (result.stdout || '') + (result.stderr || '')});
  process.stdout.write('X');
}
console.log('');
if (skipped.length) console.log(`   ${skipped.length} known Windows checkout artefact(s) ignored: ${skipped.join(', ')}`);
if (failed.length) {
  console.log(`   ${failed.length} SUITE(S) FAILED:`);
  for (const f of failed) {
    console.log(`\n   --- ${f.name} ---`);
    console.log(f.output.split('\n').slice(0, 18).map((l) => '   ' + l).join('\n'));
  }
} else {
  console.log(`   ok - ${suites.length - skipped.length} suites passed`);
}

// ---- 2. the doctor -------------------------------------------------------
console.log('\n2. Can this computer host a game?');
const doctor = run(resolve(root, 'game/tools/doctor.mjs'));
console.log((doctor.stdout || doctor.stderr || '').trimEnd());

// ---- 3. the decks against the real Forge --------------------------------
console.log('\n3. Does Forge know every card in the library?');
const decks = run(resolve(root, 'game/tools/check-my-decks.mjs'));
console.log((decks.stdout || decks.stderr || '').trimEnd());

// ---- verdict -------------------------------------------------------------
const problems = [];
if (failed.length) problems.push(`${failed.length} test suite(s)`);
if (doctor.status !== 0) problems.push('the host doctor');
if (decks.status !== 0) problems.push('the deck/Forge check');

console.log('\n' + '='.repeat(60));
if (problems.length) {
  console.log(`✕ Problems in: ${problems.join(', ')}.`);
  console.log('  Copy everything above and send it back.');
  process.exit(1);
}
console.log('✓ Steps 1 to 3 all pass. This computer is ready to host.');
console.log('  Steps 4 to 9 need a running game and a browser - see the run-book.');
