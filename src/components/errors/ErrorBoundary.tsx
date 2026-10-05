"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportClientError } from "@/lib/errors/report";

type Props = {
  children: ReactNode;
  /** Human label for the boundary, used in the fallback + error report (e.g. a module slug). */
  name?: string;
  /** Custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Compact fallback (for a small panel) vs full-height (default). */
  compact?: boolean;
};

type State = { error: Error | null };

/**
 * Isolating error boundary — a crash in `children` renders a recovery panel instead
 * of white-screening the whole app, and reports the error to /api/client-errors.
 * Wrap each incident module so one failing panel never takes down the console.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      error,
      source: "boundary",
      context: this.props.name,
      componentStack: info.componentStack ?? undefined,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className={`ic-error-boundary${this.props.compact ? " ic-error-boundary--compact" : ""}`} role="alert">
        <div className="ic-error-boundary__icon" aria-hidden>
          ⚠
        </div>
        <h3 className="ic-error-boundary__title">
          {this.props.name ? `This section hit a problem` : "Something went wrong"}
        </h3>
        <p className="ic-error-boundary__msg">
          The rest of the console is still working. You can retry this{" "}
          {this.props.name ? "section" : "view"} without losing your place.
        </p>
        <div className="ic-error-boundary__actions">
          <button type="button" className="ic-btn-add" onClick={this.reset}>
            Try again
          </button>
          <button
            type="button"
            className="ic-link-btn"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Reload page
          </button>
        </div>
        <details className="ic-error-boundary__details">
          <summary>Technical detail</summary>
          <pre>{error.message}</pre>
        </details>
      </div>
    );
  }
}
