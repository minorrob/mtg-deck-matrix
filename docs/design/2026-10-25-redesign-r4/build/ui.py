"""HTML snippets for every r4 component and state. Used by the pack's guideline pages, the frames and the artifact previews."""
from glyphs import svg
STATES = ['rest', 'hover', 'focus', 'active', 'disabled', 'selected', 'danger']
ST_WORD = {'inbox': 'In box', 'physical': 'Physical', 'pull': 'Pull', 'reserved': 'Reserved', 'ordered': 'Ordered', 'buy': 'To buy',
           'standin': 'Stand-in', 'remove': 'Remove', 'watch': 'Watch', 'draft': 'Draft'}

def btn(label, kind='', state='rest', icon=None, size='', extra='', icon_end=None):
    cls = ['cm-btn']
    if kind: cls.append(f'cm-btn--{kind}')
    if size: cls += [f'cm-btn--{s}' for s in size.split()]
    attrs = ''
    if state in ('hover', 'focus', 'active', 'selected'): cls.append(f'is-{state}')
    if state == 'selected': attrs += ' aria-pressed="true"'
    if state == 'disabled': attrs += ' disabled'
    ic = svg(icon) if icon else ''
    ie = svg(icon_end) if icon_end else ''
    return f'<button type="button" class="{" ".join(cls)}"{attrs}{extra}>{ic}{label}{ie}</button>'

def status(st, word=None, on_art=False):
    w = word or ST_WORD[st]
    return f'<span class="cm-status{" cm-status--on-art" if on_art else ""}" data-st="{st}" title="{w}">{svg("st-"+st)}<span class="w">{w}</span></span>'

def chip(label, n=None, state='rest'):
    cls = 'cm-chip' + (f' is-{state}' if state in ('hover', 'focus', 'selected') else '')
    a = ' aria-pressed="true"' if state == 'selected' else (' disabled' if state == 'disabled' else ' aria-pressed="false"')
    nn = f'<span class="n">{n}</span>' if n is not None else ''
    return f'<button type="button" class="{cls}"{a}>{label}{nn}</button>'

def bar(parts, on_art=False):
    tot = sum(v for _, v in parts) or 1
    return f'<div class="cm-bar{" cm-bar--on-art" if on_art else ""}" role="img" aria-label="' + ', '.join(f'{v} {ST_WORD[k].lower()}' for k, v in parts) + '">' + ''.join(f'<i data-st="{k}" style="flex:{v}"></i>' for k, v in parts if v) + '</div>'

def pips(colors, root='..'):
    return ''.join(f'<img src="{root}/assets/mana/{c}.svg" alt="{c}">' for c in colors)

def tile(name, eyebrow, tags, art, st, st_word, parts, meta_l, meta_r, colors, root='..', state='rest', ready='Playable', checked=False, play=True, fav=False):
    cls = 'cm-tile' + (f' is-{state}' if state in ('hover', 'focus', 'selected') else '')
    chk = f'<label class="cm-check" style="min-height:0"><input type="checkbox" aria-label="Select {name}"{" checked" if checked or state=="selected" else ""}></label>'
    play_btn = btn('Play it', 'on-art', icon='play', size='compact') if play else ''
    return f'''<a class="{cls}" href="#" style="background-image:url({root}/assets/art/{art}.webp)" aria-label="{name}">
  <div class="cm-tile__top">{status(st, st_word, on_art=True)}<span class="cm-tile__fav{' is-on' if fav else ''}" role="img" aria-label="{'Favorite' if fav else 'Not a favorite'}">{svg('star-on' if fav else 'star')}</span><span class="cm-tile__pips">{pips(colors, root)}</span></div>
  <div class="cm-tile__tools">{chk}<span class="cm-tile__menu" aria-hidden="true">{svg('more')}</span></div>
  <div class="cm-tile__body"><span class="cm-tile__eyebrow">{eyebrow}</span><h3 class="cm-tile__name">{name}</h3><span class="cm-tile__tags">{tags}</span>
    {bar(parts, on_art=True)}<div class="cm-tile__meta"><span>{meta_l}</span><b>{meta_r}</b></div>
    <div class="cm-tile__foot"><span class="cm-tile__ready">{svg("check")}{ready}</span>{play_btn}</div></div></a>'''

