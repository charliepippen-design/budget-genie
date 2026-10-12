import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { saveCrashBackup } from '@/lib/crash-recovery';
import { reportClientError } from '@/lib/error-report';
import { CrashFallback } from './CrashFallback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  attempt: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    saveCrashBackup('app', error);
    reportClientError({ section: 'app', error, componentStack: info.componentStack });
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  private retry = () => this.setState((s) => ({ error: null, componentStack: '', attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <CrashFallback
          title="Something went wrong"
          error={this.state.error}
          componentStack={this.state.componentStack}
          className="min-h-screen justify-center bg-background"
          onRetry={this.retry}
        />
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
