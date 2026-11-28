import { css } from 'lit';
import type { createPracticeSession } from '../practice/practice-session';

export type PracticeSession = ReturnType<typeof createPracticeSession>;

// The session updates its view in place before requesting a render.
export const sessionProperty = { attribute: false, hasChanged: () => true };

export function selectValue(event: Event) {
  if (!(event.currentTarget instanceof HTMLSelectElement))
    throw new TypeError('Expected a select element');
  return event.currentTarget.value;
}

export const baseStyles = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  [hidden] {
    display: none !important;
  }
`;

export const cardStyles = css`
  :host {
    display: flex;
    min-width: 0;
  }
  .card {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--corner);
    padding: clamp(0.55rem, 1.2vw, 1rem);
    min-width: 0;
  }
  .heading-row,
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.65rem;
    align-items: center;
  }
  .heading-row {
    justify-content: space-between;
    margin-bottom: 0.45rem;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0;
  }
  .status {
    color: var(--muted);
    margin-block: 0.65rem;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--miss);
  }
  .good {
    color: var(--hit);
  }
  @media (min-width: 48rem) and (max-height: 42rem) {
    .card {
      padding: 0.45rem 0.65rem;
    }
  }
  @media (max-width: 35rem) {
    .card {
      padding: 0.45rem 0.55rem;
    }
    h2 {
      font-size: 1rem;
    }
  }
`;

export const controlStyles = css`
  button,
  select,
  microphone {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: var(--corner);
    background-color: #f6fbfd;
    color: #183347;
    padding: 0.35rem 0.6rem;
    max-width: 100%;
  }
  button:not(:disabled),
  select:not(:disabled) {
    cursor: pointer;
  }
  button:disabled,
  select:disabled {
    opacity: 0.5;
  }
  button:not(:disabled):hover {
    filter: brightness(0.94);
  }
  button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .primary,
  .icon-button[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    font-weight: 700;
  }
  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

export const iconStyles = css`
  width: 1.2rem;
  height: 1.2rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
`;
