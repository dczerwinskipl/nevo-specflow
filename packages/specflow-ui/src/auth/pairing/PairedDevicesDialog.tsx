import { useCallback, useEffect, useState } from 'react';

import type { PairedDevice } from '@nevo/specflow-contracts/authentication';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  InformationList,
  Spinner,
} from '@nevo/ui';
import { Monitor, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { OperationalRow } from '../../shared/operational-list';
import { pairingFailure, type DevicePairingApi, type PairingFailure } from './api';
import { readDeviceName } from './deviceName';
import { usePairingFailureText } from './failureText';
import { useDeviceLabel, useShortDate } from './time';

type Devices =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly devices: readonly PairedDevice[] }
  | { readonly kind: 'failed'; readonly failure: PairingFailure };

export interface PairedDevicesDialogProps {
  readonly api: DevicePairingApi;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Opens Pair a device (the footer's primary action). */
  readonly onPairDevice: () => void;
  /** This browser's own pairing was revoked: it is unpaired now. */
  readonly onThisDeviceRevoked: () => void;
}

/** The paired devices with Revoke each (device-pairing.md, Paired devices). */
export function PairedDevicesDialog(props: PairedDevicesDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <PairedDevicesContent {...props} /> : null}
    </Dialog>
  );
}

function PairedDevicesContent({
  api,
  onOpenChange,
  onPairDevice,
  onThisDeviceRevoked,
}: PairedDevicesDialogProps) {
  const { t } = useTranslation();
  const deviceLabel = useDeviceLabel();
  const shortDate = useShortDate();
  const failureText = usePairingFailureText();
  const [state, setState] = useState<Devices>({ kind: 'loading' });
  const [revoking, setRevoking] = useState<PairedDevice>();
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeFailure, setRevokeFailure] = useState<PairingFailure>();

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    api.listDevices().then(
      (list) => setState({ kind: 'ready', devices: list.devices }),
      (error: unknown) => setState({ kind: 'failed', failure: pairingFailure(error) }),
    );
  }, [api]);
  useEffect(load, [load]);

  const devices = state.kind === 'ready' ? state.devices : [];
  const last = devices.length === 1;

  const revoke = (device: PairedDevice) => {
    setRevokeBusy(true);
    setRevokeFailure(undefined);
    api.revokeDevice(device.id).then(
      () => {
        setRevokeBusy(false);
        setRevoking(undefined);
        if (device.current) {
          onThisDeviceRevoked();
        } else {
          load();
        }
      },
      (error: unknown) => {
        const failure = pairingFailure(error);
        setRevokeBusy(false);
        // Already gone (revoked elsewhere meanwhile): the list is the answer.
        if (failure.kind === 'not-found') {
          setRevoking(undefined);
          load();

          return;
        }

        setRevokeFailure(failure);
      },
    );
  };

  const kind = revoking ? (last ? 'last' : revoking.current ? 'this' : 'other') : undefined;

  return (
    <DialogContent
      closeLabel={t('pairing.devices.close')}
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{t('pairing.devices.title')}</DialogTitle>
        <DialogDescription>{t('pairing.devices.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {state.kind === 'loading' ? (
          <div className="flex justify-center py-6">
            <Spinner label={t('pairing.devices.loading')} />
          </div>
        ) : state.kind === 'failed' ? (
          <Alert role="alert" tone="danger" title={t('pairing.devices.failed')}>
            <p>{failureText(state.failure)}</p>
            <Button size="sm" variant="secondary" onClick={load}>
              {t('pairing.devices.retry')}
            </Button>
          </Alert>
        ) : (
          <InformationList>
            {state.devices.map((device) => (
              <OperationalRow
                key={device.id}
                leading={
                  <Icon
                    name={readDeviceName(device.label).handheld ? Smartphone : Monitor}
                    size="sm"
                    aria-hidden="true"
                  />
                }
                primary={deviceLabel(device.label)}
                factsLayout="inline"
                compactFacts={
                  device.current
                    ? [
                        t('pairing.device.thisDevice'),
                        t('pairing.device.pairedOn', { date: shortDate(device.pairedAt) }),
                      ]
                    : [
                        t('pairing.device.pairedOn', { date: shortDate(device.pairedAt) }),
                        { text: t('pairing.device.from', { address: device.origin.address }) },
                      ]
                }
                trailing={
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('pairing.devices.revoke')}: ${deviceLabel(device.label)}`}
                    onClick={() => {
                      setRevokeFailure(undefined);
                      setRevoking(device);
                    }}
                  >
                    {t('pairing.devices.revoke')}
                  </Button>
                }
              />
            ))}
          </InformationList>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('pairing.devices.close')}
        </Button>
        <Button onClick={onPairDevice}>{t('pairing.devices.pair')}</Button>
      </DialogFooter>
      {revoking && kind ? (
        <AlertDialog
          open
          onOpenChange={(open) => (open || revokeBusy ? undefined : setRevoking(undefined))}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {kind === 'last'
                  ? t('pairing.devices.revokeLastTitle')
                  : kind === 'this'
                    ? t('pairing.devices.revokeThisTitle')
                    : t('pairing.devices.revokeOtherTitle', {
                        device: deviceLabel(revoking.label),
                      })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {kind === 'last'
                  ? t('pairing.devices.revokeLastBody')
                  : kind === 'this'
                    ? t('pairing.devices.revokeThisBody')
                    : t('pairing.devices.revokeOtherBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {revokeFailure ? (
              <Alert role="alert" tone="danger" title={t('pairing.devices.revokeFailed')}>
                {failureText(revokeFailure)}
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary" disabled={revokeBusy}>
                  {t('pairing.devices.cancel')}
                </Button>
              </AlertDialogCancel>
              <Button
                variant="destructive"
                aria-busy={revokeBusy}
                disabled={revokeBusy}
                onClick={() => revoke(revoking)}
              >
                {revokeBusy
                  ? t('pairing.devices.revoking')
                  : kind === 'this'
                    ? t('pairing.devices.revokeThisConfirm')
                    : t('pairing.devices.revoke')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </DialogContent>
  );
}
