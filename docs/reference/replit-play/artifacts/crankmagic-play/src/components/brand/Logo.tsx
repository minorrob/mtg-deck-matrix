import { cn } from '@/lib/utils';

/** The wand mark: a slim wand with a four-point spark. */
export function WandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M6 26 L19 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 4 L23.6 8.4 L28 10 L23.6 11.6 L22 16 L20.4 11.6 L16 10 L20.4 8.4 Z" fill="currentColor" />
      <circle cx="8" cy="9" r="1.4" fill="currentColor" opacity="0.6" />
      <circle cx="26" cy="22" r="1.1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[hsl(var(--lichen))] shadow-sm">
        <WandMark size={18} />
      </span>
      {!compact && (
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Crank<span className="italic text-primary">Magic</span>
        </span>
      )}
    </span>
  );
}
