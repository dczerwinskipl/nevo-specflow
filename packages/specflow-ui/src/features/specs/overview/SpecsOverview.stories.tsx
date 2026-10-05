import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell, Separator, Typography } from '@nevo/ui';

import { NevoBrandLogo, defaultNevoBrand } from '../../../brand';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { AppLocale } from '../../../i18n';
import { createLongContentFixture, createSpecItem, createSpecsFixture } from './fixtures';
import type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecsOverviewSource,
  SpecsOverviewState,
  SteeringTarget,
} from './model';
import { SpecsOverview } from './SpecsOverview';
import { useSpecsOverview } from './useSpecsOverview';

function SourceLifecycleFixture() {
  const [collection, setCollection] = useState<SpecsCollection>('active');
  const pending = useRef<
    {
      collection: SpecsCollection;
      resolve: (value: SpecsOverviewProjection) => void;
      reject: (error: Error) => void;
    }[]
  >([]);
  const source = useMemo<SpecsOverviewSource>(
    () => ({
      read: (scope) =>
        new Promise((resolve, reject) => {
          // Deliberately ignores cancellation: the owner must also guard late responses.
          pending.current.push({ collection: scope, resolve, reject });
        }),
    }),
    [],
  );
  const { state, refresh } = useSpecsOverview(source, collection);
  const settle = (scope: SpecsCollection, failure = false) => {
    const request = pending.current.findLast((item) => item.collection === scope);
    if (!request) throw new Error('Expected a pending collection request.');
    if (failure) request.reject(new Error('Fixture unavailable'));
    else request.resolve(createSpecsFixture(scope));
  };
  return (
    <StoryLocalization locale="en">
      <div className="h-dvh">
        <AppShell navigation={<Typography className="p-4">Specs</Typography>}>
          <SpecsOverview state={state} onCollectionChange={setCollection} onRefresh={refresh} />
        </AppShell>
      </div>
      <div className="flex gap-4 p-4" aria-label="Source test controls">
        <button type="button" onClick={() => settle('active')}>
          Resolve Active
        </button>
        <button type="button" onClick={() => settle('archive')}>
          Resolve Archive
        </button>
        <button type="button" onClick={() => settle('archive', true)}>
          Fail Archive
        </button>
      </div>
    </StoryLocalization>
  );
}

function OverviewFixture({
  state,
  locale = 'en',
  interactive = true,
  selectable = false,
}: {
  state: SpecsOverviewState;
  locale?: AppLocale;
  interactive?: boolean;
  selectable?: boolean;
}) {
  const [collectionOverride, setCollectionOverride] = useState<SpecsOverviewState>();
  const [target, setTarget] = useState<SteeringTarget>();
  const [refreshes, setRefreshes] = useState(0);
  const [sessionStarts, setSessionStarts] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <StoryLocalization locale={locale}>
      <div className="h-dvh w-full">
        <AppShell
          brandPrimary={defaultNevoBrand.coreColor}
          navigation={
            <div className="grid content-start gap-4 p-4">
              <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" type="horizontal" size="md" />
              <Separator />
              <Typography variant="label-sm">
                {locale === 'pl' ? 'Specyfikacje' : 'Specs'}
              </Typography>
            </div>
          }
        >
          <SpecsOverview
            state={collectionOverride ?? state}
            onCollectionChange={(collection) =>
              setCollectionOverride({
                collection,
                projection: createSpecsFixture(collection),
                loading: false,
                refreshing: false,
                error: false,
              })
            }
            onRefresh={() => setRefreshes((count) => count + 1)}
            onCreateSession={interactive ? () => setSessionStarts((count) => count + 1) : undefined}
            onOpenTarget={interactive ? setTarget : undefined}
            selectionFor={
              selectable
                ? (id) => ({
                    selected: selected.includes(id),
                    onSelectedChange: (checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current.filter((value) => value !== id), id]
                          : current.filter((value) => value !== id),
                      ),
                  })
                : undefined
            }
          />
          <output className="sr-only" aria-label="Fixture interaction result">
            {JSON.stringify({ target, refreshes, selected, sessionStarts })}
          </output>
        </AppShell>
      </div>
    </StoryLocalization>
  );
}

