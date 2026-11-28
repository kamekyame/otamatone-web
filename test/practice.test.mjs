import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centsFrom,
  initialPitchRangeStart,
  isMatch,
  makePitchReader,
  nearOctave,
  noteName,
  pitchForTarget,
  pitchRangeSize,
  pitchRangeStart,
  pitchWindowSize,
  updatePitchReadout,
} from '../src/pitch.ts';
import { adjacentNoteIndex, tempoMap } from '../src/score/score.ts';
import { makeStepGate } from '../src/practice/step-practice.ts';
import { staffOffset } from '../src/score/score-overlay.ts';

test('played pitch follows fractional diatonic positions across staff steps and octaves', () => {
  assert.equal(staffOffset(60, 0), 0);
  assert.equal(staffOffset(60, 0.25), 0.125);
  assert.equal(staffOffset(60, -0.25), -0.25);
  assert.equal(staffOffset(72, -2), -1.5);
  assert.equal(staffOffset(60, 12), 7);
});

test('step practice waits for a sustained match and discards interrupted matches', () => {
  const gate = makeStepGate();
  for (const time of [0, 45, 90, 135, 179])
    assert.equal(gate.sample(time, true), false);
  assert.equal(gate.sample(180, false), false);
  assert.equal(gate.sample(200, true), false);
  assert.equal(gate.sample(400, true), false);
  for (const time of [460, 520]) assert.equal(gate.sample(time, true), false);
  assert.equal(gate.sample(580, true), true);
});

test('a repeated note must be released and played again', () => {
  const gate = makeStepGate();
  gate.reset(true);
  for (const time of [0, 60, 120, 180, 240])
    assert.equal(gate.sample(time, true), false);
  assert.equal(gate.sample(260, false), false);
  assert.equal(gate.sample(300, true), false);
  for (const time of [320, 360, 400])
    assert.equal(gate.sample(time, false), false);
  for (const time of [420, 480, 540])
    assert.equal(gate.sample(time, true), false);
  assert.equal(gate.sample(600, true), true);
});

test('step guide progress follows a continuous match and resets on interruption', () => {
  const gate = makeStepGate();
  gate.sample(0, false);
  assert.equal(gate.holding, false);
  assert.equal(gate.progress, 0);
  gate.sample(30, true);
  assert.equal(gate.holding, true);
  assert.equal(gate.progress, 0);
  gate.sample(120, true);
  assert.equal(gate.progress, 0.5);
  gate.sample(150, false);
  assert.equal(gate.holding, false);
  assert.equal(gate.progress, 0);
  gate.sample(180, true);
  gate.sample(270, true);
  assert.equal(gate.progress, 0.5);
  assert.equal(gate.sample(360, true), true);
  assert.equal(gate.progress, 1);
  gate.reset(true);
  gate.sample(390, true);
  assert.equal(gate.holding, false);
  assert.equal(gate.progress, 0);
  gate.sample(420, false);
  gate.sample(500, false);
  gate.sample(530, true);
  assert.equal(gate.holding, true);
  assert.equal(gate.progress, 0);
  gate.sample(700, true);
  assert.equal(gate.progress, 0);
});

test('tempo changes apply at the indicated beat and can be converted back to beats', () => {
  const time = tempoMap([
    { at: 4, bpm: 60 },
    { at: 0, bpm: 120 },
    { at: 8, bpm: 180 },
  ]);
  assert.equal(time.secondsAt(4), 2);
  assert.equal(time.secondsAt(7), 5);
  assert.equal(time.beatAt(6), 8);
  assert.equal(time.beatAt(7), 11);
});

test('moving practice position selects adjacent note starts and clamps at the ends', () => {
  const notes = [{ start: 0 }, { start: 1 }, { start: 3 }];
  assert.equal(adjacentNoteIndex(notes, 0, -1), 0);
  assert.equal(adjacentNoteIndex(notes, 0, 1), 1);
  assert.equal(adjacentNoteIndex(notes, 2, -1), 1);
  assert.equal(adjacentNoteIndex(notes, 2, 1), 2);
  assert.equal(adjacentNoteIndex(notes, 3, 1), 2);
  assert.equal(adjacentNoteIndex([], 0, 1), undefined);
});

