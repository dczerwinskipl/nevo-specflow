import { importIR, inspectIR } from './commands';
import type { ImporterRequest } from '../messages';
import type { ResourceCatalogDefinition } from '@nevo/figma-core/authoring';

const UI_WIDTH = 560;
export function startFigmaImporter(resourceCatalogs: readonly ResourceCatalogDefinition[]) {
  figma.showUI(__html__, { width: UI_WIDTH, height: 380, themeColors: true });
  figma.skipInvisibleInstanceChildren = false;

  figma.ui.onmessage = (message: ImporterRequest) => {
    void handleImporterMessage(message, resourceCatalogs);
  };
}

async function handleImporterMessage(
  message: ImporterRequest,
  resourceCatalogs: readonly ResourceCatalogDefinition[],
) {
  if (message.type === 'RESIZE_UI') {
    const height = Number((message as { height?: unknown }).height);
    if (Number.isFinite(height)) figma.ui.resize(UI_WIDTH, Math.min(720, Math.max(340, height)));
    return;
  }
  try {
    if (message.type === 'INSPECT_IR') {
      const inspection = await inspectIR(message.ir, resourceCatalogs);
      figma.ui.postMessage({ type: 'INSPECTION', requestId: message.requestId, inspection });
      return;
    }
    const result =
      message.type === 'IMPORT_IR'
        ? await importIR(message.ir, resourceCatalogs, (progress) =>
            figma.ui.postMessage({ type: 'PROGRESS', ...progress }),
          )
        : undefined;
    if (!result) return;
    figma.ui.postMessage({ type: 'DONE', message: result });
    figma.notify(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const inspection = message.type === 'INSPECT_IR';
    figma.ui.postMessage({
      type: inspection ? 'INSPECTION_ERROR' : 'ERROR',
      requestId: message.type === 'INSPECT_IR' ? message.requestId : undefined,
      message: detail,
    });
    if (!inspection) figma.notify(`Import failed: ${detail}`, { error: true });
  }
}
