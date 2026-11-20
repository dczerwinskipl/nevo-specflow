import { useState } from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nevo/ui';
import {
  CheckoutPath,
  DiscardWarning,
  Group,
  MONO,
  PathList,
  TextLink,
} from './MockParts.stories-support';

/*
 * PRESENTATION MOCK ONLY (D16). The Close preview's one Uncommitted changes group, by kind, each
 * with its remedy: the agent attempt whose commit failed, files SpecFlow saved (this specification
 * and another one, as the shipped "held by uncommitted files SpecFlow wrote" state names them), and
 * changes made outside SpecFlow.
 */

export const AGENT_FILES = [
  'specs/active/single-sign-on/tasks/t-04/task.md',
  'specs/active/single-sign-on/tasks/t-04/screens.md',
  'src/auth/refresh.ts',
  'src/auth/state.ts',
  'src/auth/refresh.test.ts',
];

export function CloseUncommittedDialog() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent closeLabel="Close" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Close Single sign-on</DialogTitle>
          <DialogDescription>
            Single sign-on cannot close yet: 12 files in its checkout are not committed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Group
            heading="Uncommitted changes · 12"
            explanation="Closing starts from a committed checkout, and SpecFlow never discards work. Each kind is committed its own way:"
          >
            <div className="grid gap-5 pt-1">
              <Group
                level={4}
                heading="Agent work whose commit failed · 5"
                explanation={
                  <>
                    Implementation of t-04 finished, but a Git hook refused its commit (
                    <span className={MONO}>COMMIT_HOOK_FAILED</span>).
                  </>
                }
              >
                <PathList paths={AGENT_FILES} />
                <div>
                  <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal}>
                    Retry commit
                  </Button>
                </div>
              </Group>
              <Group
                level={4}
                heading="Saved in SpecFlow, not committed yet · 5"
                explanation="Documents and task changes SpecFlow saved. Commit them from that specification’s Documents or with Git, or finish its step in progress there (finishing commits them)."
              >
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <p className="text-body-sm font-medium">
                      Single sign-on (this specification) · 2
                    </p>
                    <PathList
                      paths={[
                        'specs/active/single-sign-on/overview.md',
                        'specs/active/single-sign-on/tasks/t-05/task.md',
                      ]}
                    />
                    <div>
                      <TextLink>Open Documents</TextLink>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <p className="text-body-sm font-medium">
                      <TextLink>Passkeys spike</TextLink> · 3
                    </p>
                    <PathList
                      paths={[
                        'specs/active/passkeys-spike/tasks/index.yaml',
                        'specs/active/passkeys-spike/tasks/oidc-callback/task.md',
                        'specs/active/passkeys-spike/tasks/oidc-callback/task.yaml',
                      ]}
                    />
                  </div>
                </div>
              </Group>
              <Group
                level={4}
                heading="Changed outside SpecFlow · 2"
                explanation="SpecFlow did not write these. Commit them with Git in this checkout, or move them elsewhere."
              >
                <PathList paths={['scratch-notes.txt', 'package.json']} />
                <CheckoutPath path="D:\repos\acme-portal\.nevo\worktrees\nevo-1" />
                <DiscardWarning />
              </Group>
            </div>
          </Group>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Dismiss</Button>
          <Button>Check again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
