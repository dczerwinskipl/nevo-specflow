import { describe, expect, it } from 'vitest';
import { validatePath } from './addition';

/** What the client sends: a document name without a dot gets `.md` appended. */
const finalName = (name: string, kind: 'document' | 'folder') =>
  kind === 'document' && !name.includes('.') ? `${name}.md` : name;

/** Same table as the UI contract test (documentTreePolicy.test.ts): the server is the source of truth. */
const nameContract: readonly { name: string; kind: 'document' | 'folder'; valid: boolean }[] = [
  { name: 'notes', kind: 'document', valid: true },
  { name: 'a.txt', kind: 'document', valid: true },
  { name: 'Report 2024', kind: 'folder', valid: true },
  { name: 'con-notes.md', kind: 'document', valid: true },
  { name: 'com0.md', kind: 'document', valid: true },
  { name: 'CON.md', kind: 'document', valid: false },
  { name: 'con', kind: 'document', valid: false },
  { name: 'nul.txt', kind: 'document', valid: false },
  { name: 'LPT9.md', kind: 'document', valid: false },
  { name: 'AUX', kind: 'folder', valid: false },
  { name: '.hidden.md', kind: 'document', valid: false },
  { name: '.git', kind: 'folder', valid: false },
  { name: 'a:b.md', kind: 'document', valid: false },
  { name: 'a?b', kind: 'folder', valid: false },
  { name: 'trail.', kind: 'folder', valid: false },
  { name: 'a.png', kind: 'document', valid: false },
];

describe('validatePath', () => {
  it.each(nameContract)('$kind "$name" is valid: $valid', ({ name, kind, valid }) => {
    const path = finalName(name, kind);
    const check = () => validatePath(path, kind === 'document');
    if (valid) expect(check).not.toThrow();
    else expect(check).toThrow();
  });
});
