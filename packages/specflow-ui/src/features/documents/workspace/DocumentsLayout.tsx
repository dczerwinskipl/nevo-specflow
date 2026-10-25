import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { runtimeKeys, useRuntimeMode } from '../../../app/useRuntimeMode';
import { DocumentsWorkspace } from './DocumentsWorkspace';

/**
 * Layout of `documents` and `documents/$documentId`: it owns the whole Documents workspace
 * (explorer, open-document state, editor provider) in every Runtime mode, so moving between the
 * list and a document, or between documents, only changes `documentId`: nothing unmounts and no
 * state is lost. The mode only selects the documents adapter (`useDocumentsApi`).
 */
export function DocumentsLayout() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { specId, documentId } = useParams({
    strict: false,
    select: (params) => ({ specId: params.specId, documentId: params.documentId }),
  });
  const mode = useRuntimeMode();
  // Nothing renders (and fetches) before Runtime info settles: the mode picks the adapter.
  if (mode === 'loading' || !specId) return null;
  if (mode === 'unavailable')
    return (
      <div className="p-6">
        <Alert
          tone="attention"
          title={t('auth.runtimeUnavailable.title')}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: runtimeKeys.info })}
            >
              {t('common.retry')}
            </Button>
          }
        >
          <p>{t('auth.runtimeUnavailable.description')}</p>
        </Alert>
      </div>
    );
  // A spec switch is a new workspace: the key drops the previous spec's tree state.
  return <DocumentsWorkspace key={specId} specId={specId} documentId={documentId} />;
}
