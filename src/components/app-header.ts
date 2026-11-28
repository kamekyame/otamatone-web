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
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
      }
      h1 {
        font-size: clamp(1.1rem, 2vw, 1.75rem);
        margin: 0;
      }
      .github-link {
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
        <h1>オタマトーン練習サイト</h1>
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
