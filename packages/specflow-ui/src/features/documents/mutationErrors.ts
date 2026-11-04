import type { ActionReason } from '@nevo/specflow-contracts/documents';
import type { TFunction } from 'i18next';
import { isHttpClientError } from '@nevo/http-client';
import { translateMessage } from '../../i18n/message';
import { apiErrorCode } from '../../shared/http/apiErrorCode';
import { reasonFragment } from './catalogue/documentTypePolicy';

/** The `details` of a refusal's error body, when it has any. */
function refusalDetails(error: unknown): { reason?: ActionReason; cause?: string } | undefined {
  return isHttpClientError(error) && typeof error.data === 'object' && error.data !== null
    ? (error.data as { details?: { reason?: ActionReason; cause?: string } }).details
    : undefined;
}

/** The reason a write refusal carries, else the one its code implies. */
export function refusalReason(error: unknown, code: string | undefined): ActionReason {
  const details = refusalDetails(error);
  if (details?.reason) {
    return details.reason;
  }

  switch (code) {
    case 'SPEC_ARCHIVED':
      return 'archived';
    case 'COMMIT_BLOCKED':
      return 'commit-blocked';
    case 'GIT_POLICY_INVALID':
      return 'git-policy-invalid';
    default:
      return 'branch-protected';
  }
}

/** Maps a Runtime error code to the explanation shown to the reader; the server text is never shown. */
export function documentMutationError(error: unknown, t: TFunction): string {
  const code = apiErrorCode(error);
  switch (code) {
    case 'DOCUMENT_PATH_CONFLICT':
      return t('documents.tree.error.pathConflict');
    case 'DOCUMENT_PATH_INVALID':
      return t('documents.tree.error.pathInvalid');
    case 'DOCUMENT_REVISION_CONFLICT':
      return t('documents.tree.error.revisionConflict');
    case 'DOCUMENT_ALREADY_CLASSIFIED':
      return t('documents.tree.error.alreadyClassified');
    case 'DOCUMENT_PROTECTED':
      return translateMessage(t, reasonFragment('protected'));
    case 'DOCUMENT_OPERATION_CONFLICT':
      return t('documents.tree.error.requestConflict');
    case 'SPEC_MANIFEST_DIRTY':
      return t('documents.tree.error.manifestDirty');
    case 'SPEC_BUSY':
      return t('documents.tree.error.busy');
    // The definitions changed since the chooser was shown (the template's catalogue revision).
    case 'CATALOGUE_STALE':
    case 'ARCHETYPE_UNKNOWN':
      return t('documents.tree.error.catalogueStale');
    case 'DOCUMENT_RECOVERY_REQUIRED':
      return t('documents.tree.error.recovery');
    // A file system that ignores letter case (Windows) cannot rename `bb.md` to `Bb.md`; the
    // Runtime decides, the UI does not know the platform.
    case 'DOCUMENT_OPERATION_INVALID':
      return refusalDetails(error)?.cause === 'case-only-rename'
        ? t('documents.tree.error.caseOnlyRename')
        : t('documents.tree.error.default');
    // The document has a save running or one to resume: the operation waits for it.
    case 'document-save-running':
      return t('documents.tree.error.saveRunning');
    case 'document-save-to-resume':
      return t('documents.tree.error.saveToResume');
    case 'document-save-unconfirmed':
      return t('documents.tree.error.saveUnconfirmed');
    case 'BRANCH_PROTECTED':
    case 'COMMIT_BLOCKED':
    case 'GIT_POLICY_INVALID':
    case 'SPEC_ARCHIVED':
      return t('documents.tree.error.refused', {
        reason: translateMessage(t, reasonFragment(refusalReason(error, code))),
      });
    default:
      return t('documents.tree.error.default');
  }
}
