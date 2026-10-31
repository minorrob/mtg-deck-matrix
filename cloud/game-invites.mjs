/* CREATE GAME'S INVITATIONS (ROB-320; docs/program/rob-320-invitations-contract.md §2). The Worker's half of "choose 2 or more human
 * players, select their names from the dropdown if a crankmagic user OR put in their name and email > create game": cloud/tables.mjs
 * asks `plan` before the table exists and `send` after it does.
 *
 *   plan   a dropdown pick (the name or handle GET /api/users/search gave) becomes the address the server holds for that person --
 *          the page never has one -- and every guest is checked whole (cap, group, duplicates) with nothing written. A refusal here
 *          leaves no table, no admission, no email.
 *   send   each guest is admitted, recorded and emailed the lobby link and their name (cloud/sharing.mjs inviteToGame), one at a
 *          time. A guest's failure is that guest's: their seat stays held, and `one` sends the same invitation again.
 *
 * Present only where the sharing service is on (SHARING_ENABLED, a database, a person): elsewhere a seat made with an address is held
 * and nothing is mailed, as it was.
 */
import {sharing, ShareError} from './sharing.mjs';
import {createLibrary} from './library.mjs';
import {userByName} from './lounge.mjs';

const clean = (v, n = 80) => String(v ?? '').trim().slice(0, n);

/** @returns {?{plan: Function, send: Function, one: Function}} null where invitations are not switched on */
export function gameInvitations(env, who, {now, fetchImpl, origin}) {
  if (!env.DB || env.SHARING_ENABLED !== 'on' || !who || who.service || !who.email) return null;
  const service = sharing(env.DB, env, {now, fetchImpl, cacheProjections: false});
  const person = async () => ({...(await createLibrary(env.DB, {now}).user(who.email))});

  /** @param {object[]} seats the request's seats after the host's @returns {Promise<?{seats: object[], people: object[]}>} */
  async function plan(seats) {
    const out = [...seats], people = [];
    for (const [i, seat] of seats.entries()) {
      if (!seat || seat.kind !== 'human' || !(seat.email || seat.user)) continue;
      let to = clean(seat.email, 254).toLowerCase();
      if (!to) {
        const found = await userByName(env.DB, who.email, seat.user);
        if (!found.email) throw new ShareError(found.ambiguous
          ? `Two CrankMagic users are named "${clean(seat.user, 60)}". Type the one you mean as a name and email instead.`
          : `No CrankMagic user is named "${clean(seat.user, 60)}". Type their name and email instead.`, 422);
        to = found.email;
      }
      const name = clean(seat.name || seat.user, 80), group = seat.group;
      people.push({seatId: i + 1, to, name, group});
      out[i] = {kind: 'human', name, email: to, ...(group ? {group} : {})};
    }
    if (!people.length) return null;
    await service.planGuests(await person(), people.map(({to, group}) => ({to, group})));
    return {seats: out, people};
  }

  /** One guest's invitation: admitted, recorded, emailed. Never throws for the guest's own failure; never returns an address. */
  async function one({tableId, seatId, to, name, group, hostName}) {
    try {
      const sent = await service.inviteToGame(await person(), {to, name, group: group ?? undefined, tableId, hostName}, origin);
      return sent.status === 'sent' ? {seatId, name, status: 'sent'}
        : {seatId, name, status: sent.status === 'pending' ? 'pending' : 'failed', error: 'The invitation email could not be sent. The seat is held for them: press Send again to retry.'};
    } catch (error) {
      if (error instanceof ShareError) return {seatId, name, status: 'failed', error: error.message};
      throw error;
    }
  }

  async function send(planned, {tableId, hostName}) {
    const results = [];
    for (const p of planned.people) results.push(await one({...p, tableId, hostName}));
    return results;
  }
  return {plan, send, one};
}
