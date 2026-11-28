import { html, LitElement } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { live } from 'lit/directives/live.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';
import { scaleKeys } from './demo';
import { centsFrom, noteName } from './pitch';
import {
  createPracticeSession,
  type MicrophoneElement,
} from './practice-session';
import './style.css';

const stripIndexes = Array.from({ length: 12 }, (_, i) => i);

function noteStrip(id: string, start: number, midi?: number, target?: number) {
  const current = midi === undefined ? undefined : Math.round(midi);
  const goal = target === undefined ? undefined : Math.round(target);
  return html`
    <div
      id=${id}
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

function selectValue(event: Event) {
  if (!(event.currentTarget instanceof HTMLSelectElement))
    throw new TypeError('Expected a select element');
  return event.currentTarget.value;
}

class OtamatoneApp extends LitElement {
  private readonly session = createPracticeSession(this);
  private readonly sheet = createRef<HTMLElement>();
  private readonly canvas = createRef<HTMLCanvasElement>();
  private readonly microphone = createRef<MicrophoneElement>();
  private readonly file = createRef<HTMLInputElement>();

  protected override createRenderRoot() {
    // Keep the existing layout CSS and OSMD's generated score in the light DOM.
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    void this.connectSession();
  }

  override disconnectedCallback() {
    this.session.disconnect();
    super.disconnectedCallback();
  }

  private async connectSession() {
    await this.updateComplete;
    const { sheet, canvas, microphone } = this;
    if (this.isConnected && sheet.value && canvas.value && microphone.value)
      this.session.connect({
        sheet: sheet.value,
        canvas: canvas.value,
        microphone: microphone.value,
      });
  }

  protected override render() {
    return html`
      <main class="shell">
        <div class="workspace-nav"><h1>オタマトーン練習サイト</h1></div>
        ${this.renderInput()} ${this.renderTuner()}
        <section id="practice">
          ${this.renderScore()} ${this.renderPractice()}
        </section>
        <footer>マイクの音声と楽譜はブラウザ内で処理されます。</footer>
      </main>
    `;
  }

  private renderInput() {
    const { view } = this.session;
    return html`
      <section class="card input-bar" aria-label="音声入力">
        <label class="device-control">
          音声入力
          <select
            id="device"
            ?disabled=${view.inputBusy}
            @change=${this.onDeviceChange}
          >
            <option value="" .selected=${live(view.device === '')}>
              システムの既定
            </option>
            ${view.devices.map(
              ({ label, value }) =>
                html`<option
                  value=${value}
                  .selected=${live(view.device === value)}
                >
                  ${label}
                </option>`,
            )}
          </select>
        </label>
        <microphone
          id="input-permission"
          ${ref(this.microphone)}
          ?hidden=${!view.showNative}
        ></microphone>
        <button
          id="input-toggle"
          class="icon-button ${classMap({ 'can-stop': view.inputBusy })}"
          type="button"
          ?hidden=${view.showNative}
          aria-label=${view.inputLabel}
          title=${view.inputLabel}
          @click=${this.session.toggleInput}
        >
          <svg class="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" />
          </svg>
          <svg class="stop-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" fill="currentColor" />
          </svg>
        </button>
        <button
          id="input-resume"
          class="primary"
          type="button"
          ?hidden=${!view.canResume}
          @click=${this.session.resume}
        >
          音程検出を開始
        </button>
        <span
          id="input-status"
          class="status ${view.inputStatus.level}"
          role="status"
          >${view.inputStatus.message}</span
        >
      </section>
    `;
  }

  private renderTuner() {
    const { displayPitch, listening, tunerStart } = this.session.view;
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
        ${noteStrip('tuner-notes', tunerStart, midi)}
      </div>
    `;
  }

  private renderScore() {
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

  private renderPractice() {
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
          ${noteStrip('step-notes', view.stepStart, view.stepPitch, view.stepTarget)}
        </div>
      </div>
    `;
  }

  private onDeviceChange(event: Event) {
    this.session.selectDevice(selectValue(event));
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

  private onModeChange(event: Event) {
    this.session.selectMode(selectValue(event));
  }

  private onSpeedChange(event: Event) {
    this.session.selectSpeed(selectValue(event));
  }
}

customElements.define('otamatone-app', OtamatoneApp);
