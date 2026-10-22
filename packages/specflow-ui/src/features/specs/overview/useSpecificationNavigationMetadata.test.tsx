import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { projectSpecificationNavigation } from './useSpecificationNavigationMetadata';

const data = createSpecificationWorkspaceFixture('no-git', 's');

describe('Specification navigation source', () => {
  it('is idle without a matched Specification', () => {
    expect(projectSpecificationNavigation(null, { data, error: null, status: 'success' })).toEqual({
      status: 'idle',
    });
  });

  it('reports loading (never a failure) while the Workspace read has not settled', () => {
    expect(
      projectSpecificationNavigation('s', { data: undefined, error: null, status: 'pending' }),
    ).toEqual({ status: 'loading' });
  });

  it('reports a failure only for a real failed request without a snapshot', () => {
    expect(
      projectSpecificationNavigation('s', {
        data: undefined,
        error: new HttpClientError('Unavailable', { kind: 'http', status: 503 }),
        status: 'error',
      }),
    ).toEqual({ status: 'failed' });
  });

  it('projects title, key, document count and Git capability from the Workspace snapshot', () => {
    const projected = projectSpecificationNavigation('s', {
      data: { ...data, key: 'UI-1234' },
      error: null,
      status: 'success',
    });
    expect(projected).toEqual({
      status: 'available',
      metadata: {
        title: data.title,
        key: 'UI-1234',
        documentCount: data.documents.length,
        hasGit: false,
        stale: false,
      },
    });
  });

  it('does not present unavailable document metadata as an authoritative zero', () => {
    const projected = projectSpecificationNavigation('s', {
      data: {
        ...data,
        documents: [],
        hasGit: undefined,
        sectionAvailability: { ...data.sectionAvailability, documents: 'unavailable' },
      },
      error: null,
      status: 'success',
    });
    expect(projected.metadata).toMatchObject({ documentCount: undefined, hasGit: undefined });
  });

  it.each([401, 403, 404])('does not expose retained metadata after HTTP %i', (status) => {
    expect(
      projectSpecificationNavigation('s', {
        data,
        error: new HttpClientError('Denied', { kind: 'http', status }),
        status: 'error',
      }),
    ).toEqual({ status: 'denied' });
    expect(
      projectSpecificationNavigation('s', {
        data,
        error: Object.assign(new Error('Denied by injected API'), { status }),
        status: 'error',
      }),
    ).toEqual({ status: 'denied' });
  });

  it('retains the last snapshot as stale during a transient refresh failure', () => {
    expect(
      projectSpecificationNavigation('s', {
        data,
        error: new HttpClientError('Temporarily unavailable', { kind: 'http', status: 503 }),
        status: 'error',
      }).metadata,
    ).toMatchObject({ title: data.title, stale: true });
  });
});
