import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { deriveDocumentTitle } from './document-title';
import { decodeText } from './file-analysis';
import { loadSpecification, type LoadedSpecification } from './loaded-specification';
import { probeFile } from './observation';
import type { DocumentCommitMarker } from './reads/commit-model';
import { commitSubjectOf, readDocumentCommitView } from './reads/commit-reader';
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
  const summaries = await summariesOfLoaded(loaded, options);
  const view = await readDocumentCommitView(engine.context, commitSubjectOf(loaded), {
    now: resolveReadOptions(options).now,
    ...(options.processTable !== undefined ? { processTable: options.processTable } : {}),
  });
  return summaries.map((summary) => {
    const commit = view.markers.get(summary.path);
    return commit === undefined ? summary : { ...summary, commit };
  });
}

/** Registered document summaries of an already loaded Specification. */
async function summariesOfLoaded(
  loaded: LoadedSpecification,
  options: DocumentReadOptions = {},
): Promise<readonly RegisteredDocumentSummary[]> {
  const resolved = resolveReadOptions(options);
  const rows = await mapBounded(
    loaded.manifest.documents,
    ANALYSIS_CONCURRENCY,
    async (document): Promise<RegisteredDocumentSummary | undefined> => {
      const probe = await probeFile<SummaryMemoValue>(
        loaded,
        document.path,
        resolved,
        resolved.summaryMemo,
        (analysis) => ({
          title: deriveDocumentTitle(
            document.path,
            analysis.kind === 'text' && analysis.bytes ? decodeText(analysis.bytes) : undefined,
          ),
          revision: analysis.revision,
        }),
      );
      if (probe.kind !== 'file') return undefined;
      return { id: document.id, path: document.path, type: document.type, ...probe.value };
    },
  );
  return rows.filter((row): row is RegisteredDocumentSummary => row !== undefined);
}
