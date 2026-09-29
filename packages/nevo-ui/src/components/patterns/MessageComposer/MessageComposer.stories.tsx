import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Button } from '../../actions/Button';
import { IconButton } from '../../actions/IconButton';
import { MessageComposer, type MessageComposerProps } from './MessageComposer';
import { Typography } from '../../foundations/Typography';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ComposerExample({
  defaultValue = '',
  disabled = false,
  enterKeyBehavior = 'submit',
  maxRows = 8,
  readOnly = false,
}: {
  defaultValue?: string;
  disabled?: boolean;
  enterKeyBehavior?: MessageComposerProps['enterKeyBehavior'];
  maxRows?: number;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);

  return (
    <div className="grid max-w-full gap-2" style={{ width: 'min(34rem, calc(100vw - 2rem))' }}>
      <MessageComposer
        data-last-submission={lastSubmission ?? undefined}
        disabled={disabled}
        enterKeyBehavior={enterKeyBehavior}
        onSubmit={(submittedValue) => setLastSubmission(submittedValue)}
        readOnly={readOnly}
      >
        <MessageComposer.Editor
          aria-label="Reply to customer"
          maxRows={maxRows}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Write a reply..."
          value={value}
        />
        <MessageComposer.Toolbar>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Attach file" icon="file" size="xs" />
            <Button size="sm" variant="ghost">
              Insert template
            </Button>
          </div>
          <Button disabled={disabled || readOnly} size="sm" type="submit">
            Send reply
          </Button>
        </MessageComposer.Toolbar>
      </MessageComposer>
      <Typography
        aria-live="polite"
        as="p"
        className="m-0 min-h-4 text-content-muted"
        variant="body-sm"
      >
        {lastSubmission === null ? 'Nothing submitted yet.' : `Submitted: ${lastSubmission}`}
      </Typography>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Patterns/MessageComposer',
  component: MessageComposer,
  tags: ['autodocs'],
  args: {
    children: undefined,
    enterKeyBehavior: 'submit',
    onSubmit: () => undefined,
  },
  argTypes: {
    children: {
      control: false,
      description: 'Compose with MessageComposer.Editor and MessageComposer.Toolbar.',
      table: { type: { summary: 'ReactNode' } },
    },
    disabled: {
      control: 'boolean',
      description: 'Disables native controls inside the composition.',
    },
    enterKeyBehavior: {
      control: 'inline-radio',
      options: ['submit', 'newline'],
      description:
        'Lets the product choose keyboard behavior, including a touch-friendly newline mode.',
    },
    onSubmit: {
      control: false,
      description: 'Receives the raw editor value. The component does not trim or clear it.',
      table: { type: { summary: '(value, event) => void | Promise<void>' } },
    },
    readOnly: {
      control: 'boolean',
      description: 'Makes the editor read-only and suppresses submission.',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'MessageComposer is a native-form submission surface. Standalone is the default presentation; integrated delegates outer border, radius, and surface chrome to its parent composite.',
      },
    },
  },
} satisfies Meta<typeof MessageComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CRMReply: Story = {
  render: ({ disabled, enterKeyBehavior, readOnly }) => (
    <ComposerExample disabled={disabled} enterKeyBehavior={enterKeyBehavior} readOnly={readOnly} />
  ),
};

export const ShortValue: Story = {
  render: () => <ComposerExample defaultValue="Thanks — I will confirm the renewal date today." />,
};

export const MultilineGrowing: Story = {
  render: () => (
    <ComposerExample
      defaultValue={
        'Hi Marta,\n\nI reviewed the quarterly plan and added the requested owner changes.'
      }
    />
  ),
};

export const ExplicitNewlineMode: Story = {
  render: () => <ComposerExample enterKeyBehavior="newline" />,
};

export const MaxHeightReached: Story = {
  render: () => <ComposerExample maxRows={4} />,
  play: async ({ canvas, userEvent }) => {
    const editor = canvas.getByRole('textbox', {
      name: 'Reply to customer',
    }) as HTMLTextAreaElement;
    Object.defineProperty(editor, 'scrollHeight', {
      configurable: true,
      get: () => Math.max(48, editor.value.split('\n').length * 20 + 28),
    });

    await userEvent.type(
      editor,
      'One{shift>}{enter}{/shift}Two{shift>}{enter}{/shift}Three{shift>}{enter}{/shift}Four{shift>}{enter}{/shift}Five',
    );
    const maximumHeight = editor.style.height;
    assert(maximumHeight !== '', 'The editor should set an explicit bounded height.');
    assert(editor.style.overflowY === 'auto', 'The editor should scroll internally after maxRows.');

    await userEvent.type(editor, '{shift>}{enter}{/shift}Six{shift>}{enter}{/shift}Seven');
    assert(editor.style.height === maximumHeight, 'The editor should stop growing after maxRows.');
  },
};

export const Disabled: Story = {
  render: () => (
    <ComposerExample defaultValue="Reply unavailable while the record is locked." disabled />
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <ComposerExample defaultValue="This reply is retained for audit history." readOnly />
  ),
};

