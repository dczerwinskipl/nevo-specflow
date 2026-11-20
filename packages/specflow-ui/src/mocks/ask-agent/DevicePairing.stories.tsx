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

export const PairThisDevice: Story = {};
export const PairThisDeviceCodeExpired: Story = { args: { state: 'unpaired-expired' } };
export const PairFirstDeviceHeadless: Story = { args: { state: 'unpaired-headless' } };
export const ApproveCode: Story = { args: { state: 'approve-code' } };
export const ShowQrCode: Story = { args: { state: 'approve-qr' } };
export const PairedDevices: Story = { args: { state: 'devices' } };
export const RevokeDevice: Story = { args: { state: 'devices-revoke' } };
