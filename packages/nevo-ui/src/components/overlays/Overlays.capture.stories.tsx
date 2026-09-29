import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Button } from '../actions/Button';
import { TextInput } from '../forms/TextInput';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './AlertDialog';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip';

const meta = {
  title: 'Nevo UI/Overlays/Design Capture',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Dialog']}>
      <Dialog open>
        <DialogContent data-design-canonical="true" data-design-source-id="default">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Update the customer record.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <TextInput aria-label="Customer name" defaultValue="Acme Industries" />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Dialog',
      title: 'Dialog',
      description: 'Static modal content surface',
      kind: 'component',
      order: 132,
    },
  },
};

export const AlertDialogCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['AlertDialog']}>
      <AlertDialog open>
        <AlertDialogContent data-design-canonical="true" data-design-source-id="default">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'AlertDialog',
      title: 'Alert dialog',
      description: 'Static confirmation surface',
      kind: 'component',
      order: 134,
    },
  },
};

export const TooltipCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Tooltip']}>
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="secondary">Archive</Button>
          </TooltipTrigger>
          <TooltipContent data-design-canonical="true" data-design-source-id="default">
            Archive customer
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Tooltip',
      title: 'Tooltip',
      description: 'Static open/active contextual label',
      kind: 'component',
      order: 136,
    },
  },
};



