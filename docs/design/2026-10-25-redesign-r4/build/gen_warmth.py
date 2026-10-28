"""The warm table: the principles taken from Rob's reference (Concept B, Table Companion), with the template's answer to each."""
from gen_guidelines import page, both
from ui import *
from glyphs import svg

REF = '../reference/concept-b-table-companion.webp'
# (n, x%, y%, title, what you see, the rule, how the template does it)
P = [
 (1, 26.3, 35.1, 'A place, not a page',
  'A walnut table under a lamp, books, dice, a brass compass. You could pull up a chair.',
  'Play happens on a table you could sit at: wood, felt and warm light from above, falling into shadow at the edges. The interface floats over the place. The place is never a flat color.',
  '<code>.cm-study</code> on <code>--table-wood</code>, <code>--table-grain</code>, <code>--table-light</code>, <code>--table-shade</code>; seats on <code>.cm-mat</code>. Drawn from noise, so there is no image to load.'),
 (2, 91.5, 59.6, 'Warm light, neutral chrome',
  'The panels are near-black and calm; the warmth is all in the room around them.',
  'Warmth comes from materials and light (walnut, brass, parchment, the lamp), never from tinting the chrome. No mana color owns the frame: players take their commander\'s colors as their own, so the frame stays neutral and color arrives with the cards. This is the one thing we do not take from the reference: its green felt and green buttons.',
  'Grounds and panels are the skin\'s neutrals. The felt is <code>--table-felt</code>, a warm charcoal. A deck\'s surfaces take its commander\'s <code>--mana-*</code> tints; nothing else does.'),
 (3, 21.2, 2.9, 'The name in gilt; brass is the table\'s metal',
  'The app name sits in gold capitals beside an emblem, and the table has brass fittings: the rings around each portrait, the compass.',
  'CrankMagic is set in engraved capitals in antique gilt beside the gear logo, the way the reference sets its name. The table\'s fittings are brass, the rings around portraits. Neither metal ever marks a value, so neither is mistaken for a price.',
  '<code>.cm-wordmark</code>: Cinzel 600 capitals at .08em in <code>--color-brand</code>; <code>--table-brass</code> for fittings on the table. Money keeps <code>--color-money</code>.'),
 (4, 20.6, 28.2, 'Two voices of type',
  'Engraved roman capitals at the top of the screen; a warm, open sans for everything you read and do.',
  'Roman capitals name places and things: page titles and the deck title. A humanist sans does the work: reading, choosing, counting. Section titles are spaced capitals in the sans, each with a small icon.',
  'Cinzel 600 through <code>--font-display</code> and <code>--font-hero</code>; Lato 400 and 700 through <code>--font-body</code>; <code>.cm-section-title</code>.'),
 (5, 30.9, 14.9, 'People at the table',
  'Every seat is a face in a ring, a name and a big life total.',
  'Seats are people, not slots. Each shows a portrait, a name and the number that matters at a glance. Here the portrait is the commander\'s art, because that is who the player is at this table.',
  '<code>.cm-portrait</code> in a <code>--table-brass</code> ring; <code>.cm-seatmini</code> on a mat, <code>.cm-seat</code> in the HUD views, <code>.cm-boardrow</code> in a drawer.'),
 (6, 65.8, 84.0, 'The cards carry the color',
  'The hand is big real card art; the spell, the target and every history line show their art.',
  'Card art is the most magical thing on the screen, so show it generously and let it bring the color. A thumbnail beats a word wherever a card is named.',
  '<code>.cm-pick</code> (art, name, meta), <code>.cm-history</code> (art, line), the hand at full card size.'),
 (7, 23.6, 46.8, 'Say what happens before it happens',
  '"Choose a creature to exile", a Target then Review step, and the consequence written out before you confirm.',
  'A decision names the task as a plain sentence, shows the step you are on, shows what you picked, says what will happen if it resolves, and offers exactly two buttons: the step forward and the way back.',
  '<code>h2</code> task, <code>.cm-steps</code>, <code>.cm-pick</code>, <code>.cm-consequence</code>, <code>.cm-decide-actions</code> (one primary, one secondary).'),
 (8, 22.1, 8.5, 'The table can always be reclaimed',
  'Both side panels have a tab with a chevron on their inner edge.',
  'Side drawers hold the decision and the stack. Each folds to a labeled tab at the screen edge, so the table can fill the screen and nothing is lost. A decision is never hidden: with its drawer folded it shows in the center slot.',
  '<code>.cm-drawer</code> with <code>.cm-drawer__tab</code>, left, right and bottom; see Play surfaces.'),
 (9, 53.8, 69.7, 'Soft depth, few lines',
  'Panels float over the table on soft shadows; mats have an inset edge; dividers are faint and few.',
  'Depth comes from soft shadow and a 1px light line, never from heavy borders. Corners are 12 to 16px. Padding is generous. A divider separates groups, not rows of the same thing.',
  '<code>--radius-card</code>, <code>--radius-tile</code>, <code>--color-line</code>, the drawer and mat shadows.'),
 (10, 89.1, 2.8, 'Quiet status in the margins',
  'Seats filled, settings and the clock sit small in the top corner.',
  'Ambient facts live at the edges, small and out of the way: who is here, the time, the settings. They never compete with the decision.',
  'A top-right row of compact on-art buttons and small text; the center top holds the view switch, a <code>.cm-seg</code> whose selection is ink.'),
]
TOOK = [('Cinzel roman capitals for the app name', 'Kept: CrankMagic in Cinzel capitals, and Cinzel for page titles and the deck title'), ('Gold app name and emblem', 'Kept: the name in antique gilt beside the gear logo; brass rings on the table'), ('Lato for everything read', 'Kept'), ('Spaced section titles with icons', 'Kept'),
        ('Drawer tabs with a chevron and a 45-degree cut', 'Kept'), ('Portraits in rings, big life totals', 'Kept, with the commander\'s art as the portrait'),
        ('Walnut table, lamp light, shadowed edges', 'Kept, drawn from noise'), ('Card art in the decision and the history', 'Kept'),
        ('Green felt mats', 'Charcoal felt: no mana color owns the table'), ('Sage green primary button', 'Sapphire, the one press-this'),
        ('Green selected tab and target glow', 'Ink: selection inverts, a white ring on the table'), ('Green "1 legal" chip', 'Decision gold: it is the answer the app is waiting for'),
        ('Green presence dots', 'Left out: a local table does not need them')]

