import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { EMOTES, useChat } from '@/state/chat';
import { fmtTime, seatColor } from '@/game/derive';
import { cn } from '@/lib/utils';

export function ChatPanel({ spectator, compact, channel = 'table' }: { spectator?: boolean; compact?: boolean; channel?: 'table' | 'public' }) {
  const { messages, send, muted, toggleMute } = useChat(channel);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Some browsers return a Promise from scrolling. React effects may only
    // return a cleanup function, never the scroll operation's return value.
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    send(t, spectator ? { from: 'You (watching)', seat: null, spectator: true } : undefined);
    setText('');
  };
  return (
    <div className={cn('flex h-full min-h-[240px] flex-col', compact && 'min-h-[200px]')}>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto scroll-thin pr-1 text-[13px]" aria-live="polite">
        {messages.filter((m) => !muted.has(m.from)).map((m) => (
          <div key={m.id} className="group">
            <span className="font-semibold" style={{ color: m.seat != null ? seatColor(m.seat) : undefined }}>{m.from}</span>
            {m.spectator && <span className="ml-1 text-[10px] uppercase text-muted-foreground">rail</span>}
            <span className="ml-1.5 text-[10px] text-muted-foreground">{fmtTime(m.at)}</span>
            {m.from !== 'Rob' && <button onClick={() => toggleMute(m.from)} className="ml-1 hidden text-[10px] text-muted-foreground underline group-hover:inline">mute</button>}
            <div className={cn(m.emote && 'inline-block rounded-full bg-accent px-2 font-callout text-sm uppercase tracking-wide')}>{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {!spectator && (
        <div className="mt-2 flex flex-wrap gap-1">
          {EMOTES.map((e) => <button key={e} onClick={() => send(e, { emote: e })} className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-secondary">{e}</button>)}
        </div>
      )}
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={channel === 'public' ? 'Message everyone in the lobby' : spectator ? 'Say something from the rail' : 'Message the table'} className="min-w-0 flex-1 rounded-full border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label={channel === 'public' ? 'Public lobby message' : 'Table chat message'} data-testid="input-chat" />
        <button className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Send"><Send className="h-3.5 w-3.5" /></button>
      </form>
    </div>
  );
}

export function ChatTab() {
  return <ChatPanel />;
}
