import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { OwnerCredentialStatus } from '@nevo/specflow-contracts/authentication';
import { Alert, Button, Field, Separator, Spinner, TextInput, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { SpecFlowStandaloneShell, StandaloneScreenHeader } from '../../app/StandaloneScreenLayout';
import { pairingFailure, type DevicePairingApi, type PairingFailure } from './api';
import { readDeviceName } from './deviceName';
import { usePairingFailureText } from './failureText';
import { formatClock, useDeviceLabel, useSecondsUntil, useWaitPhrase } from './time';

const MONO = 'font-mono';
const POLL_MS = 2000;
const DEFAULT_RETRY_SECONDS = 60;

export type UnpairedStatus = Extract<OwnerCredentialStatus, { kind: 'device'; present: false }>;

export type PairingCodeView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'valid'; readonly code: string; readonly remainingSeconds: number }
  | { readonly kind: 'expired'; readonly code: string; readonly lost: boolean }
  | {
      readonly kind: 'failed';
      readonly failure: PairingFailure;
      readonly blockedSeconds: number;
    };

export interface InitialCodeView {
  readonly value: string;
  readonly pending: boolean;
  readonly failure?: PairingFailure;
  /** Too many tries: the field waits this long. */
  readonly blockedSeconds: number;
}

export type PairedHow = 'approval' | 'qr' | 'initial-code';

export interface PairedView {
  /** The browser's user agent as the Runtime stored it. */
  readonly userAgent: string | undefined;
  readonly how: PairedHow;
}

export interface PairDeviceScreenViewProps {
  readonly status: UnpairedStatus;
  readonly code: PairingCodeView;
  /** This browser as the Runtime saw it when it asked for the code. */
  readonly thisDevice?: { readonly userAgent: string | undefined; readonly address: string };
  readonly initial: InitialCodeView;
  readonly qrInvalid?: boolean;
  /** A QR code from the address bar is being used. */
  readonly redeemingQr?: boolean;
  readonly paired?: PairedView;
  readonly onNewCode: () => void;
  readonly onInitialChange: (value: string) => void;
  readonly onInitialSubmit: () => void;
  readonly onContinue: () => void;
}

/** Spelled out for a screen reader: "K 7 Q F, M 2 X D". */
function spelled(code: string): string {
  return `${[...code.slice(0, 4)].join(' ')}, ${[...code.slice(4)].join(' ')}`;
}

