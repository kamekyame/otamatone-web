import { css, html, LitElement } from 'lit';
import { initialPitchRangeStart, noteName, pitchRangeSize } from '../pitch';
import { baseStyles } from './shared';

class NoteStrip extends LitElement {
  static override properties = {
    start: { type: Number },
    midi: { type: Number },
    target: { type: Number },
    vertical: { type: Boolean, reflect: true },
  };
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        width: 100%;
        min-width: 0;
        --note-cell-height: 1.15rem;
        --note-cell-padding: 0.1rem;
      }
      .strip {
        position: relative;
        display: grid;
        grid-template-columns: repeat(${pitchRangeSize}, minmax(0, 1fr));
        gap: 2px;
        min-height: var(--note-cell-height);
      }
      .note-cell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: var(--note-cell-padding);
        border: 1px solid var(--border);
        border-radius: 0.2rem;
        background: var(--surface);
        color: var(--muted);
        font-size: 0.72rem;
        line-height: 1;
        white-space: nowrap;
        writing-mode: horizontal-tb;
        text-orientation: mixed;
        font-variant-numeric: tabular-nums;
      }
      .note-cell.is-target {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: #183347;
        font-weight: 700;
      }
      .current-marker {
        position: absolute;
        z-index: 1;
        pointer-events: none;
        background: #6e3793;
      }
      :host([vertical]) {
        width: auto;
        height: 100%;
        flex: 1;
        min-height: 0;
      }
      :host([vertical]) .strip {
        display: flex;
        flex-direction: column-reverse;
        height: 100%;
        min-height: 0;
      }
      :host([vertical]) .note-cell {
        flex: 1;
      }
      :host([vertical]) .current-marker {
        left: 0;
        right: 0;
        top: calc(100% - var(--pitch-position));
        height: 3px;
        transform: translateY(-50%);
      }
      :host(:not([vertical])) .current-marker {
        top: 0;
        bottom: 0;
        left: var(--pitch-position);
        width: 3px;
        transform: translateX(-50%);
      }
      @media (max-width: 47.99rem) {
        :host([vertical]) {
          width: 100%;
          height: auto;
          flex: 1 1 100%;
        }
        :host([vertical]) .strip {
          display: grid;
          flex-direction: initial;
          height: auto;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(var(--note-cell-height), auto));
        }
        :host([vertical]) .current-marker {
          top: 0;
          bottom: 0;
          left: var(--pitch-position);
          right: auto;
          width: 3px;
          height: auto;
          transform: translateX(-50%);
        }
        :host([vertical]) .note-cell {
          min-height: var(--note-cell-height);
          font-size: 0.78rem;
        }
      }
    `,
  ];

  declare start: number;
  declare midi: number | undefined;
  declare target: number | undefined;
  declare vertical: boolean;

  constructor() {
    super();
    this.start = initialPitchRangeStart;
    this.midi = undefined;
    this.target = undefined;
    this.vertical = false;
  }

  protected override render() {
    const notes = Array.from(
      { length: pitchRangeSize },
      (_, index) => this.start + index,
    );
    const current = this.midi === undefined ? undefined : Math.round(this.midi);
    const target =
      this.target === undefined ? undefined : Math.round(this.target);
    const currentPosition =
      this.midi === undefined || current === undefined
        ? undefined
        : (this.midi - current + 0.5) * 100;

    return html`
      <div class="strip" aria-hidden="true">
        ${notes.map(
          (midi) => html`
            <div class="note-cell ${midi === target ? 'is-target' : ''}">
              ${noteName(midi)}
              ${
                midi === current && currentPosition !== undefined
                  ? html`<span
                      class="current-marker"
                      style=${`--pitch-position: ${currentPosition}%`}
                    ></span>`
                  : ''
              }
            </div>
          `,
        )}
      </div>
    `;
  }
}

customElements.define('otama-note-strip', NoteStrip);
