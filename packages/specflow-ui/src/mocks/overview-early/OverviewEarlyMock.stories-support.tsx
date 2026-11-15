import type { ReactNode } from 'react';
import {
  AppContent,
  AppContentContainer,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  EmptyState,
  Icon,
  IconButton,
  InformationList,
  MarkdownDocument,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  OverflowMenu,
  SideNavigation,
  TooltipProvider,
  Typography,
  WorkspaceHeader,
  cn,
  treeRowActionClassName,
  useContainerMinWidth,
  type IconName,
  type NavigationAdapter,
  type NavigationNode,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { NowBlock } from '../../features/tasks/execution/NowBlock';
import { SessionsSection } from '../../features/sessions/contributions/specification-work/SessionsSection';
import { TreeDocumentRow, TreeLevel } from '../../shared/document-tree';
import { TasksSummarySection } from '../../features/tasks/contributions/specification-overview/TasksSummarySection';
import type { SpecificationWorkSectionContext } from '../../features/specs';
import { OperationalRow } from '../../shared/operational-list';
import { WorkspaceSection } from '../../shared/workspace-section';
import {
  documentsFor,
  firstTasksOverview,
  nextStepTitle,
  producingStep,
  stepIndex,
  overviewMarkdown,
  projectionFor,
  sessionsFor,
  specGoal,
  specSlug,
  specTitle,
  workflowSteps,
  type EarlyScenario,
  type MockDocument,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview in early and sparse states (no Tasks, no
 * attention, at most one Session). Not production code: static data, no routing, no backend.
 * It renders the real AppShell / AppWorkspace / WorkspaceHeader, the real NowBlock, the real
 * SessionsSection and TasksSummarySection, and the Documents page's own document row (TreeDocumentRow
 * in a flat TreeLevel, row ⋯ menu). Variant D: every applicable section is always present; an empty
 * one is its header and an inline EmptyState (the Tasks page's pattern). Every story pins one frame.
 */

export type EarlySecondary =
  | 'none'
  /** The document preview at the balanced split (50 / 50); the Overview is one column. */
  | 'doc-half';

export interface OverviewEarlyMockProps {
  width: number;
  height?: number;
  scenario: EarlyScenario;
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

/** "Step 2 of 7 · next: Design the solution" for an active work step. */
function progressLine(scenario: EarlyScenario): string {
  const index = stepIndex(scenario);
  const next = nextStepTitle(scenario);
  if (index < 0) {
    return `${workflowSteps.length} steps`;
  }

  return `Step ${index + 1} of ${workflowSteps.length}${next ? ` · next: ${next}` : ''}`;
}

/** The workflow's position and its one main action; the step's purpose and a progress line. */
function Now({ scenario }: { scenario: EarlyScenario }) {
  const projection = projectionFor(scenario);
  const position = projection.position;
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
        <div className="grid gap-0.5">
          {purpose ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {purpose}
            </Typography>
          ) : null}
          <Typography as="p" variant="body-sm" className="text-content-muted">
            {progressLine(scenario)}
          </Typography>
        </div>
      }
      actions={
        <Button>{position.kind === 'not-started' ? 'Start workflow' : 'Finish step'}</Button>
      }
    />
  );
}

const typeIcon: Record<string, IconName> = {
  overview: 'book-open',
  behaviour: 'list-ordered',
  ux: 'panels-top-left',
  backend: 'server',
  decisions: 'file-check',
};

