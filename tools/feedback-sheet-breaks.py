# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py tools/feedback-sheet-breaks.py
# The feedback sheet (the feedback loop, PR 2): the glyph on every page, the report gathered and bounded, the Worker's
# answers shown, and signed out refused with the way out -- each promise broken once and the suite seen red.
SUITES = ['tests/feedback-sheet.mjs']
APP, SHEET, DECKS = 'crankmagic-app.js', 'crankmagic-feedback.js', 'crankmagic-decks.js'
BREAKS = [
    ('the glyph gone from the page head', APP, "${help?helpButton(help):''}${feedbackButton()}</div>", "${help?helpButton(help):''}</div>"),
    ('the glyph gone from the deck page', DECKS, "${b('More','deck-more-menu',{deck:d.id},false,{caret:'down'})}${C.feedbackButton()}</div>", "${b('More','deck-more-menu',{deck:d.id},false,{caret:'down'})}</div>"),
    ('the glyph with no name for a reader', APP, 'data-action="send-feedback" aria-label="Send feedback" title="Send feedback">✉</button>', 'data-action="send-feedback">✉</button>'),
    ('the Menu still mails', SHEET, '    actions["send-feedback"] = () => {open();};', '    actions["send-feedback"] = () => {mailto();};'),
    ("the sheet's header not sent", SHEET, '"x-crankmagic": "feedback"}', '"x-crankmagic": "sync"}'),
    ('the kind not read', SHEET, 'const report = draft({kind: f.kind.value, text, screenshot});', 'const report = draft({kind: "bug", text, screenshot});'),
    ('the text not bounded', SHEET, '      return S.boundReport({\n        kind, text,', '      return ({schema: "CrankFeedback@1",\n        kind, text,'),
    ('the build not read', SHEET, 'if (v && typeof v.commit === "string") build = {commit: v.commit, profile: String(v.profile || "release")};', ''),
    ('the console ring not sent', SHEET, '        console: errors.slice(),\n', ''),
    ('the console ring not kept', SHEET, 'addEventListener("error", (event) => {if (event && typeof event.message === "string" && event.message) keep(', 'addEventListener("error", (event) => {if (false) keep('),
    ('the deck not named', SHEET, 'deck: deckId || hovered ? {id: deckId || undefined, name: deck ? deck.name : undefined, card: hovered || undefined} : undefined,', 'deck: undefined,'),
    ('the screen not named', SHEET, 'page: {route: location.hash || `#${r.view}`, screen: SCREENS[r.view] || r.view, view: game ? game.view : undefined},', 'page: {route: location.hash || `#${r.view}`, view: game ? game.view : undefined},'),
    ('a refusal closes the sheet', SHEET, '} catch (err) {say(err.message); sending.disabled = false;}', '} catch (err) {d.close(); notice(err.message, true);}'),
    ('an empty text sent', SHEET, 'if (!text) {say("Say what happened, in a few words at least."); f.text.focus(); return;}', ''),
    ('the picture sent as it came', SHEET, 'const url = canvas.toDataURL("image/webp", q);', 'const url = canvas.toDataURL("image/png");'),
    ('signed out, the form offered anyway', SHEET, 'if (C.signedIn && !C.signedIn()) {', 'if (false) {'),
    ('the thanks silent on the dropped picture', SHEET, 'notice(`Feedback sent. Thank you${report.screenshot && value.feedback && value.feedback.screenshot === "dropped" ? " (the picture is not kept yet)" : ""}.`);', 'notice("Feedback sent. Thank you.");'),
]
