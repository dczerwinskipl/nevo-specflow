import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';

import type { AuthApi } from '../auth/api';
import { createAuthStore } from '../auth/store';
import { createSpecFlowRouter } from './router';

type AuthMode = 'local' | 'required' | 'authenticated' | 'unavailable';

function RoutedApplication({
  authMode = 'local',
  path = '/',
}: {
  authMode?: AuthMode;
  path?: '/' | '/ui-playground' | '/login';
}) {
  const router = useMemo(
    () =>
      createSpecFlowRouter(
        createMemoryHistory({ initialEntries: [path] }),
        storyAuthStore(authMode),
      ),
    [authMode, path],
  );
  return <RouterProvider router={router} />;
}

const meta = {
  title: 'SpecFlow/Screens/Application Shell',
  component: RoutedApplication,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RoutedApplication>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};
export const Playground: Story = { args: { path: '/ui-playground' } };
export const AuthenticationRequired: Story = { args: { authMode: 'required' } };
export const AlreadyAuthenticatedLogin: Story = {
  args: { authMode: 'authenticated', path: '/login' },
};
export const RuntimeUnavailable: Story = { args: { authMode: 'unavailable' } };

export const Navigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'UI Playground' }));
    await canvas.findByText(
      'A neutral product-owned surface for checking Nevo UI composition inside the real app.',
    );
  },
};

export const MobileNavigation: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open navigation' }));
    const navigation = await waitFor(
      () =>
        canvasElement.ownerDocument.querySelector<HTMLElement>(
          'nav[aria-label="Product navigation"]',
        ),
      'Opening compact navigation should mount the product navigation.',
    );
    if (!navigation?.textContent?.includes('UI Playground')) {
      throw new Error('Opening compact navigation should expose the product links.');
    }
  },
};

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

export const FigmaCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['SpecFlowApplicationShell']}>
      <RoutedApplication />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'SpecFlowApplicationShell',
      title: 'Nevo SpecFlow — Application shell',
      description: 'Initial desktop application shell with Home selected',
      kind: 'screen',
      order: 200,
    },
  },
};

function storyAuthStore(mode: AuthMode) {
  if (mode === 'unavailable') {
    return createAuthStore(
      fakeApi({ getSession: () => Promise.reject(new Error('Runtime unavailable')) }),
    );
  }

  const session: AuthSessionResponse =
    mode === 'required'
      ? {
          authenticationRequired: true,
          authenticated: false,
          loginMethods: {
            password: { enabled: true },
            oidc: [{ id: 'company', name: 'Company SSO' }],
          },
        }
      : mode === 'authenticated'
        ? {
            authenticationRequired: true,
            authenticated: true,
            user: { id: 'demo', name: 'Demo' },
            authenticatedWith: { kind: 'password' },
            loginMethods: { password: { enabled: true }, oidc: [] },
          }
        : {
            authenticationRequired: false,
            authenticated: false,
            user: { id: 'local-user', name: 'Local User' },
            loginMethods: { password: { enabled: false }, oidc: [] },
          };

  return createAuthStore(fakeApi(), session);
}

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    getSession: () => Promise.reject(new Error('Story should use its initial session')),
    loginWithPassword: () => Promise.reject(new Error('not configured')),
    startOidc: () => Promise.reject(new Error('not configured')),
    logout: () => Promise.resolve(),
    ...overrides,
  };
}
