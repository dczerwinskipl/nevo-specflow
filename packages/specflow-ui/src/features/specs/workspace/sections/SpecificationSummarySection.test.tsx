// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appI18n } from '../../../../i18n';
import { createWorkspaceIntegrationApi } from '../../../../../test-support/specs/workspace/api';
import { mapWorkspaceResponse } from '../../read-model/mapWorkspaceResponse';
import { SpecificationSummarySection } from './SpecificationSummarySection';

// The document body's own query belongs to Documents; here only the expand target matters.
vi.mock('../../../documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../documents')>()),
  DocumentContent: ({ documentId }: { documentId: string }) => (
    <div data-testid="expanded-document">{documentId}</div>
  ),
}));

const documents = [
  { id: 'behaviour', title: 'Behaviour', kind: 'behaviour' },
  { id: 'overview', title: 'Overview', kind: 'overview' },
  { id: 'backend', title: 'Backend', kind: 'backend' },
];

async function summaryOf(overviewDocumentId: string | undefined, summary = 'From the overview…') {
  const dto = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
  const data = mapWorkspaceResponse({
    ...dto,
    specification: { ...dto.specification, summary },
    sections: {
      ...dto.sections,
      documents: {
        state: 'available',
        data: { items: documents, ...(overviewDocumentId ? { overviewDocumentId } : {}) },
      },
    },
  });
  render(
    <SpecificationSummarySection
      title={data.title}
      intro={data.intro}
      overviewDocumentId={data.overviewDocumentId}
      specId={data.id}
    />,
  );
}

describe('Specification summary expand target', () => {
  beforeAll(async () => {
    await appI18n.changeLanguage('en');
    // jsdom has no scrolling element; the expand remembers the scroll position there.
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      value: document.documentElement,
    });
  });
  afterEach(cleanup);

  it('opens the overview even when another document is listed first', async () => {
    await summaryOf('overview');

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByTestId('expanded-document').textContent).toBe('overview');
  });

  it('offers no expand action without an overview, never a substitute document', async () => {
    await summaryOf(undefined);

    expect(screen.getByText('From the overview…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(screen.queryByTestId('expanded-document')).toBeNull();
  });

  it('offers no Show more under a description the Runtime did not cut', async () => {
    await summaryOf('overview', 'Source: GitHub issue #156.');

    expect(screen.getByText('Source: GitHub issue #156.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('offers Show description without a goal only when the overview holds more than its template', () => {
    const summary = (overviewInitialOnly: boolean) => (
      <SpecificationSummarySection
        title="SSO sign-in"
        specId="sso"
        overviewDocumentId="overview"
        overviewInitialOnly={overviewInitialOnly}
      />
    );
    const view = render(summary(true));
    expect(screen.queryByRole('button', { name: 'Show description' })).toBeNull();

    view.rerender(summary(false));
    expect(screen.getByRole('button', { name: 'Show description' })).toBeTruthy();
  });
});

describe('Specification page identity', () => {
  beforeAll(async () => {
    await appI18n.changeLanguage('en');
  });
  afterEach(cleanup);

  it('says under the title that the page is a Specification, with its key when it has one', () => {
    const { rerender } = render(
      <SpecificationSummarySection title="Converge the APIs" specificationKey="nevo-2" />,
    );
    const kind = () => document.querySelector('[data-page-kind]')?.textContent;

    expect(screen.getByRole('heading', { level: 1, name: 'Converge the APIs' })).toBeTruthy();
    expect(kind()).toBe('Specification · nevo-2');

    rerender(<SpecificationSummarySection title="Converge the APIs" />);
    expect(kind()).toBe('Specification');
  });
});