function grouped(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Whether this screen leads with SpecFlow's own code: nobody can approve a code yet. */
export function leadsWithInitialCode(status: UnpairedStatus): boolean {
  return status.initialCode === 'file' && !status.anyDevicePaired;
}

/**
 * The browser without an owner credential (D21, device-pairing.md): its own code to approve on a
 * paired device, or SpecFlow's initial code for the first device. Presentational.
 */
export function PairDeviceScreenView(props: PairDeviceScreenViewProps) {
  const { t } = useTranslation();
  const deviceLabel = useDeviceLabel();

  if (props.paired) {
    const handheld = readDeviceName(props.paired.userAgent).handheld;
    const label = deviceLabel(props.paired.userAgent);

    return (
      <SpecFlowStandaloneShell>
        <div className="grid gap-6">
          <StandaloneScreenHeader
            title={t(handheld ? 'pairing.paired.titlePhone' : 'pairing.paired.titleDevice')}
            description={t(
              props.paired.how === 'qr'
                ? 'pairing.paired.byQr'
                : props.paired.how === 'initial-code'
                  ? 'pairing.paired.byInitialCode'
                  : 'pairing.paired.byApproval',
            )}
          />
          <Alert tone="success" title={t('pairing.paired.alertTitle', { device: label })}>
            {t('pairing.paired.alertBody')}
          </Alert>
          <Button width="full" onClick={props.onContinue}>
            {t('pairing.paired.continue')}
          </Button>
        </div>
      </SpecFlowStandaloneShell>
    );
  }

  if (props.redeemingQr) {
    return (
      <SpecFlowStandaloneShell>
        <div className="flex justify-center py-12">
          <Spinner label={t('pairing.screen.loading')} />
        </div>
      </SpecFlowStandaloneShell>
    );
  }

  const headlessFirst = leadsWithInitialCode(props.status);

  return (
    <SpecFlowStandaloneShell>
      <div className="grid gap-6">
        <StandaloneScreenHeader
          title={t('pairing.screen.title')}
          description={t('pairing.screen.description')}
        />
        {props.qrInvalid ? (
          <Alert role="alert" tone="attention">
            {t('pairing.screen.qrInvalid')}
          </Alert>
        ) : null}
        {headlessFirst ? null : (
          <>
            <PairingCodeCard
              code={props.code}
              thisDevice={props.thisDevice}
              onNewCode={props.onNewCode}
            />
            <ApproveSteps />
          </>
        )}
        {props.status.initialCode === 'none' ? null : (
          <>
            {headlessFirst ? null : <Separator />}
            <InitialCodeSection
              status={props.status}
              view={props.initial}
              onChange={props.onInitialChange}
              onSubmit={props.onInitialSubmit}
            />
          </>
        )}
      </div>
    </SpecFlowStandaloneShell>
  );
}

function PairingCodeCard({
  code,
  thisDevice,
  onNewCode,
}: {
  readonly code: PairingCodeView;
  readonly thisDevice: PairDeviceScreenViewProps['thisDevice'];
  readonly onNewCode: () => void;
}) {
  const { t } = useTranslation();
  const deviceLabel = useDeviceLabel();
  const wait = useWaitPhrase();
  const failureText = usePairingFailureText();
  const rateLimited = code.kind === 'failed' && code.failure.kind === 'rate-limited';
  const shown = code.kind === 'valid' || code.kind === 'expired' ? code.code : undefined;

  return (
    <div className="grid gap-2 rounded-composite border border-border-default bg-surface-subtle px-4 py-4">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        {t('pairing.code.label')}
      </Typography>
      {code.kind === 'failed' ? (
        <Typography as="p" variant="body-md" className="text-content-primary" role="alert">
          {rateLimited
            ? t('pairing.code.rateLimited', { when: wait(code.blockedSeconds) })
            : failureText(code.failure)}
        </Typography>
      ) : shown ? (
        <p
          className={`font-mono text-[2rem] leading-tight tracking-[0.2em] ${code.kind === 'expired' ? 'text-content-muted line-through' : 'text-content-primary'}`}
          aria-label={spelled(shown)}
        >
          {grouped(shown)}
        </p>
      ) : (
        <Typography as="p" variant="body-md" className="text-content-secondary" role="status">
          {t('pairing.code.requesting')}
        </Typography>
      )}
      {code.kind === 'valid' ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('pairing.code.valid', { time: formatClock(code.remainingSeconds) })}
        </Typography>
      ) : code.kind === 'loading' ? null : (
        <div className="flex flex-wrap items-center gap-3">
          {code.kind === 'expired' ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t(code.lost ? 'pairing.code.lost' : 'pairing.code.expired')}
            </Typography>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            leadingIcon="refresh"
            disabled={code.kind === 'failed' && code.blockedSeconds > 0}
            onClick={onNewCode}
          >
            {t('pairing.code.newCode')}
          </Button>
        </div>
      )}
      {thisDevice ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('pairing.code.thisDevice', {
            device: deviceLabel(thisDevice.userAgent),
            address: thisDevice.address,
          })}
        </Typography>
      ) : null}
    </div>
  );
}

function ApproveSteps() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-2">
      <Typography as="h2" variant="title-sm">
        {t('pairing.approve.title')}
      </Typography>
      <ol className="grid list-decimal gap-1 pl-5 text-body-md text-content-primary marker:text-content-muted">
        <li>{t('pairing.approve.step1')}</li>
        <li>{t('pairing.approve.step2')}</li>
        <li>{t('pairing.approve.step3')}</li>
      </ol>
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('pairing.approve.qrHint')}
      </Typography>
    </section>
  );
}

