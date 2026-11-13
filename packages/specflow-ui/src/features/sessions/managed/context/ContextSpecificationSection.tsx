import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { ContextDocumentationRow } from './ContextDocumentationRow';
import { ContextKey, ContextNavigationRow } from './ContextNavigationRow';
import { ContextNote, ContextSection, ContextSkeletonRows } from './ContextSectionFrame';
import { isRequired, isSectionPresent, resolveSection } from './sessionContextAvailability';
import type { ContextSpecification, SessionContextViewModel } from './sessionContextTypes';

/**
 * The Specification this Session is associated with: its identity row, and under it (same list)
 * the Documents row that opens that Specification's Documents. Present for Specification- and
 * Task-scoped Sessions only; required there, so a Specification that cannot be found is an error
 * note, not silence; one the user may not view is an info note without a Documents row. While
 * loading, the skeleton covers both rows (the Documents row only exists once the Specification is
 * ready), so the section keeps its height when the data arrives.
 */
export function ContextSpecificationSection({
  value,
  onOpenSpecification,
  onOpenDocuments,
  onOpenDocumentation,
}: {
  value: SessionContextViewModel;
  onOpenSpecification?: (specification: ContextSpecification) => void;
  onOpenDocuments?: (specification: ContextSpecification) => void;
  /** The project documentation of the Session's workspace: a row under Documents. */
  onOpenDocumentation?: () => void;
}) {
  const { t } = useTranslation();
  if (!isSectionPresent('specification', value.scope)) {
    return null;
  }

  const resolved = resolveSection(value.specification, isRequired('specification', value.scope));
  if (resolved.kind === 'omit') {
    return null;
  }

  // Without a wired handler a ready row would look clickable and do nothing: show no rows.
  if (resolved.kind === 'ready' && !onOpenSpecification) {
    return null;
  }

  return (
    <ContextSection
      title={t('sessions.context.specification.sectionTitle')}
      busy={resolved.kind === 'skeleton'}
    >
      {resolved.kind === 'skeleton' && (
        <ContextSkeletonRows rows={onOpenDocuments ? ['identity', 'navigation'] : ['identity']} />
      )}
      {resolved.kind === 'ready' && onOpenSpecification && (
        <InformationList>
          <ContextNavigationRow
            icon="workflow"
            emphasis="identity"
            label={resolved.value.title}
            secondary={
              <>
                <ContextKey>{resolved.value.key}</ContextKey>
                {resolved.value.collection === 'archived' && (
                  <span className="block">{t('sessions.context.specification.archived')}</span>
                )}
              </>
            }
            onClick={() => onOpenSpecification(resolved.value)}
          />
          {onOpenDocuments && (
            <ContextNavigationRow
              icon="file"
              label={t('sessions.context.specification.documents')}
              onClick={() => onOpenDocuments(resolved.value)}
            />
          )}
          {onOpenDocumentation && <ContextDocumentationRow onOpen={onOpenDocumentation} />}
        </InformationList>
      )}
      {resolved.kind === 'info' && (
        <ContextNote kind="info">
          {t('sessions.context.availability.specificationForbidden')}
        </ContextNote>
      )}
      {resolved.kind === 'warning' && (
        <ContextNote kind="warning">
          {t('sessions.context.availability.specificationUnreadable')}
        </ContextNote>
      )}
      {resolved.kind === 'error' && (
        <ContextNote kind="error">
          {resolved.ref?.key
            ? t('sessions.context.availability.specificationMissingNamed', {
                key: resolved.ref.key,
              })
            : t('sessions.context.availability.specificationMissing')}
        </ContextNote>
      )}
    </ContextSection>
  );
}
