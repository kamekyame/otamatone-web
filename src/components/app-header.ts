import { css, html, LitElement } from 'lit';
import githubLogoUrl from '../assets/GitHub_Invertocat_Black.svg';
import { baseStyles } from './shared';

class AppHeader extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .workspace-nav {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.5rem;
      }
      .title {
        grid-area: 1 / 1;
      }
      h1 {
        font-size: clamp(1.1rem, 2vw, 1.75rem);
        margin: 0;
      }
      .header-controls {
        grid-area: 2 / 1 / 3 / 3;
        min-width: 0;
      }
      .header-controls slot {
        display: block;
      }
      .github-link {
        grid-area: 1 / 2;
        --logo-width: 1.5rem;
        display: block;
        flex: none;
        padding: calc(var(--logo-width) / 4);
        border-radius: var(--corner);
      }
      .github-link:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .github-link img {
        display: block;
        width: var(--logo-width);
        height: auto;
      }
      @media (min-width: 64rem) {
        .workspace-nav {
          grid-template-columns: auto minmax(0, 1fr) auto;
        }
        .header-controls {
          grid-area: 1 / 2;
        }
        .github-link {
          grid-area: 1 / 3;
        }
      }
      @media (max-width: 35rem) {
        h1 {
          font-size: 1rem;
        }
      }
    `,
  ];

  protected override render() {
    return html`
      <div class="workspace-nav">
        <div class="title"><h1>オタマトーン練習サイト</h1></div>
        <div class="header-controls"><slot name="controls"></slot></div>
        <a
          class="github-link"
          href="https://github.com/kamekyame/otamatone-web"
          target="_blank"
          aria-label="GitHub でソースコードを見る"
        >
          <img src=${githubLogoUrl} alt="" width="98" height="96" />
        </a>
      </div>
    `;
  }
}

customElements.define('otama-app-header', AppHeader);
