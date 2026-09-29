import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Timeline } from './Timeline';

const meta = {
  title: 'Nevo UI/Data/Timeline/Design Capture',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function CompactCapture() {
  return (
    <Timeline
      aria-label="Compact timeline capture"
      data-design-canonical="true"
      data-design-source-id="sm"
      size="sm"
    >
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
  );
}

function HistoryCapture() {
  return (
    <Timeline
      aria-label="Workflow timeline capture"
      data-design-canonical="true"
      data-design-source-id="md"
      size="md"
    >
      <Timeline.Item>
        <Timeline.Marker tone="success" icon="check" />
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
        <Timeline.Content title="Human verification" meta="Pending" />
      </Timeline.Item>
    </Timeline>
  );
}

export const TimelineCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Timeline']}>
      <div className="grid w-full max-w-5xl grid-cols-2 gap-10 bg-canvas p-8">
        <div className="rounded-surface border border-border-default bg-surface p-5">
          <CompactCapture />
        </div>
        <div className="rounded-surface border border-border-default bg-surface p-5">
          <HistoryCapture />
        </div>
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Timeline',
      title: 'Timeline',
      description: 'Inline-first compact activity and medium workflow-history variants',
      kind: 'component',
      order: 140,
    },
  },
};
