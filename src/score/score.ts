import { strFromU8, unzipSync } from 'fflate';

export type Span = {
  start: number;
  end: number;
  midi: number;
  writtenMidi: number;
  measure: number;
  offset: number;
};
type Tempo = { at: number; bpm: number };
export type Part = {
  label: string;
  notes: Span[];
  partId: string | null;
  staff: number;
  voice: number;
};
export type Score = {
  title: string;
  subtitle: string;
  composer: string;
  lyricist: string;
  rights: string;
  parts: Part[];
  measures: { at: number; number: string }[];
  end: number;
  hasRepeats: boolean;
  secondsPerBeatAt: (beat: number) => number;
  secondsAt: (beat: number) => number;
  beatAt: (seconds: number) => number;
};

const limit = 8 * 1024 * 1024;
const child = (el: Element, name: string) =>
  Array.from(el.children).find((e) => e.localName === name);
const text = (el: Element, name: string) =>
  child(el, name)?.textContent?.trim();
const number = (el: Element, key: string, fallback = 0) => {
  const val = Number(text(el, key) ?? NaN);
  return Number.isFinite(val) ? val : fallback;
};

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('XMLの形式が正しくありません。');
  return doc;
}

export async function readScore(file: File): Promise<string> {
  if (file.size > limit)
    throw new Error('楽譜ファイルは8 MB以下にしてください。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    return new TextDecoder().decode(bytes);
  const extract = (path: string) => {
    const bytesForPath = unzipSync(bytes, {
      filter: (entry) => {
        if (entry.name !== path) return false;
        if (entry.originalSize > limit)
          throw new Error('展開後の楽譜は8 MB以下にしてください。');
        return true;
      },
    })[path];
    if (!bytesForPath?.length || bytesForPath.length > limit)
      throw new Error(`${path} を展開できませんでした。`);
    return strFromU8(bytesForPath);
  };
  const rootfile = parseXml(extract('META-INF/container.xml')).querySelector(
    'rootfile',
  );
  const path = rootfile?.getAttribute('full-path');
  if (!path) throw new Error('圧縮MusicXMLに楽譜の指定がありません。');
  return extract(path);
}

const steps: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const metronomeUnits: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
};

