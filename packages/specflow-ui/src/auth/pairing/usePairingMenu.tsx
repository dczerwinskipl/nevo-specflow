import { useEffect, useState, type ReactNode } from 'react';

import { useAppServices } from '../../app/useAppServices';
import type { DevicePairingApi } from './api';
import { PairDeviceDialog } from './PairDeviceDialog';
import { PairedDevicesDialog } from './PairedDevicesDialog';

export interface PairingMenuActions {
  readonly onPairDevice: () => void;
  readonly onPairedDevices: () => void;
}

/** Whether this browser is a paired device (the account menu offers pairing to those only). */
export function usePairedDevice(api: DevicePairingApi): boolean {
  const [paired, setPaired] = useState(false);
  useEffect(() => {
    let current = true;
    api.getDevice().then(
      (status) => {
        if (current) {
          setPaired(status.kind === 'device' && status.present);
        }
      },
      () => undefined,
    );

    return () => {
      current = false;
    };
  }, [api]);

  return paired;
}

/**
 * The account menu's **Pair a device** and **Paired devices** and the dialogs they open over the
 * current screen (device-pairing.md); none of it on a browser that is not a paired device.
 */
export function usePairingMenu(): {
  readonly actions: PairingMenuActions | undefined;
  readonly dialogs: ReactNode;
} {
  const api = useAppServices().devicePairingApi;
  const paired = usePairedDevice(api);
  const [open, setOpen] = useState<'pair' | 'devices' | undefined>();

  if (!paired) {
    return { actions: undefined, dialogs: null };
  }

  return {
    actions: {
      onPairDevice: () => setOpen('pair'),
      onPairedDevices: () => setOpen('devices'),
    },
    dialogs: (
      <>
        <PairDeviceDialog
          api={api}
          open={open === 'pair'}
          onOpenChange={(next) => setOpen(next ? 'pair' : undefined)}
        />
        <PairedDevicesDialog
          api={api}
          open={open === 'devices'}
          onOpenChange={(next) => setOpen(next ? 'devices' : undefined)}
          onPairDevice={() => setOpen('pair')}
          onThisDeviceRevoked={() => window.location.assign('/pair')}
        />
      </>
    ),
  };
}
