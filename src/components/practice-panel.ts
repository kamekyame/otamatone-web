import { css, html, LitElement } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import {
  baseStyles,
  cardStyles,
  sessionProperty,
  type PracticeSession,
} from './shared';

export class PracticePanel extends LitElement {
  static override properties = { session: sessionProperty };
  static override styles = [
    baseStyles,
    cardStyles,
    css`
      .pitch-panel {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      h2 {
        margin: 0;
        font-size: 1rem;
      }
      #chart {
        display: block;
        width: 100%;
        flex: 1;
        height: 100%;
        min-height: 0;
        background: #f4fafd;
        border-radius: var(--corner);
      }
      .guide-display {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      @media (max-width: 47.99rem) {
        .guide-display {
          flex: none;
        }
        #chart {
          flex: none;
          min-height: 0;
          height: clamp(8rem, 24svh, 13rem);
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
    return html`
      <div class="card pitch-panel">
        <h2>おたまガイド</h2>
        <div class="guide-display">
          <canvas
            id="chart"
            ${ref(this.canvas)}
            aria-label="おたまガイド：お手本と演奏音程"
          ></canvas>
        </div>
      </div>
    `;
  }
}

customElements.define('otama-practice-panel', PracticePanel);
