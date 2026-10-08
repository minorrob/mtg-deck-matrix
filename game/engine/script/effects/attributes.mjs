/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DESIGNATIONS: WHAT A PERMANENT BECOMES WITHOUT ITS CHARACTERISTICS CHANGING (Train B, X11).
 *
 * Two of them, each a marker rules and effects can identify and nothing else (CR 701.37b, 722.3a), neither an ability nor
 * part of the permanent's copiable values, both gone with the permanent as it leaves the battlefield (CR 400.7):
 *
 *   MONSTROUS (CR 701.37). Monstrosity adds its counters and designation only if the permanent is not already monstrous
 *   (701.37a): `alterAttribute` with `attribute: "monstrous"` and `counters: N`, checked as it resolves --
 *   one already monstrous gets nothing (Protector of the Wastes' second activation does nothing). Becoming monstrous is an
 *   event, "when this creature becomes monstrous" (cards/index.mjs, rules/trigger.mjs), and the N it took is kept for
 *   "X" abilities that refer to it (701.37c).
 *
 *   PREPARED (CR 722.3). A permanent with a prepare spell (a preparation card's inset frame, CR 722.2) that becomes
 *   prepared -- "this creature enters prepared" (Goblin Glasswright, an entering replacement, CR 614.1c), or an effect --
 *   gets the designation, unless it already has it (722.3a); and as it does, its controller creates a copy of it in exile
 *   with only the prepare spell's characteristics (722.3c). For as long as the permanent stays on the battlefield and
 *   prepared, that copy stays in exile -- an exception to CR 704.5e (rules/sba.mjs) -- and the permanent's controller may
 *   cast it (rules/actions.mjs); casting it unprepares the permanent as it becomes cast (601.2i). Unprepared any other way
 *   (722.3b), or gone, and the copy ceases to exist. The copy is a copy of a card: cast, it is a spell like any other, and
 *   once it leaves the stack it ceases to exist (CR 704.5e; rules/stack.mjs).
 *
 * WHAT IS NAMED, NOT BUILT: a token or a permanent that is a copy of a preparation card having its prepare spell (722.2b,
 * copiable values) -- tokens and copies are made without one, so they never become prepared -- and a prepare spell that is
 * itself a permanent spell (cards/index.mjs refuses one).
 */

import {addObject, removeObject} from "../../state/index.mjs";
import {event, cardRef} from "./zones.mjs";
import {addCounters} from "./resources.mjs";
import {controllerOf} from "../../rules/layers.mjs";

/** The designations `alterAttribute` gives or takes. */
export const ATTRIBUTES = Object.freeze(["monstrous", "prepared"]);

/* That a permanent gained or lost a designation, for what watches ("when this creature becomes monstrous") and the history. */
const changed = (state, id, attribute, value) => event("GameEventCardAttribute", state, {card: cardRef(state, id), attribute, value});

/**
 * As a permanent becomes prepared (CR 722.3a, 722.3c): the designation, and the copy of it in exile with its prepare spell's
 * characteristics, made by and for its controller. Nothing for a permanent with no prepare spell or one already prepared.
 */
export function prepare(state, id, events = []) {
  const object = state.objects[id];
  if (object?.zone !== "battlefield" || !object.preparation || object.prepared === true) return events;
  object.prepared = true;
  const controller = controllerOf(state, id);
  const {of: _name, ...spell} = structuredClone(object.preparation);
  const copy = addObject(state, {...spell, copy: true, owner: controller, controller}, "exile");
  /* Which permanent it is the prepare spell of: what keeps it in exile (rules/sba.mjs) and lets it be cast (rules/actions.mjs). */
  state.objects[copy].prepareOf = id;
  object.preparedCopy = copy;
  events.push(changed(state, id, "prepared", true));
  return events;
}

/** Unprepared (CR 722.3b): the designation gone, and the copy in exile with it -- unless it is being cast (601.2i). */
export function unprepare(state, id, events = [], {keepCopy = false} = {}) {
  const object = state.objects[id];
  if (!object || object.prepared !== true) return events;
  delete object.prepared;
  const copy = object.preparedCopy;
  delete object.preparedCopy;
  if (!keepCopy && copy !== undefined && state.objects[copy]?.zone === "exile" && state.objects[copy].prepareOf === id) removeObject(state, copy);
  events.push(changed(state, id, "prepared", false));
  return events;
}

/** Whether this copy in exile is a prepared permanent's prepare spell, there while that permanent is (CR 722.3c). */
export function preparedCopyStays(state, id) {
  const copy = state.objects[id];
  const permanent = copy?.prepareOf !== undefined ? state.objects[copy.prepareOf] : null;
  return Boolean(permanent) && permanent.zone === "battlefield" && permanent.prepared === true && permanent.preparedCopy === id;
}

/**
 * `alterAttribute` -- a designation given or taken: `attribute` "monstrous" (CR 701.37; with `counters`, monstrosity N) or
 * "prepared" (CR 722.3; `value: false`, unprepared), on each of `targets` that is a permanent -- only a permanent can be
 * either (701.37b, 722.3a).
 */
export function alterAttribute(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (object?.zone !== "battlefield") continue;
    if (params.attribute === "monstrous") {
      if (params.value === false || object.monstrous === true) continue;
      const n = Number.isInteger(params.counters) ? Math.max(0, params.counters) : null;
      if (n) addCounters(state, id, "+1/+1", n, events, context.controller);
      object.monstrous = true;
      if (n !== null) object.monstrosityX = n;
      events.push(changed(state, id, "monstrous", true));
    }
    if (params.attribute === "prepared") {
      if (params.value === false) unprepare(state, id, events);
      else prepare(state, id, events);
    }
  }
  return events;
}
