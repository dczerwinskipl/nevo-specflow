// The fingerprint of the settings that decide what a corpus contains and how it is read: `docs.root`
// and the content of `docs.yaml`, and with `semantic` also `docs.search.semantic`. The reopen
// fingerprint (`readCheckoutDocsSettings`) includes `semantic`; the corpus revision does not.

import { createHash } from 'node:crypto';

import type { CorpusSettings } from './docs-file';

/** Bump when the canonical form below changes. */
const FINGERPRINT_VERSION = 's1';

export function corpusSettingsFingerprint(
  settings: CorpusSettings,
  semantic: boolean | undefined = undefined,
): string {
  const canonical = JSON.stringify([
    settings.root,
    semantic ?? null,
    settings.taxonomy.scopes ?? null,
    settings.taxonomy.areas ?? null,
    settings.nonAuthoritative,
    settings.exclude,
  ]);

  return `${FINGERPRINT_VERSION}-${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}
