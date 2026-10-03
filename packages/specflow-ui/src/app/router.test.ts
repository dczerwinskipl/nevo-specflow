import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { createSpecFlowRouter } from './router';

describe('SpecFlow router', () => {
  it('boots directly into the UI playground route', async () => {
    const router = createSpecFlowRouter(
      createMemoryHistory({ initialEntries: ['/ui-playground'] }),
    );

    await router.load();

    expect(router.state.location.pathname).toBe('/ui-playground');
    expect(router.state.matches.at(-1)?.routeId).toBe('/ui-playground');
  });
});
