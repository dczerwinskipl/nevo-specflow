import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import { specificationAttentionItems } from '../extensions/specificationAttentionItems';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { AttentionSection } from './sections/AttentionSection';
import type { SpecificationWorkspaceData } from './model';

/** Specification hosts the slot; domain modules supply data, actions and priority. */
export function SpecificationAttentionOutlet({
  specId,
  data,
}: {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
}) {
  const modules = useUiModules();
  const actions = useWorkspaceRuntime();
  const context = { specId, data, actions };
  const { t } = useTranslation();
  const failedSources: string[] = [];
  const contributed = modules.get(specificationAttentionItems).flatMap((source) => {
    try {
      return source.getItems(context);
    } catch (error) {
      // Never pretend that an unavailable domain source has no Attention.
      failedSources.push(source.id);
      console.error(`Specification Attention contribution failed: ${source.id}`, error);
      return [];
    }
  });
  const seen = new Set<string>();
  const order = { critical: 0, high: 1, normal: 2 } as const;
  const items = contributed
    .filter(({ item }) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => order[a.item.priority ?? 'normal'] - order[b.item.priority ?? 'normal']);
  if (!items.length && !failedSources.length) return null;
  return (
    <div className="py-6">
      {items.length > 0 ? <AttentionSection items={items} /> : null}
      {failedSources.length > 0 ? (
        <Alert role="alert" tone="attention" title={t('specification.attentionSourceFailedTitle')}>
          {t('specification.attentionSourceFailedDescription')}
        </Alert>
      ) : null}
    </div>
  );
}
