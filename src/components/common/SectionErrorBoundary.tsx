import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { CRASH_BACKUP_KEY, saveCrashBackup } from '@/lib/crash-recovery';
import { reportClientError } from '@/lib/error-report';
import { CrashFallback } from './CrashFallback';

export { CRASH_BACKUP_KEY, saveCrashBackup };

interface Props {
  name: string;
  children: ReactNode;
  /** The boundary resets automatically when any of these values change. */
  resetKeys?: unknown[];
  onReset?: () => void;
}

interface State {
  error: Error | null;
  componentStack: string;
  attempt: number;
}

const sameKeys = (a: unknown[] = [], b: unknown[] = []) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.name}]`, error, info.componentStack);
    saveCrashBackup(this.props.name, error);
    reportClientError({ section: this.props.name, error, componentStack: info.componentStack });
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null, componentStack: '' });
    }
  }

  private reset = () => {
    this.props.onReset?.();
    this.setState((s) => ({ error: null, componentStack: '', attempt: s.attempt + 1 }));
  };

  render() {
    if (!this.state.error) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;

    return (
      <CrashFallback
        title="This section hit an error"
        error={this.state.error}
        componentStack={this.state.componentStack}
        className="m-4 rounded-xl border border-border bg-card shadow-lg"
        onRetry={this.reset}
      />
    );
  }
}
