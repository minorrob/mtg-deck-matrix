// Concede (one confirm) and End for everyone (two confirms).
import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useGame } from '@/state/game';

export function ConfirmTable({ kind, onClose }: { kind: 'concede' | 'end' | null; onClose: () => void }) {
  const { adapter } = useGame();
  const [step, setStep] = useState(1);
  const close = () => { setStep(1); onClose(); };
  const end = kind === 'end';
  return (
    <AlertDialog open={!!kind} onOpenChange={(b) => !b && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{end ? (step === 1 ? 'End the game for everyone?' : 'Really end it? This cannot be undone.') : 'Concede this game?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {end ? (step === 1 ? 'Every seat stops here. The record is kept in game history.' : 'Friend, AI 2 and AI 3 will see that you ended it.') : 'You leave the game; the others play on. Your seat counts as a loss.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>Keep playing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid={`button-confirm-${kind}-${step}`}
            onClick={(e) => {
              if (end && step === 1) { e.preventDefault(); setStep(2); return; }
              adapter.tableAction(end ? 'end-for-everyone' : 'concede');
              close();
            }}
          >
            {end ? (step === 1 ? 'Yes, continue' : 'End for everyone') : 'Concede'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
