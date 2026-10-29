import {
  AppShell,
  IconButton,
  MarkdownDocument,
  ScrollArea,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import {
  documentById,
  fileName,
  sessionMessages,
  sourceOf,
} from './content-kinds/fixtures.stories-support';
import { MockNavigation } from './MockNavigation.stories-support';
import {
  PaneHeader,
  TabHostBody,
  TabHostHeader,
  UnsavedChangesDialog,
} from './tab-host/TabHost.stories-support';
import type { TabContentProvider } from './tab-host/types.stories-support';
import { useTabHost } from './tab-host/useTabHost.stories-support';

/*
 * Second host of the SAME tab host: read-only previews with their own tiny provider. It imports no
 * editor code (no content-kinds registry, no editor session): only the host and plain data.
 */
const noop = () => undefined;

const readOnlyProvider: TabContentProvider = (id) => {
  const doc = documentById(id);

  return {
    label: fileName(doc.path),
    path: doc.path,
    dirty: false,
    render: () => (
      <ScrollArea
        aria-label={`Preview of ${fileName(doc.path)}`}
        className="min-h-0 flex-1"
        contentClassName="p-6"
        direction="vertical"
      >
        <MarkdownDocument
          className="[&_code]:break-words [&_pre]:w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
          source={sourceOf(id)}
        />
      </ScrollArea>
    ),
    actions: () => [
      {
        id: 'open-in-documents',
        label: 'Open in Documents',
        icon: 'open-full',
        presentation: 'icon',
        direct: 'always',
        onPress: noop,
      },
    ],
    settle: noop,
  };
};

function SessionsWorkspace({ empty }: { empty: boolean }) {
  const host = useTabHost(
    empty
      ? { open: [], active: null }
      : { open: ['specification', 'sequence'], active: 'specification' },
    readOnlyProvider,
  );
  const scope = 'sessions-mock';
  const index = host.active ? host.open.indexOf(host.active) : -1;
  const link = (fileId: string) => (
    <button
      key={fileId}
      type="button"
      onClick={() => host.openItem(fileId)}
      className="rounded-control text-content-link underline underline-offset-2 hover:text-content-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      {fileName(documentById(fileId).path)}
    </button>
  );

  return (
    <div data-workspace-fit="available" className="flex h-full w-full min-w-0">
      <section aria-label="Session" className="flex min-w-0 basis-1/2 flex-col">
        <PaneHeader>
          <WorkspaceHeader title="Sign-in flow" labels={{ moreActions: 'More actions' }} />
        </PaneHeader>
        <ScrollArea
          aria-label="Conversation"
          className="min-h-0 flex-1"
          contentClassName="grid gap-4 p-6"
          direction="vertical"
        >
          {sessionMessages.map((message) =>
            message.role === 'user' ? (
              <div
                key={message.id}
                className="ml-auto max-w-[80%] rounded-composite bg-surface-control px-4 py-2"
              >
                <Typography variant="body-md">{message.text}</Typography>
              </div>
            ) : (
              <div key={message.id} className="max-w-[90%]">
                <Typography variant="body-md" className="text-content-secondary">
                  {message.text} {link(message.files[0])}, and the request sequence is in{' '}
                  {link(message.files[1])}.
                </Typography>
              </div>
            ),
          )}
        </ScrollArea>
      </section>
      <section
        aria-label="Context"
        data-mock-region="secondary"
        className="flex min-w-0 basis-1/2 flex-col border-l border-border-subtle"
      >
        {/* Secondary header as AppWorkspace draws it: Back leading, Close trailing. */}
        <TabHostHeader
          host={host}
          content={readOnlyProvider}
          scope={scope}
          label="Opened context files"
          budget={2}
          leading={
            // Back exists only when there is a previous tab to return to.
            index > 0 ? (
              <IconButton
                aria-label="Back"
                className="[&_svg]:rotate-180"
                icon="arrow-right"
                size="sm"
                variant="ghost"
                onClick={() => host.setActive(host.open[index - 1]!)}
              />
            ) : undefined
          }
          trailing={
            <IconButton
              aria-label="Close secondary content"
              icon="close"
              size="sm"
              variant="ghost"
              onClick={host.closeAll}
            />
          }
        />
        <div className="min-h-0 flex-1">
          <TabHostBody
            host={host}
            content={readOnlyProvider}
            scope={scope}
            empty={
              <div className="grid h-full place-items-center p-6 text-center">
                <Typography as="p" variant="body-md" className="text-content-muted">
                  Files the agent mentions open here.
                </Typography>
              </div>
            }
          />
        </div>
      </section>
      <UnsavedChangesDialog host={host} content={readOnlyProvider} />
    </div>
  );
}

export function SessionsHostMock({
  width = 1440,
  height = 900,
  empty = false,
}: {
  width?: number;
  height?: number;
  /** Starts with no opened file: the Context placeholder. */
  empty?: boolean;
}) {
  return (
    <div style={{ width, height }} data-mock-frame={width}>
      <AppShell
        navigation={<MockNavigation current="sessions" />}
        style={{ height: '100%' }}
        labels={{ navigationTitle: 'Specification navigation' }}
      >
        <SessionsWorkspace empty={empty} />
      </AppShell>
    </div>
  );
}
