import { useState, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
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
  Field,
  Icon,
  InformationList,
  InlineNote,
  SegmentedControl,
  Separator,
  TextInput,
  Typography,
} from '@nevo/ui';
import { SpecFlowStandaloneShell, StandaloneScreenHeader } from '../../app/StandaloneScreenLayout';
import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { OperationalRow } from '../../shared/operational-list';
import { MONO, QrCode } from './MockParts.stories-support';

/*
 * PRESENTATION MOCK ONLY (D21 device pairing, docs/product/specflow/ui/device-pairing.md). The
 * unpaired browser is a standalone screen like Login; a paired device approves a code, shows a QR
 * code and lists its devices in dialogs opened from the account menu, over the real routed screen.
 * Static data, no commands. The requesting device follows the frame: a phone below 600 px, a
 * laptop browser above.
 */

export type PairingState =
  | 'unpaired'
  | 'unpaired-expired'
  | 'unpaired-code-wrong'
  | 'unpaired-rate-limited'
  | 'unpaired-headless'
  | 'paired-success'
  | 'paired-by-qr'
  | 'approve-code'
  | 'approve-expired'
  | 'approve-qr'
  | 'devices'
  | 'devices-revoke'
  | 'revoke-this-device'
  | 'revoke-last-device';

/** The requesting browser of the frame (a phone at 375 px, a laptop on desktop). */
function requester() {
  return typeof window !== 'undefined' && window.innerWidth < 600
    ? { name: 'Safari on iPhone', from: '100.101.7.12', phone: true }
    : { name: 'Firefox on macOS', from: '192.168.1.20', phone: false };
}

type CodeState = 'valid' | 'expired' | 'rate-limited';

/** The short code this browser shows, in two groups of four for reading aloud. */
function PairingCode({ state }: { readonly state: CodeState }) {
  const device = requester();

  return (
    <div className="grid gap-2 rounded-composite border border-border-default bg-surface-subtle px-4 py-4">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        This device’s pairing code
      </Typography>
      {state === 'rate-limited' ? (
        <Typography as="p" variant="body-md" className="text-content-primary">
          Too many pairing codes were asked for from this device. You can ask for a new one in 4
          minutes.
        </Typography>
      ) : (
        <p
          className={`font-mono text-[2rem] leading-tight tracking-[0.2em] ${state === 'expired' ? 'text-content-muted line-through' : 'text-content-primary'}`}
          aria-label="K 7 Q F, M 2 X D"
        >
          K7QF-M2XD
        </p>
      )}
      {state === 'valid' ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          Valid for 1:48 · works once
        </Typography>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {state === 'expired' ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              This code expired. Codes work once, for about two minutes.
            </Typography>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            leadingIcon="refresh"
            disabled={state === 'rate-limited'}
          >
            New code
          </Button>
        </div>
      )}
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        This device: {device.name} · from <span className={MONO}>{device.from}</span>
      </Typography>
    </div>
  );
}

function Steps({ children }: { readonly children: ReactNode }) {
  return (
    <ol className="grid list-decimal gap-1 pl-5 text-body-md text-content-primary marker:text-content-muted">
      {children}
    </ol>
  );
}

type FirstCode = 'empty' | 'wrong' | 'rate-limited';

function EnterInitialCode({
  headless,
  state = 'empty',
}: {
  readonly headless: boolean;
  readonly state?: FirstCode;
}) {
  return (
    <section className="grid gap-3">
      <Typography as="h2" variant="title-sm">
        {headless ? 'Pair the first device' : 'First device? Use SpecFlow’s own code'}
      </Typography>
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {headless
          ? 'No device is paired yet, and this SpecFlow runs without a window to show a code in. It saved a one-time code on the machine running SpecFlow, readable only by the account that runs it. Read it there, for example over SSH, and enter it here. Until a device is paired, no agent starts.'
          : 'When no device is paired yet, SpecFlow shows a one-time code in the window or terminal that started it.'}
      </Typography>
      <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
        <Field invalid={state === 'wrong'}>
          <Field.Label>Code from SpecFlow</Field.Label>
          <TextInput
            autoComplete="one-time-code"
            placeholder="XXXX-XXXX"
            className="font-mono"
            defaultValue={state === 'wrong' ? 'H3TR-9PLQ' : undefined}
            disabled={state === 'rate-limited'}
          />
          {state === 'wrong' ? (
            <Field.Error>
              This code is not valid. It may be mistyped, used already, or replaced by a restart.
              Check the code on the machine running SpecFlow and try again.
            </Field.Error>
          ) : state === 'rate-limited' ? (
            <Field.Description>Too many tries. You can try again in 4 minutes.</Field.Description>
          ) : null}
        </Field>
        <Button type="submit" width="full" disabled={state === 'rate-limited'}>
          Pair this device
        </Button>
      </form>
    </section>
  );
}

