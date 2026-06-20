import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props & { resetLabel: string; errorTitle: string; errorDesc: string }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
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
      fallback={fallback}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
