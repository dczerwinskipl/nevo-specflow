import { win32 } from 'node:path';
import type {
  ExecutableLocation as ExecutableLocationId,
  ExecutableSource,
  ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import type { ProviderEnvironment } from '../process';
import { ProviderUnavailableError } from '../unavailable';
import {
  CommandFailure,
  MAX_EXECUTABLE_BYTES,
  nodeExecutableFiles,
  type ExecutableFiles,
} from './files';
import { npmGlobalPrefix } from './npm';
import { searchPath, trustedPath, untrustedRoots } from './search-path';
import { compareVersions } from './version';

/** A fixed place a vendor's installer puts the CLI. */
export interface ExecutableLocation {
  /** Who installs it there; the catalogue names it (for example the Codex desktop app). */
  readonly location: ExecutableLocationId;
  /**
   * An absolute path under the user's profile or the program directories. At most one segment is
   * `*`: it matches the folders directly inside its parent, such as an app's per-version folder.
   */
  readonly pattern: string;
}

/** What a provider declares about its CLI; the discovery itself is shared. */
export interface ProviderExecutableDeclaration {
  readonly providerId: string;
  /** The provider's name in messages, for example "Codex". */
  readonly title: string;
  /** The command name: PATH holds `<command>.exe`, or an npm launcher `<command>.cmd`. */
  readonly command: string;
  /** A cheap command that prints the version and starts no session, for example `--version`. */
  readonly versionArguments: readonly string[];
  /** The version the version command's output states, or undefined for any other output. */
  parseVersion(output: string): string | undefined;
  /** The CLI's npm package and its native executables, relative to the npm global prefix. */
  readonly npmPackage?: { readonly name: string; readonly executables: readonly string[] };
  /** The vendor install locations, in preference order. */
  installLocations(environment: Readonly<Record<string, string>>): readonly ExecutableLocation[];
  /** Arguments of the CLI's own sign-in command, for example `['login']`. */
  readonly signInArguments: readonly string[];
}

export interface ExecutableResolution {
  readonly path: string;
  readonly source: ExecutableSource;
  readonly location?: ExecutableLocationId;
  readonly version: string;
}

export interface LocateExecutableOptions {
  /** The local `executable` setting: it is the only candidate and is never replaced. */
  readonly configured?: string;
  /** The projected provider environment: PATH and the profile folders come from it. */
  readonly environment: ProviderEnvironment;
  /** The project workspace; nothing inside it is ever run. */
  readonly workspace: string;
  /**
   * Whether the compatibility catalogue records this exact build as incompatible. Absent when it
   * records none for the provider, so no candidate is hashed for nothing.
   */
  readonly knownIncompatible?: (build: { sha256: string; version: string }) => boolean;
  /**
   * The temporary folders nothing is run from; default `%TEMP%`, `%TMP%` and the system temporary
   * folder (tests pass their own).
   */
  readonly temporaryRoots?: readonly string[];
  readonly platform?: string;
  readonly architecture?: string;
}

const VERSION_TIMEOUT_MS = 5000;
/** Version commands running at once for one provider's install locations. */
const PARALLEL_PROBES = 4;
/**
 * Builds probed per `*` location, newest first; an app keeps a handful of version folders. More
 * are listed, never probed, and the result says so.
 */
const MAX_PATTERN_BUILDS = 16;
/** Folder entries read per `*` location. */
const MAX_PATTERN_ENTRIES = 256;

interface Candidate {
  path: string;
  source: ExecutableSource;
  location?: ExecutableLocationId;
}

type Verified =
  | { ok: true; candidate: Candidate; version: string }
  | {
      ok: false;
      candidate: Candidate;
      reasonCode: 'EXECUTABLE_NOT_WORKING' | 'KNOWN_INCOMPATIBILITY';
      version?: string;
      message: string;
    };

const clamp = (text: string) => text.slice(0, 512);

function executableFacts(candidate: Candidate, version?: string) {
  return {
    path: candidate.path,
    source: candidate.source,
    ...(candidate.location ? { location: candidate.location } : {}),
    ...(version ? { version } : {}),
  };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await map(items[index]!);
      }
    }),
  );

  return results;
}

