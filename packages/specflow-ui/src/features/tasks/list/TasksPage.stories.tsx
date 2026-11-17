import type { Meta, StoryObj } from '@storybook/react-vite';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { TasksPage } from './TasksPage';
import type { TaskListRowView, TaskListView } from './taskListModel';

const HOLD = 'Waiting for the identity provider sandbox account from IT.';

const row = (
  id: string,
  title: string,
  typeTitle: string,
  statusId: string,
  lifecycle: TaskListRowView['lifecycle'],
  more: Partial<TaskListRowView> = {},
): TaskListRowView => ({ id, title, typeTitle, statusId, lifecycle, ...more });

/** The audit state: one Task in progress, one on hold with its reason (nothing waits on it). */
const audit: TaskListView = {
  groups: [
    {
      id: 'in-progress',
      name: 'In progress',
      collapsed: false,
      rows: [
        row(
          'oidc-callback',
          'OIDC callback endpoint and session issue',
          'Implementation',
          'in-progress',
          'in_progress',
        ),
      ],
    },
    {
      id: 'on-hold',
      name: 'On hold',
      collapsed: false,
      rows: [
        row(
          'sign-in-screen',
          'Sign-in screen with the SSO button',
          'UI implementation',
          'on-hold',
          'blocked',
          { holdReason: HOLD },
        ),
      ],
    },
  ],
  progress: { completed: 0, total: 2, cancelled: 0, ended: 0, onHold: 1 },
};

/** Every status of the one presentation model, then the overlays, in one group. */
const gallery: TaskListView = {
  groups: [
    {
      id: 'all',
      name: 'All states',
      collapsed: false,
      rows: [
        row('t-draft', 'Session refresh rules', 'Backend', 'draft', 'pending', {
          dependsOn: ['T-02'],
        }),
        row('t-ready', 'Logout across tabs', 'UI', 'ready', 'pending'),
        row('t-waiting', 'Remember the last provider', 'UI', 'waiting', 'pending', {
          waitingFor: ['oidc-callback'],
        }),
        row('t-active', 'Token exchange endpoint', 'Backend', 'in-progress', 'in_progress'),
        row('t-held', 'Audit log of sign-in events', 'Backend', 'on-hold', 'blocked', {
          holdReason: HOLD,
        }),
        row('t-blocked', 'Rate limits for sign-in', 'Backend', 'blocked', 'blocked', {
          attention: {
            reason: 'context-unresolved',
            message:
              'Cannot start: its context entry requirements.md › Rate limits no longer exists',
          },
        }),
        row('t-holds-up', 'Provider metadata cache', 'Backend', 'on-hold', 'blocked', {
          holdReason: 'Waiting for the provider to publish its new keys.',
          attention: { reason: 'on-hold-blocking', blocks: { taskIds: ['t-a', 't-b', 't-c'] } },
        }),
        row('t-finish', 'Sign-in screen with the SSO button', 'UI', 'on-hold', 'blocked', {
          holdReason: HOLD,
          attention: {
            reason: 'on-hold-blocking',
            stepTitle: 'Break the solution down',
            blocks: { finish: 'breakdown' },
          },
        }),
        row('t-escalated', 'Provider selection', 'Spike', 'on-hold', 'blocked', {
          holdReason: 'Which provider should the first release support?',
          attention: { reason: 'task-escalated', message: 'It escalated.' },
        }),
        row('t-stuck', 'Session cookie flags', 'Backend', 'draft', 'pending', {
          blocksSpecification: true,
        }),
        row('t-done', 'Evaluate identity provider SDKs', 'Spike', 'completed', 'completed'),
        row('t-cancelled', 'SAML fallback for legacy tenants', 'Backend', 'cancelled', 'blocked'),
        { id: 't-broken', statusId: 'broken', lifecycle: 'blocked', broken: true },
      ],
    },
  ],
  progress: { completed: 1, total: 11, cancelled: 1, ended: 0, onHold: 4 },
};

/** The long Polish title wraps inside the title track only (834: about 410 px of title track). */
const polish: TaskListView = {
  groups: [
    {
      id: 'on-hold',
      name: 'Wstrzymane',
      collapsed: false,
      rows: [
        row(
          'sign-in-screen',
          'Ekran logowania z przyciskiem SSO i komunikatami błędów',
          'Implementacja UI',
          'on-hold',
          'blocked',
          { holdReason: 'Czekamy na konto testowe dostawcy tożsamości od działu IT.' },
        ),
      ],
    },
  ],
  progress: { completed: 0, total: 1, cancelled: 0, ended: 0, onHold: 1 },
};

function TasksPageStory({
  view,
  locale = 'en',
}: {
  readonly view: TaskListView;
  readonly locale?: 'en' | 'pl';
}) {
  return (
    <StoryLocalization locale={locale}>
      <div className="w-full p-4">
        <TasksPage
          state={{ status: 'ready', view }}
          blocking={false}
          fullTaskHref={(taskId) => `/specs/sso/tasks/${taskId}`}
          onOpenTask={() => undefined}
          onClearBlocking={() => undefined}
          onNewTask={() => undefined}
          specificationTitle="SSO sign-in"
        />
      </div>
    </StoryLocalization>
  );
}

const meta = {
  title: 'SpecFlow/Features/Tasks Page',
  component: TasksPageStory,
  parameters: { layout: 'fullscreen' },
  args: { view: audit },
} satisfies Meta<typeof TasksPageStory>;
export default meta;
type Story = StoryObj<typeof meta>;

/** In progress and a person's hold: the status is kept, the reason is the supporting line. */
export const InProgressAndOnHold: Story = {
  play: ({ canvasElement }) => {
    const held = canvasElement.querySelector('[data-row-task="sign-in-screen"]');
    if (!held?.textContent?.includes(`On hold${HOLD}`)) {
      throw new Error('On hold keeps its label and shows the reason once, under it.');
    }
  },
};
export const InProgressAndOnHoldMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
/** Every status mark and each attention overlay, added under the status. */
export const StatusGallery: Story = { args: { view: gallery } };
export const StatusGalleryMobile: Story = {
  args: { view: gallery },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const LongPolishTitle: Story = { args: { view: polish, locale: 'pl' } };
