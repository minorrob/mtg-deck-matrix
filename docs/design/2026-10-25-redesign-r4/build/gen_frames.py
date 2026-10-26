from pagekit import head, write
from ui import *
from glyphs import svg
R = '..'
def shell(frame, title, main, current='Decks', sub='My decks'):
    nav = [('Decks', 'cards'), ('Library', 'library'), ('Explore', 'search'), ('Play', 'play')]
    subs = ['My decks', 'Favorites', 'Create', 'Shared', 'About deck building']
    navh = ''
    for n, ic in nav:
        navh += f'<a href="#" {"aria-current=page" if n==current else ""}>{svg(ic)}{n}</a>'
        if n == 'Decks' and current == 'Decks':
            navh += '<div class="sub">' + ''.join(f'<a href="#" {"aria-current=page" if s==sub else ""}>{s}</a>' for s in subs) + '</div>'
    tab = ''.join(f'<a href="#" {"aria-current=page" if n==current else ""}>{svg(ic)}{n}</a>' for n, ic in nav)
    return (f'<!-- frame: {frame} -->\n' + head(f'{title} · CrankMagic r4', root=R, extra=f'<link rel="stylesheet" href="frames.css">', doc=False)
            + f'''<body class="cm"><div class="topbar"><img src="{R}/assets/brand/crankmagic-logo-gear-v4-256.webp" alt=""><b class="cm-wordmark">CrankMagic</b><span class="cm-avatar">R</span></div>
<div class="app"><aside class="rail"><a class="brand" href="#"><img src="{R}/assets/brand/crankmagic-logo-gear-v4-256.webp" alt=""><b class="cm-wordmark">CrankMagic</b></a><nav class="nav">{navh}</nav>
<div class="acct"><span class="cm-avatar">R</span><div><b>rob@example.com</b><span>Synced · just now</span></div>{svg("chev")}</div></aside>
<main class="main">{main}</main></div><nav class="tabbar">{tab}</nav><script src="{R}/glyphs.js"></script></body></html>''')
LEGAL = '<footer class="foot"><p><b>CrankMagic</b> is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. Card data and images from Scryfall; commander ranks from EDHREC. Prices are dated snapshots, not offers.</p><nav><a href="#">Fan Content Policy</a><a href="#">Scryfall</a><a href="#">EDHREC</a><a href="#">License</a><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Contact</a></nav></footer>'