/** An executable found in an install location, before it is probed. */
interface InstalledBuild {
  path: string;
  location: ExecutableLocationId;
  /** Newer first: the executable's modification time, then its folder's. */
  modifiedMs: number;
  folderModifiedMs: number;
}

/**
 * The guard every candidate passes before anything runs: the path, and the real path it resolves
 * to through junctions and symbolic links, are both outside the workspace and the temporary
 * folders (compared with those folders' own real paths). A link elsewhere stays usable.
 */
async function createTrustGuard(
  options: LocateExecutableOptions,
  files: ExecutableFiles,
): Promise<{ untrusted: string[]; trusted: (path: string) => Promise<boolean> }> {
  const untrusted = untrustedRoots(options.environment, options.workspace, options.temporaryRoots);
  const real = await Promise.all(untrusted.map((root) => files.realpath(root).catch(() => root)));
  const roots = [...untrusted, ...real];

  return {
    untrusted,
    async trusted(path) {
      if (!trustedPath(path, roots)) {
        return false;
      }

      try {
        return trustedPath(await files.realpath(path), roots);
      } catch {
        return false;
      }
    },
  };
}

async function regularFile(files: ExecutableFiles, path: string) {
  try {
    const stat = await files.stat(path);

    return stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size > 0 &&
      stat.size <= MAX_EXECUTABLE_BYTES
      ? stat
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The executables present in the install locations, newest first within each location; at most
 * `MAX_PATTERN_BUILDS` per `*` location are returned and the rest counted. Only lists folders and
 * reads file metadata: nothing is run.
 */
async function installedBuilds(
  locations: readonly ExecutableLocation[],
  trusted: (path: string) => Promise<boolean>,
  files: ExecutableFiles,
): Promise<{ builds: InstalledBuild[]; omitted: number }> {
  const builds: InstalledBuild[] = [];
  let omitted = 0;
  for (const location of locations) {
    const segments = location.pattern.split('\\');
    const wildcard = segments.indexOf('*');
    const found: InstalledBuild[] = [];
    if (wildcard < 0) {
      const stat = await regularFile(files, location.pattern);
      if (stat && (await trusted(location.pattern))) {
        found.push({
          path: location.pattern,
          location: location.location,
          modifiedMs: stat.mtimeMs,
          folderModifiedMs: 0,
        });
      }
    } else {
      const parent = segments.slice(0, wildcard).join('\\');
      const rest = segments.slice(wildcard + 1);
      const entries = (await files.list(parent).catch(() => [] as string[])).slice(
        0,
        MAX_PATTERN_ENTRIES,
      );
      for (const entry of entries) {
        const folder = win32.join(parent, entry);
        const folderStat = await files.stat(folder).catch(() => undefined);
        if (!folderStat || (!folderStat.isDirectory() && !folderStat.isSymbolicLink())) {
          continue;
        }

        const path = win32.join(folder, ...rest);
        const stat = await regularFile(files, path);
        if (stat && (await trusted(path))) {
          found.push({
            path,
            location: location.location,
            modifiedMs: stat.mtimeMs,
            folderModifiedMs: folderStat.mtimeMs,
          });
        }
      }

      // Build folder names (hashes) say nothing about age: the newest builds come first.
      found.sort(
        (a, b) =>
          b.modifiedMs - a.modifiedMs ||
          b.folderModifiedMs - a.folderModifiedMs ||
          (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
      );
      omitted += Math.max(0, found.length - MAX_PATTERN_BUILDS);
      found.length = Math.min(found.length, MAX_PATTERN_BUILDS);
    }

    builds.push(...found);
  }

  return { builds, omitted };
}

/** A located executable and, when an install location supplied it, what those locations held. */
interface Located {
  resolution: ExecutableResolution;
  /** The install locations searched and the builds they held (`source: 'discovered'` only). */
  installs?: { locations: readonly ExecutableLocation[]; snapshot: string };
}

const snapshotOf = (builds: readonly InstalledBuild[]) =>
  builds.map((build) => build.path.toLowerCase() + '|' + String(build.modifiedMs)).join('\n');

/**
 * Finds the provider's CLI and verifies it by running its version command: the configured path
 * alone when set; else the first verified executable on PATH; else the highest verified version
 * among the vendor install locations. Nothing unverified is ever returned. Throws a
 * `ProviderUnavailableError` saying what was found or where it looked.
 */
export async function locateExecutable(
  declaration: ProviderExecutableDeclaration,
  options: LocateExecutableOptions,
  files: ExecutableFiles = nodeExecutableFiles,
): Promise<ExecutableResolution> {
  return (await locate(declaration, options, files)).resolution;
}

async function locate(
  declaration: ProviderExecutableDeclaration,
  options: LocateExecutableOptions,
  files: ExecutableFiles,
): Promise<Located> {
  const { title } = declaration;
  if (
    (options.platform ?? process.platform) !== 'win32' ||
    (options.architecture ?? process.arch) !== 'x64'
  ) {
    throw new ProviderUnavailableError(
      'INSTALLATION_UNAVAILABLE',
      `The ${title} adapter is implemented for Windows x64 only.`,
    );
  }

  const regular = async (path: string) => (await regularFile(files, path)) !== undefined;
  const guard = await createTrustGuard(options, files);
  /** A candidate that may run: a regular file whose real location is trusted. */
  const runnable = async (path: string) => (await regular(path)) && (await guard.trusted(path));

  async function verify(candidate: Candidate): Promise<Verified> {
    const failed = (
      reasonCode: Extract<Verified, { ok: false }>['reasonCode'],
      message: string,
      version?: string,
    ): Verified => ({
      ok: false,
      candidate,
      reasonCode,
      message: clamp(message),
      ...(version ? { version } : {}),
    });
    let output: string;
    try {
      output = await files.run(candidate.path, declaration.versionArguments, {
        environment: options.environment,
        timeoutMs: VERSION_TIMEOUT_MS,
      });
    } catch (error) {
      const why = error instanceof CommandFailure ? error.message : 'it could not be started';

      return failed(
        'EXECUTABLE_NOT_WORKING',
        `${title} at ${candidate.path} did not answer \`${declaration.versionArguments.join(' ')}\`: ${why}.`,
      );
    }

    const version = declaration.parseVersion(output.trim());
    if (!version) {
      return failed(
        'EXECUTABLE_NOT_WORKING',
        `${title} at ${candidate.path} did not report a recognizable version.`,
      );
    }

    if (options.knownIncompatible) {
      let sha256: string;
      try {
        sha256 = await files.hash(candidate.path);
      } catch {
        return failed(
          'EXECUTABLE_NOT_WORKING',
          `${title} at ${candidate.path} could not be read.`,
          version,
        );
      }

      if (options.knownIncompatible({ sha256, version })) {
        return failed(
          'KNOWN_INCOMPATIBILITY',
          `${title} ${version} at ${candidate.path} is a build recorded as incompatible.`,
          version,
        );
      }
    }

    return { ok: true, candidate, version };
  }

  function resolved(result: Extract<Verified, { ok: true }>): ExecutableResolution {
    return {
      path: result.candidate.path,
      source: result.candidate.source,
      ...(result.candidate.location ? { location: result.candidate.location } : {}),
      version: result.version,
    };
  }

  function unavailable(failure: Extract<Verified, { ok: false }>): never {
    throw new ProviderUnavailableError(failure.reasonCode, failure.message, {
      executable: executableFacts(failure.candidate, failure.version),
    });
  }

  // 1. The explicit local setting always wins and is never silently replaced.
  if (options.configured !== undefined) {
    const candidate: Candidate = { path: options.configured, source: 'configured' };
    if (!win32.isAbsolute(options.configured) || !(await regular(options.configured))) {
      throw new ProviderUnavailableError(
        'EXECUTABLE_NOT_FOUND',
        `The configured ${title} executable ${options.configured} does not exist or is not a regular file.`,
        { checkedLocations: [{ source: 'configured', path: options.configured }] },
      );
    }

    const result = await verify(candidate);

    return { resolution: result.ok ? resolved(result) : unavailable(result) };
  }

  const failures: Extract<Verified, { ok: false }>[] = [];
  const seen = new Set<string>();
  const fresh = (path: string) => {
    const key = win32.resolve(path).toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  };

  // 2. PATH: a native `.exe`, or an npm launcher resolved to its package's native executable
  // (a `.cmd`/`.bat` launcher is never run: cmd.exe re-parses every argument).
  const npmPackage = declaration.npmPackage;
  const pathCandidates: Candidate[] = [];
  const launchers: string[] = [];
  for (const directory of searchPath(options.environment, guard.untrusted)) {
    const native = win32.join(directory, declaration.command + '.exe');
    if (fresh(native) && (await runnable(native))) {
      pathCandidates.push({ path: native, source: 'path' });
    }

    for (const extension of ['.cmd', '.bat']) {
      const launcher = win32.join(directory, declaration.command + extension);
      const isFile = (path: string) =>
        files.stat(path).then(
          (stat) => stat.isFile(),
          () => false,
        );
      // An npm launcher sits in the global prefix beside the package folder it starts.
      const packageFolder = npmPackage
        ? win32.join(directory, 'node_modules', ...npmPackage.name.split('/'))
        : undefined;
      if (
        !packageFolder ||
        !(await isFile(launcher)) ||
        !(await files.stat(packageFolder).then(
          (stat) => stat.isDirectory(),
          () => false,
        ))
      ) {
        continue;
      }

      launchers.push(launcher);
      for (const relative of npmPackage?.executables ?? []) {
        const target = win32.join(directory, relative);
        if (fresh(target) && (await runnable(target))) {
          pathCandidates.push({ path: target, source: 'path', location: 'npm-global-package' });
        }
      }
    }
  }

  // PATH order decides, so candidates are verified one at a time and the first that works wins.
  for (const candidate of pathCandidates) {
    const result = await verify(candidate);
    if (result.ok) {
      return { resolution: resolved(result) };
    }

    failures.push(result);
  }

  // 3. The vendor install locations, and the npm global prefix as npm reports it.
  const env = options.environment.values;
  const locations = [...declaration.installLocations(env)];
  const prefix = npmPackage ? await npmGlobalPrefix(options.environment, guard, files) : undefined;
  if (prefix && npmPackage) {
    for (const relative of npmPackage.executables) {
      locations.push({ location: 'npm-global-package', pattern: win32.join(prefix, relative) });
    }
  }

  const trustedLocations = locations.filter((location) =>
    trustedPath(location.pattern, guard.untrusted),
  );
  const { builds, omitted } = await installedBuilds(trustedLocations, guard.trusted, files);
  const installed: Candidate[] = builds
    .filter((build) => fresh(build.path))
    .map((build) => ({ path: build.path, source: 'discovered', location: build.location }));
  const omittedNote = omitted
    ? ` ${omitted} older build folder${omitted === 1 ? ' was' : 's were'} not checked.`
    : '';

  const verifiedInstalls = await mapLimited(installed, PARALLEL_PROBES, verify);
  let best: Extract<Verified, { ok: true }> | undefined;
  for (const result of verifiedInstalls) {
    if (!result.ok) {
      failures.push(result);
    } else if (!best || compareVersions(result.version, best.version) > 0) {
      // Equal versions keep the earlier one: declared location order, then newest build first.
      best = result;
    }
  }

  if (best) {
    return {
      resolution: resolved(best),
      installs: { locations: trustedLocations, snapshot: snapshotOf(builds) },
    };
  }

  // Fail closed: report the most specific problem of a found executable, else where it looked.
  const failure =
    failures.find((item) => item.reasonCode === 'KNOWN_INCOMPATIBILITY') ?? failures[0];
  if (failure) {
    unavailable({ ...failure, message: clamp(failure.message + omittedNote) });
  }

  const checkedLocations: NonNullable<ProviderDescriptor['checkedLocations']> = [
    {
      source: 'path' as const,
      path: ['.exe', '.cmd', '.bat'].map((extension) => declaration.command + extension).join(', '),
    },
    ...locations.map((location) => ({
      source: 'discovered' as const,
      path: location.pattern,
      location: location.location,
    })),
  ].slice(0, 32);
  const launcher = launchers[0];
  if (launcher && npmPackage) {
    throw new ProviderUnavailableError(
      'EXECUTABLE_NOT_FOUND',
      clamp(
        `${launcher} is the npm launcher of ${npmPackage.name}, but the package's native executable is missing.`,
      ),
      { checkedLocations, unresolvedLauncher: { path: launcher, package: npmPackage.name } },
    );
  }

  throw new ProviderUnavailableError(
    'EXECUTABLE_NOT_FOUND',
    clamp(`No ${title} CLI was found on PATH or in its install locations.${omittedNote}`),
    { checkedLocations },
  );
}

/**
 * Discovery once per Runtime. A found executable is kept while its file is unchanged; when it came
 * from an install location, each read also lists those locations again (folder listings and file
 * metadata only, nothing runs) and discovers again when the builds there changed, so an app update
 * into a new folder is picked up. A failure is kept for 30 seconds. `forget` makes the next read a
 * full discovery (an explicit recheck).
 */
export function createExecutableLocator(
  declaration: ProviderExecutableDeclaration,
  options: LocateExecutableOptions,
  files: ExecutableFiles = nodeExecutableFiles,
  now: () => number = Date.now,
) {
  let found: { located: Located; size: number; mtimeMs: number } | undefined;
  let failure: { error: ProviderUnavailableError; at: number } | undefined;
  let pending: Promise<ExecutableResolution> | undefined;

  async function unchanged() {
    if (!found) {
      return false;
    }

    const stat = await files.stat(found.located.resolution.path).catch(() => undefined);
    if (
      stat?.isFile() !== true ||
      stat.isSymbolicLink() ||
      stat.size !== found.size ||
      stat.mtimeMs !== found.mtimeMs
    ) {
      return false;
    }

    const installs = found.located.installs;
    if (!installs) {
      return true;
    }

    const guard = await createTrustGuard(options, files);
    const { builds } = await installedBuilds(installs.locations, guard.trusted, files);

    return snapshotOf(builds) === installs.snapshot;
  }

  return {
    async resolve(signal: AbortSignal): Promise<ExecutableResolution> {
      signal.throwIfAborted();
      if (await unchanged()) {
        return found!.located.resolution;
      }

      found = undefined;
      if (failure && now() - failure.at < 30000) {
        throw failure.error;
      }

      pending ??= (async () => {
        try {
          const located = await locate(declaration, options, files);
          const stat = await files.stat(located.resolution.path);
          found = { located, size: stat.size, mtimeMs: stat.mtimeMs };
          failure = undefined;

          return located.resolution;
        } catch (error) {
          if (error instanceof ProviderUnavailableError) {
            failure = { error, at: now() };
          }

          throw error;
        } finally {
          pending = undefined;
        }
      })();

      return pending;
    },
    /** The next read discovers again from scratch (an explicit recheck). */
    forget() {
      found = undefined;
      failure = undefined;
    },
  };
}

export type ExecutableLocator = ReturnType<typeof createExecutableLocator>;
