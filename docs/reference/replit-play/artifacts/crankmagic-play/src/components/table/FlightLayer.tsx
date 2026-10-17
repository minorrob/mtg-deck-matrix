// FLIP card travel. On every new view, cards whose zone changed fly from where
// they were to where they are now; cards that left the screen fly to their pile;
// cards that arrived from a hidden zone fly out of the library (draw, scry) or an
// opponent's hand. Purely presentational: the view already says where everything is.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { locationMap, visibleName } from '@/game/derive';
import type { CardView, RoomView } from '@/game/types';
import { anchorEls, cardEls } from '@/lib/flights';
import { CardBack } from '@/components/cards/CardBack';
import { artFor } from '@/lib/art';

interface Snap {
  rect: DOMRect;
  key: string;
}
interface Flight {
  id: string;
  cardId: number;
  from: DOMRect;
  to: DOMRect;
  faceFrom: boolean;
  faceTo: boolean;
  name: string | null;
  tilt: number;
  duration: number;
}

type Loc = { owner: number; zone: string; card?: CardView };

function locations(v: RoomView): Map<number, Loc> {
  const m = new Map<number, Loc>(locationMap(v));
  for (const s of v.state.stack) if (s.cardId != null && !m.has(s.cardId)) m.set(s.cardId, { owner: s.playerId, zone: 'Stack' });
  for (const o of v.decision?.options ?? []) if (o.cardId != null && !m.has(o.cardId)) m.set(o.cardId, { owner: v.seat, zone: 'Reveal' });
  return m;
}

function measure(): Map<number, Snap> {
  const out = new Map<number, Snap>();
  cardEls.forEach((el, id) => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2) return;
    out.set(id, { rect: r, key: el.closest('[data-zone]')?.getAttribute('data-zone') ?? '?' });
  });
  return out;
}

function anchorRect(key: string): DOMRect | null {
  const el = anchorEls.get(key);
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width > 1 ? r : null;
}

export function FlightLayer({ view, disabled }: { view: RoomView; disabled: boolean }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const snaps = useRef<Map<number, Snap>>(new Map());
  const prevView = useRef<RoomView | null>(null);
  const hidden = useRef<Set<HTMLElement>>(new Set());

  // keep the "before" picture fresh while idle (resizes, layout swaps)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (flights.length === 0) snaps.current = measure();
    }, 900);
    const onR = () => (snaps.current = measure());
    window.addEventListener('resize', onR);
    window.addEventListener('pointerup', onR);
    return () => {
      clearInterval(t);
      window.removeEventListener('resize', onR);
      window.removeEventListener('pointerup', onR);
    };
  }, [flights.length]);

  useLayoutEffect(() => {
    const pv = prevView.current;
    prevView.current = view;
    const now = measure();
    if (disabled || !pv || pv.matchId !== view.matchId || pv.revision === view.revision || view.revision < pv.revision) {
      snaps.current = now;
      return;
    }
    const before = snaps.current;
    const oldLoc = locations(pv);
    const newLoc = locations(view);
    const list: Flight[] = [];
    const push = (cardId: number, from: DOMRect, to: DOMRect, faceFrom: boolean, faceTo: boolean, name: string | null, tilt = 0, duration = 0.22) => {
      if (list.length >= 6) return;
      if (Math.hypot(from.left - to.left, from.top - to.top) < 6) return;
      list.push({ id: `${cardId}-${view.revision}`, cardId, from, to, faceFrom, faceTo, name, tilt, duration });
    };

    // 1) still on screen but moved zones
    now.forEach((s, id) => {
      const b = before.get(id);
      const o = oldLoc.get(id);
      const n = newLoc.get(id);
      if (b && o && n && o.zone !== n.zone) {
        const el = cardEls.get(id);
        if (el) {
          el.style.visibility = 'hidden';
          hidden.current.add(el);
        }
        const nm = n.card ? visibleName(n.card) : null;
        push(id, b.rect, s.rect, true, true, nm, 0, n.zone === 'Battlefield' ? 0.18 : 0.22);
      }
    });
    // 2) left the screen → fly to its pile
    before.forEach((b, id) => {
      if (now.has(id)) return;
      const o = oldLoc.get(id);
      if (!o) return;
      const n = newLoc.get(id);
      const owner = n?.owner ?? o.owner;
      let zone = n?.zone;
      if (!zone || zone === 'Hand') zone = o.zone === 'Reveal' || (o.zone === 'Hand' && owner === pv.seat && !n) ? 'Library' : n ? 'Hand' : 'Library';
      const to = anchorRect(`${owner}:${zone}`);
      if (!to) return;
      const nm = o.card ? visibleName(o.card) : n?.card ? visibleName(n.card) : null;
      push(id, b.rect, to, !!nm, zone === 'Graveyard' || zone === 'Exile' || zone === 'Command', nm, zone === 'Graveyard' ? 18 : 0, 0.24);
    });
    // 3) arrived on screen from somewhere hidden or unrendered
    now.forEach((s, id) => {
      if (before.has(id)) return;
      const n = newLoc.get(id);
      const o = oldLoc.get(id);
      if (!n) return;
      let src: DOMRect | null = null;
      if (o) src = anchorRect(`${o.owner}:${o.zone}`);
      if (!src) src = anchorRect(n.zone === 'Hand' || n.zone === 'Reveal' ? `${n.owner}:Library` : `${n.owner}:Hand`);
      if (!src) return;
      const el = cardEls.get(id);
      if (el) {
        el.style.visibility = 'hidden';
        hidden.current.add(el);
      }
      const nm = n.card ? visibleName(n.card) : null;
      push(id, src, s.rect, !!o && o.zone !== 'Hand', true, nm, 0, n.zone === 'Hand' ? 0.24 : 0.22);
    });

    snaps.current = now;
    if (list.length) setFlights((f) => [...f, ...list]);
    // never leave anything hidden: safety release
    const safety = window.setTimeout(() => {
      hidden.current.forEach((el) => (el.style.visibility = ''));
      hidden.current.clear();
    }, 700);
    return () => clearTimeout(safety);
  }, [view, disabled]);

  const land = (f: Flight) => {
    setFlights((l) => l.filter((x) => x.id !== f.id));
    const el = cardEls.get(f.cardId);
    if (el) {
      el.style.visibility = '';
      hidden.current.delete(el);
    }
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden data-layer="flights">
      {flights.map((f) => {
        const w = f.to.width;
        const sx = f.from.width / w;
        const art = f.name ? artFor(f.name).src : null;
        return (
          <motion.div
            key={f.id}
            className="absolute left-0 top-0"
            style={{ width: w, transformOrigin: '0 0' }}
            initial={{ x: f.from.left, y: f.from.top, scale: sx, rotate: 0 }}
            animate={{ x: f.to.left, y: f.to.top, scale: 1, rotate: f.tilt }}
            transition={{ duration: f.duration, ease: [0.2, 0.8, 0.2, 1] }}
            onAnimationComplete={() => land(f)}
          >
            {f.faceTo && art ? (
              <motion.div initial={{ rotateY: f.faceFrom ? 0 : 90 }} animate={{ rotateY: 0 }} transition={{ duration: f.duration * 0.6, delay: f.faceFrom ? 0 : f.duration * 0.4 }} className="mtg-card" style={{ width: w }}>
                <img className="card-img" src={art} alt="" />
              </motion.div>
            ) : (
              <CardBack width={w} />
            )}
          </motion.div>
        );
      })}
    </div>,
    document.body,
  );
}