export const Focused: Story = {
  render: () => (
    <div className="max-w-full" style={{ width: 'min(34rem, calc(100vw - 2rem))' }}>
      <MessageComposer onSubmit={() => undefined}>
        <MessageComposer.Editor
          aria-label="Focused reply"
          autoFocus
          placeholder="Write a reply..."
        />
        <MessageComposer.Toolbar>
          <Typography className="text-content-muted" variant="body-sm">
            Enter to send
          </Typography>
          <Button size="sm" type="submit">
            Send
          </Button>
        </MessageComposer.Toolbar>
      </MessageComposer>
    </div>
  ),
};

export const Integrated: Story = {
  render: () => (
    <div className="w-[34rem] max-w-full overflow-hidden rounded-composite border border-border-default bg-surface-raised">
      <div className="min-h-24 p-4">
        <Typography className="text-content-muted" variant="body-md">
          Parent composite owns border, radius, and outer surface.
        </Typography>
      </div>
      <MessageComposer onSubmit={() => undefined} presentation="integrated">
        <MessageComposer.Editor aria-label="Integrated message" placeholder="Write a message..." />
        <MessageComposer.Toolbar>
          <IconButton aria-label="Attach file" icon="file" size="xs" />
          <Button size="sm" type="submit">
            Send
          </Button>
        </MessageComposer.Toolbar>
      </MessageComposer>
    </div>
  ),
};

function InteractionExample() {
  const [submissions, setSubmissions] = useState<string[]>([]);
  return (
    <div data-submissions={JSON.stringify(submissions)}>
      <MessageComposer onSubmit={(value) => setSubmissions((current) => [...current, value])}>
        <MessageComposer.Editor aria-label="Contract editor" defaultValue="  Existing draft  " />
        <MessageComposer.Toolbar>
          <IconButton aria-label="Attach contract" icon="file" size="xs" />
          <Button size="sm" type="submit">
            Submit
          </Button>
        </MessageComposer.Toolbar>
      </MessageComposer>
    </div>
  );
}

export const InteractionContract: Story = {
  render: () => <InteractionExample />,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const editor = canvas.getByRole('textbox', { name: 'Contract editor' }) as HTMLTextAreaElement;
    const host = editor.closest<HTMLElement>('[data-submissions]');
    assert(host, 'The interaction fixture should expose its submission state.');

    editor.focus();
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    assert(editor.value.includes('\n'), 'Shift+Enter should insert a newline.');
    assert(host.getAttribute('data-submissions') === '[]', 'Shift+Enter must not submit.');

    const composingEnter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: 'Enter',
    });
    editor.dispatchEvent(composingEnter);
    assert(host.getAttribute('data-submissions') === '[]', 'Composing Enter must not submit.');

    await userEvent.keyboard('{Enter}');
    const submissions = JSON.parse(host.getAttribute('data-submissions') ?? '[]') as string[];
    assert(submissions.length === 1, 'Plain Enter should submit once.');
    assert(
      submissions[0] !== submissions[0]!.trim(),
      'Submission should preserve whitespace.',
    );
    assert(editor.value === submissions[0], 'Submission must not clear the editor value.');

    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    const afterButton = JSON.parse(host.getAttribute('data-submissions') ?? '[]') as string[];
    assert(afterButton.length === 2, 'The explicit submit action should use the same contract.');
  },
};

function CaptureComposer({
  disabled = false,
  presentation,
  sourceId,
}: {
  disabled?: boolean;
  presentation: 'standalone' | 'integrated';
  sourceId: string;
}) {
  return (
    <MessageComposer
      data-design-canonical="true"
      data-design-source-id={sourceId}
      disabled={disabled}
      onSubmit={() => undefined}
      presentation={presentation}
    >
      <MessageComposer.Editor aria-label={`${sourceId} editor`} defaultValue="Design capture" />
      <MessageComposer.Toolbar>
        <IconButton aria-label="Attach file" icon="file" size="xs" />
        <Button disabled={disabled} size="sm" type="submit">
          Send
        </Button>
      </MessageComposer.Toolbar>
    </MessageComposer>
  );
}

function MessageComposerCapture() {
  return (
    <DesignCaptureProvider captureComponents={['MessageComposer']}>
      <div className="grid w-[34rem] gap-6">
        <CaptureComposer presentation="standalone" sourceId="default" />
        <CaptureComposer disabled presentation="standalone" sourceId="standalone-disabled" />

        <div className="overflow-hidden rounded-composite border border-border-default bg-surface-raised">
          <CaptureComposer presentation="integrated" sourceId="integrated-default" />
        </div>

        <div className="overflow-hidden rounded-composite border border-border-default bg-surface-raised">
          <CaptureComposer disabled presentation="integrated" sourceId="integrated-disabled" />
        </div>
      </div>
    </DesignCaptureProvider>
  );
}

export const CanonicalCapture: Story = {
  render: () => <MessageComposerCapture />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'MessageComposer',
      title: 'Message composer',
      description: 'Generic long-form submission surface with editable editor and toolbar slots',
      kind: 'component',
      order: 26,
    },
  },
};



