import { css, html, LitElement } from 'lit';
import { live } from 'lit/directives/live.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { classMap } from 'lit/directives/class-map.js';
import type { MicrophoneElement } from '../practice/practice-session';
import {
  baseStyles,
  cardStyles,
  controlStyles,
  iconStyles,
  selectValue,
  sessionProperty,
  type PracticeSession,
} from './shared';

export class AudioInput extends LitElement {
  static override properties = { session: sessionProperty };
  static override styles = [
    baseStyles,
    cardStyles,
    controlStyles,
    css`
      .input-bar {
        gap: 0.35rem 0.6rem;
        font-size: 0.875rem;
      }
      .device-control {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
        max-width: 100%;
      }
      #device {
        min-width: 0;
        max-width: 16rem;
      }
      .input-bar .status {
        margin: 0;
        font-size: 0.8rem;
      }
      microphone::permission-icon {
        fill: #183347;
      }
      .icon-button svg {
        ${iconStyles}
      }
      .stop-icon,
      .can-stop .mic-icon {
        display: none;
      }
      .can-stop .stop-icon {
        display: block;
      }
      @media (max-width: 35rem) {
        .input-bar {
          gap: 0.25rem 0.45rem;
        }
        .input-bar .status {
          flex: 1 1 9rem;
        }
      }
    `,
  ];
  declare session: PracticeSession;
  private readonly microphone = createRef<MicrophoneElement>();
  get microphoneElement() {
    return this.microphone.value;
  }

  protected override render() {
    const { view } = this.session;
    return html`
      <section class="card controls input-bar" aria-label="音声入力">
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

  private onDeviceChange(event: Event) {
    this.session.selectDevice(selectValue(event));
  }
}

customElements.define('otama-audio-input', AudioInput);
