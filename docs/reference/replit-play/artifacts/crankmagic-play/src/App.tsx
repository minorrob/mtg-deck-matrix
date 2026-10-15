import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import PlayHome from '@/pages/PlayHome';
import Lobby from '@/pages/Lobby';
import Game from '@/pages/Game';
import Spectate from '@/pages/Spectate';
import { PrefsProvider } from '@/state/prefs';
import { ChatProvider } from '@/state/chat';
import { GameProvider } from '@/state/game';
import { initSoundUnlock } from '@/lib/sound';

const queryClient = new QueryClient();

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={PlayHome} />
        <Route path="/lobby" component={Lobby} />
        <Route path="/game" component={Game} />
        <Route path="/spectate/:id" component={Spectate} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  useEffect(() => initSoundUnlock(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PrefsProvider>
          <ChatProvider>
            <GameProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
              </WouterRouter>
              <Toaster />
            </GameProvider>
          </ChatProvider>
        </PrefsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