const loaded: SpecsOverviewState = {
  collection: 'active',
  projection: createSpecsFixture(),
  loading: false,
  refreshing: false,
  error: false,
};
const meta = {
  title: 'SpecFlow/Screens/Specs Overview',
  component: OverviewFixture,
  args: { state: loaded },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OverviewFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const rows = canvasElement.querySelectorAll('[data-spec-id]');
    if (rows.length !== 7) throw new Error('Every Specification must occupy one queue position.');
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Open specification: Deterministic admission and execution boundaries',
      }),
    );
    if (
      !canvas
        .getByLabelText('Fixture interaction result')
        .textContent?.includes('"kind":"specification"')
    )
      throw new Error('Identity must preserve neutral Spec intent.');
    if (canvas.queryByRole('button', { name: /TASK-03 requires review/ }))
      throw new Error('The overview must have one Spec destination, not nested task actions.');
    const titleEdges = [...canvasElement.querySelectorAll('[data-spec-title]')].map(
      (element) => element.getBoundingClientRect().left,
    );
    const headingEdges = [...canvasElement.querySelectorAll('summary h2')].map(
      (element) => element.getBoundingClientRect().left,
    );
    if ([...titleEdges, ...headingEdges].some((left) => Math.abs(left - titleEdges[0]!) > 1))
      throw new Error('All titles and group labels must share the same content axis.');
    const header = canvasElement.querySelector('summary')!;
    const surfaceProbe = document.createElement('div');
    surfaceProbe.className = 'bg-surface-control';
    canvasElement.append(surfaceProbe);
    const surfaceColor = getComputedStyle(surfaceProbe).backgroundColor;
    surfaceProbe.remove();
    if (getComputedStyle(header).backgroundColor !== surfaceColor)
      throw new Error('Group headers must use the stronger shared control surface token.');
    for (const reason of canvasElement.querySelectorAll<HTMLElement>('[data-spec-reason]')) {
      const summary = reason.parentElement!;
      const key = summary.firstElementChild!;
      const text = reason.querySelector('span')!;
      const keyRange = document.createRange();
      keyRange.selectNodeContents(key);
      const reasonRange = document.createRange();
      reasonRange.selectNodeContents(text);
      const lineHeight = parseFloat(getComputedStyle(summary).lineHeight);
      const offset =
        (reasonRange.getClientRects()[0]!.top - keyRange.getClientRects()[0]!.top) / lineHeight;
      if (Math.abs(offset - Math.round(offset)) > 0.05)
        throw new Error('Reason text must share the metadata baseline, including after wrapping.');
    }
    canvas.getByText('Implementer · 3 Tasks');
    const attention = canvas.getByText('Requires attention').closest('details');
    const ready = canvas.getByText('Ready', { exact: true }).closest('details');
    if (!attention || !ready) throw new Error('Expected independent steering disclosures.');
    await userEvent.click(attention.querySelector('summary')!);
    if (attention.open || !ready.open)
      throw new Error('Collapsing one group must not close another.');
    await userEvent.click(attention.querySelector('summary')!);
    if (!attention.open || !ready.open) throw new Error('Groups must reopen independently.');
  },
};
export const SpecLevelAttention: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[1]!] },
    },
  },
};
export const Ready: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[3]!] },
    },
  },
};
export const BatchWorking: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[4]!] },
    },
  },
};
export const SingleTaskWorking: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...loaded.projection!,
        items: [
          createSpecItem({
            ...createSpecsFixture().items[4]!,
            currentExecutions: [
              { sessionId: 'single', agentRole: 'Implementer', taskIds: ['TASK-02'] },
            ],
          }),
        ],
      },
    },
  },
};
export const QuietAndRemediation: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: createSpecsFixture().items.slice(5) },
    },
  },
};
export const Loading: Story = {
  args: { state: { collection: 'active', loading: true, refreshing: false, error: false } },
};
export const EmptyActive: Story = {
  args: { state: { ...loaded, projection: { ...loaded.projection!, items: [] } } },
};
export const EmptyArchive: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: { ...createSpecsFixture('archive'), items: [] },
    },
  },
};
export const Unavailable: Story = {
  args: { state: { collection: 'active', loading: false, refreshing: false, error: true } },
};
export const Refreshing: Story = { args: { state: { ...loaded, refreshing: true } } };
export const RefreshFailure: Story = { args: { state: { ...loaded, error: true } } };
export const PartialSignalFailure: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...loaded.projection!,
        items: [
          createSpecItem({ ...createSpecsFixture().items[0]!, steeringAvailable: false }),
          ...createSpecsFixture().items.slice(1),
        ],
      },
    },
  },
};
export const Archive: Story = {
  args: { state: { ...loaded, collection: 'archive', projection: createSpecsFixture('archive') } },
  play: async ({ canvas, userEvent }) => {
    const search = canvas.getByRole('textbox', { name: 'Search specs' });
    await userEvent.type(search, 'canonical');
    if (canvas.queryByText('Requires attention'))
      throw new Error('Archive must remain historical.');
    await userEvent.clear(search);
    await userEvent.type(search, 'does-not-exist');
    canvas.getByText('No matching specifications');
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }));
    canvas.getByText('Canonical Session, Turn and Work model');
  },
};
export const CollectionSwitch: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Archive' }));
    canvas.getByRole('textbox', { name: 'Search specs' });
    if (canvas.queryByText('Requires attention'))
      throw new Error('Active signals cannot leak into Archive.');
    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    canvas.getByText('Requires attention');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
    const refresh = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Refresh',
    );
    if (!refresh) throw new Error('Refresh should be available in the owning header menu.');
    if (!refresh.querySelector('svg')) throw new Error('Refresh must have its semantic icon.');
    await userEvent.click(refresh);
    if (!canvas.getByLabelText('Fixture interaction result').textContent?.includes('"refreshes":1'))
      throw new Error('Refresh must notify the collection owner.');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
    const createSession = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Create session',
    );
    if (!createSession?.querySelector('svg'))
      throw new Error('Create session must expose a semantic icon.');
    await userEvent.click(createSession);
    if (
      !canvas
        .getByLabelText('Fixture interaction result')
        .textContent?.includes('"sessionStarts":1')
    )
      throw new Error('Session start must notify the application owner.');
  },
};
export const LongContent: Story = {
  args: { state: { ...loaded, projection: createLongContentFixture() } },
};
export const Polish: Story = { args: { locale: 'pl' } };
export const Selection: Story = {
  args: { selectable: true },
  play: async ({ canvas, userEvent }) => {
    const reasons = [...document.querySelectorAll('[data-spec-reason]')];
    if (reasons.length < 3 || reasons.some((reason) => !reason.querySelector('svg')))
      throw new Error('Each dominant attention/issue reason must have a passive icon.');
    const firstTitle = canvas.getByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
    });
    const firstCheckbox = canvas.getByRole('checkbox', {
      name: 'Select specification: Deterministic admission and execution boundaries',
    });
    const titleBox = firstTitle.getBoundingClientRect();
    const rowBox = firstTitle.closest('[data-spec-id]')!.getBoundingClientRect();
    const checkboxBox = firstCheckbox.getBoundingClientRect();
    if (
      checkboxBox.width !== 16 ||
      titleBox.left - checkboxBox.right < 16 ||
      Math.abs(rowBox.top + rowBox.height / 2 - checkboxBox.top - checkboxBox.height / 2) > 1
    )
      throw new Error(
        'Standard checkbox must have breathing room and be vertically centered in its row.',
      );
    await userEvent.click(
      canvas.getByRole('checkbox', {
        name: 'Select specification: Deterministic admission and execution boundaries',
      }),
    );
    const result = canvas.getByLabelText('Fixture interaction result');
    if (
      !result.textContent?.includes('"selected":["admission"]') ||
      result.textContent.includes('"target"')
    )
      throw new Error('Selection must not activate the row destination.');
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Open specification: Deterministic admission and execution boundaries',
      }),
    );
    if (!result.textContent?.includes('"specId":"admission"'))
      throw new Error('Navigation must retain stable identity rather than the display key.');
    const pr = canvas.getByRole('link', {
      name: 'Open pull request #27 — Deterministic admission and execution boundaries',
    });
    if (pr.getAttribute('href') !== 'https://example.test/pull/27')
      throw new Error('PR must preserve its explicit destination.');
    if (!pr.querySelector('svg')) throw new Error('PR links must expose the branch icon.');
    const metadata = pr.closest('[data-spec-metadata]')!;
    if (
      [...metadata.children].some(
        (element) => Math.abs(element.getBoundingClientRect().height - 24) > 1,
      )
    )
      throw new Error('PR and pills must share the compact metadata line height.');
    if (firstTitle.closest('[data-spec-id]')!.getBoundingClientRect().width >= 672) {
      const metadataBox = metadata.getBoundingClientRect();
      const currentRowBox = firstTitle.closest('[data-spec-id]')!.getBoundingClientRect();
      if (
        Math.abs(
          metadataBox.top + metadataBox.height / 2 - currentRowBox.top - currentRowBox.height / 2,
        ) > 1
      )
        throw new Error('Wide metadata must be vertically centered in its row.');
    }
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Specification actions: Runtime authorization and project access policy',
      }),
    );
    const menu = document.querySelector('[role="menu"]');
    const open = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
      (element) => element.textContent === 'Open specification',
    );
    if (!open) throw new Error('Row overflow must expose its independent menu.');
    if (!open.querySelector('svg')) throw new Error('Open specification must expose its icon.');
    await userEvent.click(open);
    if (!result.textContent?.includes('"specId":"security"'))
      throw new Error('Menu must act on its owning Spec.');
  },
};
export const MetadataOverflow: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createLongContentFixture(),
        items: [
          createSpecItem({
            ...createLongContentFixture().items[0]!,
            pullRequests: [27, 31, 34].map((number) => ({
              number,
              url: `https://example.test/pull/${number}`,
            })),
            tags: [
              'Very long stable product area label with realistic content',
              'Runtime',
              'Provider',
              'Auth',
            ],
          }),
        ],
      },
    },
  },
};
export const ReadOnlyPreview: Story = {
  args: { interactive: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
    const createSession = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Create session',
    );
    if (createSession?.getAttribute('aria-disabled') !== 'true')
      throw new Error('Session creation must remain disabled without the owner capability.');
    await userEvent.keyboard('{Escape}');
  },
};
export const Mobile: Story = {
  ...LongContent,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const SourceLifecycle: Story = {
  render: () => <SourceLifecycleFixture />,
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('status', { name: 'Loading specifications' });
    await userEvent.click(canvas.getByRole('radio', { name: 'Archive' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Active' }));
    if (canvas.queryByText('Requires attention'))
      throw new Error('A late Active response must not leak into Archive.');
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Archive' }));
    await canvas.findByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
    const refresh = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Refresh',
    );
    if (!refresh) throw new Error('Missing scoped refresh.');
    await userEvent.click(refresh);
    canvas.getByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Fail Archive' }));
    await canvas.findByRole('alert');
    canvas.getByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Archive' }));
    await canvas.findByText('Canonical Session, Turn and Work model');
    if (canvas.queryByRole('alert')) throw new Error('Successful retry must clear the error.');
  },
};