/** The browser without an owner credential: its code to approve elsewhere, or the first code. */
export function UnpairedScreen({
  code = 'valid',
  first = 'empty',
  headless = false,
}: {
  readonly code?: CodeState;
  readonly first?: FirstCode;
  readonly headless?: boolean;
}) {
  return (
    <StoryLocalization>
      <SpecFlowStandaloneShell>
        <div className="grid gap-6">
          <StandaloneScreenHeader
            title="Pair this device"
            description="Only a paired device can approve, finish or close work in SpecFlow on acme-dev. Pairing is done once per browser."
          />
          {headless ? (
            <EnterInitialCode headless state={first} />
          ) : (
            <>
              <PairingCode state={code} />
              <section className="grid gap-2">
                <Typography as="h2" variant="title-sm">
                  Approve it from a paired device
                </Typography>
                <Steps>
                  <li>On a device that is already paired, open your account menu.</li>
                  <li>Choose Pair a device and enter the code above.</li>
                  <li>Check that it names this device, then approve.</li>
                </Steps>
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  On a phone, you can instead choose Show QR code there and scan it with this
                  phone’s camera.
                </Typography>
              </section>
              <Separator />
              <EnterInitialCode headless={false} state={first} />
            </>
          )}
        </div>
      </SpecFlowStandaloneShell>
    </StoryLocalization>
  );
}

/** The requesting browser once paired: by approval of its code, or after scanning a QR code. */
function PairedScreen({ byQr }: { readonly byQr: boolean }) {
  const device = requester();

  return (
    <StoryLocalization>
      <SpecFlowStandaloneShell>
        <div className="grid gap-6">
          <StandaloneScreenHeader
            title={device.phone ? 'This phone is paired' : 'This device is paired'}
            description={
              byQr
                ? 'Paired with the QR code shown on Chrome on Windows. You can now approve, finish and close work here.'
                : 'Chrome on Windows approved it. You can now approve, finish and close work here.'
            }
          />
          <Alert tone="success" title={`${device.name} · paired just now`}>
            It stays paired until you revoke it in Paired devices, on any paired device.
          </Alert>
          <Button width="full">Continue to SpecFlow</Button>
        </div>
      </SpecFlowStandaloneShell>
    </StoryLocalization>
  );
}

