import { Collapsible, DescriptionList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { FrontmatterProperty } from './frontmatter';

/**
 * Read-only "Properties" block above a previewed document: the leading YAML block as a collapsed
 * key/value list. It assigns no meaning to the keys and offers no editing.
 */
export function DocumentProperties({
  properties,
  label,
}: {
  properties: readonly FrontmatterProperty[];
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      // The block stands for the file's first lines: the scroll anchor maps it to source line 1.
      data-source-line={1}
      data-document-properties=""
      className="mb-4 min-w-0 rounded-composite border border-border-default"
    >
      <Collapsible>
        <Collapsible.Trigger>
          <Typography as="span" variant="label-md">
            {label ?? t('documents.properties.label')}
          </Typography>
          <Typography as="span" variant="body-sm" className="ml-2 text-content-muted">
            {properties.length}
          </Typography>
        </Collapsible.Trigger>
        <Collapsible.Content className="px-3">
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
