import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw, Copy, Check } from 'lucide-react';
import { captureBoundaryError } from '@/lib/observability';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  incidentCode: string | null;
  copied: boolean;
}

/**
 * Global error boundary — PB-OBSERVABILITY-001.
 *
 * componentDidCatch reports a structured, PII-safe incident (route, component,
 * anonymous/session ID, app version, correlation context) via the canonical
 * observability layer, and shows a copiable PB-ERR-XXXXXX code so support can
 * locate the session. The user NEVER sees technical details. If observability
 * itself fails, the boundary keeps working (fail-open).
 */
class ErrorBoundaryInner extends Component<Props & { resetLabel: string; errorTitle: string; errorDesc: string; incidentLabel: string; copyLabel: string; copiedLabel: string }, State> {
  state: State = { hasError: false, error: null, incidentCode: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    try {
      const incidentCode = captureBoundaryError(error, info.componentStack);
      this.setState({ incidentCode });
    } catch (err) {
      // Observability must never break the app.
      logger.warn('[ErrorBoundary] incident capture failed (swallowed)', err);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, incidentCode: null, copied: false });
  };

  handleCopy = async () => {
    const code = this.state.incidentCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.setState({ copied: true });
    } catch {
      // Clipboard unavailable (permissions, insecure context): keep UI usable.
      logger.warn('[ErrorBoundary] clipboard copy failed');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-100">
              {this.props.errorTitle}
            </h2>
            <p className="text-sm text-zinc-500 max-w-md">
              {this.props.errorDesc}
            </p>
          </div>
          {this.state.incidentCode && (
            <button
              type="button"
              onClick={this.handleCopy}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              title={this.props.copyLabel}
            >
              <span>
                {this.props.incidentLabel}: <span className="font-mono font-semibold text-zinc-200">{this.state.incidentCode}</span>
              </span>
              {this.state.copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="sr-only">
                {this.state.copied ? this.props.copiedLabel : this.props.copyLabel}
              </span>
            </button>
          )}
          <Button
            onClick={this.handleReset}
            className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {this.props.resetLabel}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ErrorBoundary({ children, fallback }: Props) {
  const { t } = useTranslation();
  return (
    <ErrorBoundaryInner
      resetLabel={t('common.retry', 'Retry')}
      errorTitle={t('errors.boundaryTitle', 'Something went wrong')}
      errorDesc={t('errors.boundaryDesc', 'An unexpected error occurred. Try reloading this section.')}
      incidentLabel={t('errors.incidentCode', 'Incident code')}
      copyLabel={t('errors.copyIncidentCode', 'Copy incident code')}
      copiedLabel={t('errors.incidentCodeCopied', 'Copied')}
      fallback={fallback}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
