import { useState, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import {
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
 * PRESENTATION MOCK ONLY (D21 device pairing). The unpaired browser is a standalone screen like
 * Login; a paired device approves a code, shows a QR code and lists its devices in dialogs opened
 * from the account menu, over the real routed screen. Static data, no commands.
 */

export type PairingState =
  | 'unpaired'
  | 'unpaired-expired'
  | 'unpaired-headless'
  | 'approve-code'
  | 'approve-qr'
  | 'devices'
  | 'devices-revoke';

/** The short code this browser shows, in two groups of four for reading aloud. */
function PairingCode({ expired = false }: { readonly expired?: boolean }) {
  return (
    <div className="grid gap-2 rounded-composite border border-border-default bg-surface-subtle px-4 py-4">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        This device’s pairing code
      </Typography>
      <p
        className={`font-mono text-[2rem] leading-tight tracking-[0.2em] ${expired ? 'text-content-muted line-through' : 'text-content-primary'}`}
        aria-label="K 7 Q F, M 2 X D"
      >
        K7QF-M2XD
      </p>
      {expired ? (
        <div className="flex flex-wrap items-center gap-3">
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            This code expired. Codes work once, for about two minutes.
          </Typography>
          <Button size="sm" variant="secondary" leadingIcon="refresh">
            New code
          </Button>
        </div>
      ) : (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          Valid for 1:48 · works once
        </Typography>
      )}
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        This device: Safari on iPhone · from <span className={MONO}>100.101.7.12</span>
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

function EnterInitialCode({ headless }: { readonly headless: boolean }) {
  return (
    <section className="grid gap-3">
      <Typography as="h2" variant="title-sm">
        {headless ? 'Pair the first device' : 'First device? Use the Runtime’s code'}
      </Typography>
      {headless ? (
        <>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            No device is paired yet. This Runtime runs without a console, so it wrote a one-time
            code to a file that only its user can read:
          </Typography>
          <p className={`${MONO} text-body-sm`}>~/.local/state/nevo-specflow/pairing-code</p>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            Read it on that machine, for example over SSH, and enter it here. Until a device is
            paired, no agent runs.
          </Typography>
        </>
      ) : (
        <Typography as="p" variant="body-md" className="text-content-secondary">
          When no device is paired yet, the Runtime prints a one-time code in the window or terminal
          that started it.
        </Typography>
      )}
      <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
        <Field>
          <Field.Label>Code from the Runtime</Field.Label>
          <TextInput autoComplete="one-time-code" placeholder="XXXX-XXXX" className="font-mono" />
        </Field>
        <Button type="submit" width="full">
          Pair this device
        </Button>
      </form>
    </section>
  );
}

/** The browser without an owner credential: its code to approve elsewhere, or the first code. */
export function UnpairedScreen({
  expired = false,
  headless = false,
}: {
  readonly expired?: boolean;
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
            <EnterInitialCode headless />
          ) : (
            <>
              <PairingCode expired={expired} />
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
              <EnterInitialCode headless={false} />
            </>
          )}
        </div>
      </SpecFlowStandaloneShell>
    </StoryLocalization>
  );
}

function PairDeviceDialog({ mode }: { readonly mode: 'code' | 'qr' }) {
  const [tab, setTab] = useState<string>(mode);

  return (
    <Dialog open>
      <DialogContent closeLabel="Close">
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
                <Field>
                  <Field.Label>Code shown on the other device</Field.Label>
                  <TextInput defaultValue="K7QF-M2XD" className="font-mono" />
                </Field>
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
          {tab === 'code' ? <Button>Pair Safari on iPhone</Button> : null}
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

function DevicesDialog({ revoke }: { readonly revoke: boolean }) {
  return (
    <>
      <Dialog open>
        <DialogContent closeLabel="Close">
          <DialogHeader>
            <DialogTitle>Paired devices</DialogTitle>
            <DialogDescription>
              These browsers can approve, finish and close work in SpecFlow on acme-dev. Revoke one
              you no longer use or do not recognise.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <InformationList>
              {devices.map((device) => (
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
      {revoke ? (
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Safari on iPhone?</AlertDialogTitle>
              <AlertDialogDescription>
                It can no longer approve, finish or close anything until it is paired again. Work it
                already did stays.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialogCancel>
              <Button variant="destructive">Revoke</Button>
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
  if (state === 'unpaired' || state === 'unpaired-expired' || state === 'unpaired-headless') {
    return (
      <UnpairedScreen
        expired={state === 'unpaired-expired'}
        headless={state === 'unpaired-headless'}
      />
    );
  }

  return (
    <>
      <WorkflowExecutionFixture scenario="waiting" />
      <StoryLocalization>
        <Delayed>
          {state === 'approve-code' || state === 'approve-qr' ? (
            <PairDeviceDialog mode={state === 'approve-qr' ? 'qr' : 'code'} />
          ) : (
            <DevicesDialog revoke={state === 'devices-revoke'} />
          )}
        </Delayed>
      </StoryLocalization>
    </>
  );
}
