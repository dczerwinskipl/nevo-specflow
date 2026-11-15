import { describe, expect, it } from 'vitest';

import { documentTypeKind } from '../specs/definitions/kinds/document-type';
import { specificationArchetypeKind } from '../specs/definitions/kinds/specification-archetype';
import { agentArchetypeKind, taskTypeKind, workflowKind } from '../workflow/definitions/kinds';
import { TASK_TYPE_KIND, WORKFLOW_KIND } from '../workflow/definitions/model';
import { createDefaultDefinitionRegistry } from './shipped-registry';

describe('the shipped definition kinds', () => {
  it('registers every kind the product ships', () => {
    const kinds = createDefaultDefinitionRegistry()
      .loadOrder()
      .map((kind) => kind.kind);

    expect(kinds).toEqual(
      expect.arrayContaining(
        [
          documentTypeKind,
          specificationArchetypeKind,
          agentArchetypeKind,
          workflowKind,
          taskTypeKind,
        ].map((kind) => kind.kind),
      ),
    );
  });

  it('lets the archetype kind depend on the workflow kinds by their registered ids', () => {
    expect(specificationArchetypeKind.dependsOn).toEqual(
      expect.arrayContaining([WORKFLOW_KIND, TASK_TYPE_KIND]),
    );
    expect(workflowKind.kind).toBe(WORKFLOW_KIND);
    expect(taskTypeKind.kind).toBe(TASK_TYPE_KIND);
  });
});
