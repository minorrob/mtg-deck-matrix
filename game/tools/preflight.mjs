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
import {readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findPlaywright} from '../../tests/uat/browser-runner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browserReady = Boolean(findPlaywright());
/* CI's own two variables. With them set, a suite that would have skipped itself fails instead. */
const env = browserReady ? {...process.env, PAGE_BUDGET_REQUIRED: '1', GEOMETRY_REQUIRED: '1'} : process.env;
const run = (file, args = []) => spawnSync(process.execPath, [file, ...args], {cwd: root, encoding: 'utf8', env});

/* THE TWO BROWSER SUITES ARE NOT EXCUSED HERE.
 *
 * They were, and it was wrong. page-budget and browser-geometry skip themselves and exit 0 when no
 * browser is present, so a run without Playwright reported them green; this file then listed them
 * as "known Windows checkout artefacts" and passed over them by name. That turned a silent gap into
 * a documented one, inside the tool whose entire job is to say whether this machine is ready -- and
 * it hid a real failure: page-budget was genuinely red on main for two commits, which only CI
 * caught, because CI sets the two _REQUIRED variables that turn the self-skip into a failure.
 *
 * So: when Playwright is here, this sets those same variables and the suites must actually pass.
 * When it is not, they are reported as NOT RUN -- named, with the command that would run them, and
 * carried into the final verdict. A check that was skipped is not evidence that anything passed. */
const BROWSER_INSTALL = 'npm install --no-save --no-package-lock playwright@1.56.0 && npx playwright install --with-deps chromium';

console.log('CrankMagic Online pre-flight\n' + '='.repeat(60));

// ---- 1. the suites -------------------------------------------------------
const suites = [
  ...readdirSync(resolve(root, 'tests')).filter((f) => f.endsWith('.mjs')).map((f) => ['tests', f]),
  ...readdirSync(resolve(root, 'game/tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => ['game/tests', f]),
];
const failed = [], notRun = [];
process.stdout.write(`\n1. Test suites (${suites.length}) `);
for (const [dir, file] of suites) {
  const result = run(resolve(root, dir, file));
  // A suite that declares its own skip is not a pass. It is reported by name, whatever its exit code.
  if (result.status === 0 && /\bSKIPPED\b/.test(result.stdout || '')) {
    notRun.push({name: `${dir}/${file}`, why: (result.stdout.match(/SKIPPED\s*[\u2014-]\s*([^.\n]+)/) || [, 'it skipped itself'])[1].trim()});
    process.stdout.write('s'); continue;
  }
  if (result.status === 0) { process.stdout.write('.'); continue; }
  failed.push({name: `${dir}/${file}`, output: (result.stdout || '') + (result.stderr || '')});
  process.stdout.write('X');
}
console.log('');
if (notRun.length) {
  console.log(`   ${notRun.length} suite(s) DID NOT RUN:`);
  for (const item of notRun) console.log(`     ${item.name} - ${item.why}`);
  console.log(`   To run them:  ${BROWSER_INSTALL}`);
}
if (failed.length) {
  console.log(`   ${failed.length} SUITE(S) FAILED:`);
  for (const f of failed) {
    console.log(`\n   --- ${f.name} ---`);
    console.log(f.output.split('\n').slice(0, 18).map((l) => '   ' + l).join('\n'));
  }
} else {
  console.log(`   ok - ${suites.length - notRun.length} suites passed${browserReady ? ', browser suites included' : ''}`);
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
if (notRun.length) {
  // Green with a hole in it is still a hole, and saying so is the whole point of this file.
  console.log(`✓ Everything that ran passed - but ${notRun.length} suite(s) did not run, so this is not a clean bill of health.`);
  console.log(`  ${notRun.map((item) => item.name).join(', ')}`);
  console.log(`  ${BROWSER_INSTALL}`);
} else {
  console.log('✓ Steps 1 to 3 all pass. This computer is ready to host.');
}
console.log('  Steps 4 to 9 need a running game and a browser - see the run-book.');
