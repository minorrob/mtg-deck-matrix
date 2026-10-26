from gen_guidelines import page, both, REG
from ui import *
from glyphs import svg

# ---------- navigation ----------
def tabs_states(reg):
    return (tabs([('Overview',None),('The hundred',100),('Upgrades',None),('Explore',None),('Acquire',46)], 1)
            + tabs([('Overview',None),('The hundred',100),('Upgrades',None),('Explore',None),('Acquire',46)], 0, {2:'hover',3:'focus',4:'disabled'})
            + '<p class="note" style="margin:0">Selected: ink label and a 3px ink bar. Hover: ink label. Focus: aether ring inside the tab. Disabled: faint. Counts ride in a muted pill.</p>')
page('components-navigation.html', 'group="Components" viewport="1100x520" subtitle="Tabs in every state" name="Tabs"',
     'Tabs', 'Tabs sit on a strong line and mark the current one with an ink bar, not the accent.', [('Deck page tabs', '', both(tabs_states, 560))])

# ---------- surfaces ----------
def dialog(reg):
    body = f'''<div class="grid" style="--min:220px">{field("Deck name","Krenko Goblins")}{field("Budget","225",hint="Only informs; nothing is refused for money.")}</div>
<div class="cm-field"><span class="lbl">Bracket</span><div class="row" style="gap:18px">{check("2 Core",radio=True)}{check("3 Upgraded",radio=True,checked=True)}{check("4 Optimized",radio=True)}</div></div>
<div class="cm-field"><span class="lbl">Seats at the table</span>{seg(["2","3","4"],2)}</div>'''
    return f'''<div style="position:relative;height:520px;display:grid;place-items:center;background:url(../assets/art/krenko.webp) center/cover;border-radius:var(--radius-card);overflow:hidden">
<div class="cm-scrim"></div><div class="cm-dialog" role="dialog" aria-labelledby="dlg-t" style="height:440px"><div class="cm-dialog__head"><h2 id="dlg-t">Define the deck</h2><span class="cm-small">Step 2 of 4</span>{btn("","quiet",icon="x",size="icon",extra=' aria-label="Close"')}</div>
<div class="cm-dialog__body">{body}</div><div class="cm-dialog__foot"><span class="lead">Saved as you go</span>{btn("Back")}{btn("Next: cards","primary")}</div></div></div>'''
def sheet(reg):
    return f'''<div style="position:relative;height:520px;background:var(--color-bg);border-radius:var(--radius-card);overflow:hidden;border:1px solid var(--color-line)">
<div style="padding:24px;opacity:.5"><h1>Library</h1></div><div class="cm-sheet" role="dialog" aria-label="Filters"><div class="cm-sheet__head"><h2>Filters</h2>{btn("","quiet",icon="x",size="icon",extra=' aria-label="Close"')}</div>
<div class="cm-sheet__body">{field("Card name","",placeholder="Any card")}<div class="cm-field"><span class="lbl">Where it is</span><div style="display:grid;gap:4px">{check("In a box",checked=True)}{check("Ordered")}{check("To buy",checked=True)}</div></div><div class="cm-field"><span class="lbl">Colors</span><div class="row">{"".join(f'<img src="../assets/mana/{c}.svg" style="width:24px" alt="{c}">' for c in "WUBRG")}</div></div></div>
<div class="cm-sheet__foot">{btn("Clear","quiet")}{btn("Show 46 cards","primary")}</div></div></div>'''
def toasts(reg):
    return f'<div style="display:grid;gap:12px">{toast_ok("Auto-created 99 cards for Giada deck")}{toast_ok("Moved 12 cards to the box","Undo")}{toast_err("Sharing is not on for this copy yet. Nothing was sent.")}</div><p class="note" style="margin:0">Success inverts to ink and offers Undo for as long as it shows. Errors stay on the panel with a required-red edge and a dismiss; they never time out.</p>'
def menu(reg):
    return f'<div class="row" style="align-items:flex-start;gap:24px">{account_menu(hover="Settings", reg=reg)}<div style="display:grid;gap:8px;max-width:260px"><span class="cm-label">Groups</span><span class="cm-small">You · This device · Your data · Skin · Help · Careful · Sign out. The danger group is last but one, labeled, in required red, and its one item opens a confirm. Sign out stands alone at the foot.</span></div></div>'
