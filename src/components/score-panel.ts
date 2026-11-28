import { css, html, LitElement } from 'lit';
import { live } from 'lit/directives/live.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import folderOpenIcon from '@material-symbols/svg-400/outlined/folder_open.svg?raw';
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
        flex: none;
        height: auto;
        width: 100%;
        min-width: 0;
      }
      .score-meta {
        min-width: 0;
        margin: -0.15rem 0 0.45rem;
      }
      .score-meta h2 {
        overflow-wrap: anywhere;
      }
      .score-meta p {
        margin: 0.15rem 0 0;
        color: var(--muted);
        font-size: 0.8rem;
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
      #part {
        max-width: min(34vw, 16rem);
      }
      #sample-score {
        max-width: min(70vw, 22rem);
      }
      #score {
        color-scheme: light;
        background: #fff;
        border-radius: var(--corner);
        flex: 1;
        width: 100%;
        min-width: 0;
        height: 100%;
        max-height: 65svh;
        min-height: 0;
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
      @media (max-width: 35rem) {
        .score-tools {
          font-size: 0.8rem;
        }
        #score {
          max-height: 55svh;
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
          <div class="score-meta">
            <h2>${view.scoreTitle || '楽譜'}</h2>
            <p
              ?hidden=${!view.scoreSubtitle && !view.scoreComposer && !view.scoreLyricist && !view.scoreRights}
            >
              ${[view.scoreSubtitle, view.scoreComposer, view.scoreLyricist, view.scoreRights].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div class="controls score-tools">
            <label id="sample-control">
              <span>サンプル楽譜</span>
              <select
                id="sample-score"
                .value=${live(view.sampleId)}
                ?disabled=${view.loading}
                @change=${this.onSampleChange}
              >
                <option value="" disabled>選んでください</option>
                ${scaleKeys.map(
                  ({ label }, index) =>
                    html`<option value=${`scale-${index}`}>
                      音階練習：${label}
                    </option>`,
                )}
                <option value="twinkle">きらきら星</option>
              </select>
            </label>
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
              <span aria-hidden="true">${unsafeSVG(folderOpenIcon)}</span>
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

  private onSampleChange(event: Event) {
    void this.session.loadSample(selectValue(event));
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