def ref_board(_reg=None):
    marks = ''.join(f'<a href="#p{n}" class="pin" style="left:{x}%;top:{y}%" aria-label="Principle {n}">{n}</a>' for n, x, y, *_ in P)
    return (f'<figure style="margin:0;display:grid;gap:8px"><div style="position:relative;border-radius:var(--radius-card);overflow:hidden;box-shadow:0 0 0 1px var(--color-line)">'
            f'<img src="{REF}" alt="Rob\'s reference: Concept B, Table Companion, a proposed play screen on a wooden table" style="display:block;width:100%">{marks}</div>'
            '<figcaption class="note">Rob\'s reference, 2026-10-25: "Concept B · Table Companion". The numbers match the principles below.</figcaption></figure>')

def principles(_reg=None):
    out = ''
    for n, _, _, title, see, rule, how in P:
        out += (f'<article id="p{n}" class="cm-panel" style="padding:18px 20px;display:grid;grid-template-columns:40px 1fr;gap:6px 14px">'
                f'<span class="num-badge">{n}</span><h3 style="margin:0">{title}</h3><span></span>'
                f'<div style="display:grid;gap:8px"><p class="cm-small" style="margin:0"><b>In the reference.</b> {see}</p><p style="margin:0">{rule}</p>'
                f'<p class="cm-small" style="margin:0"><b>In the template.</b> {how}</p></div></article>')
    return f'<div style="display:grid;gap:12px">{out}</div>'

def took(_reg=None):
    rows = ''.join(f'<tr><td>{a}</td><td>{b}</td></tr>' for a, b in TOOK)
    return f'<table class="data"><tr><th>In the reference</th><th>In the template</th></tr>{rows}</table>'

USE = ['Start every page from a frame in <code>frames/</code> and keep its rail, head and footer.',
       'Name the page in Cinzel (<code>h1</code>); give every section a Lato <code>h2</code>, or a <code>.cm-section-title</code> when it sits in a drawer or panel head.',
       'Put one sapphire primary on the screen, the next step of the journey. Everything else is secondary or quiet.',
       'Wherever a card is named, show its art (<code>.cm-pick</code>, a tile, a row thumbnail).',
       'Write every decision as a sentence, show the step, show what will happen, and give two buttons.',
       'For anything at the table, set it on <code>.cm-study</code> with seats on <code>.cm-mat</code>; put side detail in a <code>.cm-drawer</code> that folds to its tab.',
       'Keep the chrome neutral. The only mana color on a surface is the commander\'s own, through its tints and its cards.',
       'Check every frame in all three skins and both registers, at 1440 and 390, against the contrast pages.']

css = ('<style>.pin{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;'
       'background:var(--table-brass);color:#120d08;font:700 13px/1 var(--font-body);text-decoration:none;box-shadow:0 0 0 2px rgb(0 0 0 / .6),0 4px 12px rgb(0 0 0 / .6)}'
       '.num-badge{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--table-brass);color:var(--table-brass);font:600 15px/1 var(--font-display)}'
       '.use{margin:0;padding-left:20px;display:grid;gap:8px}</style>')
page('warmth.html', 'group="Principles" viewport="1200x3600" subtitle="Why the reference feels warm, and how the template keeps it" name="The warm table"',
     'The warm table', css + 'Rob\'s reference makes you want to sit down and play. These ten principles are why, each with what the template does about it. The template keeps the reference\'s room, type, drawers and voice, and keeps CrankMagic\'s own palette: the five mana colors each have one job, and no single mana color owns the frame.',
     [('The reference', '', ref_board()), ('Ten principles', '', principles()), ('What we took, and what we changed', 'Everything green in the reference became something neutral or something with a job, because a player at a Krenko table should not sit on a green-mana room.', took()),
      ('Using the template for a new page', 'For the walkthrough screens and wireframes, in order:', '<ol class="use">' + ''.join(f'<li>{u}</li>' for u in USE) + '</ol>')])
print('warmth ok')
