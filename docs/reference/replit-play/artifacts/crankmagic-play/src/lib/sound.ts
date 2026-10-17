// Tiny synthesized sound set (STUB): no audio files, nothing plays before the first
// press on the page. Volumes come from Settings › Play.
type Cue = 'draw' | 'land' | 'arrive' | 'leave' | 'life' | 'attack' | 'turn' | 'end' | 'die' | 'shield' | 'sword';

let ctx: AudioContext | null = null;
let unlocked = false;
let volume = 0.6;
let muted = false;

export function initSoundUnlock() {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setSound(v: number, m: boolean) {
  volume = v / 100;
  muted = m;
}

const CUES: Record<Cue, [number, number, OscillatorType, number]> = {
  draw: [660, 0.08, 'triangle', 880],
  land: [180, 0.12, 'sine', 120],
  arrive: [440, 0.14, 'triangle', 660],
  leave: [330, 0.16, 'sine', 160],
  life: [520, 0.18, 'sine', 780],
  attack: [140, 0.2, 'sawtooth', 90],
  turn: [392, 0.22, 'triangle', 523],
  end: [262, 0.4, 'triangle', 392],
  die: [900, 0.05, 'square', 600],
  shield: [1046, 0.25, 'sine', 1318],
  sword: [220, 0.12, 'square', 110],
};

export function play(cue: Cue) {
  if (!unlocked || muted || volume <= 0) return;
  try {
    ctx = ctx ?? new AudioContext();
    const [f, dur, type, f2] = CUES[cue];
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08 * volume, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch {
    /* audio unavailable */
  }
}
