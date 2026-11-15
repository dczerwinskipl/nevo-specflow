import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { getProjectCatalogue } from '../../definitions/process-catalogue';
import { sha256Hex } from '../../hash';
import { templateValues } from '../archetypes/template-renderer';
import type { ArchetypeDefinition } from '@nevo/specflow-contracts/documents';
import type { SpecificationManifest } from '../model';
import { deriveDocumentTitle } from './document-title';
import { decodeText } from './file-analysis';
import { loadSpecification, type LoadedSpecification } from './loaded-specification';
import { probeFile } from './observation';
import type { DocumentCommitMarker } from './reads/commit-model';
import { commitSubjectOf, readDocumentCommitView } from './reads/commit-reader';
import { matchesTemplateShape, templateShape } from './template-match';
import {
  resolveReadOptions,
  type DocumentReadOptions,
  type SummaryMemoValue,
} from './read-options';

const ANALYSIS_CONCURRENCY = 8;

export interface RegisteredDocumentSummary {
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly title: string;
  readonly revision: string;
  /**
   * The file is still only the archetype template it was created from (same type and file name),
   * rendered with the Specification's title, slug and creation date; the goal, which the
   * Specification does not keep, may hold any text. False without such a template.
   */
  readonly templateOnly: boolean;
  /** The open commit that covers the file (pending, failed, uncommitted); absent when none does. */
  readonly commit?: DocumentCommitMarker;
}

/**
 * Registered documents whose file exists, with their derived titles (the workspace `documents`
 * section). Unclassified and dangling entries are not part of it. Files that cannot be read safely
 * are left out rather than failing the section.
 */
export async function readRegisteredDocumentSummaries(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
): Promise<readonly RegisteredDocumentSummary[]> {
  const loaded = await loadSpecification(engine, specId, resolveReadOptions(options).fs);
  const archetype = await archetypeOf(engine, loaded.manifest);
  const summaries = await summariesOfLoaded(loaded, archetype, options);
  const view = await readDocumentCommitView(engine.context, commitSubjectOf(loaded), {
    now: resolveReadOptions(options).now,
    ...(options.processTable !== undefined ? { processTable: options.processTable } : {}),
  });

  return summaries.map((summary) => {
    const commit = view.markers.get(summary.path);

    return commit === undefined ? summary : { ...summary, commit };
  });
}

/** The Specification's archetype in the current catalogue; none when it cannot be read. */
async function archetypeOf(
  engine: SpecFlowEngine,
  manifest: SpecificationManifest,
): Promise<ArchetypeDefinition | undefined> {
  try {
    return (await getProjectCatalogue(engine)).catalogue.findArchetype(manifest.archetype.id);
  } catch {
    // Without a readable catalogue no document is reported as template only.
    return undefined;
  }
}

/** Registered document summaries of an already loaded Specification. */
async function summariesOfLoaded(
  loaded: LoadedSpecification,
  archetype: ArchetypeDefinition | undefined,
  options: DocumentReadOptions = {},
): Promise<readonly RegisteredDocumentSummary[]> {
  const resolved = resolveReadOptions(options);
  const values = templateValues({
    title: loaded.manifest.title,
    slug: loaded.manifest.slug,
    created: loaded.manifest.created ?? '',
  });
  const rows = await mapBounded(
    loaded.manifest.documents,
    ANALYSIS_CONCURRENCY,
    async (document): Promise<RegisteredDocumentSummary | undefined> => {
      const template = archetype?.templates.find(
        (candidate) =>
          candidate.documentType === document.type && candidate.filename === document.path,
      );
      const shape = template ? templateShape(template.content, values) : undefined;
      // The memo answers for the file AND the template it was compared to.
      const prefix = shape ? `${sha256Hex(JSON.stringify(shape))}:` : 'none:';
      const probe = await probeFile<SummaryMemoValue>(
        loaded,
        document.path,
        resolved,
        {
          get: (key) => resolved.summaryMemo.get(prefix + key),
          set: (key, value) => resolved.summaryMemo.set(prefix + key, value),
        },
        (analysis) => {
          const text =
            analysis.kind === 'text' && analysis.bytes ? decodeText(analysis.bytes) : undefined;

          return {
            title: deriveDocumentTitle(document.path, text),
            revision: analysis.revision,
            templateOnly:
              shape !== undefined && text !== undefined && matchesTemplateShape(text, shape),
          };
        },
      );
      if (probe.kind !== 'file') {
        return undefined;
      }

      return { id: document.id, path: document.path, type: document.type, ...probe.value };
    },
  );

  return rows.filter((row): row is RegisteredDocumentSummary => row !== undefined);
}