def row(q, name, colors, price, st, action, root='..', state='rest', action_kind=''):
    cls = 'cm-row' + (f' is-{state}' if state in ('hover', 'focus', 'selected', 'disabled') else '')
    return (f'<div class="{cls}" role="row"><span class="q">{q}</span><span class="name">{name}</span><span class="pips">{pips(colors, root)}</span>'
            f'<span class="price">{price}</span><span>{status(st)}</span>{btn(action, action_kind, size="compact")}'
            f'<button type="button" class="cm-btn cm-btn--quiet cm-btn--compact cm-btn--icon" aria-label="More for {name}" title="More">{svg("more")}</button></div>')

def field(label, value='', state='rest', placeholder='', hint='', err=''):
    cls = 'cm-input' + (f' is-{state}' if state in ('hover', 'focus') else '') + (' is-invalid' if state == 'danger' else '')
    dis = ' disabled' if state == 'disabled' else ''
    inv = ' aria-invalid="true"' if state == 'danger' else ''
    h = f'<span class="hint">{hint}</span>' if hint and state != 'danger' else ''
    e = f'<span class="err">{svg("alert")}{err}</span>' if state == 'danger' else ''
    return f'<div class="cm-field"><label>{label}</label><input class="{cls}" value="{value}" placeholder="{placeholder}"{dis}{inv}>{h}{e}</div>'

def check(label, state='rest', radio=False, checked=False):
    k = 'cm-radio' if radio else 'cm-check'
    ic = ' is-checked' if (checked or state == 'selected') else ''
    st = f' is-{state}' if state in ('hover', 'focus') else ''
    inv = ' is-invalid' if state == 'danger' else ''
    dis = ' disabled' if state == 'disabled' else ''
    c = ' checked' if (checked or state == 'selected') else ''
    return f'<label class="{k}{" is-disabled" if state=="disabled" else ""}"><input type="{"radio" if radio else "checkbox"}" class="{(ic+st+inv).strip()}"{c}{dis}>{label}</label>'

def seg(options, selected=0, states=None):
    states = states or {}
    out = []
    for i, o in enumerate(options):
        s = states.get(i, 'selected' if i == selected else 'rest')
        a = ' aria-pressed="true"' if s == 'selected' else (' disabled' if s == 'disabled' else ' aria-pressed="false"')
        out.append(f'<button type="button" class="{("is-"+s) if s in ("hover","focus","selected") else ""}"{a}>{o}</button>')
    return f'<div class="cm-seg" role="group">{"".join(out)}</div>'

def tabs(items, selected=0, states=None):
    states = states or {}
    out = []
    for i, (lab, n) in enumerate(items):
        s = states.get(i, 'selected' if i == selected else 'rest')
        a = ' aria-selected="true"' if s == 'selected' else (' disabled' if s == 'disabled' else ' aria-selected="false"')
        nn = f'<span class="cm-count">{n}</span>' if n is not None else ''
        out.append(f'<button role="tab" class="cm-tab{(" is-"+s) if s in ("hover","focus","selected") else ""}"{a}>{lab}{nn}</button>')
    return f'<div class="cm-tabs" role="tablist">{"".join(out)}</div>'

def toast_ok(msg, action='Undo'):
    return f'<div class="cm-toast cm-toast--ok" role="status">{svg("check")}<span class="msg">{msg}</span><button class="cm-btn cm-btn--quiet undo">{action}</button><button class="cm-btn cm-btn--quiet cm-btn--icon" aria-label="Dismiss">{svg("x")}</button></div>'
def toast_err(msg):
    return f'<div class="cm-toast cm-toast--err" role="alert">{svg("alert")}<span class="msg">{msg}</span><button class="cm-btn cm-btn--quiet cm-btn--icon" aria-label="Dismiss">{svg("x")}</button></div>'

