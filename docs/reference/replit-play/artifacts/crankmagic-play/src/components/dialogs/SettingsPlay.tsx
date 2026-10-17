import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { THEMES } from '@/components/brand/AppNav';
import { MATS } from '@/lib/art';
import { usePrefs } from '@/state/prefs';
import { cn } from '@/lib/utils';

export function SettingsPlay({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { prefs, set } = usePrefs();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-display">Settings › Play</DialogTitle><DialogDescription>Saved on this device.</DialogDescription></DialogHeader>
        <div className="max-h-[68vh] space-y-5 overflow-auto pr-1 text-sm">
          <section>
            <h3 className="zone-label mb-2">Theme</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => set({ theme: t.id })} className={cn('rounded-xl border p-2 text-left', prefs.theme === t.id ? 'border-primary ring-2 ring-primary/30' : 'border-border')} data-testid={`settings-theme-${t.id}`}>
                  <div className="mb-1.5 flex h-8 overflow-hidden rounded-md">{t.swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</div>
                  <span className="text-xs font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="zone-label mb-2">Your mat</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {MATS.map((m) => (
                <button key={m.id} onClick={() => set({ mats: { ...prefs.mats, '0': m.id } })} className={cn('overflow-hidden rounded-lg border text-left', prefs.mats['0'] === m.id ? 'border-primary ring-2 ring-primary/30' : 'border-border')}>
                  <div className="h-12 bg-[hsl(var(--felt))]" style={m.css ? { background: m.css } : undefined}>{m.src && <img src={m.src} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="px-1.5 py-1 text-[11px]">{m.name}</div>
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="zone-label">Motion &amp; sound</h3>
            <label className="flex items-center justify-between">Reduce motion (also follows your system)<Switch checked={prefs.reduceMotion} onCheckedChange={(b) => set({ reduceMotion: b })} data-testid="switch-reduce-motion" /></label>
            <label className="block">Callout intensity · {prefs.overlay}<Slider className="mt-1.5" min={0} max={100} step={1} value={[prefs.overlay]} onValueChange={([v]) => set({ overlay: v })} /></label>
            <label className="block">Sound effects · {prefs.sfx}<Slider className="mt-1.5" min={0} max={100} step={1} value={[prefs.sfx]} onValueChange={([v]) => set({ sfx: v })} /></label>
            <label className="flex items-center justify-between">Mute<Switch checked={prefs.mute} onCheckedChange={(b) => set({ mute: b })} /></label>
          </section>
          <section className="space-y-3">
            <h3 className="zone-label">Table</h3>
            <label className="flex items-center justify-between">Remind me to play a land before ending my turn<Switch checked={prefs.remindLand} onCheckedChange={(b) => set({ remindLand: b })} /></label>
            <label className="flex items-center justify-between">Step by step (stop at every step)<Switch checked={prefs.stepByStep} onCheckedChange={(b) => set({ stepByStep: b })} /></label>
            <label className="flex items-center justify-between">Nameplates on placeholder art<Switch checked={prefs.nameplates} onCheckedChange={(b) => set({ nameplates: b })} /></label>
            <label className="block">Card size · {prefs.cardSize}px<Slider className="mt-1.5" min={44} max={130} step={2} value={[prefs.cardSize]} onValueChange={([v]) => set({ cardSize: v })} /></label>
            <label className="block">Hand size · {prefs.handScale.toFixed(1)}×<Slider className="mt-1.5" min={1} max={3} step={0.1} value={[prefs.handScale]} onValueChange={([v]) => set({ handScale: v })} /></label>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
