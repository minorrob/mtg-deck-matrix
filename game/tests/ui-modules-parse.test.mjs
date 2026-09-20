import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/* EVERY ONLINE UI MODULE PARSES. Nothing in the suites imports game/ui/setup.mjs -- it reads the
   DOM at load -- so a syntax error in it was invisible to 92 green suites while the host's Game
   setup page failed to load at all, for two days, on the tree Rob plays. The browser reports that
   as one line in a console nobody had open. This asks Node to parse each file the way the browser
   would, so a missing parenthesis is a red suite rather than a blank page. */
const dir = fileURLToPath(new URL('../ui/', import.meta.url));
const modules = readdirSync(dir).filter((name) => /\.(mjs|js)$/.test(name)).sort();

test('the online UI directory has modules to check', () => {
  assert.ok(modules.includes('setup.mjs') && modules.includes('guest.mjs') && modules.includes('review.mjs'));
});

for (const name of modules) {
  test(`${name} parses`, () => {
    const result = spawnSync(process.execPath, ['--check', path.join(dir, name)], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, `${name} does not parse:\n${(result.stderr || '').split('\n').filter((l) => /SyntaxError|\^/.test(l) || /^\s*at /.test(l) === false).slice(0, 6).join('\n')}`);
  });
}