page('components-surfaces.html', 'group="Components" viewport="1200x2200" subtitle="Dialog, side sheet, toast, account menu" name="Surfaces"',
     'Dialogs, sheets, toasts and menus', 'The dialog is 900px at most, with a sticky title and a sticky footer, and its one primary sits bottom right. The side sheet is 420px with the same head and foot. Toasts and menus use the pop shadow.',
     [('Dialog shell', '', both(dialog, 600)), ('Side sheet', '', both(sheet, 600)), ('Toasts', '', both(toasts)), ('Account menu', '', both(menu))])

# ---------- tile and row ----------
def tiles(reg):
    t = lambda **k: tile(**{**dict(name='Krenko, Mob Boss', eyebrow='D6 · Krenko', tags='Goblin tribal · Tokens · ETB triggers', art='krenko', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3', colors=['R']), **k})
    return f'''<div class="grid" style="--min:200px">
  <div style="display:grid;gap:6px"><span class="cm-label">Rest · favorite</span>{t(fav=True)}</div>
  <div style="display:grid;gap:6px"><span class="cm-label">Hover</span>{t(state="hover", name="Chulane, Teller of Tales", eyebrow="D2 · Chulane", art="chulane", colors=["G","W","U"], tags="Landfall · Ramp · Blink")}</div>
  <div style="display:grid;gap:6px"><span class="cm-label">Focus visible</span>{t(state="focus", name="Shadrix Silverquill", eyebrow="D5 · Shadrix", art="shadrix", colors=["W","B"], tags="Counters · Drain and burn")}</div>
  <div style="display:grid;gap:6px"><span class="cm-label">Selected (bulk)</span>{t(state="selected", name="Tymna + Kraum", eyebrow="D1 · Tymna + Kraum", art="tymna", colors=["W","B","U","R"], st="buy", st_word="12 to buy", parts=[("inbox",41),("pull",47),("buy",12)], meta_l="41 in · 47 to pull · 12 to buy", ready="Stand-ins in", tags="Draw · Tap ability · Lifegain")}</div>
  <div style="display:grid;gap:6px"><span class="cm-label">New deck</span><a class="cm-tile cm-tile--new" href="#">{svg("plus")}<b style="margin-top:8px">New deck</b><span class="cm-small">From a commander, a list or a precon</span></a></div>
</div>'''
def rows_demo(reg):
    head = '<div class="cm-rowhead cm-label"><span>Qty</span><span>Card</span><span>Cost</span><span style="text-align:right">Price</span><span>Status</span><span>Action</span><span></span></div>'
    r = (row(1,'Access Tunnel',[],'$0.56','pull','Put it in the box') + row(1,'Emeria, the Sky Ruin',['W'],'$7.20','pull','Put it in the box',state='hover')
         + row(1,'Evolving Wilds',[],'$0.26','ordered','Mark arrived',state='focus') + row(1,'Cathar Commando',['W'],'$0.23','buy','Buy',state='selected')
         + row(1,'Grateful Apparition',['W'],'$0.37','standin','Swap in real',state='rest') + row(1,'Selfless Spirit',['W'],'$0.41','remove','Take it out',action_kind='danger') + row(32,'Plains',[],'$0.09','inbox','In the box',state='disabled'))
    return f'<div class="cm-panel" style="padding:4px 8px"><div class="cm-group"><h3>Loading</h3><span class="cm-count">53</span><span class="cm-small">Owned, not in the box yet</span></div>{head}<div class="cm-rows" role="table">{r}</div></div><p class="note" style="margin:0">Rows from top: rest, hover, focus visible, selected, stand-in, danger (remove), disabled. The trailing action is compact secondary; the overflow is a 32px icon button with a name and a tooltip.</p>'
page('components-tile-row.html', 'group="Components" viewport="1300x1700" subtitle="Deck tile and table row with trailing actions" name="Tile and row"',
     'Deck tile and table row', 'The deck tile is 3:4 with the commander art full bleed under an obsidian gradient; its words and chips use the fixed poster pair so they read over any art in any skin. Table rows are 48px with a 1px line, the price in money gold and the action at the end.',
     [('Deck tile', '', both(tiles, 1100)), ('Table row with trailing actions', '', both(rows_demo, 1100))])

# ---------- play ----------
def board_bg(inner, mat='night-citadel', h=300):
    return f'<div style="position:relative;min-height:{h}px;border-radius:var(--radius-card);overflow:hidden;background:#101014 url(../assets/mats/{mat}.webp) center/cover;padding:18px;display:grid;gap:14px;align-content:start">{inner}</div>'
def seat_views(reg):
    s1 = seat('Rob','Krenko, Mob Boss',40,0,7,'Your turn',turn=True,priority=True)
    s2 = seat('AI · Normal','Chulane, Teller of Tales',38,0,6,'Waiting')
    s3 = seat('Rob','Krenko, Mob Boss',9,3,4,'Deciding',turn=True,danger=True)
    return (f'<div class="grid" style="--min:420px">'
            f'<div style="display:grid;gap:6px"><span class="cm-label">3D view · over the table edge</span>{board_bg(s1+s2, "night-citadel", 220)}</div>'
            f'<div style="display:grid;gap:6px"><span class="cm-label">Table view · top left of each seat</span>{board_bg(s2+"<div style=height:60px></div>"+s1, "grove-arch", 220)}</div>'
            f'<div style="display:grid;gap:6px"><span class="cm-label">Focus view · above your own board</span>{board_bg(s3, "ember-serpent", 220)}</div></div>'
            '<p class="note" style="margin:0">One component, three places. Whose turn: an aether ring on the disc. Priority: an aether-dot chip. Low life: the vital turns harm red and the word stays. No panel around the seat: one scrim pill, so the board stays open.</p>')
def decide_demo(reg):
    return board_bg(f'<div style="display:grid;justify-items:center;gap:16px">{phases("Main 1")}{decide("Choose an action","Select one to review it. Nothing happens until you confirm.",["Play Mountain ×2","Play Path of Ancestry","Cast Krenko, Mob Boss"],sel="Play Mountain ×2")}</div>', 'star-gate', 330)
def neon(reg):
    return board_bg('<div style="display:grid;place-items:center;height:200px;gap:10px"><span class="cm-hud"><span class="cm-neon cm-neon--answer">Your turn</span></span><span class="cm-hud"><span class="cm-neon cm-neon--harm" style="font-size:calc(30px * var(--hud-scale))">Krenko attacks you · 6</span></span></div>', 'night-citadel', 240)
def camera_demo(reg):
    return f'<div class="row" style="align-items:flex-start;gap:24px">{camera(2,1)}<div style="display:grid;gap:8px;max-width:300px"><span class="cm-label">Camera</span><span class="cm-small">The same menu in all three views. HUD text is the 100/125/150/200 setting; it scales the seat headers, the decision slot, the phase strip and the callouts together. View is a segmented control, so the current view is always named.</span></div></div>'
A = '../assets/art/'; C = '../assets/cards/'
def study_bg(inner, h=300, pad=18):
    return f'<div class="cm-study" style="position:relative;min-height:{h}px;border-radius:var(--radius-card);overflow:hidden;padding:{pad}px;display:grid;gap:14px;align-content:start">{inner}</div>'
def study_demo(reg):
    mat = lambda s, cards: f'<div class="cm-mat" style="padding:14px;display:grid;gap:12px;align-content:start;min-height:190px">{s}<div style="display:flex;gap:10px">{cards}</div></div>'
    c = lambda n, tapped=False: f'<img src="{C}{n}.webp" alt="" style="width:64px;border-radius:4px;box-shadow:0 8px 16px -8px #000{";transform:rotate(90deg);margin:0 14px" if tapped else ""}">'
    s1 = seat('Rob', 'Krenko, Mob Boss', 40, 0, 7, 'Your turn', turn=True, priority=True, portrait=A + 'krenko.webp')
    s2 = seat('AI · Normal', 'Chulane, Teller of Tales', 38, 0, 6, 'Waiting', portrait=A + 'chulane.webp')
    return study_bg(f'<div class="grid" style="--min:420px;gap:22px;padding:12px">{mat(s2, c("forest")+c("island",True)+c("solring"))}{mat(s1, c("mountain")+c("warrens"))}</div>', 320, 22)
def drawer_body_actions(compact=False):
    return (dsection('<span class="cm-small">Your spell</span>' + pick(C + 'command.webp', "Krenko's Command", 'Instant · you')
                     + '<h2>Choose up to two players to mill</h2>' + steps(['Mode', 'Target', 'Review'], 1)
                     + '<span class="cm-small">Selected target</span>' + pick(A + 'chulane.webp', 'Chulane, Teller of Tales', 'AI · 38 life')
                     + consequence('If it resolves', 'each target player mills three cards.')
                     + '<div class="cm-decide-actions">' + btn('Confirm target', 'primary', icon='check') + btn('Change target', icon='reload') + '</div>')
            + ('' if compact else dsection(disclosure('Boards', 'seats', boardrow(A + 'krenko.webp', 'You', 40, None, True, '(Rob)') + boardrow(A + 'chulane.webp', 'Chulane', 38, 1) + boardrow(A + 'giada.webp', 'Giada', 36, 0) + boardrow(A + 'shadrix.webp', 'Shadrix', 31, 0)))))
def drawer_body_stack():
    return (dsection('<div><b>Your spell</b> <span class="cm-muted">· awaiting targets</span></div>' + pick(C + 'command.webp', "Krenko's Command", 'Instant') + '<span>Choose up to two players to mill.</span>')
            + dsection(disclosure('History', 'history', history([(C + 'solring.webp', 'Chulane cast Sol Ring'), (C + 'matron.webp', 'Rob cast Goblin Matron'), (C + 'mountain.webp', 'Rob played Mountain'), (A + 'krenko.webp', '<span class="turn">Turn 4 · Rob</span>')])))) 
def drawer_states(reg):
    cell = lambda lbl, html, w=380: f'<div style="display:grid;gap:8px;align-content:start"><span class="cm-label">{lbl}</span><div style="height:440px;width:{w}px;max-width:100%;display:flex;background:var(--color-bg);border-radius:var(--radius-card);overflow:hidden;border:1px dashed var(--color-line-strong)">{html}</div></div>'
    small = dsection('<span class="cm-small">Your spell</span>' + pick(C + 'command.webp', "Krenko's Command", 'Instant · you') + '<h3>Choose up to two players to mill</h3>' + steps(['Mode', 'Target', 'Review'], 1))
    d = lambda **k: drawer('left', 'Actions', small, 'scroll', did=f'd-{reg}-{len(k)}-{k.get("toggle_state","r")}', **k)
    return ('<div class="grid" style="--min:320px;gap:20px">'
            + cell('Open · rest', f'<div style="--drawer-w:300px;display:contents">{d()}</div>')
            + cell('Tab · hover', f'<div style="--drawer-w:300px;display:contents">{d(toggle_state="hover")}</div>')
            + cell('Tab · focus visible', f'<div style="--drawer-w:300px;display:contents">{d(toggle_state="focus")}</div>')
            + cell('Collapsed · the tab keeps the name', drawer('left', 'Actions', small, 'scroll', collapsed=True, did=f'dc-{reg}'), 120)
            + cell('Collapsed · right, with a count', f'<div style="margin-left:auto;display:flex">{drawer("right", "Stack", "", "stack", collapsed=True, count=1, did=f"dr-{reg}")}</div>', 120)
            + cell('Phone · a bottom sheet with the same tab', f'<div style="margin-top:auto;width:100%;display:flex">{drawer("bottom", "Actions", small, "scroll", did=f"db-{reg}")}</div>')
            + cell('Phone · collapsed', f'<div style="margin-top:auto;width:100%;display:flex">{drawer("bottom", "Stack", "", "stack", collapsed=True, count=1, did=f"dbc-{reg}")}</div>')
            + '</div>')
def companion(reg):
    def mat(s, cards, sel=False):
        chk = f'<span class="cm-mat__check">{svg("check")}</span>' if sel else ''
        return f'<div class="cm-mat{" is-selected" if sel else ""}" style="padding:14px;display:grid;gap:12px;align-content:start">{chk}{s}<div style="display:flex;gap:8px;flex-wrap:wrap">{cards}</div></div>'
    c = lambda n, tapped=False: f'<img src="{C}{n}.webp" alt="" style="width:54px;border-radius:4px;box-shadow:0 8px 16px -8px #000{";transform:rotate(90deg);margin:0 10px" if tapped else ""}">'
    seats = [('Chulane', 'AI · Normal', 38, 'chulane', c('forest') + c('island', True) + c('solring'), True), ('Giada', 'Dana', 36, 'giada', c('path') + c('forest'), False),
             ('Krenko', 'You · Rob', 40, 'krenko', c('mountain') + c('warrens'), False), ('Shadrix', 'Sam', 31, 'shadrix', c('island') + c('solring'), False)]
    mats = ''.join(mat(seatmini(sub, l, A + p + '.webp', n, turn=sub.startswith('You')), cards, sel) for n, sub, l, p, cards, sel in seats)
    hand = ''.join(f'<img src="{C}{n}.webp" alt="" style="width:96px;border-radius:6px;margin:0 -6px;box-shadow:0 12px 24px -10px #000">' for n in ['mountain', 'command', 'matron', 'skirk', 'purphoros'])
    top = f'<div style="display:flex;justify-content:center;position:relative">{seg(["Focus", "Table", "Full screen"], 2)}<div style="position:absolute;right:0;top:0">{btn("Camera", "on-art", icon="camera", size="compact")}</div></div>'
    return (f'<div class="cm-study" style="position:relative;height:780px;border-radius:var(--radius-card);overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr) auto">'
            f'<div style="--drawer-w:300px;height:780px;display:flex;z-index:2">{drawer("left", "Actions", drawer_body_actions(), "scroll", did=f"ca-{reg}")}</div>'
            f'<div style="position:relative;padding:16px 18px 0;display:grid;grid-template-rows:auto auto 1fr;gap:16px;min-width:0">{top}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">{mats}</div>'
            f'<div style="display:flex;justify-content:center;align-items:flex-end;overflow:hidden;margin:0 -18px">{hand}</div></div>'
            f'<div style="--drawer-w:290px;height:780px;display:flex;z-index:2">{drawer("right", "Stack", drawer_body_stack(), "stack", did=f"cs-{reg}")}</div></div>')
page('play-surfaces.html', 'group="Play" viewport="1500x4200" subtitle="The Study, drawers, seat header, decision, HUD scale, Camera, neon callout" name="Play surfaces"',
     'Play surfaces', 'The 3D, Table and Focus views share one seat header, one decision, one HUD text scale and one Camera menu, set on the Study: a walnut table under a warm lamp with every seat on charcoal felt. The Actions drawer holds the decision and the Stack drawer holds what is waiting and what happened; both collapse to a tab so the table can fill the screen. A decision is never hidden: with the Actions drawer collapsed it shows in the center slot.',
     [('The table companion', 'The whole surface at once: Actions on the left (the spell, the step, the target, what will happen, two buttons, then the seats and what the decision can do at each), the table in the middle, the Stack and history on the right. Selection on the table is ink: the chosen seat\'s mat takes a white ring and a check, never a color.', companion('dark')),
      ('The Study', 'The default table. Wood grain, lamp light and felt nap are drawn by the browser from noise, so there is no image to load. The felt is charcoal, never a mana color: every commander sits on it equally, and a player\'s chosen mat replaces it. Each seat wears its commander\'s art as its portrait, in a brass ring.', study_demo('dark')),
      ('Drawer with a collapse tab', 'A 32px spine on the drawer\'s inner edge: rounded at its outer top corner, cut back at 45 degrees, the chevron in a 48px cell at the top. Collapsed, the panel goes and the tab stays at the screen edge with the drawer\'s name and a count. The tab is a real button with aria-expanded; the focus ring sits inside it.', both(drawer_states, 1300)),
      ('Seat header in three views', '', seat_views('dark')), ('The center decision slot', 'Where the decision shows when the Actions drawer is collapsed, and on the 3D view: top center, in the same place in every view. Choices are secondary; the one primary is the step forward.', decide_demo('dark')),
      ('Neon callout', 'Fixed callout lights in every skin; Barlow Condensed 800 italic is the one expressive face. Reduced motion stills the glow.', neon('dark')), ('Camera menu', '', both(camera_demo, 560))])
print('guidelines B ok')
