import { useTranslation } from 'react-i18next';
import { Collapsible, Icon } from '@nevo/ui';
import type { WorkspaceDocsSkippedDocument } from '@nevo/specflow-contracts/docs';
import { SkippedDocumentList } from '../skipped/SkippedDocumentList';

/**
 * The documents the reader skips (invalid frontmatter, a duplicated id), said once and quietly
 * under the workspace picker in a collapsed disclosure. The all-skipped Alert keeps a single
 * file's full diagnostic visible.
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
      {placement === 'alert' && skipped.length === 1 ? (
        list
      ) : (
        <Collapsible className={placement === 'pane' ? '-ml-control-padding-compact' : undefined}>
          <Collapsible.Trigger className="px-0 text-status-attention">{line}</Collapsible.Trigger>
          <Collapsible.Content className="pl-control-padding-compact">{list}</Collapsible.Content>
        </Collapsible>
      )}
    </div>
  );
}
