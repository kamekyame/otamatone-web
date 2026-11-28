import { css, html, LitElement } from 'lit';
import { live } from 'lit/directives/live.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { noteName } from '../pitch';
import './note-strip';
import {
  baseStyles,
  cardStyles,
  controlStyles,
  iconStyles,
  selectValue,
  sessionProperty,
  type PracticeSession,
} from './shared';

export class PracticePanel extends LitElement {
  static override properties = { session: sessionProperty };
  static override styles = [
    baseStyles,
    cardStyles,
    controlStyles,
    css`
      .pitch-panel {
        display: flex;
        flex-direction: column;
      }
      .practice-heading {
        justify-content: flex-start;
      }
      .badge {
        background: var(--accent-soft);
        border-radius: var(--corner);
        color: #075f81;
        padding: 0.25rem 0.7rem;
        font-size: 0.8rem;
      }
      .badge.good {
        color: var(--hit);
      }
      .badge.error {
        color: var(--miss);
      }
      .practice-status {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem 0.65rem;
        align-items: center;
        margin-left: auto;
      }
      .practice-status p {
        margin: 0;
      }
      .icon-button svg {
        ${iconStyles}
      }
      #chart {
        display: block;
        width: 100%;
        height: clamp(6rem, 17svh, 12rem);
        margin: 0.25rem 0 0.4rem;
        background: #f4fafd;
        border-radius: var(--corner);
      }
      .count-in {
        color: var(--accent);
        font-weight: 750;
      }
      .step-goal {
        display: flex;
        align-items: baseline;
        gap: 0.7rem;
        color: var(--muted);
        margin-block: 0.65rem;
      }
      .step-goal strong {
        font-size: 2.3rem;
        color: var(--accent);
      }
      otama-note-strip {
        margin: 0.6rem 0 0.85rem;
      }
      @media (min-width: 48rem) {
        #timed-display {
          display: flex;
          flex: 1;
          flex-direction: column;
        }
        #chart {
          flex: 1 0 7rem;
          height: 0;
        }
        #step-display {
          flex: 1;
          align-content: center;
        }
      }
      @media (min-width: 48rem) and (max-height: 42rem) {
        #chart {
          flex-basis: 6rem;
        }
        .step-goal {
          margin-block: 0.25rem;
        }
        .step-goal strong {
          font-size: 1.8rem;
        }
      }
      @media (max-width: 35rem) {
        .pitch-panel > .controls {
          font-size: 0.8rem;
        }
        .mode-label {
          display: none;
        }
        #chart {
          height: clamp(5.5rem, 14svh, 10rem);
        }
        .practice-heading {
          gap: 0.2rem 0.45rem;
        }
        .practice-status .status {
          font-size: 0.75rem;
        }
        .step-goal {
          margin: 0.35rem 0;
        }
        .step-goal strong {
          font-size: 1.7rem;
        }
      }
    `,
  ];
  declare session: PracticeSession;
  private readonly canvas = createRef<HTMLCanvasElement>();
  get canvasElement() {
    return this.canvas.value;
  }

  protected override render() {
    const { view } = this.session;
    const disabled = view.loading || !view.scoreVisible;
    return html`
      <div class="card pitch-panel">
        <div class="heading-row practice-heading">
          <h2 id="practice-heading">
            ${view.stepMode ? '一音ずつ練習' : '音程バー'}
          </h2>
          <span id="feedback" class="badge ${view.feedback.level}"
            >${view.feedback.message}</span
          >
          <div class="practice-status">
            <p id="position" class="status">${view.position}</p>
            <p
              id="count-in"
              class="count-in"
              role="status"
              ?hidden=${!view.countIn}
            >
              ${view.countIn}
            </p>
          </div>
        </div>
        <div class="controls">
          <label>
            <span class="mode-label">進め方</span>
            <select
              id="practice-mode"
              aria-label="進め方"
              .value=${live(view.stepMode ? 'step' : 'timed')}
              @change=${this.onModeChange}
            >
              <option value="timed">テンポに合わせる</option>
              <option value="step">音程が合ったら次へ</option>
            </select>
          </label>
          <button
            class="primary"
            id="play"
            type="button"
            ?disabled=${disabled}
            @click=${this.session.togglePlay}
          >
            ${view.playLabel}
          </button>
          <button
            id="reset"
            type="button"
            ?disabled=${disabled}
            @click=${this.session.rewind}
          >
            先頭へ
          </button>
          <label id="speed-control" ?hidden=${view.stepMode}>
            <span class="sr-only">練習速度</span>
            <select
              id="speed"
              title="練習速度"
              .value=${live(view.speed)}
              ?disabled=${Boolean(view.countIn)}
              @change=${this.onSpeedChange}
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.25">125%</option>
            </select>
          </label>
          <button
            id="repeat-practice"
            class="icon-button"
            type="button"
            aria-label="曲全体を繰り返す"
            aria-pressed=${String(view.repeat)}
            title="曲全体を繰り返す"
            @click=${this.session.toggleRepeat}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"
              />
            </svg>
          </button>
        </div>
        <div id="timed-display" ?hidden=${view.stepMode}>
          <canvas
            id="chart"
            ${ref(this.canvas)}
            aria-label="目標音程と演奏音程の時間グラフ"
          ></canvas>
        </div>
        <div id="step-display" ?hidden=${!view.stepMode}>
          <p class="step-goal">
            目標音
            <strong id="step-note"
              >${view.stepTarget === undefined ? '—' : noteName(view.stepTarget)}</strong
            >
            <span
              >入力音
              <b id="step-input"
                >${view.displayPitch ? noteName(view.displayPitch.midi) : '—'}</b
              ></span
            >
          </p>
          <otama-note-strip
            .start=${view.stepStart}
            .midi=${view.stepPitch}
            .target=${view.stepTarget}
          ></otama-note-strip>
        </div>
      </div>
    `;
  }

  private onModeChange(event: Event) {
    this.session.selectMode(selectValue(event));
  }

  private onSpeedChange(event: Event) {
    this.session.selectSpeed(selectValue(event));
  }
}

customElements.define('otama-practice-panel', PracticePanel);
