import { css, html, LitElement } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import { createPracticeSession } from './practice/practice-session';
import './components/app-header';
import './components/audio-input';
import type { AudioInput } from './components/audio-input';
import './components/live-tuner';
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
        gap: 0.4rem;
        padding: 0.4rem clamp(0.5rem, 1.5vw, 1.5rem);
      }
      #practice {
        display: grid;
        gap: 0.5rem;
        min-width: 0;
      }
      footer {
        color: var(--muted);
        font-size: 0.7rem;
        line-height: 1.3;
      }
      @media (min-width: 48rem) {
        .shell {
          min-height: 100svh;
          grid-template-columns: minmax(16rem, 1fr) minmax(0, 1.5fr);
          grid-template-rows: auto auto 1fr auto;
        }
        otama-app-header,
        #practice,
        footer {
          grid-column: 1 / -1;
        }
        #practice {
          grid-template-rows: minmax(min-content, 1.15fr) minmax(
              min-content,
              1fr
            );
        }
      }
      @media (min-width: 48rem) and (max-height: 42rem) {
        #practice {
          grid-template-rows: auto auto;
        }
      }
    `,
  ];

  private readonly session = createPracticeSession(this);
  private readonly input = createRef<AudioInput>();
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
    const { displayPitch, listening, tunerStart } = this.session.view;
    return html`
      <main class="shell">
        <otama-app-header></otama-app-header>
        <otama-audio-input
          ${ref(this.input)}
          .session=${this.session}
        ></otama-audio-input>
        <otama-live-tuner
          .displayPitch=${displayPitch}
          .listening=${listening}
          .tunerStart=${tunerStart}
        ></otama-live-tuner>
        <section id="practice">
          <otama-score-panel
            ${ref(this.score)}
            .session=${this.session}
          ></otama-score-panel>
          <otama-practice-panel
            ${ref(this.practice)}
            .session=${this.session}
          ></otama-practice-panel>
        </section>
        <footer>マイクの音声と楽譜はブラウザ内で処理されます。</footer>
      </main>
    `;
  }
}

customElements.define('otamatone-app', OtamatoneApp);
