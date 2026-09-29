import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from '../../components/actions/IconButton';
import { Typography } from '../../components/foundations/Typography';
import { AppFloatingOutlet, AppFloatingProvider, AppFloatingRegion } from './AppFloating';
import { FloatingWindow, FloatingWindowHost } from './FloatingWindows';

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid min-h-64 gap-3 p-4">
      <Typography className="text-content-secondary" variant="body-md">
        {label}
      </Typography>
      <div className="h-12 rounded-control bg-surface-subtle" />
      <div className="h-12 w-2/3 rounded-control bg-surface-subtle" />
      <div className="h-12 rounded-control bg-surface-subtle" />
    </div>
  );
}

const initialWindows = [
  { id: 'one', title: 'Window 1' },
  { id: 'two', title: 'Window 2' },
  { id: 'three', title: 'Window 3' },
  { id: 'four', title: 'Window 4' },
  { id: 'five', title: 'Window 5' },
] as const;

function Demo({
  maxVisible = 3,
  notificationId = 'four',
}: {
  maxVisible?: number;
  notificationId?: string | null;
}) {
  const [windows, setWindows] = useState<Array<{ id: string; title: string }>>([...initialWindows]);

  return (
    <AppFloatingProvider supported>
      <div className="relative h-screen min-h-[36rem] w-full overflow-hidden bg-workspace">
        <div className="p-6">
          <Typography className="text-content-muted" variant="body-md">
            Workspace placeholder
          </Typography>
        </div>

        <AppFloatingOutlet />

        <AppFloatingRegion>
          <FloatingWindowHost maxVisible={maxVisible} overflowIcon="chat">
            {windows.map((window) => (
              <FloatingWindow
                key={window.id}
                id={window.id}
                notification={window.id === notificationId}
                title={window.title}
                actions={
                  <IconButton
                    aria-label="Open full view"
                    icon="open-full"
                    onClick={() => undefined}
                    size="xs"
                    variant="ghost"
                  />
                }
                onClose={() =>
                  setWindows((current) => current.filter((item) => item.id !== window.id))
                }
              >
                <Placeholder label={`Generic content for ${window.id}`} />
              </FloatingWindow>
            ))}
          </FloatingWindowHost>
        </AppFloatingRegion>
      </div>
    </AppFloatingProvider>
  );
}

const meta = {
  title: 'Nevo UI/Layout/FloatingWindows',
  component: FloatingWindowHost,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FloatingWindowHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FiveWindows: Story = {
  render: () => <Demo />,
};

export const MaxTwoVisible: Story = {
  render: () => <Demo maxVisible={2} />,
};

export const NoNotification: Story = {
  render: () => <Demo notificationId={null} />,
};

export const UnsupportedNarrowMode: Story = {
  render: () => (
    <AppFloatingProvider supported={false}>
      <div className="relative h-screen min-h-[28rem] w-full bg-workspace">
        <AppFloatingOutlet />
        <AppFloatingRegion>
          <FloatingWindowHost>
            <FloatingWindow id="one" title="Window 1" onClose={() => undefined}>
              <Placeholder label="This must not be rendered." />
            </FloatingWindow>
          </FloatingWindowHost>
        </AppFloatingRegion>

        <div className="p-6">
          <Typography className="text-content-muted" variant="body-md">
            Floating windows are intentionally unavailable in narrow/mobile mode.
          </Typography>
        </div>
      </div>
    </AppFloatingProvider>
  ),
};

