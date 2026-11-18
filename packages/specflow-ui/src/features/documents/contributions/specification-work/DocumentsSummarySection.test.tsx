// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEC,
  fakeTaskAuthoringApi,
  renderWithAuthoring,
} from '../../../tasks/authoring/authoring.test-support';
import type { DocumentItem } from '../../../specs/read-model';
import { DocumentsSummarySection } from './DocumentsSummarySection';

afterEach(cleanup);

const doc = (id: string, contentState: DocumentItem['contentState']): DocumentItem => ({
  id,
  title: id,
  kind: id,
  filename: `${id}.md`,
  ...(contentState ? { contentState } : {}),
});

const projection = (relations: WorkflowActionProjection['documentRelations'] = []) =>
  ({ documentRelations: relations }) as WorkflowActionProjection;

function renderSection(
  documents: readonly DocumentItem[],
  specificationActions: () => Promise<WorkflowActionProjection>,
) {
  renderWithAuthoring(
    <DocumentsSummarySection
      specId={SPEC}
      documents={documents}
      onOpenDocument={() => undefined}
      onOpenDocumentsView={() => undefined}
    />,
    fakeTaskAuthoringApi({ specificationActions: vi.fn(specificationActions) }),
  );
}

describe('DocumentsSummarySection document state', () => {
  it('says the shared content label once in the header, after the projection answered', async () => {
    renderSection([doc('overview', 'baseline'), doc('ux', 'baseline')], () =>
      Promise.resolve(projection()),
    );
    expect(await screen.findByText('2 · initial content only')).toBeTruthy();
    expect(screen.queryByText('Initial content only')).toBeNull();
  });

  it('shows no label while the projection loads (nothing flips when it arrives)', () => {
    renderSection(
      [doc('overview', 'baseline'), doc('ux', 'baseline')],
      () => new Promise<never>(() => undefined),
    );
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText(/initial content/i)).toBeNull();
  });

  it("names the relation of this Specification's documents beside their content state", async () => {
    renderSection(
      [doc('overview', 'authored'), doc('behaviour', 'baseline'), doc('ux', 'baseline')],
      () =>
        Promise.resolve(
          projection([
            {
              scope: { kind: 'specification', specId: SPEC },
              documentId: 'behaviour',
              relation: 'needed-to-finish',
              blocksNow: true,
              step: { id: 'specification', title: 'Write the specification', active: true },
              gate: {
                id: 'g',
                label: 'behaviour.md has an Acceptance section',
                labelDeclared: true,
                documentType: 'behaviour',
                requiredSections: ['Acceptance'],
              },
            },
            // Another registry's document of the same id is not this row's.
            {
              scope: { kind: 'task', specId: SPEC, taskId: 't-1' },
              documentId: 'ux',
              relation: 'used',
              blocksNow: false,
              step: { id: 'implement', title: 'Implement', active: true },
              gate: {
                id: 'h',
                label: 'ux.md exists',
                labelDeclared: true,
                documentType: 'ux',
                requiredSections: [],
              },
            },
          ]),
        ),
    );
    expect(
      await screen.findByText('Initial content only · needed to finish this step'),
    ).toBeTruthy();
    expect(screen.getByText('Initial content only')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('keeps the content state when the projection cannot be read', async () => {
    renderSection([doc('overview', 'authored'), doc('ux', 'baseline')], () =>
      Promise.reject(new Error('down')),
    );
    expect(await screen.findByText('Initial content only')).toBeTruthy();
  });
});
