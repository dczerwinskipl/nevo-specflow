import { createMemoryHistory } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSpecFlowRouter } from '../app/router';
import { createSpecFlowAppServices, SpecFlowServicesProvider, useSpecFlowServices } from './index';

describe('SpecFlow application services composition', () => {
  it('fails explicitly without a provider instead of using production services', () => {
    function Consumer() {
      useSpecFlowServices();
      return null;
    }

    expect(() => renderToStaticMarkup(<Consumer />)).toThrow(
      'useSpecFlowServices must be used within SpecFlowServicesProvider',
    );
  });

  it('passes the exact same stable services instance to connected components', () => {
    const services = createSpecFlowAppServices();
    function Consumer() {
      return <span>{useSpecFlowServices() === services ? 'same' : 'different'}</span>;
    }

    expect(
      renderToStaticMarkup(
        <SpecFlowServicesProvider services={services}>
          <Consumer />
        </SpecFlowServicesProvider>,
      ),
    ).toContain('same');
  });

  it('Router context and React provider share an explicitly injected services instance', () => {
    const services = createSpecFlowAppServices();
    const router = createSpecFlowRouter(
      createMemoryHistory({ initialEntries: ['/login'] }),
      services,
    );

    function Consumer() {
      const fromReact = useSpecFlowServices();
      return <span>{router.options.context.services === fromReact ? 'same' : 'different'}</span>;
    }

    const markup = renderToStaticMarkup(
      <SpecFlowServicesProvider services={services}>
        <Consumer />
      </SpecFlowServicesProvider>,
    );

    expect(markup).toContain('same');
    expect(router.options.context.auth).toBe(services.authStore);
    expect(router.options.context.specs).toBe(services.specsOverviewApi);
  });
});