export function lastAt<T extends object>(
  items: readonly T[],
  value: number,
  at: (item: T) => number,
) {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const item = items[mid];
    if (item === undefined) throw new RangeError('Invalid search index');
    if (at(item) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function adjacentNoteIndex(
  notes: readonly { start: number }[],
  beat: number,
  direction: -1 | 1,
) {
  if (!notes.length) return undefined;
  const index =
    direction < 0
      ? lastAt(notes, beat - 1e-7, (note) => note.start)
      : lastAt(notes, beat + 1e-7, (note) => note.start) + 1;
  return Math.max(0, Math.min(notes.length - 1, index));
}

export function tempoMap(changes: Tempo[]) {
  const initial = { at: 0, bpm: 120, seconds: 0 };
  const points = [initial];
  let prev = initial;
  for (const { at, bpm } of [...changes].sort((a, b) => a.at - b.at)) {
    if (at === prev.at) prev.bpm = bpm;
    else {
      prev = {
        at,
        bpm,
        seconds: prev.seconds + ((at - prev.at) * 60) / prev.bpm,
      };
      points.push(prev);
    }
  }
  const pointAtBeat = (beat: number) =>
    points[lastAt(points, beat, (x) => x.at)] ?? initial;
  return {
    secondsPerBeatAt(beat: number) {
      return 60 / pointAtBeat(beat).bpm;
    },
    secondsAt(beat: number) {
      const p = pointAtBeat(beat);
      return p.seconds + ((beat - p.at) * 60) / p.bpm;
    },
    beatAt(seconds: number) {
      const p = points[lastAt(points, seconds, (x) => x.seconds)] ?? initial;
      return p.at + ((seconds - p.seconds) * p.bpm) / 60;
    },
  };
}

export function parseScore(xml: string): Score {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (root.localName !== 'score-partwise')
    throw new Error('MuseScoreのパート形式のMusicXMLを書き出してください。');
  const workTitle = doc.querySelector('work-title')?.textContent?.trim() ?? '';
  const movementTitle =
    doc.querySelector('movement-title')?.textContent?.trim() ?? '';
  const title = workTitle || movementTitle || '無題の楽譜';
  const subtitle =
    workTitle && movementTitle && movementTitle !== workTitle
      ? movementTitle
      : '';
  const creator = (type: string) =>
    Array.from(doc.querySelectorAll('identification creator'))
      .find((element) => element.getAttribute('type') === type)
      ?.textContent?.trim() ?? '';
  const composer = creator('composer');
  const lyricist = creator('lyricist');
  const rights =
    doc.querySelector('identification rights')?.textContent?.trim() ?? '';
  const sizes: number[] = [];
  const labels: string[] = [];
  const tempoEvents: {
    measure: number;
    offset: number;
    bpm: number;
    priority: number;
  }[] = [];
  const parts: (Omit<Part, 'notes'> & {
    notes: (Span & { tieIn: boolean; tieOut: boolean })[];
  })[] = [];
  const names = new Map(
    Array.from(doc.querySelectorAll('score-part'), (el) => [
      el.getAttribute('id'),
      text(el, 'part-name'),
    ]),
  );
  for (const part of Array.from(root.children).filter(
    (el) => el.localName === 'part',
  )) {
    const voices = new Map<string, (typeof parts)[number]['notes']>();
    let divisions = 1;
    const transpositions = new Map<string, number>();
    Array.from(part.children)
      .filter((el) => el.localName === 'measure')
      .forEach((measure, index) => {
        labels[index] ??= measure.getAttribute('number') || String(index + 1);
        let offset = 0,
          length = 0,
          previous = 0;
        for (const el of measure.children) {
          const duration = Math.max(0, number(el, 'duration')) / divisions;
          if (el.localName === 'attributes') {
            divisions = number(el, 'divisions', divisions);
            if (divisions <= 0)
              throw new Error('楽譜内の音符の長さが正しくありません。');
            for (const transpose of Array.from(el.children).filter(
              (x) => x.localName === 'transpose',
            )) {
              transpositions.set(
                transpose.getAttribute('number') || '',
                number(transpose, 'chromatic') +
                  12 * number(transpose, 'octave-change'),
              );
            }
          } else if (el.localName === 'backup')
            offset = Math.max(0, offset - duration);
          else if (el.localName === 'forward') offset += duration;
          else if (el.localName === 'direction' || el.localName === 'sound') {
            const sound = el.localName === 'sound' ? el : child(el, 'sound');
            const marking = el.querySelector('metronome');
            const unit = marking
              ? metronomeUnits[text(marking, 'beat-unit') ?? '']
              : 0;
            const dots = marking?.querySelectorAll('beat-unit-dot').length ?? 0;
            const explicit = Number(sound?.getAttribute('tempo'));
            const bpm =
              explicit ||
              (marking && unit
                ? number(marking, 'per-minute') * unit * (2 - 0.5 ** dots)
                : 0);
            if (Number.isFinite(bpm) && bpm > 0)
              tempoEvents.push({
                measure: index,
                offset: offset + number(el, 'offset') / divisions,
                bpm,
                priority: explicit ? 1 : 0,
              });
          } else if (el.localName === 'note' && !child(el, 'grace')) {
            const chord = Boolean(child(el, 'chord'));
            const start = chord ? previous : offset;
            if (!chord) {
              previous = offset;
              offset += duration;
            }
            length = Math.max(length, start + duration);
            const pitch = child(el, 'pitch');
            if (pitch && duration > 0) {
              const step = steps[text(pitch, 'step') ?? ''];
              const octave = number(pitch, 'octave', NaN);
              if (typeof step !== 'number')
                throw new Error('楽譜内に音高の不正な音符があります。');
              const staff = text(el, 'staff') || '1';
              const writtenMidi =
                12 * (octave + 1) + step + number(pitch, 'alter');
              const midi =
                writtenMidi +
                (transpositions.get(staff) ?? transpositions.get('') ?? 0);
              if (!Number.isFinite(midi))
                throw new Error('楽譜内に音高の不正な音符があります。');
              const key = `${staff}/${text(el, 'voice') || '1'}`;
              const notes = voices.get(key) ?? [];
              notes.push({
                start,
                end: start + duration,
                midi,
                writtenMidi,
                measure: index,
                offset: start,
                tieIn: Boolean(
                  el.querySelector('tie[type="stop"], tied[type="stop"]'),
                ),
                tieOut: Boolean(
                  el.querySelector('tie[type="start"], tied[type="start"]'),
                ),
              });
              voices.set(key, notes);
            }
          }
          length = Math.max(length, offset);
        }
        sizes[index] = Math.max(sizes[index] || 0, length);
      });
    for (const [key, notes] of voices) {
      const name =
        names.get(part.getAttribute('id')) ||
        part.getAttribute('id') ||
        'パート';
      const [staff, voice] = key.split('/');
      parts.push({
        label: voices.size > 1 ? `${name}（段 ${staff}・声部 ${voice}）` : name,
        partId: part.getAttribute('id'),
        staff: Number(staff),
        voice: Number(voice),
        notes,
      });
    }
  }
  if (!parts.length) throw new Error('練習できる音程付きの音符がありません。');
  let end = 0;
  const measures = sizes.map((size, i) => {
    const label = labels[i];
    if (label === undefined)
      throw new Error('楽譜内に小節番号のない小節があります。');
    const measure = { at: end, number: label };
    end += size;
    return measure;
  });
  const measureStart = (index: number) => {
    const measure = measures[index];
    if (!measure) throw new Error('楽譜内に参照できない小節があります。');
    return measure.at;
  };
  const changes = tempoEvents
    .sort((a, b) => a.priority - b.priority)
    .map((e) => ({
      at: Math.max(0, measureStart(e.measure) + e.offset),
      bpm: e.bpm,
    }));
  return {
    title,
    subtitle,
    composer,
    lyricist,
    rights,
    measures,
    end,
    ...tempoMap(changes),
    hasRepeats: Boolean(
      doc.querySelector(
        'repeat, ending, sound[dacapo], sound[dalsegno], sound[tocoda], sound[fine]',
      ),
    ),
    parts: parts.map(({ notes, ...part }) => {
      const sorted = notes
        .map((n) => {
          const start = measureStart(n.measure);
          return { ...n, start: start + n.start, end: start + n.end };
        })
        .sort((a, b) => a.start - b.start || b.midi - a.midi);
      const melody: typeof sorted = [];
      for (const note of sorted) {
        const prev = melody[melody.length - 1];
        if (prev && Math.abs(note.start - prev.start) < 1e-7) continue;
        if (
          prev &&
          prev.tieOut &&
          note.tieIn &&
          prev.midi === note.midi &&
          Math.abs(prev.end - note.start) < 1e-7
        ) {
          prev.end = note.end;
          prev.tieOut = note.tieOut;
        } else {
          if (prev && prev.end > note.start) prev.end = note.start;
          melody.push(note);
        }
      }
      return {
        ...part,
        notes: melody.map(
          ({ start, end, midi, writtenMidi, measure, offset }) => ({
            start,
            end,
            midi,
            writtenMidi,
            measure,
            offset,
          }),
        ),
      };
    }),
  };
}
