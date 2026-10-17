import { DraftProvider } from '@/state/draft';
import { GameScreen } from '@/components/layout/GameScreen';

export default function Game() {
  return (
    <DraftProvider>
      <GameScreen />
    </DraftProvider>
  );
}
