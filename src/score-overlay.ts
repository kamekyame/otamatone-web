import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { VexFlowGraphicalNote } from 'opensheetmusicdisplay/build/dist/src/MusicalScore/Graphical/VexFlow/VexFlowGraphicalNote';
import type { Part, Span } from './score';

const svgNS = 'http://www.w3.org/2000/svg';
const naturalPosition = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7];

function staffPosition(midi: number) {
  const octave = Math.floor(midi / 12);
  const within = midi - octave * 12;
  const floor = Math.floor(within);
  const from = naturalPosition[floor];
  const to = naturalPosition[floor + 1];
  if (from === undefined || to === undefined)
    throw new RangeError('Invalid MIDI pitch');
  return octave * 7 + from + (within - floor) * (to - from);
}

export function staffOffset(writtenMidi: number, delta: number) {
  return staffPosition(writtenMidi + delta) - staffPosition(writtenMidi);
}

export function makeScoreOverlay(miniOtamaUrl: string) {
  const markers = new Map<
    Span,
    { group: SVGGElement; glyph: SVGGElement; step: number } | null
  >();
  return {
    clear() {
      for (const marker of markers.values()) marker?.group.remove();
      markers.clear();
    },
    plot(
      osmd: OpenSheetMusicDisplay,
      part: Part,
      note: Span,
      midi: number,
      hit: boolean,
    ) {
      if (!markers.has(note)) {
        const instrument = osmd.Sheet.Instruments.find(
          (item) => item.IdString === part.partId,
        );
        const staff = instrument?.Staves[part.staff - 1];
        const measure =
          staff &&
          osmd.GraphicSheet.MeasureList[note.measure]?.find(
            (item) => item?.ParentStaff === staff,
          );
        const entry = measure?.staffEntries.find(
          (item) =>
            Math.abs(item.relInMeasureTimestamp.RealValue * 4 - note.offset) <
            1e-6,
        );
        const candidates = entry?.graphicalVoiceEntries
          .flatMap((item) => item.notes)
          .filter(
            (item) =>
              item.sourceNote.Pitch &&
              Math.abs(
                item.sourceNote.Pitch.getHalfTone() + 12 - note.writtenMidi,
              ) < 1e-6,
          );
        const selected =
          candidates?.find(
            (item) =>
              item.sourceNote.ParentVoiceEntry.ParentVoice.VoiceId ===
              part.voice,
          ) ?? candidates?.[0];
        const graphical =
          selected && 'getNoteheadSVGs' in selected
            ? (selected as VexFlowGraphicalNote)
            : undefined;
        const head = graphical?.getNoteheadSVGs()[graphical.vfnoteIndex];
        markers.set(note, null);
        if (head instanceof SVGGraphicsElement && head.ownerSVGElement) {
          const svg = head.ownerSVGElement;
          const headMatrix = head.getScreenCTM();
          const svgMatrix = svg.getScreenCTM();
          if (headMatrix && svgMatrix) {
            const box = head.getBBox();
            const transform = svgMatrix.inverse().multiply(headMatrix);
            const point = new DOMPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ).matrixTransform(transform);
            const group = document.createElementNS(svgNS, 'g');
            group.classList.add('played-note');
            group.setAttribute('aria-hidden', 'true');
            group.setAttribute(
              'transform',
              `translate(${point.x + 12} ${point.y})`,
            );
            const glyph = document.createElementNS(svgNS, 'g');
            const icon = document.createElementNS(svgNS, 'use');
            icon.setAttribute('href', `${miniOtamaUrl}#mini-otama`);
            // Align the center of the face with the pitch anchor at (0, 0).
            icon.setAttribute('x', '-7');
            icon.setAttribute('y', '-18');
            icon.setAttribute('width', '18');
            icon.setAttribute('height', '25');
            glyph.append(icon);
            group.append(glyph);
            svg.append(group);
            markers.set(note, {
              group,
              glyph,
              step: 5 * Math.hypot(transform.c, transform.d),
            });
          }
        }
      }
      const marker = markers.get(note);
      if (!marker) return;
      marker.group.classList.toggle('match', hit);
      const offset =
        -staffOffset(note.writtenMidi, midi - note.midi) * marker.step;
      marker.glyph.style.transform = `translateY(${offset.toFixed(3)}px)`;
    },
  };
}
