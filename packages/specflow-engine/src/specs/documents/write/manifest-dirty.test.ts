import { describe, expect, it } from 'vitest';

import { assertManifestNotDirty, type ManifestBaseline } from './manifest-dirty';

const POST = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const operation = (writing = false): ManifestBaseline => ({
  kind: 'operation',
  operationId: 'op-1',
  sequence: 3,
  postSha256: POST,
  writing,
});

function refusal(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('assertManifestNotDirty', () => {
  it('accepts a manifest equal to the post-image of the latest pending operation', () => {
    expect(refusal(() => assertManifestNotDirty({ diskSha256: POST, baseline: operation() }))).toBe(
      undefined,
    );
  });

  it('refuses a manifest that differs from it, whatever HEAD says', () => {
    const error = refusal(() =>
      assertManifestNotDirty({ diskSha256: OTHER, baseline: operation(), cleanInGit: true }),
    );
    expect(error).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
  });

  it('answers busy, not dirty, while the operation is still writing its files', () => {
    const error = refusal(() =>
      assertManifestNotDirty({ diskSha256: OTHER, baseline: operation(true) }),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'manifest-changed' } });
  });

  it('without a pending operation compares with the ledger post-image before HEAD', () => {
    const ledger: ManifestBaseline = { kind: 'ledger', postSha256: POST };
    expect(refusal(() => assertManifestNotDirty({ diskSha256: POST, baseline: ledger }))).toBe(
      undefined,
    );
    // A foreign edit is still caught by the hash mismatch, Git or no Git.
    for (const cleanInGit of [false, undefined]) {
      expect(
        refusal(() =>
          assertManifestNotDirty({
            diskSha256: OTHER,
            baseline: ledger,
            ...(cleanInGit !== undefined ? { cleanInGit } : {}),
          }),
        ),
      ).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
    }
  });

  it('lets a manifest that equals HEAD pass a ledger entry that a commit made stale', () => {
    const stale: ManifestBaseline = { kind: 'ledger', postSha256: OTHER };
    expect(
      refusal(() =>
        assertManifestNotDirty({ diskSha256: POST, baseline: stale, cleanInGit: true }),
      ),
    ).toBe(undefined);
  });

  it('without a pending operation compares with HEAD, and only where Git is enabled', () => {
    const head: ManifestBaseline = { kind: 'head' };
    expect(
      refusal(() =>
        assertManifestNotDirty({ diskSha256: OTHER, baseline: head, cleanInGit: false }),
      ),
    ).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
    expect(
      refusal(() =>
        assertManifestNotDirty({ diskSha256: OTHER, baseline: head, cleanInGit: true }),
      ),
    ).toBe(undefined);
    expect(refusal(() => assertManifestNotDirty({ diskSha256: OTHER, baseline: head }))).toBe(
      undefined,
    );
  });
});
