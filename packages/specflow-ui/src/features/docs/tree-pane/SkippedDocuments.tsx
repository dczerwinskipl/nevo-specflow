import { useTranslation } from 'react-i18next';
import { Collapsible, Icon, Typography } from '@nevo/ui';
import type { WorkspaceDocsSkippedDocument } from '@nevo/specflow-contracts/docs';

/**
 * The documents the reader skips (invalid frontmatter, a duplicated id), said once and quietly
 * under the workspace picker: one document with its path and error, several as a collapsed
 * disclosure listing each full path (wrapping) and its error.
 */
export function SkippedDocuments({
  skipped,
  docsRoot,
}: {
  skipped: readonly WorkspaceDocsSkippedDocument[];
  docsRoot: string;
}) {
  const { t } = useTranslation();
  if (skipped.length === 0) {
    return null;
  }

  const list = (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {skipped.map((item) => (
        <li key={item.path} className="grid gap-0.5">
          <Typography as="code" variant="code-md" className="wrap-anywhere text-content-secondary">
            {`${docsRoot}/${item.path}`}
          </Typography>
          <Typography as="span" variant="body-sm" className="wrap-anywhere text-content-muted">
            {item.error}
          </Typography>
        </li>
      ))}
    </ul>
  );
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
    <div className="grid gap-2 px-2" role="note">
      {skipped.length === 1 ? (
        <>
          <span className="text-status-attention">{line}</span>
          {list}
        </>
      ) : (
        <Collapsible className="-ml-control-padding-compact">
          <Collapsible.Trigger className="px-0 text-status-attention">{line}</Collapsible.Trigger>
          <Collapsible.Content className="pl-control-padding-compact">{list}</Collapsible.Content>
        </Collapsible>
      )}
    </div>
  );
}
