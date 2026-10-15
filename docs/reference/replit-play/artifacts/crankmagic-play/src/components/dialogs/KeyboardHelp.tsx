import { Fragment } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const KEYS: [string, string][] = [
  ['N or Space', 'The one button (pass, next step, resolve, end turn)'], ['H', 'Show or hide your hand'], ['1–4', 'Look at that seat’s board'], ['C', 'Coach'],
  ['L', 'Cycle layout: Focus, Table'], ['?', 'This list'], ['Esc', 'Close, or return to your own board'], ['Z on a card', 'Zoom it'], ['Arrows on a divider', 'Resize panes'],
];

export function KeyboardHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Keyboard</DialogTitle><DialogDescription>Keys never fire while you type.</DialogDescription></DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {KEYS.map(([k, v]) => <Fragment key={k}><dt className="font-mono text-xs"><kbd className="rounded border bg-secondary px-1.5 py-0.5">{k}</kbd></dt><dd>{v}</dd></Fragment>)}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
