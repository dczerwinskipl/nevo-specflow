import { join } from 'node:path';

import {
  asString,
  inspectCorpus,
  isInactiveStatus,
  loadDocsSettings,
  openFileSystemCorpus,
} from '@nevo/specflow-docs';

import { LOCAL_CONFIG_RELATIVE_PATH, PROJECT_CONFIG_RELATIVE_PATH } from './project/layout';

/**
 * Whether the project documentation has an active document with this stable id, for the
 * `project-document` context entries of a Task. Same rule as `docs get`: a deprecated or superseded
 * document does not resolve. The corpus (frontmatter only) is read once, on the first lookup, so a
 * command without a project-document reference never scans it.
 */
export function projectDocumentLookup(projectRoot: string): (id: string) => Promise<boolean> {
  let active: Set<string> | undefined;

  return (id) => {
    if (active === undefined) {
      const configuration = loadDocsSettings({
        projectConfigPath: join(projectRoot, ...PROJECT_CONFIG_RELATIVE_PATH.split('/')),
        localConfigPath: join(projectRoot, ...LOCAL_CONFIG_RELATIVE_PATH.split('/')),
      });
      const { docs } = inspectCorpus(openFileSystemCorpus(projectRoot, configuration.docs));
      active = new Set(
        docs.filter((doc) => !isInactiveStatus(doc.status)).map((doc) => asString(doc.id)),
      );
    }

    return Promise.resolve(active.has(id));
  };
}