function PairDeviceDialog({ mode }: { readonly mode: 'code' | 'expired' | 'qr' }) {
  const [tab, setTab] = useState<string>(mode === 'qr' ? 'qr' : 'code');
  const expired = mode === 'expired';

  return (
    <Dialog open>
      <DialogContent closeLabel="Close" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Pair a device</DialogTitle>
          <DialogDescription>
            A paired device can approve, finish and close work. Pair only a device you are holding
            or can see.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-5">
            <SegmentedControl aria-label="How to pair" value={tab} onValueChange={setTab}>
              <SegmentedControl.Item value="code">Enter its code</SegmentedControl.Item>
              <SegmentedControl.Item value="qr">Show QR code</SegmentedControl.Item>
            </SegmentedControl>
            {tab === 'code' ? (
              <>
                <Field invalid={expired}>
                  <Field.Label>Code shown on the other device</Field.Label>
                  <TextInput defaultValue="K7QF-M2XD" className="font-mono" />
                  {expired ? (
                    <Field.Error>
                      This code expired. On the other device, choose New code and enter the new one
                      here.
                    </Field.Error>
                  ) : null}
                </Field>
                {expired ? null : (
                  <>
                    <div className="grid gap-1 rounded-composite border border-border-default px-4 py-3">
                      <Typography as="p" variant="label-sm" className="text-content-secondary">
                        This code asks to pair
                      </Typography>
                      <p className="flex items-center gap-2 text-body-md">
                        <Icon name={Smartphone} size="sm" aria-hidden="true" />
                        Safari on iPhone
                      </p>
                      <Typography as="p" variant="body-sm" className="text-content-secondary">
                        From <span className={MONO}>100.101.7.12</span> · asked 12 seconds ago
                      </Typography>
                    </div>
                    <InlineNote tone="attention">
                      If you did not start this on a device of your own, do not approve it.
                    </InlineNote>
                  </>
                )}
              </>
            ) : (
              <div className="grid justify-items-center gap-3">
                <QrCode />
                <Typography as="p" variant="body-sm" className="text-center text-content-secondary">
                  Scan it with the phone’s camera. It works once, for 1:52 more.
                </Typography>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">{tab === 'code' ? 'Cancel' : 'Done'}</Button>
          {tab === 'code' ? <Button disabled={expired}>Pair Safari on iPhone</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const devices = [
  {
    id: 'd1',
    icon: Monitor,
    name: 'Chrome on Windows',
    facts: ['This device', 'paired Nov 12'] as const,
  },
  {
    id: 'd2',
    icon: Smartphone,
    name: 'Safari on iPhone',
    facts: ['used 2 hours ago', 'paired Nov 18', 'from 100.101.7.12'] as const,
  },
  {
    id: 'd3',
    icon: Monitor,
    name: 'Firefox on Linux',
    facts: ['used 9 days ago', 'paired Nov 3'] as const,
  },
];

type Revoke = 'none' | 'other' | 'this' | 'last';

const revokeCopy: Record<Exclude<Revoke, 'none'>, { title: string; body: string }> = {
  other: {
    title: 'Revoke Safari on iPhone?',
    body: 'It can no longer approve, finish or close anything until it is paired again. Work it already did stays.',
  },
  this: {
    title: 'Revoke this device?',
    body: 'This browser can no longer approve, finish or close anything; it shows Pair this device until a paired device approves it again. Work it already did stays.',
  },
  last: {
    title: 'Revoke the last paired device?',
    body: 'No device will be paired. To pair one again you need the machine running SpecFlow: restart it with --pair and use the code it gives. Until a device is paired, no agent starts.',
  },
};

function DevicesDialog({ revoke }: { readonly revoke: Revoke }) {
  const list = revoke === 'last' ? devices.slice(0, 1) : devices;

  return (
    <>
      <Dialog open>
        <DialogContent closeLabel="Close" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Paired devices</DialogTitle>
            <DialogDescription>
              These browsers can approve, finish and close work in SpecFlow on acme-dev. Revoke one
              you no longer use or do not recognise.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <InformationList>
              {list.map((device) => (
                <OperationalRow
                  key={device.id}
                  leading={<Icon name={device.icon} size="sm" aria-hidden="true" />}
                  primary={device.name}
                  factsLayout="inline"
                  compactFacts={device.facts}
                  trailing={
                    <Button size="sm" variant="ghost">
                      Revoke
                    </Button>
                  }
                />
              ))}
            </InformationList>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary">Close</Button>
            <Button>Pair a device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {revoke !== 'none' ? (
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{revokeCopy[revoke].title}</AlertDialogTitle>
              <AlertDialogDescription>{revokeCopy[revoke].body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialogCancel>
              <Button variant="destructive">
                {revoke === 'this' ? 'Revoke this device' : 'Revoke'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

function Delayed({ children }: { readonly children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useState(() => window.setTimeout(() => setReady(true), 1200));

  return ready ? <>{children}</> : null;
}

export function PairingMock({ state }: { readonly state: PairingState }) {
  switch (state) {
    case 'unpaired':
      return <UnpairedScreen />;
    case 'unpaired-expired':
      return <UnpairedScreen code="expired" />;
    case 'unpaired-code-wrong':
      return <UnpairedScreen first="wrong" />;
    case 'unpaired-rate-limited':
      return <UnpairedScreen code="rate-limited" first="rate-limited" />;
    case 'unpaired-headless':
      return <UnpairedScreen headless />;
    case 'paired-success':
      return <PairedScreen byQr={false} />;
    case 'paired-by-qr':
      return <PairedScreen byQr />;
    default:
      break;
  }

  const dialog =
    state === 'approve-code' ? (
      <PairDeviceDialog mode="code" />
    ) : state === 'approve-expired' ? (
      <PairDeviceDialog mode="expired" />
    ) : state === 'approve-qr' ? (
      <PairDeviceDialog mode="qr" />
    ) : (
      <DevicesDialog
        revoke={
          state === 'devices-revoke'
            ? 'other'
            : state === 'revoke-this-device'
              ? 'this'
              : state === 'revoke-last-device'
                ? 'last'
                : 'none'
        }
      />
    );

  return (
    <>
      <WorkflowExecutionFixture scenario="waiting" />
      <StoryLocalization>
        <Delayed>{dialog}</Delayed>
      </StoryLocalization>
    </>
  );
}
