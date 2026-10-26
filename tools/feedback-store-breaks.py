# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python3 game/tools/batch/breaks.py tools/feedback-store-breaks.py
# The feedback loop's store (PR 1; docs/feedback-loop/PLAN-2026-10-26.html): every promise the suite makes, broken one at
# a time, and the suite seen red for each. A test that cannot fail is a comment (AGENTS.md).
SUITES = ['tests/feedback-store.mjs']
SCHEMA, STORE, WORKER, ACCESS, SQL = 'feedback-schema.js', 'cloud/feedback.mjs', 'cloud/worker.mjs', 'cloud/access.mjs', 'cloud/migrations/0009_feedback.sql'
BREAKS = [
    # The schema's bounds.
    ('the text bound off', SCHEMA, 'text: text(r.text, LIMITS.text, "the report\'s text", {required: true, multiline: true}),', 'text: text(r.text, 1e9, "the report\'s text", {required: true, multiline: true}),'),
    ('the console bound off', SCHEMA, 'if (r.console.length > LIMITS.consoleLines) refuse(', 'if (false) refuse('),
    ('the screenshot bound off', SCHEMA, 'if (bytes > LIMITS.screenshotBytes) refuse(', 'if (false) refuse('),
    ('a PNG taken as a screenshot', SCHEMA, 'const SCREENSHOT = /^data:image\\/webp;base64,([A-Za-z0-9+/]+={0,2})$/;', 'const SCREENSHOT = /^data:image\\/\\w+;base64,([A-Za-z0-9+/]+={0,2})$/;'),
    ('a hand kept in the report', SCHEMA, '    const game = object(r.game, "the game");\n    if (game) {\n      const g = drop({', '    const game = object(r.game, "the game");\n    if (game) {\n      const g = drop({...game,'),
    ('a third kind let through', SCHEMA, 'if (!KINDS.includes(r.kind)) refuse(', 'if (typeof r.kind !== "string") refuse('),
    ('boundReport keeps the first console lines, not the last', SCHEMA, '.filter(Boolean).slice(-LIMITS.consoleLines);', '.filter(Boolean).slice(0, LIMITS.consoleLines);'),
    # The state machine.
    ('a skip allowed', SCHEMA, 'const mayMove = (from, to) => nextState(from) === to;', 'const mayMove = (from, to) => STATES.indexOf(to) > STATES.indexOf(from);'),
    ('a move back allowed', SCHEMA, 'const mayMove = (from, to) => nextState(from) === to;', 'const mayMove = (from, to) => Math.abs(STATES.indexOf(to) - STATES.indexOf(from)) === 1;'),
    ('triaged without its issue', SCHEMA, 'const REQUIRES = Object.freeze({triaged: "issue", released: "release", notified: "messageId"});', 'const REQUIRES = Object.freeze({released: "release", notified: "messageId"});'),
    ('the table takes a state outside the loop', SQL, "state TEXT NOT NULL CHECK (state IN ('new', 'triaged', 'approved', 'in-progress', 'released', 'notified')),", 'state TEXT NOT NULL,'),
    # The store.
    ('the hourly limit off', STORE, 'if (Number(recent.n) >= HOURLY_LIMIT) {', 'if (false) {'),
    ('the limit counted over all time', STORE, 'const at = now(), since = new Date(Date.parse(at) - HOUR).toISOString();', 'const at = now(), since = "1970-01-01T00:00:00.000Z";'),
    ('the limit counted over everyone', STORE, 'FROM feedback WHERE reporter = ?1 AND created_at > ?2").bind(person.email, since)', 'FROM feedback WHERE created_at > ?2").bind(person.email, since)'),
    ('the screenshot kept', STORE, 'JSON.stringify(kept), screenshot ? "dropped" : null, at)', 'JSON.stringify(kept), screenshot ?? null, at)'),
    ('the reporter read from the report', STORE, '.bind(id, person.email, group, kept.kind,', '.bind(id, (input.person && input.person.email) || person.email, group, kept.kind,'),
    ('the state filter ignored', STORE, 'where.push(`state = ?${args.push(state)}`);', 'args.push(state);'),
    ('a move that is not the next taken', STORE, 'if (change.state !== undefined && !mayMove(row.state, change.state)) {', 'if (false) {'),
    ('the owner is anyone', STORE, 'export const isOwner = (env, person) => !!person && String(env.INVITE_ADMIN_ID || "") !== "" && String(person.id) === String(env.INVITE_ADMIN_ID);', 'export const isOwner = (env, person) => !!person;'),
    ('the owner is anyone where no administrator is named', STORE, 'String(env.INVITE_ADMIN_ID || "") !== "" && String(person.id) === String(env.INVITE_ADMIN_ID);', 'String(person.id) === String(env.INVITE_ADMIN_ID || person.id);'),
    # The routes.
    ('the sheet\'s header not required', WORKER, 'if (!fromTheApp(request, url, "feedback")) return reply(403,', 'if (false) return reply(403,'),
    ('the admin header not required', WORKER, 'if (method !== "GET" && !fromTheApp(request, url, "feedback-admin")) return reply(403,', 'if (false) return reply(403,'),
    ('a general person reads feedback', WORKER, 'if (!isOwner(env, person)) return reply(403,', 'if (false) return reply(403,'),
    ('the agent admitted on any application', WORKER, 'audience: env.FEEDBACK_AGENT_AUD, service: true});}', 'audience: [env.FEEDBACK_AGENT_AUD, env.ACCESS_AUD], service: true});}'),
    ('the agent admitted where no application is named', WORKER, '  if (env.FEEDBACK_AGENT_AUD) {\n    try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms(), audience: env.FEEDBACK_AGENT_AUD, service: true});}', '  if (true) {\n    try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms(), audience: env.FEEDBACK_AGENT_AUD || env.ACCESS_AUD, service: true});}'),
    ('a service token a person everywhere', ACCESS, 'if (!email && (env.SERVICE_SEATS === "on" || deps.service === true) && typeof claims.common_name', 'if (!email && typeof claims.common_name'),
    ('an oversized body read in full', WORKER, 'if (text.length > FEEDBACK_BODY) return reply(413,', 'if (false) return reply(413,'),
    ('a refusal saves the row anyway', WORKER, 'try {return reply(201, {feedback: await store.file(person, input)});}\n  catch (error) {return feedbackRefusal(error);}', 'try {return reply(201, {feedback: await store.file(person, input)});}\n  catch (error) {await store.file(person, {...input, text: "x"}).catch(() => {}); return feedbackRefusal(error);}'),
]
