import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { OperationalRow } from '../../../shared/operational-list';
import { taskAttentionOverlay, type TaskAttentionSource } from './attentionOverlay';
import { TASK_STATUS_IDS, taskStatusSupporting } from './statusPresentation';

const overlays: readonly [string, TaskAttentionSource][] = [
  ['T-08', { item: { reason: 'on-hold-blocking', blocks: { taskIds: ['T-09', 'T-10', 'T-11'] } } }],
  [
    'T-12',
    {
      item: { reason: 'on-hold-blocking', stepTitle: 'Breakdown', blocks: { finish: 'breakdown' } },
    },
  ],
  ['T-13', { item: { reason: 'task-escalated' }, feedback: 'Which provider should it use?' }],
  ['T-14', { blocksSpecification: true, specificationTitle: 'Single sign-on' }],
  ['T-15', { item: { reason: 'task-broken', message: 'Its manifest cannot be read.' } }],
];

/** Every Task status in its one presentation, then the Requires attention overlays. */
function TaskStatusGallery() {
  const { t } = useTranslation();

  return (
    <main className="grid min-w-0 gap-6">
      <InformationList>
        {TASK_STATUS_IDS.map((id, index) => (
          <OperationalRow
            key={id}
            primary={`Status ${id}`}
            compactFacts={[{ text: `T-0${index}`, mono: true }, 'Backend']}
            supporting={taskStatusSupporting(
              id,
              t(`taskAuthoring.status.${id}`, { defaultValue: id }),
            )}
            dataAttributes={{ 'data-task-status': id }}
          />
        ))}
      </InformationList>
      <InformationList>
        {overlays.map(([id, source]) => (
          <OperationalRow
            key={id}
            primary={`Attention ${id}`}
            compactFacts={[{ text: id, mono: true }, 'Backend']}
            supporting={taskAttentionOverlay(source, t)}
          />
        ))}
      </InformationList>
    </main>
  );
}

const meta = {
  title: 'SpecFlow/Components/Task Status',
  component: TaskStatusGallery,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StoryLocalization>
        <div className="w-full max-w-4xl p-4">
          <Story />
        </div>
      </StoryLocalization>
    ),
  ],
} satisfies Meta<typeof TaskStatusGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
export const GalleryMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
