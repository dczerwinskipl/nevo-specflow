import { Collapsible, DescriptionList, Typography, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { FrontmatterProperty } from './frontmatter';

/**
 * Read-only "Properties" block above a previewed document: the leading YAML block as a collapsed
 * key/value list. It assigns no meaning to the keys and offers no editing.
 */
export function DocumentProperties({
  properties,
  label,
  anchored = true,
  variant = 'box',
}: {
  properties: readonly FrontmatterProperty[];
  label?: string;
  /** False in a column beside the text: it must not stand for line 1 of the scroll anchor. */
  anchored?: boolean;
  /**
   * `box` is the framed block of the column; `row` is a plain line in the flow of the text (chevron,
   * name and count, a thin rule under it), with no frame holding empty space.
   */
  variant?: 'box' | 'row';
}) {
  const { t } = useTranslation();
  return (
    <div
      // The block stands for the file's first lines: the scroll anchor maps it to source line 1.
      data-source-line={anchored ? 1 : undefined}
      data-document-properties=""
      className={cn(
        'min-w-0',
        variant === 'box'
          ? 'mb-4 rounded-composite border border-border-default'
          : 'mb-2 border-b border-border-subtle',
      )}
    >
      <Collapsible>
        <Collapsible.Trigger
          className={variant === 'row' ? 'min-h-11! rounded-none px-0' : undefined}
        >
          <Typography as="span" variant="label-md">
            {label ?? t('documents.properties.label')}
          </Typography>
          <Typography as="span" variant="body-sm" className="ml-2 text-content-muted">
            {properties.length}
          </Typography>
        </Collapsible.Trigger>
        <Collapsible.Content className={variant === 'row' ? 'px-0' : 'px-3'}>
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
