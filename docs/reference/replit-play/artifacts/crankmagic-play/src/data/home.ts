// STUB data for Play home. Shape: OpenTable / PastGame below.
export type Access = 'open' | 'friends' | 'invite' | 'full';
export interface OpenTable {
  id: string; host: string; name: string; access: Access; seats: (string | null)[]; bracket: number; pace: string; started: boolean; turn?: number; spectators: number; note: string;
}
export const OPEN_TABLES: OpenTable[] = [
  { id: 't1', host: 'Nina', name: 'Tuesday brews', access: 'open', seats: ['Nina', 'AI', null, null], bracket: 3, pace: 'relaxed', started: false, spectators: 0, note: 'Bring something weird.' },
  { id: 't2', host: 'Marcus', name: 'Yoshimaru league night', access: 'friends', seats: ['Marcus', 'Dee', 'Ari', null], bracket: 3, pace: 'normal', started: false, spectators: 2, note: 'Friends of Marcus only.' },
  { id: 't3', host: 'Priya', name: 'cEDH-adjacent', access: 'invite', seats: ['Priya', 'Lou', null, null], bracket: 4, pace: 'quick', started: false, spectators: 0, note: 'Invite code from the Discord.' },
  { id: 't4', host: 'Oskar', name: 'Precon gauntlet', access: 'full', seats: ['Oskar', 'Wen', 'AI', 'AI'], bracket: 2, pace: 'relaxed', started: true, turn: 9, spectators: 5, note: 'Watching is open.' },
  { id: 't5', host: 'Haley', name: 'Learn Commander', access: 'open', seats: ['Haley', null, null, null], bracket: 1, pace: 'relaxed', started: false, spectators: 1, note: 'New players welcome; coach on.' },
  { id: 't6', host: 'Ravi', name: 'Lands matter', access: 'open', seats: ['Ravi', 'AI', 'AI', null], bracket: 3, pace: 'normal', started: false, spectators: 0, note: '' },
  { id: 't7', host: 'Jo', name: 'Pauper EDH', access: 'friends', seats: ['Jo', 'Sam', null, null], bracket: 2, pace: 'normal', started: false, spectators: 0, note: '' },
  { id: 't8', host: 'Calla', name: 'Late-night chaos', access: 'full', seats: ['Calla', 'Brin', 'Teo', 'Mags'], bracket: 3, pace: 'quick', started: true, turn: 14, spectators: 3, note: '' },
  { id: 't9', host: 'Iggy', name: 'Dragons only', access: 'invite', seats: ['Iggy', null, null, null], bracket: 3, pace: 'normal', started: false, spectators: 0, note: 'Ask for the code.' },
  { id: 't10', host: 'Faye', name: 'Two-hour cap', access: 'open', seats: ['Faye', 'Quinn', null, null], bracket: 3, pace: 'quick', started: false, spectators: 0, note: '' },
  { id: 't11', host: 'Dov', name: 'Budget under $50', access: 'open', seats: ['Dov', null, null, null], bracket: 2, pace: 'relaxed', started: false, spectators: 0, note: '' },
  { id: 't12', host: 'Uma', name: 'Rematch: Uma vs world', access: 'full', seats: ['Uma', 'AI', 'AI', 'AI'], bracket: 3, pace: 'normal', started: true, turn: 5, spectators: 1, note: '' },
];
export interface PastGame { id: string; when: number; result: string; turns: number; deck: string; seats: string[] }
const d = (days: number) => Date.now() - days * 86400000;
export const HISTORY: PastGame[] = [
  { id: 'g1', when: d(0.2), result: 'Won · last one standing', turns: 14, deck: 'Faerie Flock (Alela)', seats: ['Rob', 'Friend', 'AI 2', 'AI 3'] },
  { id: 'g2', when: d(1.4), result: 'Lost · 21 commander damage', turns: 11, deck: 'Faerie Flock (Alela)', seats: ['Rob', 'Nina', 'Marcus', 'AI'] },
  { id: 'g3', when: d(3.1), result: 'Ended for everyone by Marcus', turns: 7, deck: 'Phyrexian Proliferate', seats: ['Rob', 'Marcus', 'AI', 'AI'] },
  { id: 'g4', when: d(6), result: 'Won · combat', turns: 16, deck: 'Phyrexian Proliferate', seats: ['Rob', 'AI', 'AI', 'AI'] },
];
export const DECKS = ['Faerie Flock (Alela)', 'Phyrexian Proliferate (Atraxa)', 'Dwarven Guard (Bofur)', 'Samurai Steel (Yoshimaru)'];
