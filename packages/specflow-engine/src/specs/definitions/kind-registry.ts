import type {
  DefinitionFileTextLimitViolation,
  DefinitionProblemCode,
} from '@nevo/specflow-contracts/documents';
import type { TSchema } from 'typebox';

/**
 * The registry of definition kinds. A kind describes everything the generic loader needs to know about
 * one directory of `.nevo/definitions`: its schema per `schemaVersion`, how a validated file becomes an
 * entity, which other kinds it refers to and its cross-reference checks. The loader core never names a
 * kind, so a new kind (task archetypes, review kinds, ...) is one registration, not a loader change.
 * Rules: `docs/architecture/runtime/specification-documents.md` ("Definitions as project data").
 */

/** One reported problem of a check, before the loader adds the source and the severity. */
export interface DefinitionIssue {
  readonly code: DefinitionProblemCode;
  readonly message: string;
  /** JSON pointer inside the file. */
  readonly location?: string;
}

export type ReferenceLookup =
  | { readonly state: 'valid'; readonly entity: unknown }
  /** A file with that id exists but was rejected. */
  | { readonly state: 'invalid' }
  | { readonly state: 'missing' };

export interface DefinitionCheckContext {
  /** Another kind's entity by id. Only kinds named in `dependsOn` are resolved. */
  lookup(kind: string, id: string): ReferenceLookup;
}

/** A file next to the definition (a template), relative to the kind directory. */
export interface AuxiliaryFileReference {
  readonly location: string;
  readonly path: string;
}

export interface DefinitionReference {
  readonly kind: string;
  readonly id: string;
}

export interface DefinitionKind<TFile = unknown, TEntity = unknown> {
  /** Equals the directory name below `.nevo/definitions`. */
  readonly kind: string;
  /** Subdirectories that are not definitions (for example `templates`); never reported as unknown. */
  readonly auxiliaryDirectories: readonly string[];
  /** Kinds whose entities this kind refers to; they load and check first. */
  readonly dependsOn: readonly string[];
  readonly schemaVersions: readonly number[];
  /** Entities of this kind that load; extra files (in name order) are rejected. */
  readonly maxEntities: number;
  /** TypeBox schema of one `schemaVersion` of the file. */
  schema(version: number): TSchema;
  /** Exact UTF-8 byte limits the schema cannot express. */
  textLimitViolations(file: TFile): readonly DefinitionFileTextLimitViolation[];
  /** Files the loader must read for this file, in a fixed order. */
  auxiliaryFiles(file: TFile): readonly AuxiliaryFileReference[];
  /** Pure conversion of a validated file; `auxiliary` maps each referenced path to its LF text. */
  parse(file: TFile, auxiliary: ReadonlyMap<string, string>): TEntity;
  /** Checks that need other entities or whole-entity rules. */
  check(entity: TEntity, context: DefinitionCheckContext): readonly DefinitionIssue[];
  /** Other entities that must be installed together with this one. */
  references(entity: TEntity): readonly DefinitionReference[];
}

/** Erase the type parameters at the registration boundary (the loader treats files as `unknown`). */
export function defineDefinitionKind<TFile, TEntity>(
  kind: DefinitionKind<TFile, TEntity>,
): DefinitionKind {
  return kind;
}

const KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;

export class DefinitionKindRegistry {
  private readonly kinds = new Map<string, DefinitionKind>();
  private ordered: readonly DefinitionKind[] | undefined;

  register(kind: DefinitionKind): this {
    if (!KIND_PATTERN.test(kind.kind)) {
      throw new Error(`Definition kind "${kind.kind}" is not a valid directory name.`);
    }

    if (this.kinds.has(kind.kind)) {
      throw new Error(`Definition kind "${kind.kind}" is registered twice.`);
    }

    if (kind.schemaVersions.length === 0) {
      throw new Error(`Definition kind "${kind.kind}" supports no schema version.`);
    }

    this.kinds.set(kind.kind, kind);
    this.ordered = undefined;

    return this;
  }

  get(kind: string): DefinitionKind | undefined {
    return this.kinds.get(kind);
  }

  has(kind: string): boolean {
    return this.kinds.has(kind);
  }

  /** Kinds in load order: dependencies first, then by name. Throws on an unknown dependency or a cycle. */
  loadOrder(): readonly DefinitionKind[] {
    if (this.ordered) {
      return this.ordered;
    }

    const result: DefinitionKind[] = [];
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (name: string, via: string): void => {
      const kind = this.kinds.get(name);
      if (!kind) {
        throw new Error(`Definition kind "${via}" depends on unregistered kind "${name}".`);
      }

      const seen = state.get(name);
      if (seen === 'done') {
        return;
      }

      if (seen === 'visiting') {
        throw new Error(`Definition kinds depend on each other at "${name}".`);
      }

      state.set(name, 'visiting');
      for (const dependency of [...kind.dependsOn].sort()) {
        visit(dependency, name);
      }

      state.set(name, 'done');
      result.push(kind);
    };

    for (const name of [...this.kinds.keys()].sort()) {
      visit(name, name);
    }

    this.ordered = result;

    return result;
  }
}

/** Register a kind in a registry (the function form named by the architecture document). */
export function registerDefinitionKind(
  registry: DefinitionKindRegistry,
  kind: DefinitionKind,
): DefinitionKindRegistry {
  return registry.register(kind);
}
