import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { StoryLocalization } from '../../i18n/StoryLocalization';
import {
  PairDeviceScreenView,
  type PairDeviceScreenViewProps,
  type UnpairedStatus,
} from './PairDeviceScreen';
import { FIREFOX_MAC, SAFARI_IPHONE } from './pairing.stories-support';

const console_: UnpairedStatus = {
  kind: 'device',
  present: false,
  anyDevicePaired: false,
  initialCode: 'console',
};

/** The requesting browser follows the frame: a phone below 600 px, a laptop above. */
const phone = () => typeof window !== 'undefined' && window.innerWidth < 600;
const requester = () =>
  phone()
    ? { userAgent: SAFARI_IPHONE, address: '100.101.7.12' }
    : { userAgent: FIREFOX_MAC, address: '192.168.1.20' };

const noop = () => undefined;
const base: PairDeviceScreenViewProps = {
  status: console_,
  code: { kind: 'valid', code: 'K7QFM2XD', remainingSeconds: 108 },
  thisDevice: requester(),
  initial: { value: '', pending: false, blockedSeconds: 0 },
  onNewCode: noop,
  onInitialChange: noop,
  onInitialSubmit: noop,
  onContinue: noop,
};

const meta = {
  title: 'SpecFlow/Screens/Pair this device',
  component: PairDeviceScreenView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StoryLocalization>
        <Story />
      </StoryLocalization>
    ),
  ],
  args: base,
} satisfies Meta<typeof PairDeviceScreenView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The browser's own code, where it asked from, and how to approve it on a paired device. */
export const PairThisDevice: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('K7QF-M2XD')).toBeVisible();
    await expect(canvas.getByText('Valid for 1:48 · works once')).toBeVisible();
    await expect(canvas.getByText('Approve it from a paired device')).toBeVisible();
    await expect(canvas.getByLabelText('Code from SpecFlow')).toBeVisible();
  },
};

export const CodeExpired: Story = {
  args: { code: { kind: 'expired', code: 'K7QFM2XD', lost: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/This code expired/u)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'New code' })).toBeEnabled();
  },
};

export const FirstCodeWrong: Story = {
  args: {
    initial: {
      value: 'H3TR-9PLQ',
      pending: false,
      failure: { kind: 'invalid' },
      blockedSeconds: 0,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/This code is not valid\. It may be mistyped/u)).toBeVisible();
  },
};

export const TooManyTries: Story = {
  args: {
    code: { kind: 'failed', failure: { kind: 'rate-limited' }, blockedSeconds: 240 },
    initial: {
      value: '',
      pending: false,
      failure: { kind: 'rate-limited' },
      blockedSeconds: 240,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Code from SpecFlow')).toBeDisabled();
    await expect(canvas.getByText('Too many tries. You can try again in 4 minutes.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'New code' })).toBeDisabled();
  },
};

/** No device is paired and SpecFlow has no window: the page never says where the code file is. */
export const PairFirstDeviceHeadless: Story = {
  args: { status: { ...console_, initialCode: 'file' }, code: { kind: 'loading' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Pair the first device')).toBeVisible();
    await expect(canvas.getByText(/Until a device is paired, no agent starts/u)).toBeVisible();
    await expect(canvasElement.textContent).not.toMatch(/initial-pairing-code|auth[\\/]/u);
  },
};

export const PairedAfterApproval: Story = {
  args: { paired: { userAgent: requester().userAgent, how: 'approval' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Continue to SpecFlow' })).toBeVisible();
  },
};

export const PairedByQrCode: Story = {
  args: { paired: { userAgent: requester().userAgent, how: 'qr' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Paired with a QR code from a paired device/u)).toBeVisible();
  },
};
