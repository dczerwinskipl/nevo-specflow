import {
  DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH,
  type DefinitionProblem,
  type DefinitionProblemCode,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';

import type {
  DefinitionCheckContext,
  DefinitionIssue,
  DefinitionKind,
  DefinitionKindRegistry,
  ReferenceLookup,
} from './kind-registry';
import {
  DEFINITION_AUXILIARY_FILES_MAX,
  DEFINITION_DIRECTORY_ENTRIES_MAX,
  DEFINITION_DIRECTORY_OVERFLOW,
  DEFINITION_FILE_MAX_BYTES,
  DEFINITION_LOAD_MAX_BYTES,
  DEFINITION_TEMPLATE_FILE_MAX_BYTES,
} from './limits';
import { compareText } from './order';
import { pathSegments, type DefinitionSource, type ListOutcome, type SourceEntry } from './source';
import { parseDefinitionYaml } from './yaml-parse';

/**
 * The generic definition loader (architecture "Definitions as project data", "Loading"). It reads every
 * registered kind's directory through a {@link DefinitionSource}, validates each file on its own and
 * returns the valid entities plus the problems of the rest. It takes no lock, starts no process, follows
 * no symlink and reads at most the limits of the architecture table. It never names a kind: everything
 * kind-specific comes from the registry.
 */

export interface LoadedDefinition {
  readonly kind: string;
  readonly id: string;
  /** Path relative to `.nevo/definitions`, for example `document-type/overview.yaml`. */
  readonly source: string;
  readonly entity: unknown;
  /** Template files the definition was built from, relative to its kind directory. */
  readonly auxiliary: readonly string[];
}

export interface LoadResult {
  /** Valid entities by kind, then by id, in name order. */
  readonly definitions: ReadonlyMap<string, ReadonlyMap<string, LoadedDefinition>>;
  /** Ids whose file exists but was rejected, by kind. */
  readonly invalid: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * For every definition file found (valid or rejected), by `<kind>/<id>`: the paths relative to the
   * root whose state decides it (its own file, its template files and the files of the definitions it
   * refers to, present or not). A single-definition lookup re-checks exactly these files.
   */
  readonly dependencies: ReadonlyMap<string, readonly string[]>;
  /** Every problem: errors first, then by source, code and location. Not capped. */
  readonly problems: readonly DefinitionProblem[];
  /** False when `.nevo/definitions` does not exist. */
  readonly rootPresent: boolean;
  readonly bytesRead: number;
}

const FILE_NAME = /^([a-z][a-z0-9-]{0,31})\.yaml$/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const WARNING_CODES: ReadonlySet<DefinitionProblemCode> = new Set([
  'unexpected-entry',
  'unknown-kind-directory',
]);

const utf8 = new TextDecoder('utf-8', { fatal: true });

function truncate(message: string): string {
  return message.length <= DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH
    ? message
    : `${message.slice(0, DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH - 3)}...`;
}

/** Errors first, then by source, code and location (a total order, so the result is deterministic). */
export function compareProblems(left: DefinitionProblem, right: DefinitionProblem): number {
  const rank = (problem: DefinitionProblem) => (problem.severity === 'error' ? 0 : 1);

  return (
    rank(left) - rank(right) ||
    compareText(left.source, right.source) ||
    compareText(left.code, right.code) ||
    compareText(left.location ?? '', right.location ?? '') ||
    compareText(left.message, right.message)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type DecodeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'utf8' | 'nul' };

function decodeText(bytes: Uint8Array): DecodeResult {
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return { ok: false, reason: 'utf8' };
  }

  return text.includes('\u0000') ? { ok: false, reason: 'nul' } : { ok: true, text };
}

/** CRLF and lone CR become LF, so an `autocrlf` checkout does not change the catalogue revision. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/gu, '\n');
}

/** The files of the definitions an entity refers to, relative to the root (`<kind>/<id>.yaml`). */
function referencedFiles(kind: DefinitionKind, entity: unknown): string[] {
  return kind.references(entity).map((reference) => `${reference.kind}/${reference.id}.yaml`);
}

interface PendingEntity {
  readonly id: string;
  readonly source: string;
  readonly entity: unknown;
  readonly auxiliary: readonly string[];
}

export async function loadDefinitions(
  source: DefinitionSource,
  registry: DefinitionKindRegistry,
): Promise<LoadResult> {
  const problems: DefinitionProblem[] = [];
  const definitions = new Map<string, Map<string, LoadedDefinition>>();
  const invalid = new Map<string, Set<string>>();
  const dependencies = new Map<string, string[]>();
  const listings = new Map<string, ListOutcome>();
  const budget = { used: 0 };

  const depend = (kind: string, id: string, ...paths: string[]): void => {
    const key = `${kind}/${id}`;
    const known = dependencies.get(key) ?? [];
    for (const path of paths) {
      if (!known.includes(path)) {
        known.push(path);
      }
    }

    dependencies.set(key, known);
  };

  const report = (
    path: string,
    kind: string | undefined,
    code: DefinitionProblemCode,
    message: string,
    location?: string,
  ): void => {
    problems.push({
      source: path,
      ...(kind !== undefined ? { kind } : {}),
      code,
      severity: WARNING_CODES.has(code) ? 'warning' : 'error',
      message: truncate(message),
      ...(location !== undefined ? { location } : {}),
    });
  };

  const kinds = registry.loadOrder();
  for (const kind of kinds) {
    definitions.set(kind.kind, new Map());
    invalid.set(kind.kind, new Set());
  }

  const root = await source.list('', DEFINITION_DIRECTORY_OVERFLOW);
  if (root.state === 'absent') {
    return { definitions, invalid, dependencies, problems: [], rootPresent: false, bytesRead: 0 };
  }

  if (root.state !== 'ok') {
    report(
      '',
      undefined,
      root.state === 'unreadable' ? 'file-unreadable' : 'directory-unsafe',
      root.state === 'overflow'
        ? 'The definitions folder has too many entries.'
        : root.state === 'unreadable'
          ? 'The definitions folder cannot be read.'
          : 'The definitions folder is not a plain directory inside the project.',
    );

    return { definitions, invalid, dependencies, problems, rootPresent: true, bytesRead: 0 };
  }

  for (const entry of [...root.entries].sort((a, b) => compareText(a.name, b.name))) {
    if (registry.has(entry.name)) {
      continue;
    }

    if (entry.type === 'directory') {
      report(
        entry.name,
        undefined,
        'unknown-kind-directory',
        `"${entry.name}" is not a known definition kind and is ignored.`,
      );
    } else if (entry.type === 'file') {
      report(
        entry.name,
        undefined,
        'unexpected-entry',
        `"${entry.name}" is not a definition kind folder and is ignored.`,
      );
    } else {
      report(entry.name, undefined, 'directory-unsafe', `"${entry.name}" is not a plain entry.`);
    }
  }

  const checkContextFor = (kind: DefinitionKind): DefinitionCheckContext => ({
    lookup(otherKind, id): ReferenceLookup {
      if (!kind.dependsOn.includes(otherKind)) {
        throw new Error(`Kind "${kind.kind}" does not declare a dependency on "${otherKind}".`);
      }

      const found = definitions.get(otherKind)?.get(id);
      if (found) {
        return { state: 'valid', entity: found.entity };
      }

      return invalid.get(otherKind)?.has(id) ? { state: 'invalid' } : { state: 'missing' };
    },
  });

  for (const kind of kinds) {
    const pending = await readKindFiles(kind);
    const context = checkContextFor(kind);
    for (const item of pending) {
      depend(
        kind.kind,
        item.id,
        item.source,
        ...item.auxiliary.map((path) => `${kind.kind}/${path}`),
        ...referencedFiles(kind, item.entity),
      );
      const issues: readonly DefinitionIssue[] = kind.check(item.entity, context);
      if (issues.length > 0) {
        invalid.get(kind.kind)?.add(item.id);
        for (const issue of issues) {
          report(item.source, kind.kind, issue.code, issue.message, issue.location);
        }

        continue;
      }

      definitions.get(kind.kind)?.set(item.id, {
        kind: kind.kind,
        id: item.id,
        source: item.source,
        entity: item.entity,
        auxiliary: item.auxiliary,
      });
    }
  }

  problems.sort(compareProblems);

  return {
    definitions,
    invalid,
    dependencies,
    problems,
    rootPresent: true,
    bytesRead: budget.used,
  };

  /**
   * Whether a file with exactly this name (byte for byte, as `readdir` reports it) is in its directory.
   * A case-insensitive filesystem would open `Templates/Overview.md` for `templates/overview.md`; the
   * catalogue must then be the same as on a case-sensitive one, so the listed name decides.
   */
  async function exactEntry(path: string): Promise<'present' | 'absent' | 'unknown'> {
    const segments = pathSegments(path);
    const name = segments.at(-1) ?? '';
    const directory = segments.slice(0, -1).join('/');
    let listing = listings.get(directory);
    if (!listing) {
      listing = await source.list(directory, DEFINITION_DIRECTORY_OVERFLOW);
      listings.set(directory, listing);
    }

    if (listing.state === 'absent') {
      return 'absent';
    }

    if (listing.state !== 'ok') {
      return 'unknown';
    }

    return listing.entries.some((entry) => entry.name === name) ? 'present' : 'absent';
  }

  /** Everything up to the cross-reference checks: listing, reading, YAML, schema, template files. */
  async function readKindFiles(kind: DefinitionKind): Promise<PendingEntity[]> {
    const listing = await source.list(kind.kind, DEFINITION_DIRECTORY_OVERFLOW);
    if (listing.state === 'absent') {
      return [];
    }

    if (listing.state !== 'ok') {
      report(
        kind.kind,
        kind.kind,
        listing.state === 'unreadable' ? 'file-unreadable' : 'directory-unsafe',
        listing.state === 'overflow'
          ? `The "${kind.kind}" folder has too many entries; none of them is read.`
          : listing.state === 'unreadable'
            ? `The "${kind.kind}" folder cannot be read.`
            : `The "${kind.kind}" folder is not a plain directory inside the project.`,
      );

      return [];
    }

    const entries = [...listing.entries].sort((a, b) => compareText(a.name, b.name));
    const pending: PendingEntity[] = [];
    let candidates = 0;
    const seenIds = new Set<string>();
    const duplicated = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const path = `${kind.kind}/${entry.name}`;
      if (entry.type === 'directory') {
        if (!kind.auxiliaryDirectories.includes(entry.name)) {
          report(
            path,
            kind.kind,
            'unexpected-entry',
            `"${entry.name}" is not a definition and is ignored.`,
          );
        }

        continue;
      }

      const match = FILE_NAME.exec(entry.name);
      const id = match?.[1];
      if (entry.type !== 'file') {
        // A link or a special file that carries a definition name is a definition that exists and is
        // rejected (never read), so a lookup of that id says invalid, not absent.
        if (id !== undefined) {
          invalid.get(kind.kind)?.add(id);
          depend(kind.kind, id, path);
        }

        report(
          path,
          kind.kind,
          'directory-unsafe',
          `"${entry.name}" is a link or a special file and is not read.`,
        );
        continue;
      }

      if (id === undefined || WINDOWS_DEVICE_NAME.test(id)) {
        report(
          path,
          kind.kind,
          'unexpected-entry',
          `"${entry.name}" is not a valid definition file name and is ignored.`,
        );
        continue;
      }

      depend(kind.kind, id, path);
      if (index >= DEFINITION_DIRECTORY_ENTRIES_MAX) {
        invalid.get(kind.kind)?.add(id);
        report(
          path,
          kind.kind,
          'limit-exceeded',
          `The folder holds more than ${DEFINITION_DIRECTORY_ENTRIES_MAX} entries; this file is not read.`,
        );
        continue;
      }

      if (seenIds.has(id)) {
        duplicated.add(id);
        report(path, kind.kind, 'id-duplicate', `The id "${id}" is defined more than once.`);
        continue;
      }

      seenIds.add(id);
      candidates += 1;
      if (candidates > kind.maxEntities) {
        invalid.get(kind.kind)?.add(id);
        report(
          path,
          kind.kind,
          'limit-exceeded',
          `At most ${kind.maxEntities} definitions of this kind are loaded; this file is not read.`,
        );
        continue;
      }

      const loaded = await readOne(kind, id, entry, path);
      if (loaded) {
        pending.push(loaded);
      } else {
        invalid.get(kind.kind)?.add(id);
      }
    }

    for (const id of duplicated) {
      invalid.get(kind.kind)?.add(id);
    }

    return pending.filter((item) => !duplicated.has(item.id));
  }

  async function readOne(
    kind: DefinitionKind,
    id: string,
    entry: SourceEntry,
    path: string,
  ): Promise<PendingEntity | undefined> {
    const fail = (code: DefinitionProblemCode, message: string, location?: string): undefined => {
      report(path, kind.kind, code, message, location);

      return undefined;
    };

    if (entry.size > DEFINITION_FILE_MAX_BYTES) {
      return fail('file-too-large', `The file is larger than ${DEFINITION_FILE_MAX_BYTES} bytes.`);
    }

    if (budget.used + entry.size > DEFINITION_LOAD_MAX_BYTES) {
      return fail('limit-exceeded', 'The definitions exceed the total size read in one load.');
    }

    const read = await source.read(path, DEFINITION_FILE_MAX_BYTES);
    if (read.state === 'too-large') {
      return fail('file-too-large', `The file is larger than ${DEFINITION_FILE_MAX_BYTES} bytes.`);
    }

    if (read.state !== 'ok') {
      return fail(
        'file-unreadable',
        read.state === 'absent'
          ? 'The file disappeared while it was being read.'
          : read.state === 'unsafe' || read.state === 'not-regular'
            ? 'The file is not a regular file inside the definitions folder.'
            : 'The file cannot be read.',
      );
    }

    budget.used += read.bytes.length;

    const decoded = decodeText(read.bytes);
    if (!decoded.ok) {
      return fail(
        'yaml-invalid',
        decoded.reason === 'utf8'
          ? 'The file is not valid UTF-8.'
          : 'The file contains a NUL character.',
      );
    }

    const parsed = parseDefinitionYaml(decoded.text);
    if (!parsed.ok) {
      return fail('yaml-invalid', parsed.message);
    }

    const value = parsed.value;
    if (!isPlainObject(value)) {
      return fail('schema-invalid', 'The file must contain one mapping.', '');
    }

    if (typeof value.kind === 'string' && value.kind !== kind.kind) {
      return fail(
        'kind-mismatch',
        `The file says kind "${value.kind}" but lives in the "${kind.kind}" folder.`,
        '/kind',
      );
    }

    const version = value.schemaVersion;
    if (
      typeof version === 'number' &&
      Number.isInteger(version) &&
      !kind.schemaVersions.includes(version)
    ) {
      return fail(
        'unsupported-schema-version',
        `Schema version ${version} is not supported (supported: ${kind.schemaVersions.join(', ')}).`,
        '/schemaVersion',
      );
    }

    const schema = kind.schema(
      typeof version === 'number' && kind.schemaVersions.includes(version)
        ? version
        : (kind.schemaVersions.at(-1) ?? 1),
    );
    if (!Value.Check(schema, value)) {
      const errors = [...Value.Errors(schema, value)];
      const first = errors[0];
      const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';

      return fail(
        'schema-invalid',
        `${first?.message ?? 'The file does not match its schema.'}${more}`,
        first?.instancePath ?? '',
      );
    }

    if (value.id !== id) {
      return fail(
        'id-filename-mismatch',
        `The id "${String(value.id)}" must equal the file name "${id}".`,
        '/id',
      );
    }

    const violations = kind.textLimitViolations(value);
    for (const violation of violations) {
      report(
        path,
        kind.kind,
        'schema-invalid',
        `The text is ${violation.actualBytes} bytes, above the ${violation.limitBytes} byte limit.`,
        violation.path,
      );
    }

    if (violations.length > 0) {
      return undefined;
    }

    const auxiliary = await readAuxiliary(kind, value, path);
    if (!auxiliary) {
      return undefined;
    }

    try {
      return {
        id,
        source: path,
        entity: kind.parse(value, auxiliary),
        auxiliary: [...auxiliary.keys()],
      };
    } catch {
      return fail('schema-invalid', 'The file cannot be converted to a definition.');
    }
  }

  async function readAuxiliary(
    kind: DefinitionKind,
    file: unknown,
    path: string,
  ): Promise<Map<string, string> | undefined> {
    const references = kind.auxiliaryFiles(file);
    const texts = new Map<string, string>();
    if (references.length > DEFINITION_AUXILIARY_FILES_MAX) {
      report(
        path,
        kind.kind,
        'limit-exceeded',
        `The file refers to more than ${DEFINITION_AUXILIARY_FILES_MAX} template files.`,
      );

      return undefined;
    }

    let failed = false;
    for (const reference of references) {
      if (texts.has(reference.path)) {
        continue;
      }

      const fail = (message: string): void => {
        failed = true;
        report(path, kind.kind, 'template-file-invalid', message, reference.location);
      };

      const first = reference.path.split('/', 1)[0] ?? '';
      if (!kind.auxiliaryDirectories.includes(first)) {
        fail(`The path "${reference.path}" is not below a template folder of this kind.`);
        continue;
      }

      const exact = await exactEntry(`${kind.kind}/${reference.path}`);
      if (exact === 'absent') {
        fail(`The template file "${reference.path}" does not exist (names are case-sensitive).`);
        continue;
      }

      if (budget.used + 1 > DEFINITION_LOAD_MAX_BYTES) {
        failed = true;
        report(
          path,
          kind.kind,
          'limit-exceeded',
          'The definitions exceed the total size read in one load.',
          reference.location,
        );
        continue;
      }

      const read = await source.read(
        `${kind.kind}/${reference.path}`,
        DEFINITION_TEMPLATE_FILE_MAX_BYTES,
      );
      if (read.state === 'ok') {
        budget.used += read.bytes.length;
        const decoded = decodeText(read.bytes);
        if (decoded.ok) {
          texts.set(reference.path, normalizeLineEndings(decoded.text));
        } else {
          fail(
            decoded.reason === 'utf8'
              ? `The template file "${reference.path}" is not valid UTF-8.`
              : `The template file "${reference.path}" contains a NUL character.`,
          );
        }
      } else if (read.state === 'absent') {
        fail(`The template file "${reference.path}" does not exist.`);
      } else if (read.state === 'too-large') {
        fail(
          `The template file "${reference.path}" is larger than ${DEFINITION_TEMPLATE_FILE_MAX_BYTES} bytes.`,
        );
      } else if (read.state === 'unreadable') {
        fail(`The template file "${reference.path}" cannot be read.`);
      } else {
        fail(
          `The template file "${reference.path}" is not a regular file inside the template folder.`,
        );
      }
    }

    return failed ? undefined : texts;
  }
}
