import type { ComponentCaptureIR } from '@nevo/figma-core/ir';
import type { IRInspection, InspectionItemKind } from '../../messages';
import { element } from './dom';

export function uniqueCaptures(captures: readonly ComponentCaptureIR[] = []) {
  return [...new Map(captures.map((item) => [item.stableId, item])).values()];
}

export function inspectionItem(
  stableId: string | undefined,
  inspection: IRInspection | null,
  kind: InspectionItemKind = 'component',
) {
  return stableId && inspection
    ? inspection.items.find((item) => item.stableId === stableId && item.kind === kind)
    : undefined;
}

export function actionBadge(action: 'new' | 'update' | 'delete' | 'missing') {
  return element('span', action, `availability ${action}`);
}



