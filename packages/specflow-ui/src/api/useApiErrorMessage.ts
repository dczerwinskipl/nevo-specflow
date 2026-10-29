import { useTranslation } from 'react-i18next';
import type { ApiError } from './ApiError';

/** User-facing copy of a classified failure: chosen by kind, never taken from the server. */
export function useApiErrorMessage(error: ApiError): { title: string; description: string } {
  const { t } = useTranslation();

  return {
    title: t(`apiErrors.kind.${error.kind}.title`),
    description: t(`apiErrors.kind.${error.kind}.description`),
  };
}
