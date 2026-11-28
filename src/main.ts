import { css, html, LitElement } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import { createPracticeSession } from './practice/practice-session';
import './components/app-header';
import './components/audio-input';
import type { AudioInput } from './components/audio-input';
import './components/live-tuner';
import './components/practice-controls';
import type { PracticeControls } from './components/practice-controls';
import './components/practice-panel';
import type { PracticePanel } from './components/practice-panel';
import './components/score-panel';
import type { ScorePanel } from './components/score-panel';
import { baseStyles } from './components/shared';
import './style.css';

class OtamatoneApp extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .shell {
        display: grid;
        gap: 0.55rem;
        padding: 0.55rem clamp(0.5rem, 1.5vw, 1.5rem);
      }
      #workspace {
        display: grid;
        grid-template-columns: minmax(8rem, 10rem) minmax(0, 1fr);
        grid-template-rows: minmax(28rem, 1fr);
        gap: 0.55rem;
        min-width: 0;
        min-height: 28rem;
      }
      .score-practice {
        display: grid;
        grid-template-rows: repeat(2, minmax(13rem, 1fr));
        gap: 0.55rem;
        min-width: 0;
        min-height: 0;
      }
      .countdown-overlay {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: clamp(0.4rem, 2vh, 1rem);
        padding: 1.5rem;
        background: rgb(9 28 42 / 88%);
        color: white;
        text-align: center;
        backdrop-filter: blur(8px);
      }
      .countdown-overlay span {
        font-size: clamp(1.1rem, 3vw, 2rem);
        font-weight: 650;
      }
      .countdown-overlay strong {
        color: #a9edff;
        font-size: clamp(8rem, 32vw, 20rem);
        font-variant-numeric: tabular-nums;
        line-height: 0.9;
        text-shadow: 0 0 3rem rgb(42 193 239 / 55%);
      }
      .countdown-overlay button {
        margin-top: 1rem;
        border: 1px solid rgb(255 255 255 / 55%);
        border-radius: var(--corner);
        padding: 0.65rem 1rem;
        background: transparent;
        color: white;
        font: inherit;
        cursor: pointer;
      }
      footer {
        color: var(--muted);
        font-size: 0.7rem;
        line-height: 1.3;
      }
      @media (min-width: 48rem) {
        .shell {
          height: 100svh;
          min-height: 100svh;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
        }
        otama-app-header,
        otama-practice-controls,
        #workspace,
        footer {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 47.99rem) {
        #workspace {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto auto;
          min-height: 0;
        }
        .score-practice {
          grid-template-rows: auto auto;
        }
      }
    `,
  ];

  private readonly session = createPracticeSession(this);
  private readonly input = createRef<AudioInput>();
  private readonly controls = createRef<PracticeControls>();
  private readonly score = createRef<ScorePanel>();
  private readonly practice = createRef<PracticePanel>();

  override connectedCallback() {
    super.connectedCallback();
    void this.connectSession();
  }

  override disconnectedCallback() {
    this.session.disconnect();
    super.disconnectedCallback();
  }

  protected override async getUpdateComplete() {
    const completed = await super.getUpdateComplete();
    // The session measures the score after the child has applied its visibility.
    await Promise.all([
      this.input.value?.updateComplete,
      this.controls.value?.updateComplete,
      this.score.value?.updateComplete,
      this.practice.value?.updateComplete,
    ]);
    return completed;
  }

  private async connectSession() {
    await this.updateComplete;
    const microphone = this.input.value?.microphoneElement;
    const sheet = this.score.value?.sheetElement;
    const canvas = this.practice.value?.canvasElement;
    if (this.isConnected && microphone && sheet && canvas)
      this.session.connect({ microphone, sheet, canvas });
  }

  protected override render() {
    const { displayPitch, tunerStart, targetMidi, countInBeat } =
      this.session.view;
    return html`
      <main class="shell" ?inert=${countInBeat > 0}>
        <otama-app-header>
          <otama-audio-input
            slot="controls"
            ${ref(this.input)}
            .session=${this.session}
          ></otama-audio-input>
        </otama-app-header>
        <otama-practice-controls
          ${ref(this.controls)}
          .session=${this.session}
        ></otama-practice-controls>
        <section id="workspace">
          <otama-live-tuner
            .displayPitch=${displayPitch}
            .tunerStart=${tunerStart}
            .targetMidi=${targetMidi}
          ></otama-live-tuner>
          <div class="score-practice">
            <otama-score-panel
              ${ref(this.score)}
              .session=${this.session}
            ></otama-score-panel>
            <otama-practice-panel
              ${ref(this.practice)}
              .session=${this.session}
            ></otama-practice-panel>
          </div>
        </section>
        <footer>マイクの音声と楽譜はブラウザ内で処理されます。</footer>
      </main>
      <div
        class="countdown-overlay"
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label="練習開始カウントダウン"
        ?hidden=${countInBeat === 0}
      >
        <span>テンポに合わせて準備</span>
        <strong>${countInBeat}</strong>
        <span>拍</span>
        <button type="button" @click=${this.session.togglePlay}>
          カウントを中止
        </button>
      </div>
    `;
  }
}

customElements.define('otamatone-app', OtamatoneApp);
