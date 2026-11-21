import { PitchDetector } from 'pitchy';

export const matchCents = 35;
export const toMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const centsFrom = (midi: number, target: number) =>
  (midi - target) * 100;
export const nearOctave = (midi: number, target: number) =>
  midi + 12 * Math.round((target - midi) / 12);
export const isMatch = (cents: number) => Math.abs(cents) <= matchCents + 1e-7;
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export type Pitch = { hz: number; midi: number };
type PitchReadout = { pitch: Pitch; at: number } | null;

export function updatePitchReadout(
  previous: PitchReadout,
  sample: Pitch | null,
  now: number,
): PitchReadout {
  if (sample) return { pitch: sample, at: now };
  return previous && now - previous.at < 250 ? previous : null;
}

export function noteName(midi: number) {
  const note = Math.round(midi);
  const name = names[((note % 12) + 12) % 12];
  if (name === undefined) throw new RangeError('Invalid MIDI pitch');
  return name + (Math.floor(note / 12) - 1);
}

export function pitchWindowSize(sampleRate: number) {
  // Keep at least the 48 kHz window duration, using a valid analyser FFT size.
  return (
    4096 *
    2 ** Math.min(3, Math.max(0, Math.ceil(Math.log2(sampleRate / 48_000))))
  );
}

export function makePitchReader(size: number) {
  const detector = PitchDetector.forFloat32Array(size);
  detector.minVolumeDecibels = -55;
  return (data: Float32Array, sampleRate: number) => {
    const [hz, clarity] = detector.findPitch(data, sampleRate);
    return clarity >= 0.86 && hz >= 30 && hz <= 4600
      ? { hz, midi: toMidi(hz) }
      : null;
  };
}
