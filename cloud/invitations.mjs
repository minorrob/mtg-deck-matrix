/* INVITING A PERSON (ROB-320; docs/program/rob-320-invitations-contract.md §3-§5). The one place an address is admitted to
 * CrankMagic, for the Settings window and for Create game alike.
 *
 * Rob, 2026-10-29: a person who is not yet a CrankMagic user is "auto-registered as a user with CloudFlare for authentication.
 * No confirmation from me required"; invited by him they are a Game Theory Insider (the group with the AI model), invited by
 * anyone else they are in the group without it. 2026-10-30: three groups (General, Game Theory Insider, Owner), a cap of five
 * invitees per user, and "the table row is written in the same step as the Access admission (no admission without a row)".
 *
 * THE ORDER, and why it keeps those words true:
 *   1. the cap check and the row are ONE statement (INSERT ... SELECT ... WHERE count < cap), status 'pending';
 *   2. then Cloudflare Access is written and read back (cloud/access-invites.mjs), then the AI roster for an Insider;
 *   3. then the row becomes 'admitted'. The caller sends the email after that, never before.
 * Admission failing leaves the row 'pending'. It is the same invitation when it is sent again: the row is keyed by the invitee
 * (UNIQUE), the Access write reads before it writes, and the retry spends no second slot. Nothing is ever admitted without a row.
 *
 * Imports no game code; storage is the D1 binding. `fail(message, status)` throws the caller's error (ShareError in the Worker).
 */
import {admitAddress, inviteTargets} from './access-invites.mjs';
import {groupOf} from './access.mjs';

export const INVITE_CAP = 5;
export const GROUP_NAMES = Object.freeze(['general', 'insider']);
/** Five invitees per user (Rob, 2026-10-30), the owner too; INVITE_CAP, a positive integer, overrides it. */
export const capOf = env => { const n = Number(env?.INVITE_CAP); return Number.isInteger(n) && n >= 1 ? n : INVITE_CAP; };
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const address = (value, fail) => { const v = String(value ?? '').trim().toLowerCase(); return v.length <= 254 && ADDRESS.test(v) ? v : fail('Enter a valid email address.', 400); };
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();

const rowOf = (db, to) => first(db, 'SELECT * FROM invitations WHERE invitee_email=?', to);
const registered = async (db, to) => !!await first(db, 'SELECT 1 AS yes FROM users WHERE email=? UNION SELECT 1 FROM account_identities WHERE email=?', to, to);
const slotsUsed = async (db, inviterId) => Number((await first(db, 'SELECT count(*) AS n FROM invitations WHERE inviter_id=?', inviterId))?.n || 0);
/** The owner: OWNER_EMAIL (cloud/access.mjs), or an inviter the caller already knows is the administrator (`inviter.owner`). */
const ownerOf = async (db, env, inviter) => inviter.owner === true || (await groupOf(inviter.email, env, db)) === 'owner';
const hasAi = async (db, env, to) => ['owner', 'insider'].includes(await groupOf(to, env, db));

const capRefusal = (cap) => `You have already invited ${cap} people, the most one person can invite, so nothing was sent. Pick someone who already has a CrankMagic account (the dropdown), or ask the owner to invite this person or to raise the limit.`;
export const NO_AI = 'Only the CrankMagic owner can give someone AI access (Game Theory Insider). Invite them as General; the owner can upgrade them later.';

/** The group an invitation asks for, or null for "the inviter's default". Only the owner may ask for Insider. */
function asked(group, owner, fail) {
  if (group === undefined || group === null || group === '') return null;
  if (!GROUP_NAMES.includes(group)) fail('Choose Game Theory Insider or General.', 400);
  if (group === 'insider' && !owner) fail(NO_AI, 403);
  return group;
}

/**
 * A game's guests, checked whole before anything exists (Create game's plan): no row, no admission, no email.
 * @param {{inviter: {id: number, email: string}, people: {to: string, group?: string}[]}} input
 * @returns {Promise<{to: string, group: string, isNew: boolean}[]>} each person's address, the group they would get, and whether
 *   they would be a new account (the only thing that costs a slot)
 */
