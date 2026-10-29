import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import { isApiError, useApiErrorMessage, type ApiError } from '../../api';
import { SpecFlowStandaloneShell, StandaloneScreenHeader } from '../StandaloneScreenLayout';

/**
 * Error component of the router. An {@link ApiError} reads like any other classified failure; any
 * other error is a defect and gets the generic screen (its text is never displayed).
 */
export function RouteErrorView({
  error,
  reset,
}: {
  readonly error: unknown;
  readonly reset?: () => void;
}) {
  return isApiError(error) ? (
    <ApiErrorScreen error={error} reset={reset} />
  ) : (
    <ErrorScreen reset={reset} />
  );
}

function ApiErrorScreen({ error, reset }: { error: ApiError; reset?: () => void }) {
  const message = useApiErrorMessage(error);

  return <ErrorScreen title={message.title} description={message.description} reset={reset} />;
}

function ErrorScreen({
  title,
  description,
  reset,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly reset?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <SpecFlowStandaloneShell>
      <div role="alert" className="grid w-full gap-8">
        <StandaloneScreenHeader
          title={title ?? t('routeError.title')}
          description={description ?? t('routeError.description')}
        />
        <div className="flex flex-wrap gap-2">
          {reset ? <Button onClick={reset}>{t('routeError.retry')}</Button> : null}
          <Button
            variant="secondary"
            onClick={() => void navigate({ to: '/', search: { collection: 'current' } })}
          >
            {t('routeError.back')}
          </Button>
        </div>
      </div>
    </SpecFlowStandaloneShell>
  );
}
