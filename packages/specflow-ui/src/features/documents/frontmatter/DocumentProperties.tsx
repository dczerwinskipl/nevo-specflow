import { Collapsible, Typography } from '@nevo/ui';
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
          <dl className="m-0 grid min-w-0 grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-2 [&>dd]:m-0 [&>dt]:max-w-48">
            {properties.map(({ key, value }) => (
              <PropertyRow key={key} name={key} value={value} />
            ))}
          </dl>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
}

function PropertyRow({ name, value }: { name: string; value: string }) {
  return (
    <>
      <Typography
        as="dt"
        variant="body-sm"
        className="min-w-0 text-content-muted [overflow-wrap:anywhere]"
      >
        {name}
      </Typography>
      <Typography
        as="dd"
        variant="body-sm"
        className="min-w-0 whitespace-pre-wrap text-content-primary [overflow-wrap:anywhere]"
      >
        {value === '' ? '—' : value}
      </Typography>
    </>
  );
}
