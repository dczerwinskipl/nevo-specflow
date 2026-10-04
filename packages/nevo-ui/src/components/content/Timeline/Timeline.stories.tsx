import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import { Badge } from '../../feedback/Badge';
import { Typography } from '../../foundations/Typography';
import { Timeline, timelineDefaults, type TimelineSize } from './Timeline';

const sizes = ['sm', 'md'] as const satisfies readonly TimelineSize[];

const meta = {
  title: 'Nevo UI/Content/Timeline',
  component: Timeline,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Composable vertical timeline. Use sm for inline-first current activity and md for workflow or audit history. Timeline owns visual chronology only; event models, grouping, dates and domain states stay in the application.',
      },
    },
  },
  args: { ...timelineDefaults },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: sizes,
    },
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactActivity: Story = {
  args: { size: 'sm' },
  render: (args) => (
    <div className="w-96 rounded-surface border border-border-default bg-surface p-4">
      <Timeline {...args} aria-label="Current agent activity">
        <Timeline.Item>
          <Timeline.Marker tone="success" />
          <Timeline.Content title="Discover files" meta="Completed" />
        </Timeline.Item>
        <Timeline.Item aria-current="step">
          <Timeline.Marker tone="info" active />
          <Timeline.Content title="Implement" description="Editing 4 files" meta="In progress" />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Review" meta="Pending" />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const CompactWithIcon: Story = {
  args: { size: 'sm' },
  render: (args) => (
    <div className="w-96 rounded-surface border border-border-default bg-surface p-4">
      <Timeline {...args} aria-label="Current activity with an explicit icon">
        <Timeline.Item>
          <Timeline.Marker tone="success" />
          <Timeline.Content title="Read specification" meta="Completed" />
        </Timeline.Item>
        <Timeline.Item aria-current="step">
          <Timeline.Marker tone="info" active icon="loader" iconClassName="animate-spin" />
          <Timeline.Content
            title="Implement"
            description="Updating workflow transition handling"
            meta="In progress"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Review" meta="Pending" />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const WorkflowHistory: Story = {
  args: { size: 'md' },
  render: (args) => (
    <div className="w-full max-w-xl rounded-surface border border-border-default bg-surface p-5">
      <Timeline {...args} aria-label="Document workflow history">
        <Timeline.Item>
          <Timeline.Marker tone="success" icon="check" />
          <Timeline.Content
            title="Document created"
            description="Initial specification generated and accepted for implementation."
            meta="Spec Writer · Claude"
            time="10:42"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker tone="success" />
          <Timeline.Content
            title="Implementation completed"
            description="14 files changed and validation completed successfully."
            meta="Implementer · Claude"
            time="11:18"
          />
        </Timeline.Item>
        <Timeline.Item aria-current="step">
          <Timeline.Marker tone="info" active />
          <Timeline.Content
            title="Review started"
            description="Independent code review is currently running."
            meta="Reviewer · Codex"
            time="11:21"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content
            title="Human verification"
            description="Waiting for the previous workflow step."
            meta="Pending"
          />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const MixedStates: Story = {
  args: { size: 'md' },
  render: (args) => (
    <div className="w-full max-w-lg rounded-surface border border-border-default bg-surface p-5">
      <Timeline {...args} aria-label="Mixed timeline states">
        <Timeline.Item>
          <Timeline.Marker tone="success" icon="check" />
          <Timeline.Content
            title="Deployment completed"
            description="Production is healthy."
            time="09:10"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker tone="attention" icon="triangle-alert" />
          <Timeline.Content
            title="Manual approval required"
            description="Release is waiting at the production gate."
            time="09:12"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker tone="danger" icon="circle-alert" />
          <Timeline.Content
            title="Validation failed"
            description="Two checks require attention before retrying."
            time="09:16"
          />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Retry deployment" description="Not started." />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const RichContent: Story = {
  args: { size: 'md' },
  render: (args) => (
    <div className="w-full max-w-xl rounded-surface border border-border-default bg-surface p-5">
      <Timeline {...args} aria-label="Timeline with actions">
        <Timeline.Item aria-current="step">
          <Timeline.Marker tone="attention" active icon="triangle-alert" />
          <Timeline.Content
            title="Review requires changes"
            description="The reviewer found two architecture issues and one accessibility regression. The event content can wrap naturally without breaking the vertical rail."
            meta="Reviewer · Codex · 3 findings"
            time="11:47"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="attention">Action required</Badge>
              <Button size="sm" variant="secondary">
                Open review
              </Button>
            </div>
          </Timeline.Content>
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content
            title="Refinement"
            description="Starts after review findings are accepted."
            meta="Pending"
          />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const NarrowWidth: Story = {
  args: { size: 'md' },
  render: (args) => (
    <div className="w-72 rounded-surface border border-border-default bg-surface p-4">
      <Timeline {...args} aria-label="Narrow timeline example">
        <Timeline.Item>
          <Timeline.Marker tone="success" icon="check" />
          <Timeline.Content
            title="Very long workflow event title that needs to wrap without colliding with the timestamp"
            description="Long descriptions should increase the row height while the structural connector continues toward the next marker."
            meta="Automation · production-eu-west"
            time="11:18"
          />
        </Timeline.Item>
        <Timeline.Item aria-current="step">
          <Timeline.Marker tone="info" active />
          <Timeline.Content title="Review" meta="In progress" time="11:21" />
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

export const SizeComparison: Story = {
  render: () => (
    <div className="grid w-full max-w-5xl gap-8 rounded-surface border border-border-default bg-canvas p-6 md:grid-cols-2">
      <section>
        <Typography as="div" className="mb-4 text-content-secondary" variant="label-md">
          Small · current activity
        </Typography>
        <Timeline size="sm" aria-label="Small timeline example">
          <Timeline.Item>
            <Timeline.Marker tone="success" />
            <Timeline.Content title="Discover files" meta="Completed" />
          </Timeline.Item>
          <Timeline.Item aria-current="step">
            <Timeline.Marker tone="info" active />
            <Timeline.Content title="Implement" description="Editing 4 files" meta="In progress" />
          </Timeline.Item>
          <Timeline.Item>
            <Timeline.Marker />
            <Timeline.Content title="Review" meta="Pending" />
          </Timeline.Item>
        </Timeline>
      </section>
      <section>
        <Typography as="div" className="mb-4 text-content-secondary" variant="label-md">
          Medium · workflow history
        </Typography>
        <Timeline size="md" aria-label="Medium timeline example">
          <Timeline.Item>
            <Timeline.Marker tone="success" icon="check" />
            <Timeline.Content
              title="Implementation completed"
              description="Changes validated successfully."
              meta="Claude"
              time="11:18"
            />
          </Timeline.Item>
          <Timeline.Item aria-current="step">
            <Timeline.Marker tone="info" active />
            <Timeline.Content
              title="Review started"
              description="Independent review in progress."
              meta="Codex"
              time="11:21"
            />
          </Timeline.Item>
          <Timeline.Item>
            <Timeline.Marker />
            <Timeline.Content title="Human verification" meta="Pending" />
          </Timeline.Item>
        </Timeline>
      </section>
    </div>
  ),
};
