// The callout overlay: one grammar — a bold condensed word in neon with an outer
// glow, a glyph, a number where there is one. Entrance 320 ms, hold, exit 150 ms.
// Never more than three; oldest leaves first. Never covers the hand tray or the one button.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, Flame, Heart, HeartCrack, Shield, ShieldCheck, Skull, Slash, Sparkles, Swords, Trophy, Waves, Zap, Ghost, Sun, Hand } from 'lucide-react';
import type { Callout, CalloutKind } from '@/game/callouts';
import { anchorEls, cardEls } from '@/lib/flights';
import { usePrefs } from '@/state/prefs';
import { useGame } from '@/state/game';

const GLYPH: Record<CalloutKind, typeof Swords> = {
  incoming: Swords, response: Shield, hit: Zap, critical: Flame, ko: Skull, blocked: ShieldCheck, saved: Shield, countered: Slash,
  counters: Sparkles, proliferate: Waves, tokens: Sun, 'life-gain': Heart, 'life-loss': HeartCrack, fatal: Skull, destroyed: Crosshair,
  exiled: Ghost, 'your-turn': Trophy, 'game-over': Trophy, emote: Hand,
};

function anchorPoint(c: Callout, bounds: DOMRect | null): { x: number; y: number } {
  const fallback = bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.38 } : { x: window.innerWidth / 2, y: window.innerHeight * 0.38 };
  let el: HTMLElement | undefined;
  if (c.anchor?.cardId != null) el = cardEls.get(c.anchor.cardId);
  else if (c.anchor?.stack) el = anchorEls.get('stack');
  else if (c.anchor?.seat != null) el = anchorEls.get(`seat:${c.anchor.seat}`);
  if (!el || !el.isConnected) return fallback;
  const r = el.getBoundingClientRect();
  if (r.width < 2) return fallback;
  let x = r.left + r.width / 2;
  let y = r.top + Math.min(r.height / 2, 120);
  if (bounds) {
    x = Math.min(Math.max(x, bounds.left + 140), bounds.right - 140);
    y = Math.min(Math.max(y, bounds.top + 60), bounds.bottom - 90);
  }
  return { x, y };
}

function CalloutItem({ c, hold, intensity, reduced, bounds, onDone }: { c: Callout; hold: number; intensity: number; reduced: boolean; bounds: DOMRect | null; onDone: () => void }) {
  const [life, setLife] = useState(c.life?.from);
  useEffect(() => {
    if (!c.life) return;
    if (reduced) { setLife(c.life.to); return; }
    const { from, to } = c.life;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start - 350) / 850));
      setLife(Math.round(from + (to - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [c.life, reduced]);
  const pt = useMemo(() => anchorPoint(c, bounds), [c, bounds]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current(), hold);
    return () => clearTimeout(t);
  }, [hold]);
  const Glyph = GLYPH[c.kind];
  const scale = 0.75 + intensity / 200;
  const size = 44 * scale;
  return (
    <motion.div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: pt.x, top: pt.y, ['--glow-size' as string]: `${6 + intensity / 5}px` }}
      initial={reduced ? false : { opacity: 0, scale: 0.4, rotate: -6, y: 12 }}
      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.12, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.7, duration: 0.32 }}
      onClick={onDone}
      role="status"
      data-testid={`callout-${c.kind}`}
    >
      <div className={`callout-${c.tone} flex flex-col items-center`}>
        {c.life && <div className="mb-3 text-center text-xl font-semibold text-black" style={{ textShadow: 'none' }}>{c.life.name} · <span className="tabular-nums">{life}</span></div>}
        <div className="flex items-center gap-2">
          <Glyph className="callout-glyph" style={{ width: size, height: size }} strokeWidth={2.6} aria-hidden />
          <span className="callout callout-glow" style={{ fontSize: size * 1.05 }}>{c.word}</span>
          {c.number && <span className="callout callout-glow tabular" style={{ fontSize: size * 1.15 }}>{c.number}</span>}
        </div>
        {!c.life && c.readout && c.readout.filter(Boolean).length > 0 && intensity > 15 && (
          <div className="mt-2 max-w-[340px] text-center text-[14px] leading-snug text-black" style={{ textShadow: 'none' }}>
            {c.readout.filter(Boolean).map((r, i) => (
              <div key={i} className={i === 0 ? 'font-medium' : 'opacity-85'}>{r}</div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function CalloutLayer({ boundsRef }: { boundsRef: RefObject<HTMLElement | null> }) {
  const { callouts, dismissCallout } = useGame();
  const { prefs, reduced } = usePrefs();
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = boundsRef.current;
    if (!el) return;
    const upd = () => setBounds(el.getBoundingClientRect());
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    window.addEventListener('resize', upd);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', upd);
    };
  }, [boundsRef]);
  const hold = 900 + prefs.overlay * 10;
  return (
    <div className="pointer-events-none fixed inset-0 z-[55]" data-layer="callouts" aria-live="off">
      <AnimatePresence mode="wait">
        {callouts.slice(0, 1).map((c) => (
          <CalloutItem key={c.id} c={c} hold={c.readout ? hold + 700 : hold} intensity={prefs.overlay} reduced={reduced} bounds={bounds} onDone={() => dismissCallout(c.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