def account_menu(hover=None, skin='sapphire-obsidian', reg='dark'):
    def it(label, icon, end='', i=None, extra='', cls=''):
        h = ' is-hover' if hover == label else ''
        e = f'<span class="end">{end}</span>' if end else ''
        return f'<button class="cm-menu__item{h}{cls}" role="menuitem"{extra}>{svg(icon)}{label}{e}</button>'
    skins = [('sapphire-obsidian', 'Sapphire & Obsidian'), ('bronze-basalt', 'Bronze & Basalt'), ('chalk-coal', 'Chalk & Coal')]
    sk = ''.join(f'<button class="cm-menu__item" role="menuitemradio" aria-checked="{"true" if k==skin else "false"}">{svg("palette")}{n}</button>' for k, n in skins)
    return f'''<div class="cm-menu" role="menu" aria-label="Account">
  <div class="cm-menu__who"><span class="cm-avatar">R</span><div><b>rob@example.com</b><span>Synced · just now</span></div></div>
  <div class="cm-menu__group"><div class="cm-menu__label">You</div>{it("Profile","user")}{it("Invite to CrankMagic","invite")}{it("Settings","gear")}</div>
  <div class="cm-menu__group"><div class="cm-menu__label">This device</div>{it("Sync now","sync","just now")}{it("Reload with newest files","reload")}</div>
  <div class="cm-menu__group"><div class="cm-menu__label">Your data</div>{it("Save a backup file","download")}{it("Restore from a backup","upload")}</div>
  <div class="cm-menu__group"><div class="cm-menu__label">Skin</div>{sk}<div style="padding:6px 10px 8px">{seg(["Dark","Light","System"], 0 if reg=="dark" else 1)}</div></div>
  <div class="cm-menu__group"><div class="cm-menu__label">Help</div>{it("Help and glossary","help")}{it("Take a tour","tour")}{it("Send feedback","chat")}{it("Show a QR code","qr")}</div>
  <div class="cm-menu__group cm-menu__group--danger"><div class="cm-menu__label">Careful</div>{it("Reset all data…","trash")}</div>
  <div class="cm-menu__group">{it("Sign out","signout")}</div>
</div>'''

def seat(name, commander, life, poison=0, hand=7, state='Deciding', turn=False, priority=False, initial=None, danger=False, stack=False, portrait=None):
    st_cls = ' is-priority' if priority else ''
    dot = '<i></i>' if priority else ''
    return f'''<div class="cm-hud"><div class="cm-seat{" is-turn" if turn else ""}{" cm-seat--stack" if stack else ""}" aria-label="{name}, {life} life">
  {f'<span class="cm-portrait" style="background-image:url({portrait})" role="img" aria-label="{commander}"></span>' if portrait else f'<span class="cm-seat__disc">{initial or name[0]}</span>'}
  <span class="cm-seat__who"><b>{name}</b><span>{commander}</span></span>
  <span class="cm-seat__vitals"><span class="cm-vital{" is-danger" if danger else ""}"><b>{life}</b><span>life</span></span><span class="cm-vital"><b style="font-size:calc(var(--vital) * .64)">{poison}</b><span>poison</span></span><span class="cm-vital"><b style="font-size:calc(var(--vital) * .64)">{hand}</b><span>hand</span></span></span>
  <span class="cm-seat__state{st_cls}">{dot}{state}</span></div></div>'''

def decide(q, sub, choices, go=('Next step', 'Skip to end'), sel=None):
    ch = ''.join(btn(c, state='selected' if c == sel else 'rest') for c in choices)
    g = btn(go[0], 'primary') + (btn(go[1]) if go[1] else '')
    return f'<div class="cm-hud"><div class="cm-decide" role="region" aria-label="Decision"><div class="cm-decide__q">{q}<small>{sub}</small></div><div class="cm-decide__choices">{ch}</div><div class="cm-decide__go">{g}</div></div></div>'

