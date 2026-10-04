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

export const PasswordOnly: Story = { args: { loginMethods: passwordOnly } };
export const SingleOidc: Story = { args: { loginMethods: singleOidc } };
export const MultipleOidc: Story = { args: { loginMethods: multipleOidc } };
export const PasswordAndSingleOidc: Story = {
  args: { loginMethods: passwordAndSingleOidc },
};
export const PasswordAndOidc: Story = { args: { loginMethods: mixed } };

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
      root.dataset.authLayout === 'root',
      'Login Figma capture root must own the complete standalone auth surface.',
    );

    const content = root.querySelector<HTMLElement>('[data-design-slot="content"]');
    assert(content, 'Login Figma capture must expose its required content slot below the root.');
    assert(content !== root, 'Login Figma content slot must be a descendant of the capture root.');
    assert(
      content.dataset.authLayout === 'surface',
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
