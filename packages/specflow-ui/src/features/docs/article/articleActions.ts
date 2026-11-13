import type { WorkspaceHeaderAction } from '@nevo/ui';
import type { TFunction } from 'i18next';
import { docsHref } from '../reader/readerLocation';

async function copy(text: string, done: string, failed: string, notify: (message: string) => void) {
  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard is unavailable');
    }

    await navigator.clipboard.writeText(text);
    notify(done);
  } catch {
    notify(failed);
  }
}

/**
 * The overflow actions of an article: Copy link (this workstation's reader address, it names the
 * workspace) and Copy path (the repository path, portable). Pure: no hooks, the same for the split
 * header and the stacked screens.
 */
export function articleActions(input: {
  readonly workspaceId: string;
  readonly documentId: string;
  /** The repository path (`<docs.root>/<path>`). */
  readonly path: string;
  readonly notify: (message: string) => void;
  readonly t: TFunction;
}): WorkspaceHeaderAction[] {
  const { workspaceId, documentId, path, notify, t } = input;
  const failed = t('docs.article.copyFailed');

  return [
    {
      id: 'docs-copy-link',
      label: t('docs.article.copyLink'),
      onPress: () =>
        void copy(
          `${window.location.origin}${docsHref(workspaceId, documentId)}`,
          t('docs.article.linkCopied'),
          failed,
          notify,
        ),
    },
    {
      id: 'docs-copy-path',
      label: t('docs.article.copyPath'),
      onPress: () => void copy(path, t('docs.article.pathCopied'), failed, notify),
    },
  ];
}