function InitialCodeSection({
  status,
  view,
  onChange,
  onSubmit,
}: {
  readonly status: UnpairedStatus;
  readonly view: InitialCodeView;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const wait = useWaitPhrase();
  const failureText = usePairingFailureText();
  const headlessFirst = leadsWithInitialCode(status);
  const blocked = view.blockedSeconds > 0;
  const failure = view.failure;
  const invalid = failure?.kind === 'invalid';
  const otherFailure = failure && !invalid && failure.kind !== 'rate-limited' ? failure : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section className="grid gap-3">
      <Typography as="h2" variant="title-sm">
        {t(headlessFirst ? 'pairing.first.titleHeadless' : 'pairing.first.title')}
      </Typography>
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {t(
          status.initialCode === 'file'
            ? headlessFirst
              ? 'pairing.first.bodyHeadless'
              : 'pairing.first.bodyHeadlessRepair'
            : 'pairing.first.body',
        )}
      </Typography>
      <form className="grid gap-3" onSubmit={submit}>
        <Field invalid={invalid}>
          <Field.Label>{t('pairing.first.label')}</Field.Label>
          <TextInput
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('pairing.code.placeholder')}
            className={MONO}
            value={view.value}
            disabled={blocked || view.pending}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
          {invalid ? (
            <Field.Error>{t('pairing.first.invalid')}</Field.Error>
          ) : blocked ? (
            <Field.Description>
              {t('pairing.first.rateLimited', { when: wait(view.blockedSeconds) })}
            </Field.Description>
          ) : null}
        </Field>
        {otherFailure ? (
          <Alert role="alert" tone="danger">
            {failureText(otherFailure)}
          </Alert>
        ) : null}
        <Button
          type="submit"
          width="full"
          aria-busy={view.pending}
          disabled={blocked || view.pending || view.value.trim().length === 0}
        >
          {view.pending ? t('pairing.first.pairing') : t('pairing.first.submit')}
        </Button>
      </form>
    </section>
  );
}

export interface PairDeviceScreenProps {
  readonly api: DevicePairingApi;
  readonly status: UnpairedStatus;
  /** A one-time token from a scanned QR code, already taken from the address. */
  readonly qrToken?: string;
  readonly onContinue: () => void;
  readonly clock?: () => number;
}

type CodeState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly id: string;
      readonly code: string;
      readonly expiresAt: number;
    }
  | { readonly kind: 'lost'; readonly code: string }
  | { readonly kind: 'failed'; readonly failure: PairingFailure; readonly until: number };

