"""Status glyphs and UI icons, 16-unit grid, currentColor. One source for the pack's sprite and the artifact previews."""
S = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'
G = {
  # status shapes: the non-color channel of every rung
  'st-inbox':    '<circle cx="8" cy="8" r="6" fill="currentColor"/>',
  'st-physical': '<rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="currentColor"/>',
  'st-pull':     '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2.4" fill="currentColor"/>',
  'st-reserved': '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4.6" y="7" width="6.8" height="2" fill="currentColor"/>',
  'st-ordered':  '<path d="M2.5 8h9M8 3.8 12.2 8 8 12.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  'st-buy':      '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  'st-standin':  '<rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9 9 3M5 13 13 5M9.5 13 13 9.5" stroke="currentColor" stroke-width="1.6"/>',
  'st-remove':   '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  'st-watch':    '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.2"/>',
  'st-draft':    '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray=".1 3" stroke-linecap="round"/>',
  # UI
  'check':   f'<path {S} d="M3 8.5 6.5 12 13 4.5"/>',
  'alert':   f'<circle {S} cx="8" cy="8" r="6.2"/><path {S} d="M8 4.8v3.8M8 11.2v.1"/>',
  'x':       f'<path {S} d="M4 4l8 8M12 4l-8 8"/>',
  'chev':    f'<path {S} d="M4 6l4 4 4-4"/>',
  'plus':    f'<path {S} d="M8 3v10M3 8h10"/>',
  'more':    '<circle cx="3.5" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12.5" cy="8" r="1.4" fill="currentColor"/>',
  'user':    f'<circle {S} cx="8" cy="5.5" r="2.8"/><path {S} d="M2.8 13.5c.9-2.5 2.9-3.7 5.2-3.7s4.3 1.2 5.2 3.7"/>',
  'invite':  f'<circle {S} cx="6.5" cy="5.5" r="2.6"/><path {S} d="M1.8 13.5c.8-2.3 2.6-3.5 4.7-3.5s3.9 1.2 4.7 3.5M12.5 5v4M10.5 7h4"/>',
  'sync':    f'<path {S} d="M13 6.5A5 5 0 0 0 4 4.4L3 5.5M3 9.5a5 5 0 0 0 9 2.1l1-1.1M3 2.5v3h3M13 13.5v-3h-3"/>',
  'reload':  f'<path {S} d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"/>',
  'gear':    f'<circle {S} cx="8" cy="8" r="2.2"/><path {S} d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"/>',
  'download':f'<path {S} d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  'upload':  f'<path {S} d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10"/>',
  'trash':   f'<path {S} d="M2.8 4.5h10.4M6.2 4.5V3h3.6v1.5M4.2 4.5l.7 9h6.2l.7-9"/>',
  'help':    f'<circle {S} cx="8" cy="8" r="6.2"/><path {S} d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.6.3-.8.7-.8 1.3M8 11.3v.1"/>',
  'tour':    f'<path {S} d="M2.5 3.5 6 2.5l4 1.5 3.5-1v10l-3.5 1-4-1.5-3.5 1zM6 2.5v10M10 4v10"/>',
  'chat':    f'<path {S} d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z"/>',
  'qr':      f'<path {S} d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h1.5M13.5 9.5v1.5M9.5 12.5v1h4"/>',
  'signout': f'<path {S} d="M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6.5"/>',
  'book':    f'<path {S} d="M3 2.8h4.2c.5 0 .8.3.8.8v9.6c0-.5-.4-.8-.8-.8H3zM13 2.8H8.8c-.5 0-.8.3-.8.8v9.6c0-.5.4-.8.8-.8H13z"/>',
  'eye':     f'<path {S} d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle {S} cx="8" cy="8" r="1.8"/>',
  'palette': f'<path {S} d="M8 2a6 6 0 1 0 0 12c1 0 1.3-.7 1-1.4-.4-.9.1-1.6 1-1.6h1.5A2.5 2.5 0 0 0 14 8.5C14 4.9 11.3 2 8 2z"/><circle cx="5" cy="7" r=".9" fill="currentColor"/><circle cx="7.5" cy="4.8" r=".9" fill="currentColor"/><circle cx="10.6" cy="5.4" r=".9" fill="currentColor"/>',
  'camera':  f'<path {S} d="M2.5 5h2.2l1.2-1.6h4.2L11.3 5h2.2v7.5h-11z"/><circle {S} cx="8" cy="8.6" r="2.3"/>',
  'box':     f'<path {S} d="M2.5 5 8 2.5 13.5 5v6.2L8 13.7l-5.5-2.5zM2.5 5 8 7.5 13.5 5M8 7.5v6.2"/>',
  'lock':    f'<rect {S} x="3" y="7" width="10" height="6.5" rx="1.5"/><path {S} d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7"/>',
  'cart':    f'<path {S} d="M1.8 2.5h2l1.6 7.5h7l1.3-5.2H4.5"/><circle cx="6.2" cy="12.8" r="1" fill="currentColor"/><circle cx="11.6" cy="12.8" r="1" fill="currentColor"/>',
  'play':    '<path d="M5 3.2v9.6L12.8 8z" fill="currentColor"/>',
  'search':  f'<circle {S} cx="7" cy="7" r="4.3"/><path {S} d="M10.2 10.2 13.5 13.5"/>',
  'filter':  f'<path {S} d="M2.5 3.5h11M4.5 8h7M6.5 12.5h3"/>',
  'skull':   f'<path {S} d="M3 7.2a5 5 0 1 1 10 0c0 1.7-.8 2.7-1.8 3.3V13H4.8v-2.5C3.8 9.9 3 8.9 3 7.2z"/><circle cx="6" cy="7.4" r="1.1" fill="currentColor"/><circle cx="10" cy="7.4" r="1.1" fill="currentColor"/>',
  'cards':   f'<rect {S} x="2.5" y="3.5" width="7" height="10" rx="1.2"/><path {S} d="M11 4.2l2.3.8-2.6 8.3-2.2-.7"/>',
  'library': f'<rect {S} x="3.5" y="2.5" width="9" height="11" rx="1.2"/><path {S} d="M6 5.5h4M6 8h4"/>',
  'grave':   f'<path {S} d="M4 13.5V7a4 4 0 0 1 8 0v6.5zM2.5 13.5h11M8 6v4M6.5 7.5h3"/>',
  'menu':    f'<path {S} d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  'clock':   f'<circle {S} cx="8" cy="8" r="6"/><path {S} d="M8 4.8V8l2.2 1.4"/>',
  'chev-left':  f'<path {S} d="M10 3.5 5.5 8l4.5 4.5"/>',
  'chev-right': f'<path {S} d="M6 3.5 10.5 8 6 12.5"/>',
  'chev-up':    f'<path {S} d="M4 10l4-4 4 4"/>',
  'scroll':     f'<path {S} d="M4.5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v8.5a1 1 0 0 1-1 1H5M4.5 2.5A1.5 1.5 0 0 0 3 4v1.5h3M4.5 2.5A1.5 1.5 0 0 1 6 4v9.5M8.5 6h2.5M8.5 9h2.5"/>',
  'seats':      f'<circle {S} cx="5.5" cy="5.5" r="2.2"/><circle {S} cx="11" cy="6.5" r="1.8"/><path {S} d="M1.8 13c.6-2.2 2-3.3 3.7-3.3S8.6 10.8 9.2 13M10 10.2c1.6-.2 3 .7 3.8 2.8"/>',
  'stack':      f'<path {S} d="M8 2.5 13.5 5 8 7.5 2.5 5zM2.5 8 8 10.5 13.5 8M2.5 11 8 13.5 13.5 11"/>',
  'history':    f'<path {S} d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5M8 5v3.2l2.2 1.4"/>',
}
def svg(name, cls='g', size=None):
    s = f' width="{size}" height="{size}"' if size else ''
    return f'<svg class="{cls}" viewBox="0 0 16 16"{s} aria-hidden="true">{G[name]}</svg>'
def sprite_js():
    syms = ''.join(f'<symbol id="i-{k}" viewBox="0 0 16 16">{v}</symbol>' for k, v in G.items())
    return ("/* Generated by build/glyphs.py. Injects the icon sprite; use <svg class=g><use href=#i-name></svg>. */\n"
            "(function(){var d=document.createElement('div');d.style.display='none';d.innerHTML='<svg xmlns=\"http://www.w3.org/2000/svg\">"
            + syms.replace("'", "\\'") + "</svg>';document.body.prepend(d);})();\n")
if __name__ == '__main__':
    import sys
    open(sys.argv[1], 'w').write(sprite_js()); print('sprite ok')
