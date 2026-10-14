// The four supplied placeholder images are the ONLY card art in the prototype.
// Every card name maps to one deterministically (hash of the name). Real build:
// https://api.scryfall.com/cards/named?exact=<name>&format=image&version=normal
const BASE = import.meta.env.BASE_URL;

export interface PlaceholderArt {
  src: string;
  printed: string;
  artist: string;
}

export const PLACEHOLDER_ART: PlaceholderArt[] = [
  { src: `${BASE}assets/cards/valkyrie.png`, printed: 'Valkyrie (supplied image)', artist: 'credit as printed on the card' },
  { src: `${BASE}assets/cards/colossification.jpg`, printed: 'Colossification', artist: 'credit as printed on the card' },
  { src: `${BASE}assets/cards/opt.jpg`, printed: 'Opt', artist: 'credit as printed on the card' },
  { src: `${BASE}assets/cards/ugin.jpg`, printed: 'Ugin', artist: 'credit as printed on the card' },
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function exactArt(name: string): number {
  if (/^Valkyrie\b/.test(name)) return 0;
  if (name === 'Colossification') return 1;
  if (name === 'Opt') return 2;
  if (/^Ugin\b/.test(name)) return 3;
  return -1;
}

export function artFor(name: string): PlaceholderArt {
  const i = exactArt(name);
  return PLACEHOLDER_ART[i >= 0 ? i : hashString(name) % PLACEHOLDER_ART.length];
}

/** True when the supplied image is (or stands in for) that very card. */
export function artMatches(name: string): boolean {
  return exactArt(name) >= 0;
}

export interface MatArt {
  id: string;
  name: string;
  kind: 'drawn' | 'artwork';
  src?: string;
  css?: string;
}

export const MATS: MatArt[] = [
  { id: 'felt', name: 'Felt', kind: 'drawn' },
  { id: 'lichen', name: 'Lichen weave', kind: 'drawn', css: 'repeating-linear-gradient(45deg, hsl(var(--lichen) / .10) 0 2px, transparent 2px 14px), hsl(var(--felt))' },
  { id: 'ironlines', name: 'Iron lines', kind: 'drawn', css: 'repeating-linear-gradient(0deg, hsl(var(--ink) / .05) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, hsl(var(--ink) / .05) 0 1px, transparent 1px 22px), hsl(var(--felt-2))' },
  { id: 'brassring', name: 'Brass rings', kind: 'drawn', css: 'repeating-radial-gradient(circle at 80% 120%, hsl(var(--brass) / .12) 0 2px, transparent 2px 26px), hsl(var(--felt-2))' },
  { id: 'dawn', name: 'Dawn wash', kind: 'drawn', css: 'linear-gradient(160deg, hsl(36 70% 92%), hsl(200 40% 90%))' },
  { id: 'highland', name: 'Highland Mist', kind: 'artwork', src: `${BASE}assets/mats/highland-mist.jpg` },
  { id: 'cloud', name: 'Cloud Sea', kind: 'artwork', src: `${BASE}assets/mats/cloud-sea.jpg` },
  { id: 'dunes', name: 'Glyph Dunes', kind: 'artwork', src: `${BASE}assets/mats/glyph-dunes.jpg` },
  { id: 'birch', name: 'Birch Lake', kind: 'artwork', src: `${BASE}assets/mats/birch-lake.jpg` },
];

export function matById(id: string | undefined): MatArt {
  return MATS.find((m) => m.id === id) ?? MATS[0];
}
