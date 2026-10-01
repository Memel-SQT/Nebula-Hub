/**
 * Small UI sounds, synthesized on the fly with the Web Audio API: no audio files to ship and
 * nothing to load. Each sound is a few short oscillator notes with a soft attack and an
 * exponential release, kept quiet on purpose (master gain tops out well below full scale).
 *
 * Ported unchanged from Nebula Finterest v0.1.36 `src/renderer/sound.ts` (recipes, master gain,
 * low-pass and envelopes are identical). Addition: `setSoundsSuppressed`, so an app living in
 * the tray stays silent while its window is hidden (system notifications take over there).
 */
export type SoundName = 'tap' | 'nav' | 'toggle' | 'success' | 'delete' | 'error' | 'unlock' | 'open';

export const SOUND_NAMES: readonly SoundName[] = ['tap', 'nav', 'toggle', 'success', 'delete', 'error', 'unlock', 'open'];

interface Note {
  /** Start frequency, Hz. */
  from: number;
  /** End frequency (glide), Hz; defaults to `from`. */
  to?: number;
  /** Delay from the sound start, seconds. */
  at?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const RECIPES: Record<SoundName, Note[]> = {
  tap: [{ from: 1250, to: 820, duration: 0.045, type: 'sine', gain: 0.5 }],
  nav: [{ from: 520, to: 700, duration: 0.07, type: 'triangle', gain: 0.45 }],
  toggle: [
    { from: 880, duration: 0.04, type: 'sine', gain: 0.4 },
    { from: 1320, at: 0.05, duration: 0.05, type: 'sine', gain: 0.35 },
  ],
  success: [
    { from: 784, duration: 0.12, type: 'sine', gain: 0.55 },
    { from: 1047, at: 0.08, duration: 0.14, type: 'sine', gain: 0.5 },
    { from: 1568, at: 0.16, duration: 0.22, type: 'sine', gain: 0.3 },
  ],
  delete: [
    { from: 560, to: 240, duration: 0.16, type: 'triangle', gain: 0.5 },
  ],
  error: [
    { from: 220, duration: 0.11, type: 'square', gain: 0.18 },
    { from: 175, at: 0.12, duration: 0.16, type: 'square', gain: 0.18 },
  ],
  unlock: [
    { from: 523, duration: 0.1, type: 'sine', gain: 0.45 },
    { from: 659, at: 0.07, duration: 0.1, type: 'sine', gain: 0.45 },
    { from: 784, at: 0.14, duration: 0.12, type: 'sine', gain: 0.45 },
    { from: 1047, at: 0.21, duration: 0.3, type: 'sine', gain: 0.35 },
  ],
  open: [{ from: 330, to: 660, duration: 0.18, type: 'sine', gain: 0.35 }],
};

const MASTER_MAX_GAIN = 0.22;

let context: AudioContext | null = null;
let enabled = true;
let volume = 0.45;
let suppressed = false;

export function configureSounds(settings: { enabled: boolean; volume: number }): void {
  enabled = settings.enabled;
  volume = Math.min(1, Math.max(0, settings.volume / 100));
}

/** While true (window hidden in the tray), no sound plays, not even forced ones. */
export function setSoundsSuppressed(value: boolean): void {
  suppressed = value;
}

function getContext(): AudioContext | null {
  if (context) {
    return context;
  }
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  return context;
}

export function playSound(name: SoundName, options: { force?: boolean } = {}): void {
  if (suppressed || document.visibilityState === 'hidden') {
    return;
  }
  if ((!enabled && !options.force) || volume === 0) {
    return;
  }
  const audio = getContext();
  if (!audio) {
    return;
  }
  if (audio.state === 'suspended') {
    void audio.resume();
  }

  const start = audio.currentTime + 0.005;
  const master = audio.createGain();
  master.gain.value = MASTER_MAX_GAIN * volume;
  // A gentle low-pass takes the edge off the square/triangle waves.
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4200;
  filter.connect(master);
  master.connect(audio.destination);

  let end = start;
  for (const note of RECIPES[name]) {
    const noteStart = start + (note.at ?? 0);
    const noteEnd = noteStart + note.duration;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = note.type ?? 'sine';
    oscillator.frequency.setValueAtTime(note.from, noteStart);
    if (note.to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.to, noteEnd);
    }
    const peak = note.gain ?? 0.5;
    envelope.gain.setValueAtTime(0.0001, noteStart);
    envelope.gain.exponentialRampToValueAtTime(peak, noteStart + Math.min(0.012, note.duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(envelope);
    envelope.connect(filter);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
    end = Math.max(end, noteEnd);
  }

  window.setTimeout(() => {
    filter.disconnect();
    master.disconnect();
  }, (end - start + 0.1) * 1000);
}
