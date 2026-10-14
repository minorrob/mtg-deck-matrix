import { cn } from '@/lib/utils';
import { WandMark } from '@/components/brand/Logo';

/** Placeholder card back (CrankMagic has its own; swap the art here). Never names a card. */
export function CardBack({ width, tapped, label, className }: { width: number; tapped?: boolean; label?: string; className?: string }) {
  return (
    <div className={cn('mtg-card card-back grid place-items-center', tapped && 'is-tapped', className)} style={{ width }} aria-hidden>
      <WandMark className="text-[hsl(var(--card)/0.85)]" size={Math.max(12, width * 0.36)} />
      {label && width > 50 && <span className="absolute bottom-[8%] text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--card)/0.9)]">{label}</span>}
    </div>
  );
}
