import { describe, expect, it } from 'vitest';
import { createSpecFlowAppServices } from '../../services';
import { documentsApiFor, documentsApiKind } from './useDocumentsApi';

describe('documents adapter selection', () => {
  it('serves a project Runtime with the project adapter and the demo Runtime with the demo one', () => {
    const services = createSpecFlowAppServices();
    expect(documentsApiKind('project')).toBe('project');
    expect(documentsApiKind('demo')).toBe('demo');
    expect(documentsApiFor(services, 'project')).toBe(services.projectDocumentsApi);
    expect(documentsApiFor(services, 'demo')).toBe(services.demoDocumentsApi);
    expect(services.projectDocumentsApi).not.toBe(services.demoDocumentsApi);
  });

  it('never picks the project adapter before the mode is known', () => {
    // The workspace does not render then (`DocumentsLayout`); a bare harness gets the demo one.
    expect(documentsApiKind('loading')).toBe('demo');
    expect(documentsApiKind('unavailable')).toBe('demo');
  });
});