def phases(now='Main 1'):
    ps = ['Untap', 'Upkeep', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End']
    i = ps.index(now)
    return '<div class="cm-hud"><div class="cm-phases" aria-label="Phase">' + ''.join(f'<span class="{"done" if j < i else ("now" if j == i else "")}">{p}</span>' for j, p in enumerate(ps)) + '</div></div>'

def camera(view=2, hud=0):
    return f'''<div class="cm-camera" role="dialog" aria-label="Camera">
  <div class="cm-camera__row"><div class="top"><b>View</b></div>{seg(["Table","Focus","3D"], view)}</div>
  <div class="cm-camera__row"><div class="top"><b>Tilt</b><span>40°</span></div><input class="cm-range" type="range" min="0" max="60" value="40" aria-label="Tilt"></div>
  <div class="cm-camera__row"><div class="top"><b>Zoom</b><span>100%</span></div><input class="cm-range" type="range" min="50" max="200" value="100" aria-label="Zoom"></div>
  <div class="cm-camera__row"><div class="top"><b>Card size</b><span>100%</span></div><input class="cm-range" type="range" min="60" max="160" value="100" aria-label="Card size"></div>
  <div class="cm-camera__row"><div class="top"><b>HUD text</b><span>{["100%","125%","150%","200%"][hud]}</span></div>{seg(["100","125","150","200"], hud)}</div>
  <div class="cm-camera__row"><div class="top"><b>Table</b></div><select class="cm-select" aria-label="Table design"><option>Medieval oak, iron bands</option></select></div>
</div>'''


# ---------- drawer with a collapse tab, and what goes in it ----------
def section_title(text, icon=None, tag='h2'):
    return f'<{tag} class="cm-section-title">{svg(icon) if icon else ""}{text}</{tag}>'

TAB_SHAPE = {'open': '<path d="M0 .5H16.5A15 15 0 0 1 31.5 15.5V196L0 227.5"/>', 'collapsed': '<path d="M0 .5H16.5A15 15 0 0 1 31.5 15.5V176L0 207.5"/>'}
def drawer(side, title, body, icon=None, collapsed=False, toggle_state='rest', count=None, did='drawer', head_end=''):
    """side: left or right. body: the drawer's sections. The tab is the only way in or out; it stays when collapsed."""
    k = 'collapsed' if collapsed else 'open'
    point = {'left': 'chev-left', 'right': 'chev-right', 'bottom': 'chev-left'}[side]
    st = {'rest': '', 'hover': ' is-hover', 'focus': ' is-focus', 'active': ' is-active'}[toggle_state]
    label = f'<span class="cm-drawer__label" aria-hidden="true">{title}{f"<span class=cm-count>{count}</span>" if count is not None else ""}</span>'
    verb = 'Open' if collapsed else 'Collapse'
    return f'''<aside class="cm-drawer cm-drawer--{side}{" is-collapsed" if collapsed else ""}" aria-label="{title}">
  <div class="cm-drawer__body" id="{did}"><header class="cm-drawer__head">{section_title(title, icon)}{head_end}</header>{body}</div>
  <div class="cm-drawer__tab"><svg class="cm-drawer__shape" viewBox="{"0 0 224 32" if side == "bottom" else ("0 0 32 204" if collapsed else "0 0 32 224")}" preserveAspectRatio="none" aria-hidden="true">{'<path d="M0 32V15.5A15 15 0 0 1 15 .5H196L227.5 32"/>' if side == "bottom" else TAB_SHAPE[k]}</svg>
    <button class="cm-drawer__toggle{st}" aria-expanded="{"false" if collapsed else "true"}" aria-controls="{did}" aria-label="{verb} {title}">{svg(point)}</button>{label}</div>
</aside>'''

def dsection(html):
    return f'<section class="cm-drawer__section">{html}</section>'

def disclosure(title, icon, body, expanded=True):
    return f'<div class="cm-disclosure"><button class="cm-disclosure__head" aria-expanded="{"true" if expanded else "false"}">{section_title(title, icon, "span")}{svg("chev-up")}</button><div>{body}</div></div>'

def steps(items, now=0):
    out = []
    for i, s in enumerate(items):
        out.append(f'<span class="now">{s}</span>' if i == now else f'<span>{s}</span>')
    return '<div class="cm-steps" aria-label="Steps">' + svg('chev-right').join(out) + '</div>'

def pick(img, name, meta):
    return f'<div class="cm-pick"><img src="{img}" alt=""><div><b>{name}</b> <span>· {meta}</span></div></div>'

def consequence(head, text):
    return f'<p class="cm-consequence"><b>{head}</b>{text}</p>'

def history(items):
    return '<ol class="cm-history">' + ''.join(f'<li><img src="{img}" alt=""><span>{txt}</span></li>' for img, txt in items) + '</ol>'

def boardrow(img, name, life, legal=None, you=False, sub=''):
    lg = '<span></span>' if legal is None else (f'<span class="cm-legal">{legal} legal</span>' if legal else f'<span class="cm-count">0 legal</span>')
    return f'<div class="cm-boardrow{" is-you" if you else ""}"><span class="cm-portrait" style="background-image:url({img})"></span><span><b>{name}</b>{f" <span class=cm-muted>{sub}</span>" if sub else ""}</span><span class="life">{life}</span>{lg}</div>'

def seatmini(name, life, portrait, sub='', turn=False):
    return f'<div class="cm-seatmini{" is-turn" if turn else ""}"><span class="cm-portrait" style="background-image:url({portrait})"></span><span><b>{name}</b>{f"<span class=cm-small style=color:#cfcdc8>{sub}</span>" if sub else ""}</span><span class="life" style="margin-left:auto">{life}</span></div>'
