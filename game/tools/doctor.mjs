/* CAN THIS COMPUTER HOST A GAME TONIGHT?
 *
 * Readiness used to be assembled by hand from a dozen places, which meant it was assembled after
 * the guests arrived. Every check below is one that has actually gone wrong: a Forge checkout that
 * moved, a card database that reported every card missing, a credential renamed in Windows, a
 * cloudflared that was never installed, a port still held by a host from this morning.
 *
 * Three outcomes, and the difference matters. `fail` means a game cannot start. `warn` means
 * something narrower will not work -- API pilots, remote guests -- and the rest still will.
 * `skip` means the check does not apply to this machine and is NOT evidence of anything.
 */
import {existsSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadForgeCardIndex, resetForgeCardIndexCache} from '../contracts/forge-card-index.mjs';
import {readWindowsGenericCredential} from './windows-credential.mjs';

const MIN_NODE_MAJOR = 20;
/* A Forge checkout with a handful of scripts is a broken or half-finished one. The real database
 * is tens of thousands; this only has to be high enough to catch a directory that is not it. */
const MIN_CARD_SCRIPTS = 1000;

const ok = (id, label, detail) => ({id, label, status: 'ok', detail});
const warn = (id, label, detail) => ({id, label, status: 'warn', detail});
const fail = (id, label, detail) => ({id, label, status: 'fail', detail});
const skip = (id, label, detail) => ({id, label, status: 'skip', detail});

function checkNode(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  return major >= MIN_NODE_MAJOR
    ? ok('node', 'Node runtime', `${version}`)
    : fail('node', 'Node runtime', `${version} is older than the v${MIN_NODE_MAJOR} this host needs. Install the current LTS.`);
}

function checkForge(forgeRoot) {
  resetForgeCardIndexCache();
  const loaded = loadForgeCardIndex(forgeRoot);
  if (!loaded.available) return fail('forge-cards', 'Forge card database', loaded.reason);
  if (loaded.index.scripts < MIN_CARD_SCRIPTS) {
    return fail('forge-cards', 'Forge card database',
      `only ${loaded.index.scripts} card scripts under ${forgeRoot}; that is not a complete Forge checkout.`);
  }
  return ok('forge-cards', 'Forge card database',
    `${loaded.index.scripts.toLocaleString('en-US')} card scripts, ${loaded.index.names.toLocaleString('en-US')} names`);
}

function checkJava(javaRoot) {
  if (!javaRoot) return warn('java', 'Java runtime', 'no JDK path given; set CRANKMAGIC_JDK_ROOT or keep the runtime beside the repository.');
  const bin = resolve(javaRoot, 'bin');
  if (!existsSync(bin)) return fail('java', 'Java runtime', `no bin directory at ${bin}. Forge cannot start without a JDK.`);
  const has = readdirSync(bin).some((f) => f === 'java' || f === 'java.exe');
  return has ? ok('java', 'Java runtime', javaRoot)
             : fail('java', 'Java runtime', `no java executable in ${bin}.`);
}

function checkCredential({platform, credential, read}) {
  if (platform !== 'win32') return skip('openai', 'OpenAI credential', 'Windows Credential Manager is not available on this platform.');
  if (!credential) return skip('openai', 'OpenAI credential', 'no credential name configured.');
  return read(credential)
    ? ok('openai', 'OpenAI credential', `${credential} is readable`)
    : warn('openai', 'OpenAI credential', `${credential} could not be read. Native Forge AI still works; API pilots will not.`);
}

function checkTunnel({platform, cloudflared}) {
  if (platform !== 'win32') return skip('cloudflared', 'Remote guest tunnel', 'checked on the Windows host only.');
  return cloudflared
    ? ok('cloudflared', 'Remote guest tunnel', 'cloudflared is installed')
    : warn('cloudflared', 'Remote guest tunnel', 'cloudflared is missing, so remote guests cannot be invited. Solo and local play are unaffected.');
}

async function checkHost({port, probe}) {
  try {
    const health = await probe(`http://127.0.0.1:${port}/api/health`);
    return health?.product === 'CrankMagic Online' && health?.protocol === 1
      ? ok('host', 'Local host', `answering on ${port}`)
      : fail('host', 'Local host', `something else is listening on ${port}. Inspect it before starting; a game may be running.`);
  } catch {
    return warn('host', 'Local host', `nothing is listening on ${port} yet. The launcher starts it.`);
  }
}

/** Every check, as data. The CLI below only prints what this returns. */
export async function runDoctor({
  forgeRoot = process.env.CRANKMAGIC_FORGE_ROOT || resolve(process.cwd(), '../forge'),
  javaRoot = process.env.CRANKMAGIC_JDK_ROOT || null,
  port = Number(process.env.COMMANDER_PORT || 8768),
  platform = process.platform,
  credential = process.env.COMMANDER_OPENAI_CREDENTIAL || 'crankmagic_openai_api',
  cloudflared = false,
  nodeVersion = process.version,
  read = readWindowsGenericCredential,
  probe = async (url) => (await fetch(url, {signal: AbortSignal.timeout(2500)})).json(),
} = {}) {
  const checks = [
    checkNode(nodeVersion),
    checkForge(forgeRoot),
    checkJava(javaRoot),
    await checkHost({port, probe}),
    checkCredential({platform, credential, read}),
    checkTunnel({platform, cloudflared}),
  ];
  const failed = checks.filter((c) => c.status === 'fail');
  return {
    schema: 'CrankMagicDoctor@1',
    ok: failed.length === 0,
    summary: failed.length
      ? `${failed.length} blocking problem${failed.length === 1 ? '' : 's'}: ${failed.map((c) => c.label).join(', ')}`
      : 'Ready to host a game.',
    checks,
  };
}

export function formatDoctor(report) {
  const mark = {ok: 'ok  ', warn: 'warn', fail: 'FAIL', skip: '--  '};
  return [
    ...report.checks.map((c) => `  ${mark[c.status]}  ${c.label.padEnd(22)} ${c.detail}`),
    '',
    (report.ok ? '✓ ' : '✕ ') + report.summary,
  ].join('\n');
}

/** Detection belongs to the CLI, so runDoctor() stays injectable and testable off Windows. */
function detectCloudflared(platform = process.platform) {
  if (platform !== 'win32') return false;
  try { execFileSync('where', ['cloudflared'], {stdio: 'ignore', windowsHide: true}); return true; }
  catch { return existsSync('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'); }
}

// process.argv[1] is a native path (C:\... on Windows); compare URLs, not a hand-built string.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runDoctor({cloudflared: detectCloudflared()});
  console.log(process.argv.includes('--json') ? JSON.stringify(report) : formatDoctor(report));
  process.exit(report.ok ? 0 : 1);
}
