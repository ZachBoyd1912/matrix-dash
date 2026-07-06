"use client";

import * as React from "react";
import { ErrorFallback } from "@/components/ui/error-fallback";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: (Error & { digest?: string }) | null;
}

/**
 * Defense-in-depth beyond Next's file-based error.tsx boundaries: those don't
 * catch errors thrown by the root layout itself (only page.tsx and below), so
 * this wraps {children} in root layout.tsx as a last resort before a blank page.
 */
export class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorFallback
            title="The app hit an unexpected error"
            description="Something crashed outside of a single page. Reloading usually fixes it."
            error={this.state.error}
            onRetry={() => this.setState({ error: null })}
            className="max-w-md"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
