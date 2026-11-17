const SEMANTIC =
  /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]{1,64}))?(?:\+[0-9A-Za-z.-]{1,64})?$/;

/** A `major.minor.patch[-prerelease][+build]` version, or undefined for anything else. */
export function semanticVersion(value: string): string | undefined {
  return SEMANTIC.test(value) ? value : undefined;
}

function parts(version: string) {
  const match = SEMANTIC.exec(version);
  if (!match) {
    throw new Error('Expected a semantic version.');
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  };
}

/** Semantic-version precedence: a prerelease sorts below its release; build metadata is ignored. */
export function compareVersions(left: string, right: string): number {
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) {
      return a.core[index]! < b.core[index]! ? -1 : 1;
    }
  }

  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) {
      return 0;
    }

    return a.prerelease.length ? -1 : 1;
  }

  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined || y === undefined) {
      return x === undefined ? -1 : 1;
    }

    if (x === y) {
      continue;
    }

    const numeric = /^\d+$/;
    if (numeric.test(x) && numeric.test(y)) {
      return Number(x) < Number(y) ? -1 : 1;
    }

    if (numeric.test(x) !== numeric.test(y)) {
      return numeric.test(x) ? -1 : 1;
    }

    return x < y ? -1 : 1;
  }

  return 0;
}
