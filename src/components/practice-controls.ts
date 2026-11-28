import { css, html, LitElement } from 'lit';
import { live } from 'lit/directives/live.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import skipBackIcon from '@material-symbols/svg-400/outlined/skip_previous.svg?raw';
import previousIcon from '@material-symbols/svg-400/outlined/chevron_left.svg?raw';
import nextIcon from '@material-symbols/svg-400/outlined/chevron_right.svg?raw';
import playIcon from '@material-symbols/svg-400/outlined/play_arrow.svg?raw';
import pauseIcon from '@material-symbols/svg-400/outlined/pause.svg?raw';
import repeatIcon from '@material-symbols/svg-400/outlined/repeat.svg?raw';
import {
  baseStyles,
  cardStyles,
  controlStyles,
  iconStyles,
  selectValue,
  sessionProperty,
  type PracticeSession,
} from './shared';

export class PracticeControls extends LitElement {
  static override properties = { session: sessionProperty };
  static override styles = [
    baseStyles,
    cardStyles,
    controlStyles,
    css`
      :host {
        display: block;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem 0.65rem;
      }
      h2 {
        margin-right: 0.25rem;
      }
      .transport {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }
      #play {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .badge {
        margin-left: auto;
        padding: 0.25rem 0.7rem;
        border-radius: var(--corner);
        background: var(--accent-soft);
        color: #075f81;
        font-size: 0.85rem;
      }
      .badge.good {
        color: var(--hit);
      }
      .badge.error {
        color: var(--miss);
      }
      .position {
        margin: 0;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .octave-control {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.85rem;
      }
      .octave-control input {
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: var(--accent);
      }
      .icon-button svg,
      #play svg {
        ${iconStyles}
      }
      @media (max-width: 35rem) {
        .toolbar {
          gap: 0.3rem;
        }
        h2 {
          display: none;
        }
        .badge {
          flex-basis: 100%;
          margin-left: 0;
          order: 2;
        }
        .position {
          margin-left: auto;
        }
      }
    `,
  ];

  declare session: PracticeSession;

  protected override render() {
    const { view } = this.session;
    const disabled = view.loading || !view.scoreVisible;
    return html`
      <section class="card toolbar" aria-label="練習コントロール">
        <h2>練習</h2>
        <label>
          <span class="sr-only">練習の進め方</span>
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
        <div class="transport" role="group" aria-label="練習位置の操作">
          <button
            id="reset"
            class="icon-button"
            type="button"
            aria-label="先頭へ"
            title="先頭へ"
            ?disabled=${disabled}
            @click=${this.session.rewind}
          >
            <span aria-hidden="true">${unsafeSVG(skipBackIcon)}</span>
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="前の音符へ"
            title="前の音符へ"
            ?disabled=${disabled}
            @click=${this.session.previousNote}
          >
            <span aria-hidden="true">${unsafeSVG(previousIcon)}</span>
          </button>
          <button
            class="primary"
            id="play"
            type="button"
            ?disabled=${disabled}
            @click=${this.session.togglePlay}
          >
            <span aria-hidden="true"
              >${unsafeSVG(view.playing ? pauseIcon : playIcon)}</span
            >
            ${view.playLabel}
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="次の音符へ"
            title="次の音符へ"
            ?disabled=${disabled}
            @click=${this.session.nextNote}
          >
            <span aria-hidden="true">${unsafeSVG(nextIcon)}</span>
          </button>
        </div>
        <label class="octave-control">
          <input
            id="octave-allowance"
            type="checkbox"
            .checked=${view.allowOctave}
            @change=${this.onOctaveAllowanceChange}
          />
          <span>オクターブ違いを許容</span>
        </label>
        <label id="speed-control" ?hidden=${view.stepMode}>
          <span class="sr-only">練習速度</span>
          <select
            id="speed"
            title="練習速度"
            .value=${live(view.speed)}
            ?disabled=${Boolean(view.countInBeat)}
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
          <span aria-hidden="true">${unsafeSVG(repeatIcon)}</span>
        </button>
        <span class="badge ${view.feedback.level}" id="feedback"
          >${view.feedback.message}</span
        >
        <p class="position" id="position">${view.position}</p>
      </section>
    `;
  }

  private onModeChange(event: Event) {
    this.session.selectMode(selectValue(event));
  }

  private onSpeedChange(event: Event) {
    this.session.selectSpeed(selectValue(event));
  }

  private onOctaveAllowanceChange(event: Event) {
    if (!(event.currentTarget instanceof HTMLInputElement))
      throw new TypeError('Expected an input element');
    this.session.setOctaveAllowance(event.currentTarget.checked);
  }
}

customElements.define('otama-practice-controls', PracticeControls);
