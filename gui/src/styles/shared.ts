import { css } from "lit";

/**
 * Styles shared by all components: a small subset of Bootstrap 5.3's classes,
 * driven by Bootstrap's CSS variables (see theme.css).
 */
export const shared = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :host {
    font-family: var(--bs-font-sans-serif);
    color: var(--bs-body-color);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.375rem 0.75rem;
    font: inherit;
    font-weight: 500;
    line-height: 1.5;
    white-space: nowrap;
    color: var(--bs-body-color);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--bs-border-radius);
    cursor: pointer;
    transition:
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn:focus-visible,
  .form-control:focus-visible,
  .form-select:focus-visible,
  .form-check-input:focus-visible {
    outline: 0;
    border-color: var(--bs-primary);
    box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.3);
  }
  .btn-sm {
    padding: 0.2rem 0.5rem;
    font-size: 0.875em;
  }
  .btn-primary {
    color: #fff;
    background: var(--bs-primary);
    border-color: var(--bs-primary);
  }
  .btn-primary:hover:not(:disabled) {
    filter: brightness(0.92);
  }
  .btn-outline-primary {
    color: var(--bs-primary-text-emphasis);
    border-color: var(--bs-primary);
  }
  .btn-outline-primary:hover:not(:disabled) {
    background: var(--bs-primary-bg-subtle);
  }
  .btn-outline-secondary {
    border-color: var(--bs-border-color);
    background: var(--nfsb-surface);
  }
  .btn-outline-secondary:hover:not(:disabled),
  .btn-ghost:hover:not(:disabled) {
    background: var(--bs-secondary-bg);
  }
  .btn-outline-secondary.active {
    background: var(--bs-secondary-bg);
  }
  .btn-outline-danger {
    color: var(--bs-danger);
    border-color: var(--bs-danger);
  }
  .btn-outline-danger:hover:not(:disabled) {
    background: var(--bs-danger-bg-subtle);
  }
  .btn-ghost {
    color: var(--bs-secondary-color);
  }
  .btn-icon {
    padding: 0.375rem 0.5rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--bs-secondary-color);
  }
  .form-control,
  .form-select {
    display: block;
    width: 100%;
    padding: 0.375rem 0.625rem;
    font: inherit;
    line-height: 1.5;
    color: var(--bs-body-color);
    background-color: var(--nfsb-surface);
    border: 1px solid var(--bs-border-color);
    border-radius: var(--bs-border-radius);
  }
  .form-control::placeholder {
    color: var(--bs-secondary-color);
    opacity: 0.7;
  }
  textarea.form-control {
    min-height: 5rem;
    resize: vertical;
  }
  .form-control.is-invalid {
    border-color: var(--bs-danger);
  }
  .form-text {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    color: var(--bs-secondary-color);
  }
  .invalid-feedback {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    color: var(--bs-danger);
  }
  .form-check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }
  .form-check-input {
    width: 1rem;
    height: 1rem;
    margin: 0;
    accent-color: var(--bs-primary);
    cursor: pointer;
  }

  .badge {
    display: inline-block;
    padding: 0.2em 0.55em;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    border-radius: var(--bs-border-radius);
    color: var(--bs-secondary-color);
    background: var(--bs-secondary-bg);
  }
  .badge-primary {
    color: var(--bs-primary-text-emphasis);
    background: var(--bs-primary-bg-subtle);
  }
  .badge-info {
    color: var(--bs-info-text-emphasis);
    background: var(--bs-info-bg-subtle);
  }
  .badge-warning {
    color: #212529;
    background: var(--bs-warning);
  }

  .card {
    background: var(--nfsb-surface);
    border: 1px solid var(--bs-border-color);
    box-shadow: var(--bs-box-shadow-sm);
  }

  .alert {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border-radius: var(--bs-border-radius);
  }
  .alert-danger {
    color: var(--bs-danger);
    background: var(--bs-danger-bg-subtle);
  }
  .alert-info {
    color: var(--bs-info-text-emphasis);
    background: var(--bs-info-bg-subtle);
  }

  /* Drag handle */
  .grip {
    color: var(--bs-secondary-color);
    opacity: 0.5;
    cursor: grab;
  }
  .grip:hover {
    opacity: 1;
  }

  /* A line showing where a dragged item would land, on hosts with a "drop" attribute */
  :host([drop="before"])::before,
  :host([drop="after"])::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 3px;
    background: var(--bs-primary);
  }
  :host([drop="before"])::before {
    top: var(--nfsb-drop-offset, -5px);
  }
  :host([drop="after"])::after {
    bottom: var(--nfsb-drop-offset, -5px);
  }

  .font-monospace {
    font-family: var(--bs-font-monospace);
  }
  .text-danger {
    color: var(--bs-danger);
  }
  .text-warning {
    color: var(--bs-warning-text-emphasis);
  }
  .text-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;
