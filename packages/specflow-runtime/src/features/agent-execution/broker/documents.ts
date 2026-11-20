import { resolveSpecificationForRead, type SpecFlowEngine } from '@nevo/specflow-engine';

import { createEngineDocumentWriteSource, type EngineDocumentWriteOptions } from '../../documents';
import type { BrokerDocuments } from './dispatch';

/**
 * The broker's document writes: the Engine write source the document routes use, opened per call
 * with the Turn's owned execution (named here, in-process; never from the request).
 */
export function createEngineBrokerDocuments(
  engine: SpecFlowEngine,
  options: EngineDocumentWriteOptions = {},
): BrokerDocuments {
  const source = (owned: Parameters<BrokerDocuments['save']>[3]) =>
    createEngineDocumentWriteSource(engine, {
      ...options,
      write: { ...options.write, ownedExecution: owned },
    });

  return {
    async workspaceOf(specId) {
      try {
        const specification = await resolveSpecificationForRead(engine, specId);

        return specification.status === 'available' ? specification.workspaceRoot : undefined;
      } catch {
        return undefined;
      }
    },
    create: (specId, input, owned) => source(owned).create(specId, input),
    save: (specId, documentId, input, owned) => source(owned).save(specId, documentId, input),
    operate: (specId, input, owned) => source(owned).operate(specId, input),
  };
}
