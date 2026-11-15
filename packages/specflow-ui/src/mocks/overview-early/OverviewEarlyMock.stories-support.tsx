import { useState, type ReactNode } from 'react';
import {
  AppContent,
  AppContentContainer,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  Icon,
  IconButton,
  InformationList,
  MarkdownDocument,
  MenuItem,
  OverflowMenu,
  SideNavigation,
  Typography,
  WorkspaceHeader,
  cn,
  useContainerMinWidth,
  type NavigationAdapter,
  type NavigationNode,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { NowBlock } from '../../features/tasks/execution/NowBlock';
import { SessionsSection } from '../../features/sessions/contributions/specification-work/SessionsSection';
import { OperationalRow } from '../../shared/operational-list';
import { WorkspaceSection } from '../../shared/workspace-section';
import {
  documentsFor,
  nextStepTitle,
  overviewMarkdown,
  projectionFor,
  sessionsFor,
  specGoal,
  specSlug,
  specTitle,
  stepStates,
  workflowSteps,
  type EarlyScenario,
  type MockDocument,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview in early and sparse states (no Tasks, no
 * attention, at most one Session). Not production code: static data, no routing, no backend.
 * It renders the real AppShell / AppWorkspace / WorkspaceHeader, the real NowBlock and the real
 * SessionsSection; the Documents section is the production section's primitives (WorkspaceSection,
 * OperationalRow) with the proposed facts. Every story pins one frame size.
 */

export type EarlyArrangement =
  /** A: Documents join the work column while there are no Tasks; Workflow outline in context. */
  | 'proposed'
  /** B: one reading column at any width; no new section. */
  | 'one-column';

export type EarlySecondary =
  | 'none'
  /** The document preview at today's Overview split (Primary 75 / Secondary 25). */
  | 'doc-quarter'
  /** The document preview at the balanced split (50 / 50). */
  | 'doc-half';

export interface OverviewEarlyMockProps {
  width: number;
  height?: number;
  scenario: EarlyScenario;
  arrangement?: EarlyArrangement;
  secondary?: EarlySecondary;
}

/** Production values (WorkView): two columns from 1408 px of content width, 16 px hysteresis. */
const TWO_COLUMN_MIN_WIDTH = 1408;
const TWO_COLUMN_HYSTERESIS = 16;
/** WorkView's section rhythm. */
const opening = 'pt-3 pb-4 @min-[40rem]/work:pb-5';
const following = 'border-t border-border-default py-4 @min-[40rem]/work:py-5';
const noop = () => undefined;

/* ------------------------------------------------------------------------------------------ */
/* Navigation                                                                                   */
/* ------------------------------------------------------------------------------------------ */

interface NavTarget {
  href: string;
}

const navigationNodes = [
  { key: 'specs', label: 'Specifications', target: { href: '#specs' } },
  { key: 'docs', label: 'Documentation', target: { href: '#docs' } },
  {
    key: 'specification',
    label: specTitle,
    children: [
      { key: 'overview', label: 'Overview', target: { href: '#overview' } },
      { key: 'sessions', label: 'Sessions', target: { href: '#sessions' } },
      { key: 'tasks', label: 'Tasks', target: { href: '#tasks' } },
      { key: 'documents', label: 'Documents', target: { href: '#documents' } },
    ],
  },
] as const satisfies readonly NavigationNode<NavTarget>[];

function Navigation() {
  const adapter: NavigationAdapter<NavTarget> = {
    match: (node) => (node.key === 'overview' ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };

  return (
    <div className="px-3 py-4">
      <SideNavigation
        adapter={adapter}
        label="SpecFlow"
        nodes={navigationNodes}
        rootIcons={{ specs: 'file', docs: 'book-open', specification: 'folder' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Sections                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Title and the overview's Goal as the description: no "Show more" under a sentence. */
function Summary() {
  return (
    <div className="grid gap-2">
      <Typography
        as="h1"
        variant="title-lg"
        className="font-semibold text-content-primary [overflow-wrap:anywhere]"
      >
        {specTitle}
      </Typography>
      <Typography
        as="p"
        variant="body-md"
        className="max-w-content-standard text-content-secondary line-clamp-3"
      >
        {specGoal}
      </Typography>
    </div>
  );
}

function Now({ scenario, sessionOffered }: { scenario: EarlyScenario; sessionOffered: boolean }) {
  const projection = projectionFor(scenario);
  const position = projection.position;
  const next = nextStepTitle(scenario);
  const purpose =
    position.kind === 'active'
      ? position.step.purpose
      : position.kind === 'not-started'
        ? position.next.step.purpose
        : undefined;

  return (
    <NowBlock
      projection={projection}
      headingId="mock-now-heading"
      links={{}}
      compactDetail
      showHandoff={false}
      menu={<IconButton icon="ellipsis" size="sm" aria-label="Workflow actions" />}
      summary={
        purpose ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {purpose}
            {next ? <span className="text-content-muted"> Finishing moves to {next}.</span> : null}
          </Typography>
        ) : undefined
      }
      actions={
        position.kind === 'not-started' ? (
          <Button>Start workflow</Button>
        ) : (
          <>
            <Button>Finish step</Button>
            {sessionOffered ? (
              <Button variant="secondary" leadingIcon="chat">
                Start session
              </Button>
            ) : null}
          </>
        )
      }
    />
  );
}

function stateFact(doc: MockDocument): string {
  return doc.state === 'template' ? 'Template only' : `Updated ${doc.updatedMinutesAgo} min ago`;
}

/**
 * Documents while they are the work: every document (no "Show all" below 8), its state (Template
 * only / Updated ...) as the one fact, the template's guidance under a document still a template,
 * and Edit on the row. The title is the document's own, never the repeated Specification title.
 */
function Documents({ scenario, openId }: { scenario: EarlyScenario; openId?: string }) {
  const documents = documentsFor(scenario);

  return (
    <WorkspaceSection aria-labelledby="mock-documents-heading">
      <WorkspaceSection.Header
        id="mock-documents-heading"
        title="Documents"
        icon="file"
        count={documents.length}
        actions={
          <OverflowMenu triggerLabel="Documents" label="Documents">
            <MenuItem leadingIcon="plus" onSelect={noop}>
              New document
            </MenuItem>
            <MenuItem onSelect={noop}>All documents</MenuItem>
          </OverflowMenu>
        }
      />
      <InformationList>
        {documents.map((doc) => (
          <OperationalRow
            key={doc.id}
            primary={doc.title}
            selected={doc.id === openId}
            compactFacts={[stateFact(doc)]}
            supporting={doc.state === 'template' ? doc.guidance : undefined}
            onPrimaryClick={noop}
            trailing={<IconButton icon="edit" size="sm" aria-label={`Edit ${doc.filename}`} />}
          />
        ))}
      </InformationList>
    </WorkspaceSection>
  );
}

/** Where the Specification is in its workflow: every step by title, the current one marked. */
function WorkflowOutline({ scenario }: { scenario: EarlyScenario }) {
  const states = stepStates(scenario);

  return (
    <WorkspaceSection aria-labelledby="mock-workflow-heading">
      <WorkspaceSection.Header
        id="mock-workflow-heading"
        headingTag="h2"
        title="Workflow"
        icon="workflow"
        actions={
          <Button variant="ghost" size="sm">
            History
          </Button>
        }
      />
      <ol className="grid gap-0.5 px-2">
        {workflowSteps.map((step) => {
          const state = states[step.id];

          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex min-h-7 items-center gap-2.5"
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {state === 'done' ? (
                  <Icon name="circle-check" size="sm" className="text-content-muted" />
                ) : (
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      state === 'current' ? 'bg-action-primary' : 'border border-content-muted',
                    )}
                  />
                )}
              </span>
              <Typography
                as="span"
                variant="body-sm"
                className={cn(
                  state === 'current'
                    ? 'font-medium text-content-primary'
                    : state === 'done'
                      ? 'text-content-secondary'
                      : 'text-content-muted',
                )}
              >
                {step.title}
                {state === 'done' ? <span className="sr-only"> (done)</span> : null}
              </Typography>
              {state === 'current' ? (
                <span className="text-body-sm text-content-muted">· Now</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </WorkspaceSection>
  );
}

/** The workspace documentation link (production `specflow.docs.workspace`, unchanged). */
function DocsLink() {
  return (
    <InformationList>
      <OperationalRow
        primary="Documentation"
        compactFacts={[specSlug]}
        onPrimaryClick={noop}
        trailing={<Icon name="chevron-right" size="sm" className="text-content-muted" />}
      />
    </InformationList>
  );
}

function Sessions({ scenario }: { scenario: EarlyScenario }) {
  return (
    <SessionsSection
      sessions={sessionsFor(scenario)}
      onOpenSession={noop}
      onOpenSessionsView={noop}
      onStartSession={noop}
      canStartSession
      canOpenSession
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Overview composition                                                                         */
/* ------------------------------------------------------------------------------------------ */

function OverviewBody({
  scenario,
  arrangement,
  openId,
}: {
  scenario: EarlyScenario;
  arrangement: EarlyArrangement;
  openId?: string;
}) {
  const { matches: wide, setElement } = useContainerMinWidth(TWO_COLUMN_MIN_WIDTH, {
    hysteresis: TWO_COLUMN_HYSTERESIS,
  });
  const hasSession = sessionsFor(scenario).length > 0;
  const proposed = arrangement === 'proposed';
  const twoColumns = proposed && wide;

  const block = (key: string, first: boolean, content: ReactNode) => (
    <div key={key} className={cn(first ? opening : following, 'min-w-0')}>
      {content}
    </div>
  );
  const now = block('now', true, <Now scenario={scenario} sessionOffered={!hasSession} />);
  const documents = (first: boolean) =>
    block('documents', first, <Documents scenario={scenario} openId={openId} />);
  const sessions = (first: boolean) =>
    hasSession ? block('sessions', first, <Sessions scenario={scenario} />) : null;
  const workflow = (first: boolean) =>
    proposed ? block('workflow', first, <WorkflowOutline scenario={scenario} />) : null;
  const docs = block('docs', false, <DocsLink />);

  return (
    <div className="@container/work min-w-0" data-overview-columns={twoColumns ? 2 : 1}>
      <div ref={setElement} aria-hidden="true" className="h-0" />
      {twoColumns ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] gap-x-12">
          <div className="col-span-2 pb-3">
            <Summary />
          </div>
          <div className="min-w-0">
            {now}
            {documents(false)}
          </div>
          <div className="min-w-0" data-overview-column="context">
            {sessions(true)}
            {workflow(!hasSession)}
            {docs}
          </div>
        </div>
      ) : (
        <div className="max-w-content-standard">
          <div className="pb-3">
            <Summary />
          </div>
          {now}
          {sessions(false)}
          {documents(false)}
          {workflow(false)}
          {docs}
        </div>
      )}
    </div>
  );
}

function Workspace({
  scenario,
  arrangement = 'proposed',
  secondary = 'none',
}: OverviewEarlyMockProps) {
  const [docOpen] = useState(secondary !== 'none');

  return (
    <AppWorkspaceProvider scopeKey={`overview-early-${scenario}-${secondary}`}>
      <AppWorkspace
        split={secondary === 'doc-half' ? 'balanced' : 'primary'}
        fit="available"
        labels={{ closeSecondary: 'Close document', backToPrimary: 'Back to Overview' }}
      >
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title="Overview"
              icon="file"
              labels={{ moreActions: 'More actions' }}
              actions={[
                {
                  id: 'history',
                  icon: 'clock',
                  presentation: 'icon',
                  label: 'Activity history',
                  direct: 'always',
                  onPress: noop,
                },
              ]}
            />
          }
        >
          <AppContent className="w-full">
            <AppWorkspaceBody scroll="area" contentClassName="py-6">
              <AppContentContainer align="start" size="full" className="grid gap-6">
                <OverviewBody
                  scenario={scenario}
                  arrangement={arrangement}
                  openId={docOpen ? 'overview' : undefined}
                />
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        {docOpen ? (
          <AppWorkspace.Secondary
            open
            header={
              <WorkspaceHeader
                as="h2"
                title="Overview"
                labels={{ moreActions: 'More actions' }}
                actions={[
                  {
                    id: 'edit',
                    icon: 'edit',
                    label: 'Edit',
                    direct: 'always',
                    onPress: noop,
                  },
                ]}
              />
            }
          >
            <AppContent>
              <AppWorkspaceBody scroll="area">
                <MarkdownDocument source={overviewMarkdown} headingOffset={1} />
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}

export function OverviewEarlyMock(props: OverviewEarlyMockProps): ReactNode {
  const { width, height = 900 } = props;

  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<Navigation />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Navigation' }}
        >
          <Workspace key={JSON.stringify(props)} {...props} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
