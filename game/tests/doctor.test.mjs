import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runDoctor, formatDoctor} from '../tools/doctor.mjs';

/* A Forge checkout big enough to look real. The doctor's job is partly to tell a complete card
 * database from a directory that merely has the right name. */
function forgeFixture(scripts = 1200) {
  const root = mkdtempSync(join(tmpdir(), 'doctor-forge-'));
  const folder = join(root, 'forge-gui/res/cardsfolder/s');
  mkdirSync(folder, {recursive: true});
  for (let i = 0; i < scripts; i++) writeFileSync(join(folder, `card_${i}.txt`), `Name:Card ${i}\nTypes:Artifact\n`);
  return root;
}
function jdkFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doctor-jdk-'));
  mkdirSync(join(root, 'bin'), {recursive: true});
  writeFileSync(join(root, 'bin/java'), '');
  return root;
}
const base = (over = {}) => ({
  platform: 'win32', nodeVersion: 'v22.0.0', cloudflared: true, credential: 'crankmagic_openai_api',
  read: () => 'a-key-long-enough-to-be-real', probe: async () => ({product: 'CrankMagic Online', protocol: 1}),
  ...over,
});
const by = (report, id) => report.checks.find((c) => c.id === id);

test('a host with everything in place reports ready', async () => {
  const forgeRoot = forgeFixture(), javaRoot = jdkFixture();
  try {
    const report = await runDoctor(base({forgeRoot, javaRoot}));
    assert.equal(report.ok, true, formatDoctor(report));
    assert.equal(by(report, 'forge-cards').status, 'ok');
    assert.match(by(report, 'forge-cards').detail, /1,200 card scripts/);
    assert.equal(by(report, 'host').status, 'ok');
  } finally { rmSync(forgeRoot, {recursive: true, force: true}); rmSync(javaRoot, {recursive: true, force: true}); }
});

test('a moved Forge checkout is a blocking failure, named as one', async () => {
  const javaRoot = jdkFixture();
  try {
    const report = await runDoctor(base({forgeRoot: join(tmpdir(), 'forge-that-is-not-there'), javaRoot}));
    assert.equal(report.ok, false);
    assert.equal(by(report, 'forge-cards').status, 'fail');
    assert.match(report.summary, /Forge card database/);
    // The other checks still report; one failure must not mask the rest of the picture.
    assert.equal(by(report, 'java').status, 'ok');
  } finally { rmSync(javaRoot, {recursive: true, force: true}); }
});

/* A directory with a dozen card scripts is a half-finished checkout, and it used to present as a
 * working one right up until a deck failed to load. */
test('a truncated card database is caught before a game starts', async () => {
  const forgeRoot = forgeFixture(12), javaRoot = jdkFixture();
  try {
    const report = await runDoctor(base({forgeRoot, javaRoot}));
    assert.equal(report.ok, false);
    assert.match(by(report, 'forge-cards').detail, /not a complete Forge checkout/);
  } finally { rmSync(forgeRoot, {recursive: true, force: true}); rmSync(javaRoot, {recursive: true, force: true}); }
});

test('a missing credential or tunnel narrows the evening without blocking it', async () => {
  const forgeRoot = forgeFixture(), javaRoot = jdkFixture();
  try {
    const report = await runDoctor(base({forgeRoot, javaRoot, cloudflared: false, read: () => null}));
    assert.equal(report.ok, true, 'neither stops a local game from starting');
    assert.equal(by(report, 'openai').status, 'warn');
    assert.equal(by(report, 'cloudflared').status, 'warn');
    assert.match(by(report, 'cloudflared').detail, /Solo and local play are unaffected/);
  } finally { rmSync(forgeRoot, {recursive: true, force: true}); rmSync(javaRoot, {recursive: true, force: true}); }
});

test('checks that do not apply are skipped, never reported as passing', async () => {
  const forgeRoot = forgeFixture(), javaRoot = jdkFixture();
  try {
    const report = await runDoctor(base({forgeRoot, javaRoot, platform: 'linux'}));
    assert.equal(by(report, 'openai').status, 'skip');
    assert.equal(by(report, 'cloudflared').status, 'skip');
    assert.equal(report.ok, true);
  } finally { rmSync(forgeRoot, {recursive: true, force: true}); rmSync(javaRoot, {recursive: true, force: true}); }
});

test('an old Node and a stranger on the port both block', async () => {
  const forgeRoot = forgeFixture(), javaRoot = jdkFixture();
  try {
    const old = await runDoctor(base({forgeRoot, javaRoot, nodeVersion: 'v16.20.0'}));
    assert.equal(by(old, 'node').status, 'fail');
    const taken = await runDoctor(base({forgeRoot, javaRoot, probe: async () => ({product: 'something else'})}));
    assert.equal(by(taken, 'host').status, 'fail');
    assert.match(by(taken, 'host').detail, /a game may be running/);
    // Nothing listening yet is the normal pre-launch state, not a problem.
    const cold = await runDoctor(base({forgeRoot, javaRoot, probe: async () => { throw Error('ECONNREFUSED'); }}));
    assert.equal(by(cold, 'host').status, 'warn');
    assert.equal(cold.ok, true);
  } finally { rmSync(forgeRoot, {recursive: true, force: true}); rmSync(javaRoot, {recursive: true, force: true}); }
});