test('the tuner identifies a sustained note and rejects silence', () => {
  const sampleRate = 48_000;
  const input = new Float32Array(4096);
  const read = makePitchReader(input.length);
  assert.equal(read(input, sampleRate), null);
  input.forEach((_, i) => {
    input[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  });
  const pitch = read(input, sampleRate);
  assert.ok(pitch);
  assert.equal(noteName(pitch.midi), 'A4');
  assert.ok(Math.abs(pitch.hz - 440) < 1);
});

test('the pitch readout bridges brief dropouts, accepts new notes immediately, and clears on silence', () => {
  const a = { hz: 440, midi: 69 };
  const c = { hz: 523.25, midi: 72 };
  assert.equal(updatePitchReadout(null, null, 0), null);
  let readout = updatePitchReadout(null, a, 100);
  readout = updatePitchReadout(readout, null, 130);
  assert.equal(readout?.pitch, a);
  readout = updatePitchReadout(readout, c, 160);
  assert.equal(readout?.pitch, a);
  readout = updatePitchReadout(readout, c, 190);
  assert.equal(readout?.pitch, c);
  readout = updatePitchReadout(readout, null, 409);
  assert.equal(readout?.pitch, c);
  assert.equal(updatePitchReadout(readout, null, 440), null);
});

test('practice accepts octaves, with the same ±35 cent boundary in either direction', () => {
  for (const midi of [69.35, 68.65, 81, 45, 81.35, 56.65])
    assert.ok(isMatch(centsFrom(pitchForTarget(midi, 69, true), 69)));
  for (const midi of [69.36, 68.64, 81.36, 56.64, 82])
    assert.ok(!isMatch(centsFrom(pitchForTarget(midi, 69, true), 69)));
  assert.equal(Math.round(centsFrom(nearOctave(80.6, 69), 69)), -40);
});

test('octave allowance can be disabled to preserve the detected octave', () => {
  assert.equal(pitchForTarget(81, 69, true), 69);
  assert.equal(pitchForTarget(81, 69, false), 81);
  assert.equal(centsFrom(pitchForTarget(81, 69, false), 69), 1200);
});

test('the tuner range stays anchored to A and shifts only by octaves', () => {
  assert.equal(pitchRangeSize, 24);
  assert.equal(noteName(initialPitchRangeStart), 'A3');
  assert.equal(noteName(initialPitchRangeStart + pitchRangeSize - 1), 'G♯5');
  assert.equal(pitchRangeStart(57, 72, 60), 57);
  assert.equal(pitchRangeStart(57, 80, 60), 57);
  assert.equal(pitchRangeStart(57, 81, 69), 69);
  assert.equal(pitchRangeStart(57, 56, 68), 45);
  assert.equal(pitchRangeStart(57, 56, 69), 45);
  assert.equal(pitchRangeStart(69, undefined, 60), 57);
  assert.equal(pitchRangeStart(57, 84, 60), 69);
  assert.equal(pitchRangeStart(57), 57);
});

test('pitch readout filters jitter and rejects a single octave jump', () => {
  let readout = updatePitchReadout(null, { hz: 440, midi: 69 }, 0);
  readout = updatePitchReadout(readout, { hz: 880, midi: 81 }, 30);
  assert.equal(noteName(readout?.pitch.midi ?? 0), 'A4');
  readout = updatePitchReadout(readout, { hz: 880, midi: 81 }, 60);
  assert.equal(noteName(readout?.pitch.midi ?? 0), 'A5');

  readout = updatePitchReadout(null, { hz: 440, midi: 69.45 }, 100);
  readout = updatePitchReadout(readout, { hz: 440, midi: 69.55 }, 130);
  readout = updatePitchReadout(readout, { hz: 440, midi: 69.65 }, 160);
  assert.ok(Math.abs((readout?.pitch.midi ?? 0) - 69.55) < 0.1);
});

test('pitch detection finds C1 and E1 at standard and high sample rates, but ignores sub-30 Hz input', () => {
  for (const sampleRate of [48_000, 96_000]) {
    const input = new Float32Array(pitchWindowSize(sampleRate));
    const read = makePitchReader(input.length);
    for (const [hz, name] of [
      [32.703, 'C1'],
      [41.203, 'E1'],
      [27.5, null],
    ]) {
      for (let i = 0; i < input.length; i++) {
        const phase = (2 * Math.PI * hz * i) / sampleRate;
        input[i] =
          0.12 *
          (Math.sin(phase) +
            0.65 * Math.sin(2 * phase) +
            0.35 * Math.sin(3 * phase));
      }
      const pitch = read(input, sampleRate);
      if (name === null) {
        assert.equal(pitch, null);
      } else {
        assert.ok(pitch, `${hz} Hz at ${sampleRate} Hz sample rate`);
        assert.equal(noteName(pitch.midi), name);
        assert.ok(Math.abs(pitch.hz - hz) < 0.1);
      }
    }
  }
});

test('pitch detection finds tones up to 4500 Hz and rejects tones above the limit', () => {
  for (const sampleRate of [44_100, 48_000, 96_000]) {
    const input = new Float32Array(pitchWindowSize(sampleRate));
    const read = makePitchReader(input.length);
    const fill = (hz) =>
      input.forEach((_, i) => {
        const phase = (2 * Math.PI * hz * i) / sampleRate;
        input[i] = 0.2 * (Math.sin(phase) + 0.3 * Math.sin(2 * phase));
      });

    for (const [hz, name] of [
      [4000, 'B7'],
      [4500, 'C♯8'],
    ]) {
      fill(hz);
      const pitch = read(input, sampleRate);
      assert.ok(pitch, `${hz} Hz at ${sampleRate} Hz sample rate`);
      assert.equal(noteName(pitch.midi), name);
      assert.ok(Math.abs(pitch.hz - hz) < 5);
    }

    fill(4650);
    assert.equal(read(input, sampleRate), null);
  }
});
