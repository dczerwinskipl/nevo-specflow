import type { AuthLoginMethods } from '@nevo/specflow-contracts/authentication';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import type { Meta, StoryObj } from '@storybook/react-vite';

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
