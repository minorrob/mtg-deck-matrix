"""Color math for the CrankMagic r4 palette: OKLCH <-> sRGB, WCAG contrast, CVD simulation."""
import math

def _srgb_to_lin(c):
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def _lin_to_srgb(c):
    return 12.92*c if c <= 0.0031308 else 1.055*(c**(1/2.4))-0.055

def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(ch*2 for ch in h)
    return tuple(int(h[i:i+2], 16)/255 for i in (0, 2, 4))
def rgb_to_hex(rgb):
    return '#' + ''.join(f"{max(0,min(255,round(c*255))):02x}" for c in rgb)

def lin_to_oklab(r, g, b):
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l_, m_, s_ = (math.copysign(abs(x)**(1/3), x) for x in (l, m, s))
    return (0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
            1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
            0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_)
def oklab_to_lin(L, a, b):
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    return (4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
            -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
            -0.0041960863*l - 0.7034186147*m + 1.7076147010*s)

def hex_to_oklab(h):
    return lin_to_oklab(*(_srgb_to_lin(c) for c in hex_to_rgb(h)))
def hex_to_oklch(h):
    L, a, b = hex_to_oklab(h)
    C = math.hypot(a, b); H = math.degrees(math.atan2(b, a)) % 360
    return L, C, H

def oklch_to_hex(L, C, H):
    """Gamut-map by reducing chroma at constant L and H until it fits sRGB."""
    lo, hi = 0.0, C
    def fits(c):
        a, b = c*math.cos(math.radians(H)), c*math.sin(math.radians(H))
        rgb = oklab_to_lin(L, a, b)
        return all(-1e-6 <= x <= 1+1e-6 for x in rgb), rgb
    ok, rgb = fits(C)
    if not ok:
        for _ in range(40):
            mid = (lo+hi)/2
            o, r = fits(mid)
            if o: lo, rgb = mid, r
            else: hi = mid
        _, rgb = fits(lo)
    return rgb_to_hex(tuple(_lin_to_srgb(max(0, min(1, x))) for x in rgb))

def luminance(h):
    r, g, b = (_srgb_to_lin(c) for c in hex_to_rgb(h))
    return 0.2126*r + 0.7152*g + 0.0722*b
def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

def mix(h1, h2, t):
    """Mix in oklab, t = share of h2 (0..1). Matches CSS color-mix(in oklab, h1 (1-t), h2 t)."""
    a1, a2 = hex_to_oklab(h1), hex_to_oklab(h2)
    L, a, b = (x*(1-t)+y*t for x, y in zip(a1, a2))
    rgb = oklab_to_lin(L, a, b)
    return rgb_to_hex(tuple(_lin_to_srgb(max(0, min(1, x))) for x in rgb))

def over(fg, bg, alpha):
    """fg at alpha composited over bg, in sRGB space (what browsers do for rgba)."""
    f, b = hex_to_rgb(fg), hex_to_rgb(bg)
    return rgb_to_hex(tuple(x*alpha + y*(1-alpha) for x, y in zip(f, b)))

# Machado, Oliveira & Fernandes 2009, severity 1.0, applied to linear RGB.
CVD = {
  'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
def simulate(h, kind):
    lin = [_srgb_to_lin(c) for c in hex_to_rgb(h)]
    M = CVD[kind]
    out = [max(0, min(1, sum(M[i][j]*lin[j] for j in range(3)))) for i in range(3)]
    return rgb_to_hex(tuple(_lin_to_srgb(x) for x in out))

def delta_e(h1, h2):
    a, b = hex_to_oklab(h1), hex_to_oklab(h2)
    return math.dist(a, b)
