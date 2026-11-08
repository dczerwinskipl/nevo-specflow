import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import type { UiRegistry } from '../../../app/ui-modules/registry';
import {
  specificationAttentionItems,
  type SpecificationAttentionEntry,
} from '../extensions/specificationAttentionItems';
import type { SpecificationWorkSectionContext } from '../extensions/specificationWorkSections';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { AttentionSection } from './sections/AttentionSection';
import type { SpecificationWorkspaceData } from '../read-model/model';

interface CollectedAttention {
  readonly items: readonly (SpecificationAttentionEntry & { readonly renderKey: string })[];
  /** Sources that are unavailable or failed; `error` is set when the contribution threw. */
  readonly failures: readonly { readonly sourceId: string; readonly error?: unknown }[];
}

/**
 * Every contributed Attention entry in priority order, and the sources that could not answer.
 * Pure apart from calling the contributions, so a host can also ask whether Attention shows.
 */
export function collectSpecificationAttention(
  modules: UiRegistry,
  context: SpecificationWorkSectionContext,
): CollectedAttention {
  const failures: { sourceId: string; error?: unknown }[] = [];
  const contributed = modules.get(specificationAttentionItems).flatMap((source) => {
    try {
      const result = source.getItems(context);
      if ('state' in result) {
        if (result.state === 'unavailable') {
          failures.push({ sourceId: source.id });
        }

        return [];
      }

      const seen = new Set<string>();

      return result.map((entry) => {
        // An Attention id is unique within its contribution, not globally.
        // Treat a source's invalid IDs as a visible failure; never drop entries silently.
        if (!entry.item.id || seen.has(entry.item.id)) {
          throw new Error(`Duplicate or empty Attention id in ${source.id}: ${entry.item.id}`);
        }

        seen.add(entry.item.id);

        return {
          ...entry,
          renderKey: JSON.stringify([source.id, entry.item.id]),
        };
      });
    } catch (error) {
      // Never pretend that an unavailable domain source has no Attention.
      failures.push({ sourceId: source.id, error });

      return [];
    }
  });
  const order = { critical: 0, high: 1, normal: 2 } as const;
  const items = contributed.sort(
    (a, b) => order[a.item.priority ?? 'normal'] - order[b.item.priority ?? 'normal'],
  );

  return { items, failures };
}

/** Whether the Attention region renders anything for this Specification. */
export function hasSpecificationAttention(
  modules: UiRegistry,
  context: SpecificationWorkSectionContext,
): boolean {
  const { items, failures } = collectSpecificationAttention(modules, context);

  return items.length > 0 || failures.length > 0;
}

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
  const { t } = useTranslation();
  const { items, failures } = collectSpecificationAttention(modules, { specId, data, actions });
  for (const failure of failures) {
    if (failure.error !== undefined) {
      console.error(
        `Specification Attention contribution failed: ${failure.sourceId}`,
        failure.error,
      );
    }
  }

  if (!items.length && !failures.length) {
    return null;
  }

  return (
    <div className="pt-3 pb-4 @min-[40rem]/work:pb-5">
      {items.length > 0 ? <AttentionSection items={items} /> : null}
      {failures.length > 0 ? (
        <Alert role="alert" tone="attention" title={t('specification.attentionSourceFailedTitle')}>
          {t('specification.attentionSourceFailedDescription')}
        </Alert>
      ) : null}
    </div>
  );
}
