import type { Meta, StoryObj } from '@storybook/react-vite';
import { PairingMock } from './PairingMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (D21 device pairing, docs/product/specflow/ui/device-pairing.md).
 * Static data; no Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Device pairing (mock)',
  component: PairingMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { state: 'unpaired' },
} satisfies Meta<typeof PairingMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/* The browser being paired */
export const PairThisDevice: Story = {};
export const PairThisDeviceCodeExpired: Story = { args: { state: 'unpaired-expired' } };
export const FirstCodeWrong: Story = { args: { state: 'unpaired-code-wrong' } };
export const TooManyTries: Story = { args: { state: 'unpaired-rate-limited' } };
export const PairFirstDeviceHeadless: Story = { args: { state: 'unpaired-headless' } };
export const PairedAfterApproval: Story = { args: { state: 'paired-success' } };
export const PairedByQrCode: Story = { args: { state: 'paired-by-qr' } };

/* A paired device */
export const ApproveCode: Story = { args: { state: 'approve-code' } };
export const ApproveExpiredCode: Story = { args: { state: 'approve-expired' } };
export const ShowQrCode: Story = { args: { state: 'approve-qr' } };
export const PairedDevices: Story = { args: { state: 'devices' } };
export const RevokeDevice: Story = { args: { state: 'devices-revoke' } };
export const RevokeThisDevice: Story = { args: { state: 'revoke-this-device' } };
export const RevokeLastDevice: Story = { args: { state: 'revoke-last-device' } };
