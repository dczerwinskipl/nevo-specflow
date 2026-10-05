import type { AuthLoginMethods } from '@nevo/specflow-contracts/authentication';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { StoryLocalization } from '../i18n/StoryLocalization';
import { LoginScreenView, loginErrorMessage } from './LoginScreen';

const passwordOnly: AuthLoginMethods = {
  password: { enabled: true },
  oidc: [],
};
const singleOidc: AuthLoginMethods = {
  password: { enabled: false },
  oidc: [{ id: 'company', name: 'Company SSO' }],
};
const multipleOidc: AuthLoginMethods = {
  password: { enabled: false },
  oidc: [
    { id: 'company', name: 'Company SSO' },
    { id: 'customer', name: 'Customer SSO' },
  ],
};
const passwordAndSingleOidc: AuthLoginMethods = {
  password: { enabled: true },
  oidc: [{ id: 'company', name: 'Company SSO' }],
};
const mixed: AuthLoginMethods = {
  password: { enabled: true },
  oidc: [
    { id: 'company', name: 'Company SSO' },
    { id: 'customer', name: 'Customer SSO' },
  ],
};

const meta = {
  title: 'SpecFlow/Screens/Login',
  component: LoginScreenView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StoryLocalization>
        <Story />
      </StoryLocalization>
    ),
  ],
  args: {
    loginMethods: mixed,
    onOidc: () => undefined,
    onPasswordChange: () => undefined,
    onPasswordSubmit: () => undefined,
    onUsernameChange: () => undefined,
  },
} satisfies Meta<typeof LoginScreenView>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertStandaloneAuthLayout(canvasElement: HTMLElement) {
  const mobileHeader = canvasElement.querySelector<HTMLElement>(
    '[data-standalone-shell-region="mobile-header"]',
  );
  const mobileSelector = mobileHeader?.querySelector<HTMLElement>(
    '[aria-label="Change language"]',
  );
  const surface = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="surface"]');
  const root = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="root"]');
  assert(
    mobileHeader && mobileSelector && surface && root,
    'Standalone auth layout regions must be present.',
  );

  const rootRect = root.getBoundingClientRect();
  const headerRect = mobileHeader.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  assert(
    Math.abs(headerRect.bottom - surfaceRect.top) <= 1,
    'Mobile auth workspace must begin directly below the standard header without an extra gap.',
  );
  assert(
    surfaceRect.bottom >= rootRect.bottom - 1,
    'Mobile auth workspace must fill the remaining viewport height.',
  );
  assert(
    mobileHeader.contains(mobileSelector),
    'Mobile language selection must belong to the mobile auth header.',
  );
  assert(
    root.scrollWidth <= root.clientWidth + 1,
    'Standalone auth layout must not introduce horizontal overflow on small screens.',
  );
  assert(
    root.scrollHeight <= root.clientHeight + 1,
    'Tall mobile login must keep scrolling inside the workspace instead of growing the viewport.',
  );
}

export const PasswordOnly: Story = { args: { loginMethods: passwordOnly } };
export const SingleOidc: Story = { args: { loginMethods: singleOidc } };
export const MultipleOidc: Story = { args: { loginMethods: multipleOidc } };
export const PasswordAndSingleOidc: Story = {
  args: { loginMethods: passwordAndSingleOidc },
};
export const PasswordAndOidc: Story = {
  args: { loginMethods: mixed },
  play: ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="surface"]');
    const desktopHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="desktop-header"]',
    );
    assert(surface && desktopHeader, 'Desktop standalone header must be present.');
    assert(
      surface.contains(desktopHeader),
      'Desktop standalone header must stay inside the centered auth surface.',
    );
    assert(
      desktopHeader.querySelector('[aria-label="Change language"]'),
      'Desktop standalone header must expose the product language action.',
    );
    const root = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="root"]');
    assert(root, 'Desktop auth root must be present.');

    const rootRect = root.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const centerDelta = Math.abs(
      surfaceRect.left + surfaceRect.width / 2 - (rootRect.left + rootRect.width / 2),
    );
    assert(
      surfaceRect.width <= 449,
      `Desktop auth surface should remain compact; received ${surfaceRect.width}px.`,
    );
    assert(centerDelta <= 2, 'Desktop auth surface must remain horizontally centered.');
  },
};

export const InvalidCredentials: Story = {
  args: {
    loginMethods: mixed,
    username: 'dominik',
    password: 'password',
    error: loginErrorMessage('invalid_credentials'),
  },
};

export const ProviderUnavailable: Story = {
  args: {
    loginMethods: singleOidc,
    error: loginErrorMessage('provider_unavailable'),
  },
};

export const SubmittingPassword: Story = {
  args: {
    loginMethods: mixed,
    username: 'dominik',
    password: 'password',
    pending: 'password',
  },
};

export const Polish: Story = {
  render: (args) => (
    <StoryLocalization locale="pl">
      <LoginScreenView {...args} />
    </StoryLocalization>
  ),
};

export const Mobile: Story = {
  args: { loginMethods: mixed },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: ({ canvasElement }) => {
    assertStandaloneAuthLayout(canvasElement);
    assert(
      canvasElement.querySelectorAll('button').length >= 4,
      'Small mobile login should render both OIDC actions, password submit, and locale control.',
    );
    assert(
      canvasElement.textContent?.includes('English'),
      'Standalone locale control should expose a visible language name instead of only a code.',
    );
  },
};

export const MobileLongOidcName: Story = {
  args: {
    loginMethods: {
      password: { enabled: false },
      oidc: [{ id: 'northwind', name: 'Northwind Workforce Identity SSO' }],
    },
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const MobileSimilarLongOidcNames: Story = {
  args: {
    loginMethods: {
      password: { enabled: false },
      oidc: [
        { id: 'northwind-eu', name: 'Northwind Workforce Identity EU' },
        { id: 'northwind-us', name: 'Northwind Workforce Identity US' },
      ],
    },
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const FigmaCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['SpecFlowLoginScreen']}>
      <LoginScreenView
        loginMethods={mixed}
        onOidc={() => undefined}
        onPasswordChange={() => undefined}
        onPasswordSubmit={() => undefined}
        onUsernameChange={() => undefined}
      />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  play: ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>(
      '[data-design-capture="true"][data-design-component="SpecFlowLoginScreen"]',
    );
    assert(root, 'Login Figma capture must expose a screen-level capture root.');
    assert(
      root.dataset.standaloneShellRegion === 'root',
      'Login Figma capture root must own the complete standalone auth surface.',
    );

    const content = root.querySelector<HTMLElement>('[data-design-slot="content"]');
    assert(content, 'Login Figma capture must expose its required content slot below the root.');
    assert(content !== root, 'Login Figma content slot must be a descendant of the capture root.');
    assert(
      content.dataset.standaloneShellRegion === 'surface',
      'Login Figma content slot must include the workspace material surface.',
    );
    assert(
      content.dataset.designComponent === undefined,
      'Login Figma content slot must remain structural instead of projecting WorkspaceSurface as an empty nested component.',
    );
  },
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'SpecFlowLoginScreen',
      title: 'Nevo SpecFlow — Login',
      description: 'Standalone mixed-method login screen',
      kind: 'screen',
      order: 210,
    },
  },
};
