import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Button } from '../actions/Button';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './Toast';

const meta = {
  title: 'Nevo UI/Feedback/Design Capture',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const tones = ['neutral', 'info', 'success', 'attention', 'danger'] as const;

export const AlertCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Alert']}>
      <div className="grid w-[32rem] gap-3 p-8">
        {tones.map((tone) => (
          <Alert
            data-design-canonical="true"
            data-design-source-id={tone}
            key={tone}
            title={`${tone.charAt(0).toUpperCase()}${tone.slice(1)} alert`}
            tone={tone}
          >
            Stable feedback content for design-system review.
          </Alert>
        ))}
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Alert',
      title: 'Alert',
      description: 'Semantic inline feedback',
      kind: 'component',
      order: 110,
    },
  },
};

export const BadgeCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Badge']}>
      <div className="flex gap-3 p-8">
        {tones.map((tone) => (
          <Badge data-design-canonical="true" data-design-source-id={tone} key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Badge',
      title: 'Badge',
      description: 'Semantic status labels',
      kind: 'component',
      order: 112,
    },
  },
};

export const EmptyStateCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['EmptyState']}>
      <div className="w-[32rem] p-8">
        <EmptyState
          actions={<Button size="sm">Create customer</Button>}
          data-design-canonical="true"
          data-design-source-id="default"
          description="Create the first customer to start working with this account."
          icon="inbox"
          title="No customers"
        />
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'EmptyState',
      title: 'Empty state',
      description: 'Empty-content composition',
      kind: 'component',
      order: 114,
    },
  },
};

export const SkeletonCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Skeleton']}>
      <Skeleton
        className="m-8 h-4 w-48"
        data-design-canonical="true"
        data-design-source-id="default"
      />
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Skeleton',
      title: 'Skeleton',
      description: 'Canonical content placeholder geometry',
      kind: 'component',
      order: 116,
    },
  },
};

export const SpinnerCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Spinner']}>
      <div className="flex items-center gap-6 p-8">
        {(['sm', 'md'] as const).map((size) => (
          <Spinner
            data-design-canonical="true"
            data-design-source-id={size}
            key={size}
            size={size}
          />
        ))}
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Spinner',
      title: 'Spinner',
      description: 'Loading indicator sizes',
      kind: 'component',
      order: 118,
    },
  },
};

export const ToastCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Toast']}>
      <ToastProvider>
        <div className="w-96 p-8">
          <Toast
            data-design-canonical="true"
            data-design-source-id="default"
            defaultOpen
            duration={Infinity}
          >
            <ToastTitle>Customer saved</ToastTitle>
            <ToastDescription>The customer record was updated.</ToastDescription>
            <ToastClose />
          </Toast>
        </div>
        <ToastViewport />
      </ToastProvider>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Toast',
      title: 'Toast',
      description: 'Static notification surface',
      kind: 'component',
      order: 120,
    },
  },
};
