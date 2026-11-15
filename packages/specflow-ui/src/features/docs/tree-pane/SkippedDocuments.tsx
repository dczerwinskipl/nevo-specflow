import { useTranslation } from 'react-i18next';
import { Collapsible, Icon } from '@nevo/ui';
import type { WorkspaceDocsSkippedDocument } from '@nevo/specflow-contracts/docs';
import { SkippedDocumentList } from '../skipped/SkippedDocumentList';

/**
 * The documents the reader skips (invalid frontmatter, a duplicated id), said once and quietly
 * under the workspace picker: one document with its path and error, several as a collapsed
 * disclosure listing each full path (wrapping) and its error. Under the Alert that every document
 * is skipped (`placement="alert"`) it is not inset again, and one document is listed without
 * repeating that it has errors.
 */
export function SkippedDocuments({
  skipped,
  docsRoot,
  placement = 'pane',
}: {
  skipped: readonly WorkspaceDocsSkippedDocument[];
  docsRoot: string;
  placement?: 'pane' | 'alert';
}) {
  const { t } = useTranslation();
  if (skipped.length === 0) {
    return null;
  }

  const list = <SkippedDocumentList skipped={skipped} docsRoot={docsRoot} />;
  const title =
    skipped.length === 1
      ? t('docs.skipped.one')
      : t('docs.skipped.many', { count: skipped.length });
  const line = (
    <span className="flex items-start gap-2 text-body-sm">
      <Icon name="triangle-alert" size="sm" className="mt-0.5 shrink-0" />
      {title}
    </span>
  );

  return (
    <div className={placement === 'pane' ? 'grid gap-2 px-2' : 'grid gap-2'} role="note">
      {skipped.length === 1 ? (
        <>
          {placement === 'pane' && <span className="text-status-attention">{line}</span>}
          {list}
        </>
      ) : (
        <Collapsible className={placement === 'pane' ? '-ml-control-padding-compact' : undefined}>
          <Collapsible.Trigger className="px-0 text-status-attention">{line}</Collapsible.Trigger>
          <Collapsible.Content className="pl-control-padding-compact">{list}</Collapsible.Content>
        </Collapsible>
      )}
    </div>
  );
}
