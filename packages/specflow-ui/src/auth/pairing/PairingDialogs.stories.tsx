import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { PairDeviceDialog } from './PairDeviceDialog';
import { PairedDevicesDialog } from './PairedDevicesDialog';
import { PairingCodeWaitingAlert } from './PairingCodeWaitingAlert';
import { fakePairingApi, pairedDevices, patternQr, refusal } from './pairing.stories-support';

/*
 * The account menu's dialogs of a paired device, over the routed screen behind them. The API is a
 * fake; the screens are the real ones.
 */

function Behind({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <WorkflowExecutionFixture scenario="waiting" />
      <StoryLocalization>{children}</StoryLocalization>
    </>
  );
}

function PairDevice({
  api = fakePairingApi(),
  qr = false,
}: {
  readonly api?: ReturnType<typeof fakePairingApi>;
  readonly qr?: boolean;
}) {
  return (
    <Behind>
      <PairDeviceDialog
        api={api}
        open
        onOpenChange={() => undefined}
        encodeQr={qr ? patternQr : undefined}
      />
    </Behind>
  );
}

function PairedDevices({ onlyOne = false }: { readonly onlyOne?: boolean }) {
  const [open, setOpen] = useState(true);
  const api = fakePairingApi({
    listDevices: () =>
      Promise.resolve({ devices: onlyOne ? pairedDevices().slice(0, 1) : pairedDevices() }),
  });

  return (
    <Behind>
      <PairedDevicesDialog
        api={api}
        open={open}
        onOpenChange={setOpen}
        onPairDevice={() => undefined}
        onThisDeviceRevoked={() => undefined}
      />
    </Behind>
  );
}

const meta = {
  title: 'SpecFlow/Screens/Paired devices',
  component: PairDevice,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PairDevice>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);

/** A paired device enters the code another browser shows and sees who asked, then approves. */
export const ApproveCode: Story = {
  play: async () => {
    const field = await body().findByLabelText('Code shown on the other device');
    await userEvent.type(field, 'K7QF-M2XD');
    await expect(await body().findByText('Safari on iPhone')).toBeVisible();
    await expect(body().getByText(/same for every program on this computer/u)).toBeVisible();
    await expect(body().getByRole('button', { name: 'Pair Safari on iPhone' })).toBeEnabled();
  },
};

export const ApproveExpiredCode: Story = {
  render: () => (
    <PairDevice
      api={fakePairingApi({
        lookup: () =>
          Promise.resolve({
            lookup: 'lookup-token',
            id: 'r1',
            origin: { address: '100.101.7.12' },
            requestedAt: new Date(Date.now() - 180_000).toISOString(),
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          }),
      })}
    />
  ),
  play: async () => {
    const field = await body().findByLabelText('Code shown on the other device');
    await userEvent.type(field, 'K7QFM2XD');
    await expect(await body().findByText(/This code expired/u)).toBeVisible();
    await expect(body().getByRole('button', { name: 'Pair a device' })).toBeDisabled();
  },
};

export const RequestRefusedForThisPage: Story = {
  render: () => (
    <PairDevice
      api={fakePairingApi({
        lookup: () => Promise.reject(refusal(403, 'owner_request_refused')),
      })}
    />
  ),
  play: async () => {
    const field = await body().findByLabelText('Code shown on the other device');
    await userEvent.type(field, 'K7QFM2XD');
    await expect(await body().findByText(/not opened from SpecFlow's own address/u)).toBeVisible();
  },
};

export const ShowQrCode: Story = {
  render: () => <PairDevice qr />,
  play: async () => {
    await userEvent.click(await body().findByRole('radio', { name: 'Show QR code' }));
    await expect(
      await body().findByRole('img', { name: 'QR code for pairing a phone' }),
    ).toBeVisible();
  },
};

export const PairedDevicesList: Story = {
  render: () => <PairedDevices />,
  play: async () => {
    await expect(await body().findByText('Safari on iPhone')).toBeVisible();
    await expect(body().getByText('This device')).toBeVisible();
    await expect(body().getAllByRole('button', { name: /^Revoke: / })).toHaveLength(3);
  },
};

export const RevokeDevice: Story = {
  render: () => <PairedDevices />,
  play: async () => {
    await userEvent.click(await body().findByRole('button', { name: 'Revoke: Safari on iPhone' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeVisible());
    await expect(screen.getByText('Revoke Safari on iPhone?')).toBeVisible();
  },
};

export const RevokeThisDevice: Story = {
  render: () => <PairedDevices />,
  play: async () => {
    await userEvent.click(await body().findByRole('button', { name: 'Revoke: Chrome on Windows' }));
    await expect(await screen.findByText('Revoke this device?')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Revoke this device' })).toBeVisible();
  },
};

export const RevokeLastDevice: Story = {
  render: () => <PairedDevices onlyOne />,
  play: async () => {
    await userEvent.click(await body().findByRole('button', { name: /^Revoke: / }));
    await expect(await screen.findByText('Revoke the last paired device?')).toBeVisible();
    await expect(screen.getByText(/restart it with --pair/u)).toBeVisible();
  },
};

/** Where Session start is offered and the headless code waits: the remedies live in the alert. */
export const PairingCodeWaiting: Story = {
  render: () => (
    <StoryLocalization>
      <div className="max-w-xl p-6">
        <PairingCodeWaitingAlert
          api={fakePairingApi()}
          onCancelled={() => undefined}
          onCheckAgain={() => undefined}
        />
      </div>
    </StoryLocalization>
  ),
  play: async () => {
    await expect(
      await body().findByRole('button', { name: 'Cancel the pairing code' }),
    ).toBeVisible();
    await expect(body().getByRole('button', { name: 'Check again' })).toBeVisible();
  },
};
