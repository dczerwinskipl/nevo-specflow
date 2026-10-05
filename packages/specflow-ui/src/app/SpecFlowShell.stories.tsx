import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';

import type { AppLocale } from '../i18n';
import { StoryLocalization } from '../i18n/StoryLocalization';

import type { AuthApi } from '../auth/api';
import { createAuthStore } from '../auth/store';
import { createSpecFlowRouter } from './router';

type AuthMode =
  'local' | 'required' | 'authenticated' | 'authenticated-refresh-failure' | 'unavailable';

function RoutedApplication({
  authMode = 'local',
  locale = 'en',
  path = '/',
}: {
  authMode?: AuthMode;
  locale?: AppLocale;
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
  return (
    <StoryLocalization locale={locale}>
      <RouterProvider router={router} />
    </StoryLocalization>
  );
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
export const Polish: Story = { args: { locale: 'pl' } };
export const LocalAccount: Story = {
  args: { authMode: 'local' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Open user menu for Local User' }),
    );
    const accountMenu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"][aria-label="User menu"]'),
      'Local account menu should open.',
    );
    if (accountMenu.textContent?.includes('Sign out')) {
      throw new Error('Trusted local mode must not expose a meaningless sign-out action.');
    }
    await userEvent.keyboard('{Escape}');
  },
};

export const AuthenticatedAccount: Story = {
  args: { authMode: 'authenticated' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open user menu for Demo' }));
    const accountMenu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"][aria-label="User menu"]'),
      'Authenticated account menu should open.',
    );
    if (!accountMenu.textContent?.includes('Sign out')) {
      throw new Error('Authenticated account menu should expose sign out.');
    }
    if (accountMenu.querySelectorAll('[role="menuitemradio"]').length !== 2) {
      throw new Error('Account menu should expose both language choices as radio items.');
    }
    await userEvent.keyboard('{Escape}');
  },
};

export const LogoutSuccess: Story = {
  args: { authMode: 'authenticated' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open user menu for Demo' }));
    const signOut = await waitFor(
      () =>
        [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
          item.textContent?.includes('Sign out'),
        ) ?? null,
      'Authenticated account menu should expose sign out.',
    );
    await userEvent.click(signOut);
    await canvas.findByRole('heading', { name: 'Welcome back' });
  },
};

export const LogoutRefreshFailure: Story = {
  args: { authMode: 'authenticated-refresh-failure' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open user menu for Demo' }));
    const signOut = await waitFor(
      () =>
        [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
          item.textContent?.includes('Sign out'),
        ) ?? null,
      'Authenticated account menu should expose sign out.',
    );
    await userEvent.click(signOut);
    await canvas.findByRole('heading', { name: 'Unable to connect' });
  },
};

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
    const accountTrigger = await waitFor(
      () =>
        [...canvasElement.ownerDocument.querySelectorAll<HTMLButtonElement>('button')].find(
          (button) => button.getAttribute('aria-label') === 'Open user menu for Local User',
        ) ?? null,
      'Compact navigation should keep the account footer mounted.',
    );
    if (!accountTrigger) throw new Error('Compact navigation account footer is missing.');

    const playgroundLink = [...navigation.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
      link.textContent?.includes('UI Playground'),
    );
    if (!playgroundLink) throw new Error('Compact navigation should expose UI Playground.');
    await userEvent.click(playgroundLink);
    await waitFor(
      () =>
        canvasElement.ownerDocument.querySelector(
          '.drawer-panel[data-side="left"][data-state="open"]',
        ) === null,
      'Selecting a route should close compact navigation.',
    );
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
  play: async ({ canvasElement }) => {
    await waitFor(
      () => canvasElement.querySelector<HTMLElement>('[data-design-layer="account-trigger"]'),
      'Application shell capture should include the account trigger design layer.',
    );
  },
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
      ? loginRequiredSession
      : mode === 'authenticated' || mode === 'authenticated-refresh-failure'
        ? authenticatedSession
        : localSession;

  return createAuthStore(
    fakeApi(
      mode === 'authenticated-refresh-failure'
        ? { getSession: () => Promise.reject(new Error('Runtime unavailable after logout')) }
        : undefined,
    ),
    session,
  );
}

const loginRequiredSession: AuthSessionResponse = {
  authenticationRequired: true,
  authenticated: false,
  loginMethods: {
    password: { enabled: true },
    oidc: [{ id: 'company', name: 'Company SSO' }],
  },
};

const authenticatedSession: AuthSessionResponse = {
  authenticationRequired: true,
  authenticated: true,
  user: { id: 'demo', name: 'Demo' },
  authenticatedWith: { kind: 'password' },
  loginMethods: { password: { enabled: true }, oidc: [] },
};

const localSession: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local-user', name: 'Local User' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    getSession: () => Promise.resolve(loginRequiredSession),
    loginWithPassword: () => Promise.reject(new Error('not configured')),
    startOidc: () => Promise.reject(new Error('not configured')),
    logout: () => Promise.resolve(),
    ...overrides,
  };
}
