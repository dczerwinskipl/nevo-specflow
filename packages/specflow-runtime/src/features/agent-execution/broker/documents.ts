import { resolveSpecificationForRead, type SpecFlowEngine } from '@nevo/specflow-engine';

import {
  createEngineDocumentWriteSource,
  createEngineTaskDocumentSource,
  type EngineDocumentWriteOptions,
} from '../../documents';
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
  // A Task subject's documents: the Task-document use case, as the same owned execution.
  const taskSource = (owned: Parameters<BrokerDocuments['save']>[3]) =>
    createEngineTaskDocumentSource(engine, { write: { ...options.write, ownedExecution: owned } });

  return {
    async workspaceOf(specId) {
      try {
        const specification = await resolveSpecificationForRead(engine, specId);

        return specification.status === 'available' ? specification.workspaceRoot : undefined;
      } catch {
        return undefined;
      }
    },
    create: (specId, input, owned, taskId) =>
      taskId === undefined
        ? source(owned).create(specId, input)
        : taskSource(owned).create(specId, taskId, input),
    save: (specId, documentId, input, owned, taskId) =>
      taskId === undefined
        ? source(owned).save(specId, documentId, input)
        : taskSource(owned).save(specId, taskId, documentId, input),
    operate: (specId, input, owned, taskId) =>
      taskId === undefined
        ? source(owned).operate(specId, input)
        : taskSource(owned).operate(specId, taskId, input),
  };
}
