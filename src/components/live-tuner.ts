import { css, html, LitElement } from 'lit';
import { centsFrom, noteName, type Pitch } from '../pitch';
import { baseStyles, iconStyles } from './shared';
import './note-strip';

class LiveTuner extends LitElement {
  static override properties = {
    displayPitch: { attribute: false },
    listening: { type: Boolean },
    tunerStart: { type: Number },
  };
  static override styles = [
    baseStyles,
    css`
      :host {
        display: flex;
        position: sticky;
        top: 0;
        z-index: 5;
        min-width: 0;
      }
      .live-pitch {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem 0.85rem;
        padding: 0.4rem 0.65rem;
        background: var(--accent-soft);
        border: 1px solid var(--border);
        border-radius: var(--corner);
        color: var(--muted);
        font-variant-numeric: tabular-nums;
        min-width: 0;
      }
      .live-reading {
        display: flex;
        flex: 0 1 14rem;
        flex-wrap: wrap;
        gap: 0.45rem 0.65rem;
        align-items: center;
      }
      strong {
        min-width: 3ch;
        font-size: 1.25rem;
        color: #183347;
      }
      otama-note-strip {
        flex: 1 1 15rem;
        margin: 0;
        --note-cell-height: 1.7rem;
        --note-cell-padding: 0.15rem;
      }
      .pitch-signal {
        display: inline-flex;
        color: var(--accent);
      }
      .pitch-signal svg {
        ${iconStyles}
      }
      .pitch-signal path {
        transform-box: fill-box;
        transform-origin: center;
        animation: listening 1s ease-in-out infinite alternate;
      }
      .pitch-signal path:nth-child(2) {
        animation-delay: -0.35s;
      }
      .pitch-signal path:nth-child(3) {
        animation-delay: -0.7s;
      }
      @keyframes listening {
        from {
          transform: scaleY(0.45);
          opacity: 0.55;
        }
        to {
          transform: scaleY(1);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .pitch-signal path {
          animation: none;
        }
      }
      @media (min-width: 48rem) {
        :host {
          position: static;
        }
        .live-pitch {
          align-content: center;
        }
      }
      @media (max-width: 35rem) {
        .live-pitch {
          padding: 0.2rem 0.55rem;
        }
      }
    `,
  ];
  declare displayPitch: Pitch | undefined;
  declare listening: boolean;
  declare tunerStart: number;

  protected override render() {
    const { displayPitch, listening, tunerStart } = this;
    const midi = displayPitch?.midi;
    const cents =
      midi === undefined ? 0 : Math.round(centsFrom(midi, Math.round(midi)));
    return html`
      <div class="live-pitch" aria-label="チューナー">
        <div class="live-reading">
          <span>入力音</span
          ><strong id="live-note"
            >${midi === undefined ? '—' : noteName(midi)}</strong
          >
          <span id="live-frequency"
            >${displayPitch ? `${displayPitch.hz.toFixed(1)} Hz` : '— Hz'}</span
          >
          <span id="live-cents" ?hidden=${!displayPitch}
            >${cents > 0 ? '+' : ''}${cents} ¢</span
          >
          <span
            id="pitch-signal"
            class="pitch-signal"
            role="img"
            aria-label="音を待っています"
            title="音を待っています"
            ?hidden=${Boolean(displayPitch) || !listening}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 9v6" />
              <path d="M12 4v16" />
              <path d="M19 9v6" />
            </svg>
          </span>
        </div>
        <otama-note-strip .start=${tunerStart} .midi=${midi}></otama-note-strip>
      </div>
    `;
  }
}

customElements.define('otama-live-tuner', LiveTuner);
