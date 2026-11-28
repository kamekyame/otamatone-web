import { css, html, LitElement } from 'lit';
import { noteName, type Pitch } from '../pitch';
import { baseStyles } from './shared';
import './note-strip';

class LiveTuner extends LitElement {
  static override properties = {
    displayPitch: { attribute: false },
    tunerStart: { type: Number },
    targetMidi: { type: Number },
  };
  static override styles = [
    baseStyles,
    css`
      :host {
        display: flex;
        min-width: 0;
      }
      .live-pitch {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: stretch;
        gap: 0.45rem;
        padding: 0.45rem;
        background: var(--accent-soft);
        border: 1px solid var(--border);
        border-radius: var(--corner);
        color: var(--muted);
        font-variant-numeric: tabular-nums;
        min-width: 0;
      }
      .live-reading {
        display: grid;
        flex: none;
        grid-template-columns: 4ch 9ch;
        align-items: center;
        justify-items: stretch;
        justify-content: center;
        gap: 0.2rem 0.4rem;
        text-align: center;
      }
      .live-reading > span:first-child {
        grid-column: 1 / -1;
      }
      strong {
        font-size: 1.1rem;
        color: #183347;
      }
      #live-frequency {
        font-size: 0.85rem;
        white-space: nowrap;
      }
      otama-note-strip {
        flex: 1;
        min-height: 0;
        margin: 0;
      }
      @media (max-width: 47.99rem) {
        .live-pitch {
          height: auto;
          flex-direction: row;
          flex-wrap: wrap;
          align-items: center;
          padding: 0.35rem 0.55rem;
        }
        .live-reading {
          flex: 1 1 100%;
          gap: 0.35rem 0.65rem;
        }
        otama-note-strip {
          flex: 1 1 100%;
          --note-cell-height: 1.7rem;
          --note-cell-padding: 0.15rem;
        }
      }
    `,
  ];
  declare displayPitch: Pitch | undefined;
  declare tunerStart: number;
  declare targetMidi: number | undefined;

  protected override render() {
    const { displayPitch, tunerStart } = this;
    const midi = displayPitch?.midi;
    return html`
      <div class="live-pitch" role="group" aria-label="入力音と目標音">
        <div class="live-reading">
          <span>入力音</span>
          <strong id="live-note"
            >${midi === undefined ? '—' : noteName(midi)}</strong
          >
          <span id="live-frequency"
            >${displayPitch ? `${displayPitch.hz.toFixed(1)} Hz` : '— Hz'}</span
          >
        </div>
        <otama-note-strip
          .start=${tunerStart}
          .midi=${midi}
          .target=${this.targetMidi}
          .vertical=${true}
        ></otama-note-strip>
      </div>
    `;
  }
}

customElements.define('otama-live-tuner', LiveTuner);
