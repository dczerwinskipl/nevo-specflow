import { createMemoryHistory, RouterContextProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api';
import { appI18n } from '../../i18n';
import { createSpecFlowRouter } from '../router';
import { FeatureUnavailable } from './FeatureUnavailable';
import { NotFoundView } from './NotFoundView';
import { RouteErrorView } from './RouteErrorView';

function inRouter(node: React.ReactNode) {
  const router = createSpecFlowRouter(createMemoryHistory({ initialEntries: ['/'] }));
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>{node}</RouterContextProvider>,
  );
}

describe('error views', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('en');
  });

  it('FeatureUnavailable says the feature is not served, without retry or error tone', () => {
    const html = renderToStaticMarkup(<FeatureUnavailable />);
    expect(html).toContain('Not available on this server');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Retry');
  });

  it('FeatureUnavailable is translated', async () => {
    await appI18n.changeLanguage('pl');
    expect(renderToStaticMarkup(<FeatureUnavailable />)).toContain('Niedostępne na tym serwerze');
  });

  it('RouteErrorView shows the copy of an ApiError kind and never its technical message', () => {
    const error = new ApiError({
      kind: 'forbidden',
      operation: 'specs.workspace',
      outcome: 'not-applied',
      retryable: false,
      code: 'forbidden',
    });
    const html = inRouter(<RouteErrorView error={error} reset={() => undefined} />);
    expect(html).toContain('No permission');
    expect(html).toContain('Try again');
    expect(html).not.toContain('specs.workspace');
  });

  it('RouteErrorView shows a generic screen for a defect without leaking its text', () => {
    const html = inRouter(<RouteErrorView error={new TypeError('secret detail')} />);
    expect(html).toContain('Something went wrong');
    expect(html).not.toContain('secret detail');
    expect(html).not.toContain('Try again');
  });

  it('NotFoundView offers the way back to the specifications', () => {
    const html = inRouter(<NotFoundView />);
    expect(html).toContain('Page not found');
    expect(html).toContain('Back to specifications');
  });
});
