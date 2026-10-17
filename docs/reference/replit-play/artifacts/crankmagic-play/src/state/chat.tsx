// Chat STUB — in memory only. Lobby chat and in-game chat are the same conversation.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export const EMOTES = ['GG', 'nice', 'oops', 'thinking', 'salt', 'hype'] as const;
export type Emote = (typeof EMOTES)[number];

export interface ChatMessage {
  id: string;
  at: number;
  from: string;
  seat: number | null;
  spectator?: boolean;
  text: string;
  emote?: Emote;
  system?: boolean;
}

interface Ctx {
  messages: ChatMessage[];
  joined: boolean;
  muted: Set<string>;
  send: (text: string, opts?: { emote?: Emote; from?: string; seat?: number | null; spectator?: boolean }) => void;
  setJoined: (b: boolean) => void;
  toggleMute: (name: string) => void;
  lastEmote: { seat: number; emote: Emote; key: number } | null;
}

const ChatContext = createContext<Ctx | null>(null);
const PublicChatContext = createContext<Ctx | null>(null);

const SEED: ChatMessage[] = [
  { id: 'm1', at: Date.now() - 1000 * 60 * 14, from: 'Nina', seat: null, text: 'anyone up for a bracket 3 pod tonight?' },
  { id: 'm2', at: Date.now() - 1000 * 60 * 11, from: 'Marcus', seat: null, text: 'in after 8. bringing the Yoshimaru list' },
  { id: 'm3', at: Date.now() - 1000 * 60 * 6, from: 'Rob', seat: 0, text: 'table is up, AI is filling two seats' },
  { id: 'm4', at: Date.now() - 1000 * 60 * 2, from: 'Theo', seat: null, spectator: true, text: 'watching from the rail' },
];

const REPLIES = ['ha, fair', 'that stack is getting tall', 'respect', 'not the Packleader again', 'gl'];

export function ChatProvider({ children }: { children: ReactNode }) {
  return <ChatChannel publicLobby><ChatChannel>{children}</ChatChannel></ChatChannel>;
}

function ChatChannel({ children, publicLobby = false }: { children: ReactNode; publicLobby?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => publicLobby
    ? SEED.slice(0, 2).map((m) => ({ ...m, seat: null }))
    : [
        { id: 'table-1', at: Date.now(), from: 'Rob', seat: 0, text: 'Welcome to the table. Ready when you are.' },
        { id: 'table-2', at: Date.now(), from: 'Friend', seat: 1, text: 'Deck selected. Good luck everyone!' },
      ]);
  const [joined, setJoined] = useState(true);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [lastEmote, setLastEmote] = useState<Ctx['lastEmote']>(null);
  const k = useRef(0);

  const send: Ctx['send'] = useCallback((text, opts) => {
    const msg: ChatMessage = {
      id: `m-${Date.now()}-${k.current++}`, at: Date.now(), from: opts?.from ?? 'Rob', seat: publicLobby ? null : opts?.seat === undefined ? 0 : opts.seat,
      spectator: opts?.spectator, text, emote: opts?.emote,
    };
    setMessages((m) => [...m, msg].slice(-200));
    if (opts?.emote && msg.seat != null) setLastEmote({ seat: msg.seat, emote: opts.emote, key: k.current++ });
    if (!opts?.from && Math.random() < 0.6) {
      const reply = publicLobby ? 'Looking for a game too. Anyone have an open seat?' : REPLIES[Math.floor(Math.random() * REPLIES.length)];
      window.setTimeout(() => {
        setMessages((m) => [...m, { id: `m-r-${Date.now()}`, at: Date.now(), from: publicLobby ? 'Nina' : 'Friend', seat: publicLobby ? null : 1, text: reply }]);
      }, 1400);
    }
  }, [publicLobby]);

  const toggleMute = useCallback((name: string) => {
    setMuted((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  }, []);

  const value = useMemo(() => ({ messages, joined, muted, send, setJoined, toggleMute, lastEmote }), [messages, joined, muted, send, toggleMute, lastEmote]);
  const Channel = publicLobby ? PublicChatContext : ChatContext;
  return <Channel.Provider value={value}>{children}</Channel.Provider>;
}

export function useChat(channel: 'table' | 'public' = 'table'): Ctx {
  const table = useContext(ChatContext);
  const publicChat = useContext(PublicChatContext);
  const c = channel === 'public' ? publicChat : table;
  if (!c) throw new Error('useChat outside ChatProvider');
  return c;
}
