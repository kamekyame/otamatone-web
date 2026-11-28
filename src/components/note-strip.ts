import { css, html, LitElement } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { noteName } from '../pitch';
import { baseStyles } from './shared';

const stripIndexes = Array.from({ length: 12 }, (_, i) => i);

class NoteStrip extends LitElement {
  static override properties = {
    start: { type: Number },
    midi: { type: Number },
    target: { type: Number },
  };
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        width: min(100%, 42rem);
      }
      .tuner-notes {
        position: relative;
      }
      .tuner-note-cells {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        border: 1px solid var(--border);
        border-radius: var(--corner);
        overflow: hidden;
      }
      .tuner-note-cells span {
        display: grid;
        place-items: center;
        min-height: var(--note-cell-height, 2.65rem);
        padding-top: var(--note-cell-padding, 0.3rem);
        background: #f6fbfd;
        color: var(--muted);
        font-size: clamp(0.6rem, 2.4vw, 0.9rem);
        font-weight: 650;
        white-space: nowrap;
      }
      .tuner-note-cells span + span {
        border-left: 1px solid var(--border);
      }
      .tuner-note-cells .current {
        background: var(--accent);
        color: white;
      }
      .tuner-note-cells .target {
        box-shadow: inset 0 0 0 2px var(--accent);
      }
      .tuner-note-cells .target.current {
        background: var(--hit);
      }
      .tuner-note-marker {
        position: absolute;
        top: -0.3rem;
        left: clamp(0.3rem, var(--pitch-position), 100% - 0.3rem);
        transform: translateX(-50%);
        width: 0.6rem;
        height: 0.85rem;
        background: var(--hit);
        border: 1px solid white;
      }
    `,
  ];
  declare start: number;
  declare midi: number | undefined;
  declare target: number | undefined;

  protected override render() {
    const { start, midi, target } = this;
    const current = midi === undefined ? undefined : Math.round(midi);
    const goal = target === undefined ? undefined : Math.round(target);
    return html`
      <div
        class="tuner-notes"
        aria-hidden="true"
        style=${styleMap({
          '--pitch-position':
            midi === undefined
              ? undefined
              : `${((midi - start + 0.5) / stripIndexes.length) * 100}%`,
        })}
      >
        <div class="tuner-note-cells">
          ${stripIndexes.map((index) => {
            const note = start + index;
            return html`<span
              class=${classMap({ current: note === current, target: note === goal })}
              >${noteName(note)}</span
            >`;
          })}
        </div>
        <span class="tuner-note-marker" ?hidden=${midi === undefined}></span>
      </div>
    `;
  }
}

customElements.define('otama-note-strip', NoteStrip);
