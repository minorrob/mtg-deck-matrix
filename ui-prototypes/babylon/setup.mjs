// Pinned, local-only engine; no install scripts and no floating CDN dependency.
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dest = new URL('./node_modules/babylonjs/', import.meta.url);
const response = await fetch('https://registry.npmjs.org/babylonjs/-/babylonjs-9.30.0.tgz');
if (!response.ok) throw Error(`Download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const expected = 'zqeeZ3aTJ6HccL6Tkt1EcoGWvSsrs68ZRTzRuzdy2r/+q1OjziUh1JNDw2KUDkS1pmAUCcvcoviaXC4CMW4WIA==';
if (createHash('sha512').update(bytes).digest('base64') !== expected) throw Error('Engine integrity mismatch');
await mkdir(dest, {recursive:true});
const {fileURLToPath} = await import('node:url');
const archive = new URL('engine.tgz', dest);
await writeFile(archive, bytes);
execFileSync('tar', ['-xzf', fileURLToPath(archive), '-C', fileURLToPath(dest), '--strip-components=1', 'package/babylon.js', 'package/license.md']);
console.log('Babylon.js 9.30.0 installed and verified (Apache-2.0).');