function DocumentMenu({ doc }: { doc: MockDocument }) {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton
          className={treeRowActionClassName}
          icon="ellipsis"
          size="sm"
          aria-label={`Actions for ${doc.filename}`}
        />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={noop}>Open</MenuItem>
        <MenuItem leadingIcon="edit" onSelect={noop}>
          Edit
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Documents with the Documents page's row: type glyph, file name, a quiet "Template only" state,
 * the type, last change and template instruction in the tooltip, row click opens, ⋯ holds Edit.
 * All documents below 8 (no "Show all"); the overview leads.
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
      <TreeLevel top flat labelledBy="mock-documents-heading">
        {documents.map((doc) => (
          <TreeDocumentRow
            key={doc.id}
            name={doc.filename}
            glyph={typeIcon[doc.id]}
            lead={doc.id === 'overview'}
            state={doc.state === 'template' ? { text: 'Template only' } : undefined}
            details={[
              `Type: ${doc.title}`,
              doc.state === 'template' ? doc.guidance : `Updated ${doc.updatedMinutesAgo} min ago`,
            ]}
            spokenDetail={doc.title}
            current={doc.id === openId}
            onOpen={noop}
            menu={<DocumentMenu doc={doc} />}
          />
        ))}
      </TreeLevel>
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

/**
 * Sessions: the production section when there are Sessions; while Sessions are offered and there
 * is none, the same header with an inline empty state whose action starts one.
 */
function Sessions({ scenario }: { scenario: EarlyScenario }) {
  const sessions = sessionsFor(scenario);
  if (sessions.length > 0) {
    return (
      <SessionsSection
        sessions={sessions}
        onOpenSession={noop}
        onOpenSessionsView={noop}
        onStartSession={noop}
        canStartSession
        canOpenSession
      />
    );
  }

  return (
    <WorkspaceSection aria-labelledby="mock-sessions-heading">
      <WorkspaceSection.Header
        id="mock-sessions-heading"
        headingTag="h2"
        title="Sessions"
        icon="chat"
      />
      <EmptyState
        variant="inline"
        title="No sessions yet"
        actions={
          <Button variant="secondary" size="sm" leadingIcon="chat">
            Start session
          </Button>
        }
      />
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Always-present work sections (variant D)                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Requires attention with no items: its header and one inline empty line. */
function AttentionEmpty() {
  return (
    <WorkspaceSection aria-labelledby="mock-attention-heading">
      <WorkspaceSection.Header
        id="mock-attention-heading"
        headingTag="h2"
        title="Requires attention"
        icon="triangle-alert"
      />
      <EmptyState variant="inline" title="Nothing needs your attention right now" />
    </WorkspaceSection>
  );
}

/**
 * Tasks: the production summary once Tasks exist; before that its header and the Tasks page's own
 * empty state, naming the step that produces Tasks and its position (from the workflow).
 */
function Tasks({ scenario }: { scenario: EarlyScenario }) {
  if (scenario === 'tasks-created') {
    const context = {
      specId: specSlug,
      data: { taskOverview: firstTasksOverview },
      actions: { openTasks: noop, tasksHref: () => '#tasks' },
    } as unknown as SpecificationWorkSectionContext;

    return <TasksSummarySection {...context} />;
  }

  return (
    <WorkspaceSection aria-labelledby="mock-tasks-heading">
      <WorkspaceSection.Header
        id="mock-tasks-heading"
        headingTag="h2"
        title="Tasks"
        icon="list-checks"
      />
      <EmptyState
        variant="inline"
        title="No tasks yet"
        description={`Tasks appear when the workflow reaches ${producingStep.title} (step ${producingStep.position} of ${workflowSteps.length}).`}
      />
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Overview composition: the accepted contract arrangement                                      */
/* ------------------------------------------------------------------------------------------ */

function OverviewBody({ scenario, openId }: { scenario: EarlyScenario; openId?: string }) {
  const { matches: wide, setElement } = useContainerMinWidth(TWO_COLUMN_MIN_WIDTH, {
    hysteresis: TWO_COLUMN_HYSTERESIS,
  });

  const block = (key: string, first: boolean, content: ReactNode) => (
    <div key={key} className={cn(first ? opening : following, 'min-w-0')}>
      {content}
    </div>
  );
  const work = [
    block('now', true, <Now scenario={scenario} />),
    block('attention', false, <AttentionEmpty />),
    block('tasks', false, <Tasks scenario={scenario} />),
  ];
  const context = (opensColumn: boolean) => [
    block('sessions', opensColumn, <Sessions scenario={scenario} />),
    block('documents', false, <Documents scenario={scenario} openId={openId} />),
    block('docs', false, <DocsLink />),
  ];

  return (
    <div className="@container/work min-w-0" data-overview-columns={wide ? 2 : 1}>
      <div ref={setElement} aria-hidden="true" className="h-0" />
      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] gap-x-12">
          <div className="col-span-2 pb-3">
            <Summary />
          </div>
          <div className="min-w-0">{work}</div>
          <div className="min-w-0" data-overview-column="context">
            {context(true)}
          </div>
        </div>
      ) : (
        <div className="max-w-content-standard">
          <div className="pb-3">
            <Summary />
          </div>
          {work}
          {context(false)}
        </div>
      )}
    </div>
  );
}

function Workspace({ scenario, secondary = 'none' }: OverviewEarlyMockProps) {
  const docOpen = secondary !== 'none';

  return (
    <AppWorkspaceProvider scopeKey={`overview-early-${scenario}-${secondary}`}>
      <AppWorkspace
        split={docOpen ? 'balanced' : 'primary'}
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
                <OverviewBody scenario={scenario} openId={docOpen ? 'overview' : undefined} />
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
                title="overview.md"
                labels={{ moreActions: 'More actions' }}
                actions={[
                  { id: 'edit', icon: 'edit', label: 'Edit', direct: 'always', onPress: noop },
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
      <TooltipProvider>
        <div style={{ width, height }} data-mock-frame={width}>
          <AppShell
            navigation={<Navigation />}
            style={{ height: '100%' }}
            labels={{ navigationTitle: 'Navigation' }}
          >
            <Workspace key={JSON.stringify(props)} {...props} />
          </AppShell>
        </div>
      </TooltipProvider>
    </StoryLocalization>
  );
}
