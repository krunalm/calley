import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component } from 'react';

import { Button } from '@/components/ui/button';

import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If not provided, the default error card is shown. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary that catches rendering errors and displays
 * a "Something went wrong" UI with a retry button.
 *
 * Used per-route to prevent full-page crashes (spec §8.4).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console in development; in production this would go to Sentry
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full min-h-[300px] items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]">
              <AlertTriangle className="h-6 w-6 text-[var(--destructive)]" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              An unexpected error occurred. Please try again.
            </p>
            {this.state.error && (
              <p className="mb-4 max-w-full truncate rounded-[var(--radius)] bg-[var(--muted)] px-3 py-1.5 font-mono text-xs text-[var(--muted-foreground)]">
                {this.state.error.message}
              </p>
            )}
            <Button onClick={this.handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
