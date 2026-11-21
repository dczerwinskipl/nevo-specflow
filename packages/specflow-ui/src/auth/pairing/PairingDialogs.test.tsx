// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appI18n } from '../../i18n';
import { PairDeviceDialog } from './PairDeviceDialog';
import { PairedDevicesDialog } from './PairedDevicesDialog';
import { PairingCodeWaitingAlert } from './PairingCodeWaitingAlert';
import { fakePairingApi, pairedDevices, patternQr, refusal } from './pairing.stories-support';
import { readDeviceName } from './deviceName';

beforeEach(async () => {
  await appI18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText('Code shown on the other device'), {
    target: { value },
  });
}

describe('Pair a device', () => {
  it('shows who asked and when, with the honest caveats, and approves only after the second step', async () => {
    const api = fakePairingApi();
    const approve = vi.spyOn(api, 'approve');
    const lookup = vi.spyOn(api, 'lookup');
    render(<PairDeviceDialog api={api} open onOpenChange={vi.fn()} />);

    typeCode('K7QF-M');
    await settle();
    expect(lookup).not.toHaveBeenCalled();
    typeCode('k7qf-m2xd');
    await settle();

    expect(lookup).toHaveBeenCalledWith('K7QFM2XD');
    expect(screen.getByText('Safari on iPhone')).toBeTruthy();
    expect(screen.getByText(/From 100\.101\.7\.12 · asked now/u)).toBeTruthy();
    expect(screen.getByText(/same for every program on this computer/u)).toBeTruthy();
    expect(screen.getByText(/browser name can be faked/u)).toBeTruthy();
    expect(screen.getByText(/Approve only a code you see on a device you hold/u)).toBeTruthy();
    expect(approve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pair Safari on iPhone' }));
    await settle();
    expect(approve).toHaveBeenCalledWith('lookup-token');
    expect(screen.getByText('Safari on iPhone is paired')).toBeTruthy();
  });

  it('explains a code that matches no request at the field and keeps Pair disabled', async () => {
    const api = fakePairingApi({
      lookup: () => Promise.reject(refusal(404, 'pairing_code_invalid')),
    });
    render(<PairDeviceDialog api={api} open onOpenChange={vi.fn()} />);
    typeCode('AAAAAAAA');
    await settle();

    expect(screen.getByText(/This code is not valid or has expired/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pair a device' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('reports a code that expired between the lookup and the approval', async () => {
    const api = fakePairingApi({
      approve: () => Promise.reject(refusal(404, 'pairing_lookup_invalid')),
    });
    render(<PairDeviceDialog api={api} open onOpenChange={vi.fn()} />);
    typeCode('K7QFM2XD');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Pair Safari on iPhone' }));
    await settle();

    expect(
      screen.getByText(/This code expired\. On the other device, choose New code/u),
    ).toBeTruthy();
  });

  it('says when SpecFlow refused the request for the page it came from', async () => {
    const api = fakePairingApi({
      lookup: () => Promise.reject(refusal(403, 'owner_request_refused')),
    });
    render(<PairDeviceDialog api={api} open onOpenChange={vi.fn()} />);
    typeCode('K7QFM2XD');
    await settle();

    expect(screen.getByRole('alert').textContent).toMatch(
      /not opened from SpecFlow's own address/u,
    );
  });

  it('clears the waiting requests', async () => {
    const api = fakePairingApi();
    const clear = vi.spyOn(api, 'clearPendingRequests');
    render(<PairDeviceDialog api={api} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear waiting requests' }));
    await settle();

    expect(clear).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Waiting requests cleared.');
  });

  it('shows a one-time QR code for a phone, and says when this page is only reachable locally', async () => {
    const api = fakePairingApi();
    render(
      <PairDeviceDialog
        api={api}
        open
        onOpenChange={vi.fn()}
        encodeQr={patternQr}
        origin="http://localhost:4318"
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Show QR code' }));
    await settle();

    expect(screen.getByRole('img', { name: 'QR code for pairing a phone' })).toBeTruthy();
    expect(screen.getByText(/It works once, for \d:\d\d more/u)).toBeTruthy();
    expect(screen.getByText(/localhost, an address only this computer can reach/u)).toBeTruthy();
  });

  it('says plainly when no QR code can be drawn', async () => {
    render(<PairDeviceDialog api={fakePairingApi()} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Show QR code' }));
    await settle();

    expect(screen.getByText(/cannot be shown in this version/u)).toBeTruthy();
  });
});

describe('Paired devices', () => {
  it('lists the devices with Revoke each and marks this one', async () => {
    render(
      <PairedDevicesDialog
        api={fakePairingApi()}
        open
        onOpenChange={vi.fn()}
        onPairDevice={vi.fn()}
        onThisDeviceRevoked={vi.fn()}
      />,
    );
    await settle();

    expect(screen.getByText('Chrome on Windows')).toBeTruthy();
    expect(screen.getByText('Safari on iPhone')).toBeTruthy();
    expect(screen.getByText('This device')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Revoke: / })).toHaveLength(3);
  });

  it('revokes another device after a confirmation that names it', async () => {
    const api = fakePairingApi();
    const revoke = vi.spyOn(api, 'revokeDevice');
    render(
      <PairedDevicesDialog
        api={api}
        open
        onOpenChange={vi.fn()}
        onPairDevice={vi.fn()}
        onThisDeviceRevoked={vi.fn()}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke: Safari on iPhone' }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Revoke Safari on iPhone?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    await settle();

    expect(revoke).toHaveBeenCalledWith('d2');
  });

  it('revokes this device and tells the page it is unpaired now', async () => {
    const onThisDeviceRevoked = vi.fn();
    render(
      <PairedDevicesDialog
        api={fakePairingApi()}
        open
        onOpenChange={vi.fn()}
        onPairDevice={vi.fn()}
        onThisDeviceRevoked={onThisDeviceRevoked}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke: Chrome on Windows' }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Revoke this device?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke this device' }));
    await settle();

    expect(onThisDeviceRevoked).toHaveBeenCalled();
  });

  it('warns what revoking the last device means', async () => {
    const api = fakePairingApi({
      listDevices: () => Promise.resolve({ devices: pairedDevices().slice(0, 1) }),
    });
    render(
      <PairedDevicesDialog
        api={api}
        open
        onOpenChange={vi.fn()}
        onPairDevice={vi.fn()}
        onThisDeviceRevoked={vi.fn()}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /^Revoke: / }));
    const confirm = screen.getByRole('alertdialog');

    expect(within(confirm).getByText('Revoke the last paired device?')).toBeTruthy();
    expect(within(confirm).getByText(/restart it with --pair/u)).toBeTruthy();
  });
});

describe('Pairing code waiting', () => {
  it('cancels the waiting code and lets the caller go on', async () => {
    const api = fakePairingApi();
    const cancel = vi.spyOn(api, 'cancelInitialCode');
    const onCancelled = vi.fn();
    render(<PairingCodeWaitingAlert api={api} onCancelled={onCancelled} onCheckAgain={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the pairing code' }));
    await settle();

    expect(cancel).toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalled();
  });

  it('reports a code file that could not be deleted and keeps the alert for Check again', async () => {
    const api = fakePairingApi({
      cancelInitialCode: () => Promise.resolve({ cancelled: true, fileRemoved: false }),
    });
    const onCancelled = vi.fn();
    render(<PairingCodeWaitingAlert api={api} onCancelled={onCancelled} onCheckAgain={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the pairing code' }));
    await settle();

    expect(onCancelled).not.toHaveBeenCalled();
    expect(screen.getByText(/its file could not be deleted/u)).toBeTruthy();
  });
});

describe('device names', () => {
  it('reads the browser and system a person recognises', () => {
    expect(readDeviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36')).toMatchObject({
      browser: 'Chrome',
      system: 'Windows',
      handheld: false,
    });
    expect(readDeviceName('(iPhone) Version/18 Mobile Safari/604.1')).toMatchObject({
      browser: 'Safari',
      handheld: true,
    });
    expect(readDeviceName(undefined)).toEqual({ handheld: false });
  });
});
