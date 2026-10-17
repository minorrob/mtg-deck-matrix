// Spectator view: synthetic projection, counts only for hand/library/graveyard/exile. Never acts.
import { useEffect } from 'react';
import { getAdapter } from '@/game/adapter';
import Game from './Game';

export default function Spectate() {
  useEffect(() => {
    getAdapter().loadScenario('spectator');
  }, []);
  return <Game />;
}
