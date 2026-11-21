// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appI18n } from '../../i18n';
import { PairDeviceScreen, type UnpairedStatus } from './PairDeviceScreen';
import { fakePairingApi, FIREFOX_MAC, never, refusal } from './pairing.stories-support';

const console_: UnpairedStatus = {
  kind: 'device',
  present: false,
  anyDevicePaired: false,
  initialCode: 'console',
};
const headless: UnpairedStatus = { ...console_, initialCode: 'file' };

beforeEach(async () => {
  await appI18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Pair this device', () => {
  it('shows this browser its code, where it asked from and how to approve it', async () => {
    render(<PairDeviceScreen api={fakePairingApi()} status={console_} onContinue={vi.fn()} />);
    await settle();

    expect(screen.getByText('K7QF-M2XD')).toBeTruthy();
    expect(screen.getByText(/Valid for \d:\d\d · works once/u)).toBeTruthy();
    expect(screen.getByText(/This device: Firefox on macOS · from 192\.168\.1\.20/u)).toBeTruthy();
    expect(screen.getByText('Approve it from a paired device')).toBeTruthy();
    expect(screen.getByLabelText('Code from SpecFlow')).toBeTruthy();
  });

  it('asks for one code only, however often it renders', async () => {
    const requestPairing = vi.fn(() => fakePairingApi().requestPairing());
    render(
      <PairDeviceScreen
        api={fakePairingApi({ requestPairing })}
        status={console_}
        onContinue={vi.fn()}
      />,
    );
    await settle();

    expect(requestPairing).toHaveBeenCalledTimes(1);
  });

  it('strikes the code through when it expired and offers a new one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requestPairing = vi.fn(() => fakePairingApi().requestPairing());
    render(
      <PairDeviceScreen
        api={fakePairingApi({ requestPairing })}
        status={console_}
        onContinue={vi.fn()}
      />,
    );
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60_000);
    });

    expect(screen.getByText(/This code expired\. Codes work once/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New code' }));
    await settle();
    expect(requestPairing).toHaveBeenCalledTimes(2);
  });

  it('says when a new code can be asked for after too many requests', async () => {
    const api = fakePairingApi({
      requestPairing: () => Promise.reject(refusal(429, 'rate_limited', { 'retry-after': '240' })),
    });
    render(<PairDeviceScreen api={api} status={console_} onContinue={vi.fn()} />);
    await settle();

    expect(screen.getByText(/You can ask for a new one in 4 minutes/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New code' }).hasAttribute('disabled')).toBe(true);
  });

  it('explains a wrong, used or replaced first code at the field', async () => {
    const api = fakePairingApi({
      redeem: () => Promise.reject(refusal(404, 'pairing_secret_invalid')),
    });
    render(<PairDeviceScreen api={api} status={console_} onContinue={vi.fn()} />);
    await settle();
    fireEvent.change(screen.getByLabelText('Code from SpecFlow'), {
      target: { value: 'H3TR-9PLQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pair this device' }));
    await settle();

    expect(
      screen.getByText(/This code is not valid\. It may be mistyped, used already, or replaced/u),
    ).toBeTruthy();
  });

  it('disables the field after too many tries and says for how long', async () => {
    const api = fakePairingApi({
      redeem: () => Promise.reject(refusal(429, 'rate_limited', { 'retry-after': '240' })),
    });
    render(<PairDeviceScreen api={api} status={console_} onContinue={vi.fn()} />);
    await settle();
    fireEvent.change(screen.getByLabelText('Code from SpecFlow'), {
      target: { value: 'ABCD2345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pair this device' }));
    await settle();

    expect(screen.getByText('Too many tries. You can try again in 4 minutes.')).toBeTruthy();
    expect(screen.getByLabelText('Code from SpecFlow').hasAttribute('disabled')).toBe(true);
  });

  it('leads with the first device on a headless SpecFlow, asks for no code and never names a path', async () => {
    const requestPairing = vi.fn(() => fakePairingApi().requestPairing());
    render(
      <PairDeviceScreen
        api={fakePairingApi({ requestPairing })}
        status={headless}
        onContinue={vi.fn()}
      />,
    );
    await settle();

    expect(screen.getByText('Pair the first device')).toBeTruthy();
    expect(screen.getByText(/Until a device is paired, no agent starts\./u)).toBeTruthy();
    expect(requestPairing).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/initial-pairing-code|[\\/]auth[\\/]/u);
  });

  it('is paired once a paired device approved its code, and continues', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onContinue = vi.fn();
    const api = fakePairingApi({
      getRequest: () =>
        Promise.resolve({
          id: 'r1',
          status: 'approved',
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
          origin: { address: '192.168.1.20' },
        }),
    });
    render(<PairDeviceScreen api={api} status={console_} onContinue={onContinue} />);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(screen.getByText('This device is paired')).toBeTruthy();
    expect(screen.getByText('Firefox on macOS · paired just now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to SpecFlow' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('is paired by a QR token from the address, and falls back to its own code when it is spent', async () => {
    const qrApi = fakePairingApi({
      redeem: (request) =>
        request.kind === 'qr-token'
          ? Promise.resolve({
              device: {
                id: 'd9',
                label: FIREFOX_MAC,
                pairedAt: '2026-11-20T10:00:00.000Z',
                pairedWith: 'qr-token',
                origin: { address: '10.0.0.2' },
                current: true,
              },
            })
          : never(),
    });
    render(<PairDeviceScreen api={qrApi} status={console_} qrToken="abc" onContinue={vi.fn()} />);
    await settle();
    expect(screen.getByText(/Paired with a QR code from a paired device/u)).toBeTruthy();
    cleanup();

    const spent = fakePairingApi({
      redeem: () => Promise.reject(refusal(404, 'pairing_secret_invalid')),
    });
    render(<PairDeviceScreen api={spent} status={console_} qrToken="abc" onContinue={vi.fn()} />);
    await settle();
    expect(screen.getByText(/This QR code is no longer valid/u)).toBeTruthy();
    expect(screen.getByText('K7QF-M2XD')).toBeTruthy();
  });
});
