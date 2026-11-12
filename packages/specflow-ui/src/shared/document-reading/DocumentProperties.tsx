import { Collapsible, DescriptionList, Typography, hitAreaBlockClassName } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { FrontmatterProperty } from './frontmatter';

/**
 * Read-only "Properties" row above a previewed document: the leading YAML block as a collapsed
 * key/value list. It assigns no meaning to the keys and offers no editing.
 */
export function DocumentProperties({
  properties,
  label,
  anchored = true,
}: {
  properties: readonly FrontmatterProperty[];
  label?: string;
  /** False in a column beside the text: it must not stand for line 1 of the scroll anchor. */
  anchored?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      // The block stands for the file's first lines: the scroll anchor maps it to source line 1.
      data-source-line={anchored ? 1 : undefined}
      data-document-properties=""
      // A plain row with a thin rule, never a frame around empty space.
      className="mb-2 min-w-0 border-b border-border-subtle"
    >
      <Collapsible>
        <Collapsible.Trigger className={hitAreaBlockClassName}>
          <Typography as="span" variant="label-md">
            {label ?? t('documents.properties.label')}
          </Typography>
          <Typography as="span" variant="body-sm" className="ml-2 text-content-muted">
            {properties.length}
          </Typography>
        </Collapsible.Trigger>
        <Collapsible.Content className="px-0">
          <DescriptionList className="pb-2">
            {properties.map(({ key, value }) => (
              <DescriptionList.Item key={key}>
                <DescriptionList.Term>{key}</DescriptionList.Term>
                <DescriptionList.Detail className="whitespace-pre-wrap">
                  {value === '' ? '—' : value}
                </DescriptionList.Detail>
              </DescriptionList.Item>
            ))}
          </DescriptionList>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
}
