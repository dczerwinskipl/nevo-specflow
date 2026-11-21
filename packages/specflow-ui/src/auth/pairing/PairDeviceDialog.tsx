import { useEffect, useRef, useState } from 'react';

import type { PairingLookup } from '@nevo/specflow-contracts/authentication';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Icon,
  InlineNote,
  SegmentedControl,
  Spinner,
  TextInput,
  Typography,
} from '@nevo/ui';
import { Monitor, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { pairingFailure, type DevicePairingApi, type PairingFailure } from './api';
import { readDeviceName } from './deviceName';
import { usePairingFailureText } from './failureText';
import { QrCodeImage, encodeQrModules, tryEncodeQr, type QrModules } from './qr';
import { formatClock, useAgePhrase, useDeviceLabel, useSecondsUntil, useWaitPhrase } from './time';

const CODE_LENGTH = 8;
const DEFAULT_RETRY_SECONDS = 60;
const MONO = 'font-mono';

type Lookup =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'found'; readonly lookup: PairingLookup }
  | { readonly kind: 'failed'; readonly failure: PairingFailure; readonly until: number };

type Approval =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pairing' }
  | { readonly kind: 'done'; readonly userAgent: string | undefined }
  | { readonly kind: 'failed'; readonly failure: PairingFailure; readonly until: number };

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly token: string; readonly expiresAt: number }
  | { readonly kind: 'failed'; readonly failure: PairingFailure };

type Clearing =
  | { readonly kind: 'idle' }
  | { readonly kind: 'clearing' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'failed'; readonly failure: PairingFailure };

/** The characters of a code as typed: letters and digits, upper case (a dash or space is a group). */
export function normalizeCodeInput(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
}

export interface PairDeviceDialogProps {
  readonly api: DevicePairingApi;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Encodes the QR value; tests and stories supply their own. */
  readonly encodeQr?: (text: string) => QrModules;
  readonly clock?: () => number;
  /** The origin a scanning phone opens; this page's own by default. */
  readonly origin?: string;
}

/**
 * Pair a device, from a paired one (device-pairing.md): enter the code another browser shows, see
 * which browser asked and when, and only then approve; or show a one-time QR code for a phone.
 */
export function PairDeviceDialog(props: PairDeviceDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <PairDeviceDialogContent {...props} /> : null}
    </Dialog>
  );
}