/** Runs the pairing of this browser: its own code and approval, the initial code, or a QR token. */
export function PairDeviceScreen({
  api,
  status,
  qrToken,
  onContinue,
  clock = Date.now,
}: PairDeviceScreenProps) {
  const headlessFirst = leadsWithInitialCode(status);
  const [code, setCode] = useState<CodeState>({ kind: 'loading' });
  const [thisDevice, setThisDevice] = useState<PairDeviceScreenViewProps['thisDevice']>();
  const [initialValue, setInitialValue] = useState('');
  const [initialPending, setInitialPending] = useState(false);
  const [initialFailure, setInitialFailure] = useState<PairingFailure>();
  const [initialBlockedUntil, setInitialBlockedUntil] = useState<number>();
  const [paired, setPaired] = useState<PairedView>();
  const [redeemingQr, setRedeemingQr] = useState(qrToken !== undefined);
  const [qrInvalid, setQrInvalid] = useState(false);
  const started = useRef(false);
  const redeeming = useRef(false);

  const expiresAt = code.kind === 'ready' ? code.expiresAt : undefined;
  const remaining = useSecondsUntil(expiresAt, clock);
  const failedUntil = code.kind === 'failed' ? code.until : undefined;
  const codeBlocked = useSecondsUntil(failedUntil, clock);
  const initialBlocked = useSecondsUntil(initialBlockedUntil, clock);

  const requestCode = useCallback(async () => {
    setCode({ kind: 'loading' });
    try {
      const created = await api.requestPairing();
      setThisDevice({ userAgent: created.origin.userAgent, address: created.origin.address });
      setCode({
        kind: 'ready',
        id: created.id,
        code: created.code,
        expiresAt: Date.parse(created.expiresAt),
      });
    } catch (error) {
      const failure = pairingFailure(error);
      const seconds =
        failure.kind === 'rate-limited' ? (failure.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS) : 0;
      setCode({ kind: 'failed', failure, until: clock() + seconds * 1000 });
    }
  }, [api, clock]);

  // Once: a second request would hold another of the few places for this computer.
  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    const startOwnCode = () => {
      if (!headlessFirst) {
        void requestCode();
      }
    };

    if (qrToken === undefined) {
      startOwnCode();

      return;
    }

    api.redeem({ kind: 'qr-token', token: qrToken }).then(
      (result) => setPaired({ userAgent: result.device.label, how: 'qr' }),
      () => {
        setQrInvalid(true);
        setRedeemingQr(false);
        startOwnCode();
      },
    );
  }, [api, headlessFirst, qrToken, requestCode]);

  const expired = code.kind === 'ready' && remaining === 0;
  const polling = code.kind === 'ready' && !expired && paired === undefined;
  const pollId = code.kind === 'ready' ? code.id : undefined;
  useEffect(() => {
    if (!polling || pollId === undefined) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        if (redeeming.current) {
          return;
        }

        try {
          const request = await api.getRequest(pollId);
          if (request.status !== 'approved') {
            return;
          }

          redeeming.current = true;
          const result = await api.redeem({ kind: 'pairing-request', id: pollId });
          setPaired({ userAgent: result.device.label, how: 'approval' });
        } catch (error) {
          redeeming.current = false;
          // Gone before it expired: a paired device cleared it.
          if (pairingFailure(error).kind === 'not-found') {
            setCode((current) =>
              current.kind === 'ready' ? { kind: 'lost', code: current.code } : current,
            );
          }
        }
      })();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [api, polling, pollId]);

  const submitInitial = () => {
    setInitialPending(true);
    setInitialFailure(undefined);
    api.redeem({ kind: 'initial-code', code: initialValue }).then(
      (result) => setPaired({ userAgent: result.device.label, how: 'initial-code' }),
      (error: unknown) => {
        const failure = pairingFailure(error);
        setInitialFailure(failure);
        if (failure.kind === 'rate-limited') {
          setInitialBlockedUntil(
            clock() + (failure.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS) * 1000,
          );
        }

        setInitialPending(false);
      },
    );
  };

  const view: PairingCodeView =
    code.kind === 'ready'
      ? expired
        ? { kind: 'expired', code: code.code, lost: false }
        : { kind: 'valid', code: code.code, remainingSeconds: remaining }
      : code.kind === 'lost'
        ? { kind: 'expired', code: code.code, lost: true }
        : code.kind === 'failed'
          ? { kind: 'failed', failure: code.failure, blockedSeconds: codeBlocked }
          : { kind: 'loading' };

  return (
    <PairDeviceScreenView
      status={status}
      code={view}
      thisDevice={thisDevice}
      initial={{
        value: initialValue,
        pending: initialPending,
        ...(initialFailure ? { failure: initialFailure } : {}),
        blockedSeconds: initialBlocked,
      }}
      qrInvalid={qrInvalid}
      redeemingQr={redeemingQr && paired === undefined}
      paired={paired}
      onNewCode={() => void requestCode()}
      onInitialChange={setInitialValue}
      onInitialSubmit={submitInitial}
      onContinue={onContinue}
    />
  );
}
