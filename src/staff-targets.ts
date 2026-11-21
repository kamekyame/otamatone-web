import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { VexFlowMeasure } from 'opensheetmusicdisplay/build/dist/src/MusicalScore/Graphical/VexFlow/VexFlowMeasure';
import type { Part } from './score';

export function drawStaffTargets(
  osmd: OpenSheetMusicDisplay,
  parts: Part[],
  selected: number,
) {
  for (const backend of osmd.Drawer.Backends) {
    if (
      !('getSvgElement' in backend) ||
      typeof backend.getSvgElement !== 'function'
    )
      continue;
    const svg = backend.getSvgElement();
    if (!(svg instanceof SVGSVGElement)) continue;
    svg.querySelectorAll('.staff-targets').forEach((layer) => layer.remove());
    if (parts.length < 2) continue;
    const layer = document.createElementNS(svg.namespaceURI, 'g');
    layer.setAttribute('class', 'staff-targets');
    layer.setAttribute('aria-hidden', 'true');
    const zoom = osmd.Zoom;
    layer.setAttribute('transform', `scale(${zoom})`);
    for (const measureRow of osmd.GraphicSheet.MeasureList) {
      for (const measure of measureRow) {
        if (
          !measure ||
          measure.ParentMusicSystem?.Parent !== backend.graphicalMusicPage ||
          !('getVFStave' in measure)
        )
          continue;
        const staff = measure.ParentStaff;
        const instrument = staff.ParentInstrument;
        const number = instrument.Staves.indexOf(staff) + 1;
        const matches = (part: Part | undefined) =>
          part?.partId === instrument.IdString && part.staff === number;
        const index = matches(parts[selected])
          ? selected
          : parts.findIndex(matches);
        if (index < 0) continue;
        const stave = (measure as VexFlowMeasure).getVFStave();
        const top = stave.getYForLine(0);
        const bottom = stave.getYForLine(stave.getNumLines() - 1);
        const rect = document.createElementNS(svg.namespaceURI, 'rect');
        rect.setAttribute('x', String(stave.getX()));
        rect.setAttribute('y', String(top - 5));
        rect.setAttribute('width', String(stave.getWidth()));
        rect.setAttribute('height', String(bottom - top + 10));
        rect.setAttribute(
          'class',
          index === selected ? 'staff-target selected' : 'staff-target',
        );
        rect.setAttribute('data-part-index', String(index));
        layer.append(rect);
      }
    }
    svg.append(layer);
  }
}
