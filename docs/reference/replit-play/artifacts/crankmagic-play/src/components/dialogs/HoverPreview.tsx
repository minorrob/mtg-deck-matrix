// Hover a card: it shows centered at up to 400 px, never taller than the board.
import { AnimatePresence, motion } from 'framer-motion';
import { findCard } from '@/game/derive';
import { useHovered } from '@/lib/hover-store';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { CardFace } from '@/components/cards/CardFace';

export function HoverPreview() {
  const id = useHovered();
  const { view } = useGame();
  const { reduced } = usePrefs();
  const card = findCard(view, id);
  const w = Math.min(286, (window.innerHeight * 0.62) / 1.4);
  return (
    <div className="pointer-events-none fixed inset-0 z-[50] hidden items-center justify-center md:flex" aria-hidden>
      <AnimatePresence>
        {card && (
          <motion.div key={card.cardId} initial={reduced ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.14 }} className="drop-shadow-2xl">
            <CardFace card={card} width={w} track={false} showTapped={false} hoverable={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
