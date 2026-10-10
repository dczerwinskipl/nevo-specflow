import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import {
  specificationAttentionItems,
  type SpecificationAttentionEntry,
} from '../extensions/specificationAttentionItems';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { AttentionSection } from './sections/AttentionSection';
import type { SpecificationWorkspaceData } from './model';

/** Specification owns the combined attention feed and its original Runtime ordering. */
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
  const contributed = modules.get(specificationAttentionItems).flatMap((source) => {
    try {
      return source.getItems(context);
    } catch (error) {
      // Preserve every Runtime request (via fallback) and other modules' entries.
      console.error(`Specification Attention contribution failed: ${source.id}`, error);
      return [];
    }
  });
  // An unavailable module must not silently hide a Runtime request for human attention.
  const claimedIds = new Set(contributed.map(({ item }) => item.id));
  const fallback: SpecificationAttentionEntry[] = data.attentionItems
    .filter((item) => !claimedIds.has(item.id))
    .map((item) => ({
      item,
      icon: item.kind === 'specification' ? 'file' : 'triangle-alert',
    }));
  const order = new Map(data.attentionItems.map((item, index) => [item.id, index]));
  const seen = new Set<string>();
  const items = [...contributed, ...fallback]
    .filter(({ item }) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(
      (a, b) =>
        (order.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.item.id) ?? Number.MAX_SAFE_INTEGER),
    );
  if (!items.length) return null;
  return (
    <div className="py-6">
      <AttentionSection items={items} />
    </div>
  );
}