# ---------- decks-hub ----------
DECKS = [
  dict(fav=True, name='Chulane, Teller of Tales', eyebrow='D2 · Chulane', tags='Landfall · Ramp · Draw · Blink', art='chulane', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3 · 60 pts', colors=['G','W','U']),
  dict(name='Kasmina, Enigma Sage', eyebrow='D3 · Kasmina · house rule', tags='Counters · Superfriends · Tokens', art='kasmina', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3', colors=['G','U']),
  dict(name='Felothar the Steadfast', eyebrow='D4 · Felothar', tags='Defender · Tap ability · Combat', art='felothar', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3', colors=['W','B','G']),
  dict(name='Shadrix Silverquill', eyebrow='D5 · Shadrix', tags='Counters · ETB triggers · Drain and burn', art='shadrix', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3', colors=['W','B']),
  dict(name='Krenko, Mob Boss', eyebrow='D6 · Krenko', tags='Goblin tribal · Tokens · Sacrifice', art='krenko', st='inbox', st_word='Boxed', parts=[('inbox',100)], meta_l='100 in the box', meta_r='B3', colors=['R']),
  dict(name='Tymna + Kraum', eyebrow='D1 · Tymna + Kraum', tags='Draw · Tap ability · Lifegain', art='tymna', st='buy', st_word='Defined', parts=[('inbox',41),('pull',47),('buy',12)], meta_l='12 to buy · 47 to pull', meta_r='B3', colors=['W','B','U','R'], ready='Stand-ins in'),
]
WOTC = [('Calling All Angels','Giada, Font of Hope','W'),('Keen Engineering','Sai, Master Thopterist','U'),('Multiverse Reforged','Jace, Multiverse Architect','U'),('Reign of Dragons','Lathliss, Dragon Queen','R'),('Tramplesaurus Rex','Ghalta, Primal Hunger','G'),('Wretched Ranks','Ghoulcaller Gisa','B')]
def decks_hub():
    wotc = '<section class="cm-panel wotc"><h3>New from Wizards</h3><span class="cm-small" style="margin-bottom:6px">Foundations Commander · Reality Fracture Commander · Oct 2, 2026</span>' + ''.join(
        f'<div class="it"><div style="display:grid;gap:2px"><b>{a}</b><span>{b}<img src="{R}/assets/mana/{c}.svg" alt="{c}"></span></div>{btn("Play it", icon="play", size="compact")}</div>' for a,b,c in WOTC) + '</section>'
    tiles = ''.join(tile(**{**d, 'root': R}) for d in DECKS)
    new = f'<a class="cm-tile cm-tile--new" href="#">{svg("plus")}<b>New deck</b><span class="cm-small">From a commander, a list or a precon</span></a>'
    main = f'''<header class="head"><div class="t"><div class="line"><h1>Decks</h1>{btn("","quiet",icon="help",size="icon compact",extra=' aria-label="About this page" title="About this page"')}</div><p>Six decks, all playable.</p></div>
<div class="acts">{btn("Bulk actions")}{btn("New deck","primary",icon="plus")}</div></header>
<div class="toolbar"><div class="cm-chips" role="group" aria-label="Stage">{chip("All",6,"selected")}{chip("Boxed",5)}{chip("Defined",1)}{chip("Building",0)}{chip("Playable",6)}{chip("Shared",0)}</div>
<div class="end"><label class="sort">Sort<select class="cm-select" style="width:190px;height:40px"><option>Closest to finished</option></select></label>{check("Show archived")}</div></div>
<div class="deckgrid">{wotc}{tiles}{new}</div>
<p class="cm-small" style="margin:0">Your decks plan <b class="cm-money">$779.85</b> together. <a class="cm-link" href="#">Set an account budget</a></p>{LEGAL}'''
    return shell('decks-hub', 'Decks', main)

# ---------- deck page ----------
def deck_hero():
    chips = ''.join(f'<span class="cm-pill">{t}</span>' for t in ['Legal · Commander + 99','Bracket 2–3','Group: Giada deck'])
    return f'''<section class="hero"><img class="card" src="{R}/assets/cards/giada.webp" alt="Giada, Font of Hope">
<div class="meta"><a class="crumb" href="#">Decks ›</a><h1 class="cm-hero">Giada deck</h1>
<div class="who"><span class="cmdr">Giada, Font of Hope <span class="cm-pips" style="display:inline-flex;gap:2px"><img src="{R}/assets/mana/W.svg" alt="W"></span></span>{status("draft","Defined")}{chips}</div>
<span class="cm-small">76 of 100 known · 24 to learn · <a class="cm-link" href="#">6 cards the table cannot play yet</a></span>
<div class="row acts" style="display:flex;flex-wrap:wrap;gap:8px">{btn("Lock list","primary",icon="lock")}{btn("Edit card list")}{btn("Log a game")}{btn("Measure")}{btn("More",icon_end="chev")}</div></div></section>'''
def deck_overview():
    tb = tabs([('Overview',None),('The hundred',100),('Upgrades',None),('Explore',None),('Acquire',46)], 0)
    curve = ''.join(f'<div><b>{v}</b><i style="height:{v*7}px"></i>{k}</div>' for k, v in [('0',0),('1',2),('2',15),('3',15),('4',12),('5',4),('6',9),('7+',7)])
    types = ''.join(f'<div><span>{k}</span><i style="width:{v/50*100:.0f}%"></i><b>{v}</b></div>' for k, v in [('Creature',50),('Land',36),('Artifact',6),('Instant',5),('Planeswalker',2),('Sorcery',1)])
    does = ''.join(f'<div><span>{k}</span><i style="width:{v/14*100:.0f}%"></i><b>{v}</b></div>' for k, v in [('Card draw',14),('Token maker',9),('Ramp',7),('Removal',7),('Team quality',5),('Board wipe',4)])
    main = f'''{deck_hero()}{tb}
<div class="next"><span class="cm-label">Next</span><p>Lock the list when it is settled. Its 47 copies are already reserved and the other 46 are on the buy list.</p></div>
<div class="cols" style="--n:2">
<section class="cm-panel box"><div class="row" style="justify-content:space-between"><h3>Progress</h3><span class="cm-small">0 of 100 in the box</span></div>
{bar([("inbox",0),("pull",47),("ordered",1),("buy",46)])}
<div class="figs"><div class="fig"><b>0</b>{status("inbox","In the box")}</div><div class="fig"><b>47</b>{status("reserved","Reserved")}</div><div class="fig"><b>1</b>{status("ordered")}</div><div class="fig"><b>46</b>{status("buy")}</div></div></section>
<section class="cm-panel box"><div class="row" style="justify-content:space-between"><h3>Cost</h3><a class="cm-link" href="#">Set a budget</a></div>
<div class="cm-figure cm-money">$57.33 <span class="cm-small" style="font-family:var(--font-body);font-weight:500">to finish</span></div>
<span class="cm-small">About $18.96 paid so far · $76.66 for the whole list at recorded prices · 0 of 2 Game Changers</span></section></div>
<div class="cols" style="--n:3"><section class="cm-panel box"><h3>Mana curve</h3><div class="curve">{curve}</div></section>
<section class="cm-panel box"><h3>By card type</h3><div class="hbars">{types}</div></section>
<section class="cm-panel box"><h3>What the spells do</h3><div class="hbars">{does}</div></section></div>
<section class="cm-panel box"><h3>How it plays</h3><p class="cm-reading" style="margin:0">Angels come down cheap and grow each other. Giada makes every later Angel bigger, so the curve wants a two-drop Angel on turn two and a wide board by turn five. Keep a board wipe for the turn the table catches up.</p></section>'''
    return shell('deck-overview', 'Giada deck', main)

HUNDRED = [
  ('Loading', 53, 'Owned, not in the box yet', [(1,'Access Tunnel',[],'$0.56','pull','Put it in the box'),(1,'Emeria, the Sky Ruin',['W'],'$7.20','pull','Put it in the box'),(1,'Evolving Wilds',[],'$0.26','pull','Put it in the box'),(1,'Mistveil Plains',['W'],'$0.26','reserved','Put it in the box'),(32,'Plains',[],'$0.09','pull','Put it in the box'),(1,'Cathar Commando',['W'],'$0.23','pull','Put it in the box')]),
  ('Coming', 1, 'Bought and on its way', [(1,'Grateful Apparition',['W'],'$0.37','ordered','Mark arrived')]),
  ('To buy', 46, 'Still needed: $57.33', [(1,'Bruna, the Fading Light',['W'],'$1.12','buy','Buy'),(1,'Angelic Aberration',['W'],'$0.48','buy','Buy'),(1,'Selfless Spirit',['W'],'$0.41','standin','Buy the real one'),(1,'Millikin',[],'$0.32','buy','Buy')]),
]
def deck_hundred():
    tb = tabs([('Overview',None),('The hundred',100),('Upgrades',None),('Explore',None),('Acquire',46)], 1)
    rows = ''
    for g, n, sub, rs in HUNDRED:
        rows += f'<div class="cm-group"><h3>{g}</h3><span class="cm-count">{n}</span><span class="cm-small">{sub}</span></div>'
        rows += '<div class="cm-rowhead cm-label"><span>Qty</span><span>Card</span><span>Cost</span><span style="text-align:right">Price</span><span>Status</span><span>Action</span><span></span></div>'
        rows += '<div class="cm-rows" role="table">' + ''.join(row(*r, root=R, state=('hover' if r[1]=='Emeria, the Sky Ruin' else 'rest')) for r in rs) + '</div>'
    main = f'''{deck_hero()}{tb}
<section class="cm-panel box"><div class="row" style="justify-content:space-between;align-items:center"><div style="display:grid;gap:4px"><h2>The hundred</h2><span class="cm-small">Not locked yet · 47 reserved · 46 to buy</span></div><div class="row">{btn("View as cards")}{btn("Export list",icon="download")}</div></div>
{bar([("inbox",0),("pull",53),("ordered",1),("standin",1),("buy",45)])}
<div>{rows}</div></section>'''
    return shell('deck-hundred', 'The hundred', main)

# ---------- play lobby ----------
def play_lobby():
    me = f'''<div class="seatcard"><img class="c" src="{R}/assets/cards/krenko.webp" alt="Krenko, Mob Boss"><div class="info"><span class="lbl">Seat 1 · You</span><h3>Krenko, Mob Boss</h3><span class="d">D6 Krenko · 100 cards · Bracket 3</span>{status("inbox","Ready",True)}<div class="row">{btn("Change deck","on-art",size="compact")}{btn("Choose mat","on-art",size="compact")}</div></div></div>'''
    ai = f'''<div class="seatcard"><img class="c" src="{R}/assets/cards/chulane.webp" alt="Chulane, Teller of Tales"><div class="info"><span class="lbl">Seat 2 · AI · Normal</span><h3>Chulane, Teller of Tales</h3><span class="d">D2 Chulane · 100 cards · Bracket 3</span>{status("inbox","Ready",True)}<div class="row">{btn("Change deck","on-art",size="compact")}</div></div></div>'''
    op = lambda n: f'<div class="seatcard seatcard--open"><div style="display:grid;gap:8px;justify-items:center"><span class="lbl" style="font:700 12px/1 var(--font-body);letter-spacing:.08em;text-transform:uppercase;color:#cfccd4">Seat {n} · open</span>{btn("Invite a player","on-art",icon="invite",size="compact")}{btn("Add an AI seat","on-art",size="compact")}</div></div>'
    rules = f'''<div class="rules" data-theme="light"><div class="row" style="justify-content:space-between"><h2>Table rules</h2>{btn("Edit","quiet",size="compact")}</div>
<dl><dt>Starting life</dt><dd>40</dd><dt>Bracket limit</dt><dd>Any</dd><dt>Seats</dt><dd>2 of 4</dd><dt>Invitations last</dt><dd>a day</dd><dt>A dropped player has</dt><dd>5 minutes</dd></dl>
<div class="go"><span>Everyone is ready.</span>{btn("Start","primary",icon="play",size="lg")}</div></div>'''
    main = f'''<header class="head"><div class="t"><div class="line"><h1>Play</h1></div><p>Your table. Four seats at most; it starts when everyone is ready.</p></div></header>
<section class="lobby cm-study">{me}{ai}{op(3)}{op(4)}{rules}</section>'''
    return shell('play-lobby', 'Play', main, current='Play')

# ---------- play fullscreen ----------
def play_fullscreen():
    hand = ''.join(f'<img src="{R}/assets/cards/{c}.webp" alt="{c}"{" class=sel" if c=="mountain" else ""}>' for c in ['mountain','path','warrens','command','matron','skirk','purphoros'])
    return (f'<!-- frame: play-fullscreen -->\n' + head('Play · CrankMagic r4', root=R, extra='<link rel="stylesheet" href="frames.css">', doc=False)
      + f'''<body class="cm"><div class="board cm-study" role="main" aria-label="Table">
<div class="edge edge--l">{drawer("left","Actions","","scroll",collapsed=True,did="fs-actions")}</div><div class="edge edge--r">{drawer("right","Stack","","stack",collapsed=True,count=0,did="fs-stack")}</div>
<div class="top">{phases("Main 1")}<div class="r">{btn("Camera","on-art",icon="camera")}</div></div>
<div class="opp">{seat("AI · Normal","Chulane, Teller of Tales",38,0,6,"Waiting",stack=True,portrait=R+"/assets/art/chulane.webp")}</div>
<div class="slot">{decide("Choose an action","Select one to review it. Nothing happens until you confirm.",["Play Mountain ×2","Play Path of Ancestry","Cast Goblin Matron"],sel="Play Mountain ×2")}</div>
<div class="table3d"><div class="plane">
  <div class="half"><span class="cap">AI · battlefield</span><img class="perm" src="{R}/assets/cards/forest.webp" alt="Forest"><img class="perm tapped" src="{R}/assets/cards/island.webp" alt="Island, tapped"><img class="perm" src="{R}/assets/cards/solring.webp" alt="Sol Ring"><div class="zones"><div class="zone"><div class="pile" style="background-image:url({R}/assets/cards/chulane.webp)"></div>Command</div><div class="zone"><div class="pile" style="background-image:url({R}/assets/cards/card-back-tan.webp)">91</div>Library</div><div class="zone"><div class="empty"></div>Graveyard 0</div></div></div>
  <div class="half"><span class="cap">Your battlefield · 1 land · 1 mana open</span><img class="perm" src="{R}/assets/cards/mountain.webp" alt="Mountain"><div class="zones"><div class="zone"><div class="pile" style="background-image:url({R}/assets/cards/krenko.webp)"></div>Command</div><div class="zone"><div class="pile" style="background-image:url({R}/assets/cards/card-back-tan.webp)">92</div>Library</div><div class="zone"><div class="empty"></div>Graveyard 0</div></div></div>
</div></div>
<div class="handcap"><span class="cm-hud"><span class="cm-seat__state" style="background:var(--mat-scrim)">Your hand · 7</span></span></div>
<div class="hand">{hand}</div>
<div class="me">{seat("Rob","Krenko, Mob Boss",40,0,7,"Your turn",turn=True,priority=True,stack=True,portrait=R+"/assets/art/krenko.webp")}</div>
</div><script src="{R}/glyphs.js"></script></body></html>''')

for name, fn in [('decks-hub', decks_hub), ('deck-overview', deck_overview), ('deck-hundred', deck_hundred), ('play-lobby', play_lobby), ('play-fullscreen', play_fullscreen)]:
    write(f'project/frames/{name}.html', fn())
print('frames ok')