export async function vetInvitees(db, env, {inviter, people, fail}) {
  const owner = await ownerOf(db, env, inviter), seen = new Set(), out = [];
  for (const person of people) {
    const to = address(person.to, fail);
    if (to === String(inviter.email).toLowerCase()) fail('That is your own address. You are already at the table.', 400);
    if (seen.has(to)) fail('The same person is on two seats. Give each seat a different person.', 400);
    seen.add(to);
    const group = asked(person.group, owner, fail), row = await rowOf(db, to);
    const isNew = !row && !await registered(db, to);
    out.push({to, group: group ?? (isNew ? (owner ? 'insider' : 'general') : (row?.grp ?? ((await hasAi(db, env, to)) ? 'insider' : 'general'))), isNew});
  }
  const needed = out.filter(p => p.isNew).length;
  if (needed) {
    const cap = capOf(env), used = await slotsUsed(db, inviter.id);
    if (used + needed > cap) {
      if (used >= cap) fail(capRefusal(cap), 409);
      fail(`Inviting ${needed} new ${needed === 1 ? 'person' : 'people'} would bring you to ${used + needed} invitations, and the most one person can invite is ${cap}; you can invite only ${cap - used} more. Nothing was sent. Pick people who already have a CrankMagic account (the dropdown), or ask the owner to invite them.`, 409);
    }
  }
  return out;
}

/**
 * Admits one address and records it. Idempotent: the same invitation again finishes what failed and spends nothing.
 * @param {{inviter: {id: number, email: string}, to: string, name: string, group?: string, source: 'settings'|'game', tableId?: string,
 *   now: () => string, fetchImpl: Function, fail: Function}} input
 * @returns {Promise<{group: string, created: boolean, already: boolean, access: object[]}>} `already`: nothing was done because the
 *   person is already in, at this group or higher; `created`: a new row (a slot) was spent; `access`: what each application confirmed
 */
export async function inviteAddress(db, env, {inviter, to: given, name, group, source, tableId = null, now, fetchImpl, fail}) {
  const to = address(given, fail), explicit = group !== undefined && group !== null && group !== '';
  const owner = await ownerOf(db, env, inviter), want = asked(group, owner, fail);
  let row = await rowOf(db, to), created = false, final;
  /* A group chosen by default (the owner's guests are Insiders) is for a NEW account only. Someone already in changes group
     only when the owner explicitly says so: a Create game with an existing General friend must never hand them AI. */
  if (!row) {
    const known = await registered(db, to), insider = await hasAi(db, env, to);
    if (known && (want !== 'insider' || insider)) return {group: insider ? 'insider' : 'general', created: false, already: true, access: []};
    final = want ?? (owner ? 'insider' : 'general');
    /* Configuration is checked before any row is written: a copy that cannot admit anyone must not fill the table. */
    if (!env.ACCESS_INVITE_TOKEN || !inviteTargets(env, final).length || !/^[\da-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || ''))
      fail('Invitations need Access invitation permissions configured by the administrator, for this group. Nothing was sent.', 503);
    const stamp = now(), cap = known ? 1e9 : capOf(env);
    const made = await db.prepare(`INSERT INTO invitations(id,invitee_email,invitee_name,inviter_id,inviter_email,grp,source,table_id,status,created_at)
      SELECT ?,?,?,?,?,?,?,?,'pending',? WHERE (SELECT count(*) FROM invitations WHERE inviter_id=?)<? ON CONFLICT(invitee_email) DO NOTHING`)
      .bind(crypto.randomUUID(), to, String(name || to).trim().slice(0, 80), inviter.id, inviter.email, final, source, tableId, stamp, inviter.id, cap).run();
    created = made.meta.changes === 1;
    if (!created) { row = await rowOf(db, to); if (!row) fail(capRefusal(capOf(env)), 409); }
  }
  if (row) {
    if (row.status === 'admitted' && (want !== 'insider' || row.grp === 'insider')) return {group: row.grp, created: false, already: true, access: []};
    final = row.grp === 'insider' || want === 'insider' ? 'insider' : 'general';
    if (final !== row.grp || row.status !== 'pending') await db.prepare("UPDATE invitations SET grp=?,status='pending' WHERE invitee_email=?").bind(final, to).run();
  }
  /* The older list (names for the lounge, Admin's People and invites) keeps being written, beside the new record. */
  await db.prepare("INSERT INTO account_invitations(email,name,invited_by,created_at,status) VALUES (?,?,?,?,'pending') ON CONFLICT(email) DO UPDATE SET name=excluded.name")
    .bind(to, String(name || to).trim().slice(0, 80), inviter.id, now()).run();
  let access;
  try { access = await admitAddress(db, env, to, {now, fetchImpl, fail, group: final}); }
  catch (error) { error.message += ' Your invitation is saved: send the same invitation again to finish it (it uses no second slot).'; throw error; }
  if (final === 'insider')
    await db.prepare('INSERT OR IGNORE INTO ai_allowlist(email,added_at,note) VALUES (?,?,?)').bind(to, now(), 'Invited as Game Theory Insider by the owner (ROB-320)').run();
  await db.prepare("UPDATE invitations SET status='admitted',admitted_at=? WHERE invitee_email=?").bind(now(), to).run();
  await db.prepare("UPDATE account_invitations SET status='admitted' WHERE email=?").bind(to).run();
  return {group: final, created, already: false, access};
}
