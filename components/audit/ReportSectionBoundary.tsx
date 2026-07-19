'use client';

/**
 * Failure containment for audit-report sections (NOT a data fallback): a report
 * payload sparser than a panel expects must degrade to a quiet "section
 * unavailable" note, never take down the whole page as a client-side exception
 * (the 2026-07 HoverAir demo-run crash). Every panel still owns its own honest
 * empty states — this boundary only catches what slipped through.
 *
 * `silent` renders nothing on error — for decorative/secondary sections where
 * even the note would be noise.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

declare global {
  interface Window {
    // Dev/preview hook: fuzz harnesses read the caught errors from here.
    __reportSectionErrors?: { section: string; message: string; stack?: string }[];
  }
}

export class ReportSectionBoundary extends Component<
  {
    children: ReactNode;
    /** Names the section in the fallback note + console diagnostics. */
    section: string;
    /** Render nothing (instead of the note) when the section throws. */
    silent?: boolean;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostics only — never rethrow. Surfaced in console + a dev hook the
    // preview fuzz harness reads; production users just see the fallback.
    // eslint-disable-next-line no-console
    console.error(
      `[report-section:${this.props.section}] render failed`,
      error,
      info?.componentStack,
    );
    if (typeof window !== 'undefined') {
      (window.__reportSectionErrors ||= []).push({
        section: this.props.section,
        message: error?.message || String(error),
        stack: error?.stack,
      });
    }
  }

  render() {
    if (this.state.failed) {
      if (this.props.silent) return null;
      return (
        <div className="rounded-md border border-dashed border-[color:var(--merchant-line)] bg-white/30 px-3 py-2 text-xs merchant-text-muted">
          This section couldn&apos;t be displayed for this run.
        </div>
      );
    }
    return this.props.children;
  }
}
