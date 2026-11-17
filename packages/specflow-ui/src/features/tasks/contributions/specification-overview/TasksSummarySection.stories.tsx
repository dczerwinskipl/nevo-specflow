import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { mapWorkspaceResponse } from '../../../specs/read-model/mapWorkspaceResponse';
import type { SpecificationWorkspaceData } from '../../../specs/read-model';
import { createFakeWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import { controlCenterWorkspace } from '../../overview/controlCenter.stories-support';
import { TasksSummarySection } from './TasksSummarySection';
import { tasksPreviewFixtures, type TasksPreviewFixture } from './tasksPreview.stories-support';

const empty: TaskOverview = { rows: [], compact: [] };

function TasksSummaryStory({
  fixture,
  data,
}: {
  readonly fixture: TasksPreviewFixture | 'empty';
  readonly data?: SpecificationWorkspaceData;
}) {
  if (!data) {
    return null;
  }

  return (
    <StoryLocalization locale="en">
      {/* About the Overview's work column at 1440 (two columns), narrower in the mobile story. */}
      <div className="w-full max-w-[62rem] p-4">
        <TasksSummarySection
          specId="sso"
          data={{
            ...data,
            taskOverview: fixture === 'empty' ? empty : tasksPreviewFixtures[fixture],
          }}
          actions={createFakeWorkspaceRuntime()}
        />
      </div>
    </StoryLocalization>
  );
}

const meta = {
  title: 'SpecFlow/Features/Overview Tasks',
  component: TasksSummaryStory,
  parameters: { layout: 'fullscreen' },
  args: { fixture: 'three' },
  argTypes: {
    fixture: { control: 'inline-radio', options: ['three', 'seven', 'twentyFive', 'empty'] },
  },
  loaders: [async () => ({ data: mapWorkspaceResponse(await controlCenterWorkspace('waiting')) })],
  render: (args, { loaded }) => (
    <TasksSummaryStory {...args} data={loaded.data as SpecificationWorkspaceData} />
  ),
} satisfies Meta<typeof TasksSummaryStory>;
export default meta;
type Story = StoryObj<typeof meta>;

const mobile = { viewport: { value: 'mobile1', isRotated: false } };

/** 3 Tasks: in progress, one waiting for it, a person's hold (not attention). */
export const ThreeTasks: Story = {};
export const ThreeTasksMobile: Story = { globals: mobile };
/** 7 Tasks after the breakdown: two rows per group, then "N more in <group>". */
export const SevenTasks: Story = { args: { fixture: 'seven' } };
/** 25 Tasks: 8 rows at most; the held Task that holds up others first, with its overlay. */
export const TwentyFiveTasks: Story = { args: { fixture: 'twentyFive' } };
export const TwentyFiveTasksMobile: Story = { args: { fixture: 'twentyFive' }, globals: mobile };
/** No Tasks yet: the section keeps its place (New task needs the Specification's workflow). */
export const NoTasks: Story = { args: { fixture: 'empty' } };
