import { RouterContextProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, type ComponentType } from 'react';
import { expect, fn, userEvent } from 'storybook/test';

import { ApiError } from '../../api';
import { withLocale } from '../../i18n/StoryLocalization';
import { createSpecFlowRouter } from '../router';
import { FeatureUnavailable } from './FeatureUnavailable';
import { NotFoundView } from './NotFoundView';
import { RouteErrorView } from './RouteErrorView';

/** The views navigate, so they sit in a router like in the application. */
function withRouter(Story: ComponentType) {
  function RouterDecorator() {
    const router = useMemo(
      () => createSpecFlowRouter(createMemoryHistory({ initialEntries: ['/'] })),
      [],
    );

    return (
      <RouterContextProvider router={router}>
        <Story />
      </RouterContextProvider>
    );
  }

  return <RouterDecorator />;
}

type ErrorView =
  | 'notFound'
  | 'routeError'
  | 'routeApiError'
  | 'featureUnavailablePage'
  | 'featureUnavailablePanel';

/** One surface that shows the chosen view, so the Default can switch between them. */
function ErrorViewPreview({ view }: { view: ErrorView }) {
  switch (view) {
    case 'notFound':
      return <NotFoundView />;
    case 'routeError':
      return <RouteErrorView error={new TypeError('secret detail')} reset={fn()} />;
    case 'routeApiError':
      return (
        <RouteErrorView
          error={
            new ApiError({
              kind: 'forbidden',
              operation: 'specs.workspace',
              outcome: 'not-applied',
              retryable: false,
              code: 'forbidden',
            })
          }
        />
      );
    case 'featureUnavailablePage':
      return (
        <div className="p-6">
          <FeatureUnavailable onBack={fn()} />
        </div>
      );
    case 'featureUnavailablePanel':
      return (
        <div className="p-6">
          <FeatureUnavailable />
        </div>
      );
  }
}

const meta = {
  decorators: [withRouter, withLocale('pl')],
  title: 'SpecFlow/Screens/Error Views',
  component: ErrorViewPreview,
  args: { view: 'notFound' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ErrorViewPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  argTypes: {
    view: {
      control: 'select',
      options: [
        'notFound',
        'routeError',
        'routeApiError',
        'featureUnavailablePage',
        'featureUnavailablePanel',
      ],
    },
  },
};

/** An address that leads nowhere: the only action is the way back to the specifications. */
export const NotFound: Story = {
  tags: ['contract'],
  render: () => <NotFoundView />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Nie znaleziono strony' }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Wróć do specyfikacji' })).toBeInTheDocument();
  },
};

/** A defect: the generic screen with a retry and the way back; its technical text is never shown. */
export const RouteError: Story = {
  tags: ['contract'],
  render: () => <RouteErrorView error={new TypeError('secret detail')} reset={fn()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toBeInTheDocument();
    await expect(canvas.queryByText(/secret detail/)).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument();
  },
};

/** A classified API failure reads like any other: the copy of its kind, never the operation name. */
export const RouteApiError: Story = {
  tags: ['contract'],
  render: () => (
    <RouteErrorView
      error={
        new ApiError({
          kind: 'forbidden',
          operation: 'specs.workspace',
          outcome: 'not-applied',
          retryable: false,
          code: 'forbidden',
        })
      }
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/specs\.workspace/)).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Spróbuj ponownie' }),
    ).not.toBeInTheDocument();
  },
};

/** A feature the server does not provide, as a full page: a calm state with a way out (never a dead end). */
export const FeatureUnavailablePage: Story = {
  tags: ['contract'],
  args: {},
  render: () => {
    const onBack = fn();

    return (
      <div className="p-6" data-testid="feature-unavailable">
        <FeatureUnavailable onBack={onBack} />
      </div>
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Niedostępne na tym serwerze')).toBeInTheDocument();
    const back = canvas.getByRole('button', { name: 'Wróć' });
    await userEvent.click(back);
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/** The same state as a panel inside a page that keeps its own navigation: no action. */
export const FeatureUnavailablePanel: Story = {
  tags: ['contract'],
  render: () => (
    <div className="p-6">
      <FeatureUnavailable />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Niedostępne na tym serwerze')).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
