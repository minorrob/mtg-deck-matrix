# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python3 game/tools/batch/breaks.py tools/feedback-triage-breaks.py
# The triage agent (the feedback loop, PR 3): every promise the suite makes, broken one at a time, and the suite seen red.
SUITES = ['tests/feedback-triage.mjs']
TOOL, WF = 'tools/feedback-triage.mjs', '.github/workflows/feedback-triage.yml'
BREAKS = [
    ('duplicates never grouped', TOOL, 'const home = groups.find((g) => g.key === key && g.kind === row.kind && jaccard(g.grams, grams) >= SIMILAR);', 'const home = null;'),
    ('everything grouped', TOOL, 'jaccard(g.grams, grams) >= SIMILAR);', 'true);'),
    ('the build ignored in grouping', TOOL, 'const key = `${routeKey(row.page && row.page.route)}|${row.build && row.build.commit}`', 'const key = `${routeKey(row.page && row.page.route)}`'),
    ("the console's file ignored for the lane", TOOL, '  if (named.length) {\n', '  if (false) {\n'),
    ('rules words in a game never the engine', TOOL, '&& ENGINE_WORDS.test(text) && !/\\b(button|drawer|click|tap|drag|scroll|layout|screen|window|zoom|camera|slider|font|color|animation)\\b/i.test(text)) return "Claude · Engine";', '&& false) return "Claude · Engine";'),
    ('a simulator wish left to the Workshop', TOOL, 'if (byRoute && byRoute[1] === "Codex · Workshop" && DECK_WORDS.test(text) && /^#(decks|discover|lab)/.test(route)) return "Claude · Deck intelligence";', ''),
    ('a wish not severity 4', TOOL, 'if (kind === "enhancement") return 4;', ''),
    ('a blocked game not severity 1', TOOL, 'if (inGame && (BLOCKING.test(text) || errors)) return 1;', ''),
    ('another format not declined', TOOL, 'for (const [re, why] of OUT_OF_SCOPE) if (re.test(text)) return {verdict: "decline", why};', ''),
    ('a wrong result batched', TOOL, 'if (severity <= 2) return {verdict: "fix now", why: severity === 1 ? "it blocks play" : "a wrong result"};', ''),
    ('the rows left out of the body', TOOL, 'lines.push("", "## Feedback rows", ...members.map((r) => `- \\`${r.id}\\``));', ''),
    ('the game log not pointed at', TOOL, ' The record: the admin game log, \\`GET /api/admin/games/${first.game.matchId || "<match>"}\\`.', ''),
    ('a reporter named in the body', TOOL, '*(${r.group}, ${r.createdAt ? r.createdAt.slice(0, 10) : "undated"})*', '*(${r.reporter})*'),
    ("the model's body taken without the rows", TOOL, 'if (typeof value.body === "string" && draft.body.match(/`[0-9a-f-]{36}`/g)?.every((id) => value.body.includes(id))) out.body = value.body;', 'if (typeof value.body === "string") out.body = value.body;'),
    ("the model's title taken at any length", TOOL, 'value.title.trim().length <= 120) out.title', 'true) out.title'),
    ("the model's files taken as given", TOOL, 'out.files = value.files.filter((f) => typeof f === "string" && /^[A-Za-z0-9_./-]+$/.test(f) && !f.startsWith("/")).slice(0, 6);', 'out.files = value.files;'),
    ('a throwing model fails the run', TOOL, 'const better = await model(draft, members).then((v) => vetAnswer(v, draft), (error) => {log.warn(`The model failed on "${draft.title}": ${error.message}`); return null;});', 'const better = await model(draft, members).then((v) => vetAnswer(v, draft));'),
    ('a triaged row triaged again', TOOL, 'const fresh = rows.filter((r) => r.state === "new" && !r.issue), skipped = rows.length - fresh.length;', 'const fresh = rows, skipped = 0;'),
    ('a group written back to its first row only', TOOL, 'for (const r of members) await store.patch(r.id, {state: "triaged", issue: made.key});', 'await store.patch(members[0].id, {state: "triaged", issue: made.key});'),
    ('the digest in no order', TOOL, 'const sorted = [...issues].sort((a, b) => order[a.recommendation.verdict] - order[b.recommendation.verdict] || a.severity - b.severity);', 'const sorted = [...issues];'),
    ('the digest dated the ISO way', TOOL, 'const date = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][when.getUTCMonth()]} ${when.getUTCDate()}, ${when.getUTCFullYear()}`;', 'const date = when.toISOString().slice(0, 10);'),
    ('the workflow writes to the repository', WF, 'permissions:\n  contents: read', 'permissions:\n  contents: write'),
    ('the workflow runs daily', WF, '    - cron: "17 * * * *"', '    - cron: "17 6 * * *"'),
    ('the SDK committed instead of installed', WF, 'run: npm install --no-save --no-package-lock @anthropic-ai/claude-agent-sdk', 'run: echo installed'),
]
