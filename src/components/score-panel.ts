import { css, html, LitElement } from 'lit';
import { live } from 'lit/directives/live.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { scaleKeys } from '../practice/demo';
import {
  baseStyles,
  cardStyles,
  controlStyles,
  iconStyles,
  selectValue,
  sessionProperty,
  type PracticeSession,
} from './shared';

export class ScorePanel extends LitElement {
  static override properties = { session: sessionProperty };
  static override styles = [
    baseStyles,
    cardStyles,
    controlStyles,
    css`
      .score-panel {
        display: flex;
        flex-direction: column;
      }
      #score-status {
        margin: 0 0 0.35rem;
      }
      .score-tools {
        justify-content: flex-end;
        margin-left: auto;
        min-width: 0;
      }
      .icon-button svg {
        ${iconStyles}
      }
      #part,
      #demo-key {
        max-width: min(34vw, 16rem);
      }
      #score {
        color-scheme: light;
        background: #fff;
        border-radius: var(--corner);
        height: clamp(8.5rem, 24svh, 15rem);
        overflow: auto;
      }
      #score:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      .staff-target {
        fill: transparent;
        cursor: pointer;
        pointer-events: all;
      }
      .staff-target:hover {
        fill: var(--accent);
        fill-opacity: 0.07;
      }
      .staff-target.selected {
        fill: var(--accent);
        fill-opacity: 0.1;
      }
      .played-note {
        color: var(--miss);
        pointer-events: none;
      }
      .played-note.match {
        color: var(--hit);
      }
      .played-note > g {
        transition: transform 60ms linear;
      }
      @media (prefers-reduced-motion: reduce) {
        .played-note > g {
          transition: none;
        }
      }
      @media (min-width: 48rem) {
        #score {
          flex: 1 0 8rem;
          height: 0;
          contain: size;
        }
      }
      @media (min-width: 48rem) and (max-height: 42rem) {
        #score {
          flex-basis: 7rem;
        }
      }
      @media (max-width: 35rem) {
        .score-tools {
          font-size: 0.8rem;
        }
        #score {
          height: clamp(6.5rem, 18svh, 12rem);
        }
      }
    `,
  ];
  declare session: PracticeSession;
  private readonly sheet = createRef<HTMLElement>();
  private readonly file = createRef<HTMLInputElement>();
  get sheetElement() {
    return this.sheet.value;
  }

  protected override render() {
    const { view } = this.session;
    const showParts = !view.loading && view.parts.length > 1;
    return html`
      <div class="card score-panel">
        <div class="heading-row">
          <h2>楽譜</h2>
          <div class="controls score-tools">
            <label id="demo-key-control" ?hidden=${!view.sample}>
              <span class="sr-only">音階の調</span>
              <select
                id="demo-key"
                ?disabled=${view.loading}
                @change=${this.onDemoKeyChange}
              >
                ${scaleKeys.map(
                  ({ label }, index) =>
                    html`<option
                      value=${index}
                      .selected=${live(view.demoKey === index)}
                    >
                      ${label}
                    </option>`,
                )}
              </select>
            </label>
            <button
              id="demo"
              type="button"
              ?hidden=${view.sample}
              ?disabled=${view.loading}
              @click=${this.onDemoClick}
            >
              音階練習に戻る
            </button>
            <label id="part-control" ?hidden=${!showParts}>
              <span class="sr-only">パート</span>
              <select
                id="part"
                ?disabled=${!showParts}
                @change=${this.onPartChange}
              >
                ${
                  view.parts.length
                    ? view.parts.map(
                        (label, index) =>
                          html`<option
                            value=${index}
                            .selected=${live(view.part === index)}
                          >
                            ${label}
                          </option>`,
                      )
                    : html`<option>—</option>`
                }
              </select>
            </label>
            <button
              id="open-score"
              class="icon-button"
              type="button"
              aria-label="楽譜を選ぶ"
              title="楽譜を選ぶ"
              ?disabled=${view.loading}
              @click=${this.onOpenClick}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 19V5h6l3 3h9v3M3 19l4-8h15l-4 8z" />
              </svg>
            </button>
            <input
              id="file"
              type="file"
              accept=".musicxml,.xml,.mxl"
              hidden
              ${ref(this.file)}
              ?disabled=${view.loading}
              @change=${this.onFileChange}
            />
          </div>
        </div>
        <p
          ?hidden=${!view.scoreStatus.message}
          id="score-status"
          class="status ${view.scoreStatus.level}"
          role="status"
        >
          ${view.scoreStatus.message}
        </p>
        <div
          id="score"
          role="region"
          tabindex="0"
          aria-label="読み込んだ楽譜"
          ${ref(this.sheet)}
          ?hidden=${!view.scoreVisible}
          @click=${this.session.selectStaff}
        ></div>
      </div>
    `;
  }

  private onDemoClick() {
    void this.session.loadSample();
  }

  private onDemoKeyChange(event: Event) {
    void this.session.loadSample(Number(selectValue(event)));
  }

  private onPartChange(event: Event) {
    this.session.selectPart(Number(selectValue(event)));
  }

  private onOpenClick() {
    this.file.value?.click();
  }

  private onFileChange(event: Event) {
    if (event.currentTarget instanceof HTMLInputElement)
      this.session.openFile(event.currentTarget);
  }
}

customElements.define('otama-score-panel', ScorePanel);
