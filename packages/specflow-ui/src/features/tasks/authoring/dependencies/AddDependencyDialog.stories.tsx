import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { AddDependencyDialog } from './AddDependencyDialog';
import type { DependencyCandidate } from './dependencyModel';

const task = (
  id: string,
  title: string,
  unavailable?: DependencyCandidate['unavailable'],
): DependencyCandidate => ({
  taskId: id,
  ...(unavailable ? { unavailable } : {}),
  task: { id, title, statusLabel: unavailable ? 'Waiting' : 'Ready to start' },
});

/** The Tasks of a Specification as the Engine offers them to "Serve the document write routes". */
const candidates: DependencyCandidate[] = [
  task(
    'create-port-engine-adapter',
    'Put Specification creation behind a SpecificationCreation port',
  ),
  task(
    'documents-ui-one-client',
    'Use the project documents client in both modes',
    'would-create-cycle',
  ),
  task(
    'create-in-memory-adapter',
    'Serve Create in demo over an in-memory SpecificationCreation',
    'would-create-cycle',
  ),
  task('create-ui-project-form', 'Use the project Create form in both modes', 'would-create-cycle'),
  task(
    'sessions-provider-free-runtime',
    'Let the Sessions feature run provider-free over an in-memory store',
  ),
  task(
    'sessions-demo-composition-and-seed',
    'Serve demo Sessions through the shared Sessions features',
    'would-create-cycle',
  ),
  task(
    'sessions-ui-project-start',
    'Use the project New Session start in both modes',
    'would-create-cycle',
  ),
  task(
    'remove-demo-transport',
    'Remove the demo transport and its contracts',
    'would-create-cycle',
  ),
  task(
    'runtime-mode-report',
    'Report the Runtime mode through the normal info route',
    'dependency',
  ),
  task('legacy-demo-fixtures', 'Retire the legacy demo fixtures', 'cancelled'),
];

const meta = {
  title: 'SpecFlow/Task authoring/Add dependencies',
  component: AddDependencyDialog,
  decorators: [withLocale('en')],
  parameters: { layout: 'fullscreen' },
  args: {
    taskTitle: 'Serve the document write routes in both modes',
    open: true,
    onOpenChange: fn(),
    candidates,
    pending: false,
    onAdd: fn(),
  },
} satisfies Meta<typeof AddDependencyDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** As it opens: the Tasks that can be added, the unavailable ones collapsed after them. */
export const Default: Story = {};

/**
 * Owner re-review (2026-11-26): Task titles, never ids; the Tasks that can be added first; the others
 * in a collapsed "Unavailable tasks" group, each with its reason; the confirm names the count.
 */
export const MostUnavailable: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body.querySelector<HTMLElement>('[role="dialog"]')!);
    await expect(dialog.queryByText(/create-port-engine-adapter/)).toBeNull();
    await expect(dialog.getByText('Available tasks')).toBeVisible();
    // The unavailable Tasks are not in the way until asked for.
    await expect(
      dialog.getByText('Use the project documents client in both modes'),
    ).not.toBeVisible();
    const add = dialog.getByRole('button', { name: 'Add dependencies' });
    await expect(add).toBeDisabled();
    await userEvent.click(
      dialog.getByRole('checkbox', {
        name: 'Put Specification creation behind a SpecificationCreation port',
      }),
    );
    await userEvent.click(
      dialog.getByRole('checkbox', {
        name: 'Let the Sessions feature run provider-free over an in-memory store',
      }),
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Add 2 dependencies' }));
    await expect(args.onAdd).toHaveBeenCalledWith([
      'create-port-engine-adapter',
      'sessions-provider-free-runtime',
    ]);
    await userEvent.click(dialog.getByRole('button', { name: /Unavailable tasks/ }));
    const cycle = dialog.getByRole('checkbox', {
      name: 'Use the project documents client in both modes',
    });
    await expect(cycle).toBeDisabled();
    await expect(
      dialog.getAllByText('Depends on this task already; adding it would create a cycle')[0],
    ).toBeVisible();
    await expect(
      dialog.getByRole('checkbox', {
        name: 'Report the Runtime mode through the normal info route',
      }),
    ).toBeChecked();
    // The search filters both groups.
    await userEvent.type(dialog.getByRole('searchbox', { name: 'Search tasks' }), 'sessions');
    await expect(
      dialog.queryByRole('checkbox', { name: 'Use the project Create form in both modes' }),
    ).toBeNull();
    await expect(
      dialog.getByRole('checkbox', {
        name: 'Let the Sessions feature run provider-free over an in-memory store',
      }),
    ).toBeVisible();
  },
};

/** Every other Task is unavailable: said in the available group; the reasons stay one tap away. */
export const AllUnavailable: Story = {
  args: {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      unavailable: candidate.unavailable ?? 'would-create-cycle',
    })),
  },
  play: async () => {
    const dialog = within(document.body.querySelector<HTMLElement>('[role="dialog"]')!);
    await expect(dialog.getByText('No task can be added now.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add dependencies' })).toBeDisabled();
  },
};

/** The Specification has no other Task. */
export const NoOtherTasks: Story = {
  args: { candidates: [] },
  play: async () => {
    const dialog = within(document.body.querySelector<HTMLElement>('[role="dialog"]')!);
    await expect(dialog.getByText('There are no other tasks in this specification.')).toBeVisible();
  },
};

/** Long titles wrap inside the dialog at 375 px; nothing scrolls sideways. */
export const LongTitles: Story = {
  args: {
    taskTitle:
      'Serve the document write routes in both modes, with the in-memory adapter and the project store behind one port',
    candidates: [
      task(
        'a',
        'Put Specification creation behind a SpecificationCreation port shared by the project and the in-memory demo Runtime, with one contract',
      ),
      task('b', 'Supercalifragilisticexpialidociousdocumentationreconciliationtask'),
      task('c', 'Use the project documents client in both modes', 'broken'),
    ],
  },
  play: async () => {
    const picker = await within(document.body).findByRole('dialog');
    // An unbroken title wraps: no row is wider than the picker that holds it.
    const list = picker.querySelector<HTMLElement>('[data-item-picker]')!;
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  },
};
