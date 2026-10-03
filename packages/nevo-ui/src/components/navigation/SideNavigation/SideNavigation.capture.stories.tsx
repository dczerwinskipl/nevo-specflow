import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { SideNavigation, sideNavigationFigmaIdentity } from './SideNavigation';
import { activeNestedAdapter, navigationNodes, rootIcons } from './SideNavigation.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/SideNavigation',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={[sideNavigationFigmaIdentity]}>
      <div className="w-64 bg-surface p-2">
        <SideNavigation
          aria-label="Workspace navigation"
          adapter={activeNestedAdapter}
          data-design-canonical="true"
          data-design-source-id="default"
          label="Workspace"
          nodes={navigationNodes}
          rootIcons={rootIcons}
        />
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: sideNavigationFigmaIdentity,
      title: 'Side navigation',
      description: 'Dense two-level application navigation with an expanded active branch',
      kind: 'component',
      order: 27,
    },
  },
};
