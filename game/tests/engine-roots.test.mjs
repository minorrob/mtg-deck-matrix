/* WHERE THE ENGINE AND ITS JDK ACTUALLY ARE.
 *
 * From Grok Bot's UAT of #311 (UAT-START-02, S1): "Host+3AI Start→Forge — 400 spawnSync javac.exe
 * ENOENT — C:\Users\robmi\CrankMagic\commander-runtime\jdk-17... missing".
 *
 * Verified here rather than taken on trust, and it is real. `commander-runtime` does not exist on
 * this machine; the JDK is at `CrankMagic/runtime/jdk-17.0.20.1+1`. Two resolutions of the same
 * thing had drifted apart:
 *
 *   game/tools/doctor.mjs:86          process.env.CRANKMAGIC_JDK_ROOT  -> reports "ok"
 *   game/tools/local-game-launcher.mjs:43  resolve(root,'../commander-runtime/jdk-17.0.20.1+1')
 *
 * So the doctor passed while Start failed, which is the worst possible pair: the check that
 * exists to tell you the machine is ready said yes, and the thing it was checking for was looked
 * for somewhere else. `check-my-decks.mjs` and `setup-catalog.mjs` both honour the environment
 * variables; the launcher was the one place that did not.
 *
 * These hold the launcher to the same convention, and to naming what it looked for when it comes
 * up empty -- an ENOENT on javac tells nobody anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {resolveEngineRoots} from '../tools/local-game-launcher.mjs';

const sandbox = () => mkdtempSync(join(tmpdir(), 'engine-roots-'));

test('the environment wins, because that is what the doctor reads', () => {
  const home = sandbox();
  const jdk = resolve(home, 'somewhere/jdk-17');
  mkdirSync(resolve(jdk, 'bin'), {recursive: true});
  writeFileSync(resolve(jdk, 'bin', 'javac.exe'), '');
  const forge = resolve(home, 'forge');
  mkdirSync(forge, {recursive: true});
  const got = resolveEngineRoots({
    root: resolve(home, 'repo'),
    env: {CRANKMAGIC_JDK_ROOT: jdk, CRANKMAGIC_FORGE_ROOT: forge},
  });
  assert.equal(got.jdk, jdk);
  assert.equal(got.forge, forge);
});

test('without the environment it finds a JDK beside the repository', () => {
  const home = sandbox();
  /* the layout on Personal-HP: CrankMagic/repo, CrankMagic/runtime/jdk-..., CrankMagic/forge */
  const jdk = resolve(home, 'runtime/jdk-17.0.20.1+1');
  mkdirSync(resolve(jdk, 'bin'), {recursive: true});
  writeFileSync(resolve(jdk, 'bin', 'javac.exe'), '');
  mkdirSync(resolve(home, 'forge'), {recursive: true});
  const got = resolveEngineRoots({root: resolve(home, 'repo'), env: {}});
  assert.equal(got.jdk, jdk, 'runtime/ is where the JDK is, and where the doctor points');
});

test('a JDK without javac is not a JDK', () => {
  const home = sandbox();
  const jre = resolve(home, 'runtime/jdk-17.0.20.1+1');
  mkdirSync(resolve(jre, 'bin'), {recursive: true});   /* no javac inside */
  mkdirSync(resolve(home, 'forge'), {recursive: true});
  assert.throws(() => resolveEngineRoots({root: resolve(home, 'repo'), env: {}}), /javac/i,
    'the launcher compiles the adapter, so a runtime-only Java is no use to it');
});

test('when nothing is found it says where it looked', () => {
  const home = sandbox();
  mkdirSync(resolve(home, 'repo'), {recursive: true});
  let message = '';
  try { resolveEngineRoots({root: resolve(home, 'repo'), env: {}}); } catch (err) { message = err.message; }
  assert.match(message, /CRANKMAGIC_JDK_ROOT/,
    'name the way out, because "spawnSync javac.exe ENOENT" names nothing');
  assert.match(message, /runtime/, 'and name the places it tried');
});

test('the path that failed on Personal-HP is still accepted if it comes back', () => {
  const home = sandbox();
  const jdk = resolve(home, 'commander-runtime/jdk-17.0.20.1+1');
  mkdirSync(resolve(jdk, 'bin'), {recursive: true});
  writeFileSync(resolve(jdk, 'bin', 'javac.exe'), '');
  mkdirSync(resolve(home, 'forge'), {recursive: true});
  const got = resolveEngineRoots({root: resolve(home, 'repo'), env: {}});
  assert.equal(got.jdk, jdk, 'the old location still works; it is just no longer the only one');
});