function PairDeviceDialogContent({
  api,
  onOpenChange,
  encodeQr = encodeQrModules,
  clock = Date.now,
  origin,
}: PairDeviceDialogProps) {
  const { t } = useTranslation();
  const deviceLabel = useDeviceLabel();
  const age = useAgePhrase();
  const wait = useWaitPhrase();
  const failureText = usePairingFailureText();
  const [tab, setTab] = useState<'code' | 'qr'>('code');
  const [value, setValue] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [approval, setApproval] = useState<Approval>({ kind: 'idle' });
  const [clearing, setClearing] = useState<Clearing>({ kind: 'idle' });
  const sequence = useRef(0);

  const normalized = normalizeCodeInput(value);
  // A lookup is made once the whole code is typed, never while it is still being typed.
  useEffect(() => {
    const current = ++sequence.current;
    if (normalized.length !== CODE_LENGTH) {
      setLookup({ kind: 'idle' });

      return;
    }

    setLookup({ kind: 'checking' });
    api.lookup(normalized).then(
      (found) => {
        if (current === sequence.current) {
          setLookup({ kind: 'found', lookup: found });
        }
      },
      (error: unknown) => {
        if (current === sequence.current) {
          const failure = pairingFailure(error);
          setLookup({
            kind: 'failed',
            failure,
            until: clock() + (retryOf(failure) ?? 0) * 1000,
          });
        }
      },
    );
  }, [api, clock, normalized]);

  const found = lookup.kind === 'found' ? lookup.lookup : undefined;
  const lookupSeconds = useSecondsUntil(found ? Date.parse(found.expiresAt) : undefined, clock);
  const expired =
    (found !== undefined && lookupSeconds === 0) ||
    (approval.kind === 'failed' && approval.failure.kind === 'invalid');
  const blockedUntil = Math.max(
    lookup.kind === 'failed' ? lookup.until : 0,
    approval.kind === 'failed' ? approval.until : 0,
  );
  const blocked = useSecondsUntil(blockedUntil > 0 ? blockedUntil : undefined, clock);
  const invalidCode = lookup.kind === 'failed' && lookup.failure.kind === 'invalid';
  const otherFailure =
    lookup.kind === 'failed' &&
    lookup.failure.kind !== 'invalid' &&
    lookup.failure.kind !== 'rate-limited'
      ? lookup.failure
      : approval.kind === 'failed' &&
          approval.failure.kind !== 'invalid' &&
          approval.failure.kind !== 'rate-limited'
        ? approval.failure
        : undefined;

  const approve = () => {
    if (!found) {
      return;
    }

    setApproval({ kind: 'pairing' });
    api.approve(found.lookup).then(
      (approved) => setApproval({ kind: 'done', userAgent: approved.origin.userAgent }),
      (error: unknown) => {
        const failure = pairingFailure(error);
        setApproval({ kind: 'failed', failure, until: clock() + (retryOf(failure) ?? 0) * 1000 });
      },
    );
  };

  const clearRequests = () => {
    setClearing({ kind: 'clearing' });
    api.clearPendingRequests().then(
      () => setClearing({ kind: 'cleared' }),
      (error: unknown) => setClearing({ kind: 'failed', failure: pairingFailure(error) }),
    );
  };

  const done = approval.kind === 'done';
  const foundLabel = found ? deviceLabel(found.origin.userAgent) : undefined;
  const handheld = readDeviceName(found?.origin.userAgent).handheld;
  const fieldError = expired
    ? t('pairing.dialog.expired')
    : invalidCode
      ? t('pairing.dialog.invalid')
      : undefined;

  return (
    <DialogContent
      closeLabel={t('pairing.devices.close')}
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{t('pairing.dialog.title')}</DialogTitle>
        <DialogDescription>{t('pairing.dialog.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-5">
          <SegmentedControl
            aria-label={t('pairing.dialog.how')}
            value={tab}
            onValueChange={(next) => setTab(next === 'qr' ? 'qr' : 'code')}
          >
            <SegmentedControl.Item value="code">
              {t('pairing.dialog.enterCode')}
            </SegmentedControl.Item>
            <SegmentedControl.Item value="qr">{t('pairing.dialog.showQr')}</SegmentedControl.Item>
          </SegmentedControl>
          {tab === 'code' ? (
            done ? (
              <Alert
                tone="success"
                role="status"
                title={t('pairing.dialog.success', { device: deviceLabel(approval.userAgent) })}
              >
                {t('pairing.dialog.successBody')}
              </Alert>
            ) : (
              <>
                <Field invalid={fieldError !== undefined}>
                  <Field.Label>{t('pairing.dialog.codeLabel')}</Field.Label>
                  <TextInput
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder={t('pairing.code.placeholder')}
                    className={MONO}
                    value={value}
                    onChange={(event) => {
                      setApproval({ kind: 'idle' });
                      setValue(event.currentTarget.value);
                    }}
                  />
                  {fieldError ? (
                    <Field.Error>{fieldError}</Field.Error>
                  ) : lookup.kind === 'checking' ? (
                    <Field.Description>{t('pairing.dialog.checking')}</Field.Description>
                  ) : blocked > 0 ? (
                    <Field.Description>
                      {t('pairing.dialog.rateLimited', { when: wait(blocked) })}
                    </Field.Description>
                  ) : null}
                </Field>
                {otherFailure ? (
                  <Alert role="alert" tone="danger">
                    {failureText(otherFailure)}
                  </Alert>
                ) : null}
                {found && !expired ? (
                  <>
                    <div className="grid gap-1 rounded-composite border border-border-default px-4 py-3">
                      <Typography as="p" variant="label-sm" className="text-content-secondary">
                        {t('pairing.dialog.asksToPair')}
                      </Typography>
                      <p className="flex items-center gap-2 text-body-md">
                        <Icon name={handheld ? Smartphone : Monitor} size="sm" aria-hidden="true" />
                        {foundLabel}
                      </p>
                      <Typography as="p" variant="body-sm" className="text-content-secondary">
                        {t('pairing.dialog.origin', {
                          address: found.origin.address,
                          asked: age(found.requestedAt),
                        })}
                      </Typography>
                      <Typography as="p" variant="body-sm" className="text-content-secondary">
                        {t('pairing.dialog.sameAddress')}
                      </Typography>
                    </div>
                    <InlineNote tone="attention">{t('pairing.dialog.attention')}</InlineNote>
                  </>
                ) : null}
                <div className="grid gap-1">
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="-ml-2"
                      disabled={clearing.kind === 'clearing'}
                      onClick={clearRequests}
                    >
                      {clearing.kind === 'clearing'
                        ? t('pairing.dialog.clearing')
                        : t('pairing.dialog.clear')}
                    </Button>
                  </div>
                  <Typography as="p" variant="body-sm" className="text-content-secondary">
                    {clearing.kind === 'cleared' ? (
                      <span role="status">{t('pairing.dialog.cleared')}</span>
                    ) : clearing.kind === 'failed' ? (
                      <span role="alert">{failureText(clearing.failure)}</span>
                    ) : (
                      t('pairing.dialog.clearHint')
                    )}
                  </Typography>
                </div>
              </>
            )
          ) : (
            <QrPanel api={api} encodeQr={encodeQr} clock={clock} origin={origin} />
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {tab === 'qr' || done ? t('pairing.dialog.done') : t('pairing.dialog.cancel')}
        </Button>
        {tab === 'code' && !done ? (
          <Button
            aria-busy={approval.kind === 'pairing'}
            disabled={!found || expired || approval.kind === 'pairing' || blocked > 0}
            onClick={approve}
          >
            {approval.kind === 'pairing'
              ? t('pairing.dialog.pairing')
              : foundLabel
                ? t('pairing.dialog.pair', { device: foundLabel })
                : t('pairing.menu.pairDevice')}
          </Button>
        ) : null}
      </DialogFooter>
    </DialogContent>
  );
}

function retryOf(failure: PairingFailure): number | undefined {
  return failure.kind === 'rate-limited'
    ? (failure.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS)
    : undefined;
}

/** The address a phone cannot reach: this computer's own. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.')
  );
}

function QrPanel({
  api,
  encodeQr,
  clock,
  origin,
}: {
  readonly api: DevicePairingApi;
  readonly encodeQr: (text: string) => QrModules;
  readonly clock: () => number;
  readonly origin: string | undefined;
}) {
  const { t } = useTranslation();
  const failureText = usePairingFailureText();
  const [state, setState] = useState<QrState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const base = origin ?? window.location.origin;
  const remaining = useSecondsUntil(state.kind === 'ready' ? state.expiresAt : undefined, clock);

  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    api.createQrToken().then(
      (issued) => {
        if (current) {
          setState({ kind: 'ready', token: issued.token, expiresAt: Date.parse(issued.expiresAt) });
        }
      },
      (error: unknown) => {
        if (current) {
          setState({ kind: 'failed', failure: pairingFailure(error) });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [api, attempt]);

  const modules =
    state.kind === 'ready' ? tryEncodeQr(`${base}/pair#token=${state.token}`, encodeQr) : undefined;
  const hostname = new URL(base).hostname;

  if (state.kind === 'failed') {
    return (
      <Alert role="alert" tone="danger">
        {failureText(state.failure)}
      </Alert>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center py-6">
        <Spinner label={t('pairing.dialog.qrLoading')} />
      </div>
    );
  }

  if (remaining === 0) {
    return (
      <div className="grid justify-items-center gap-3">
        <Typography as="p" variant="body-sm" className="text-center text-content-secondary">
          {t('pairing.dialog.qrExpired')}
        </Typography>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon="refresh"
          onClick={() => setAttempt((n) => n + 1)}
        >
          {t('pairing.dialog.qrNew')}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid justify-items-center gap-3">
      {modules ? (
        <QrCodeImage modules={modules} />
      ) : (
        <Alert role="alert" tone="danger">
          {t('pairing.dialog.qrUnavailable')}
        </Alert>
      )}
      <Typography as="p" variant="body-sm" className="text-center text-content-secondary">
        {t('pairing.dialog.qrHint', { time: formatClock(remaining) })}
      </Typography>
      {isLocalHost(hostname) ? (
        <InlineNote tone="attention">
          {t('pairing.dialog.qrLocalhost', { host: hostname })}
        </InlineNote>
      ) : null}
    </div>
  );
}
