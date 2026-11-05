import { Value } from 'typebox/value';
import { isMap, isSeq, parseDocument, type YAMLMap } from 'yaml';

import {
  AgentArchetypeDefinitionFileSchema,
  CATALOGUE_ID_PATTERN,
} from '@nevo/specflow-contracts/documents';

import type { DefinitionSource } from '../../specs/definitions/source';
import type { DefinitionWriter } from '../../specs/definitions/writer';
import { DEFINITION_FILE_MAX_BYTES } from '../../specs/definitions/limits';
import { WorkflowError } from '../errors';
import { AGENT_ARCHETYPE_KIND } from './model';

/**
 * "Remember this choice": the owner picked a model for a provider the archetype had none for (or a
 * different one). The choice is written into the agent archetype file, so later continuations resolve
 * without asking. The edit keeps comments and key order; the result must still be a valid file.
 */

export interface ArchetypeModelChoice {
  readonly provider: string;
  readonly model: string;
  readonly effort?: string;
  /** Also make the provider the archetype's preferred one. */
  readonly prefer?: boolean;
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

/** Pure: the archetype file text with the provider's model set. */
export function setArchetypeProviderModel(source: string, choice: ArchetypeModelChoice): string {
  if (!new RegExp(CATALOGUE_ID_PATTERN, 'u').test(choice.provider) || !choice.model.trim()) {
    invalid('The provider or the model is not valid.');
  }

  const document = parseDocument(source);
  const providers = document.get('providers');
  if (document.errors.length > 0 || !isSeq(providers)) {
    invalid('The agent archetype file cannot be edited.');
  }

  const entry = providers.items.find(
    (item): item is YAMLMap => isMap(item) && item.get('provider') === choice.provider,
  );
  if (entry) {
    entry.set('model', choice.model.trim());
    if (choice.effort !== undefined) {
      entry.set('effort', choice.effort);
    }
  } else {
    providers.add(
      document.createNode({
        provider: choice.provider,
        model: choice.model.trim(),
        ...(choice.effort !== undefined ? { effort: choice.effort } : {}),
      }),
    );
  }

  if (choice.prefer) {
    document.set('preferredProvider', choice.provider);
  }

  if (!Value.Check(AgentArchetypeDefinitionFileSchema, document.toJS())) {
    invalid('The choice would make the agent archetype file invalid.');
  }

  return document.toString();
}

export interface RememberModelDependencies {
  readonly source: DefinitionSource;
  readonly writer: DefinitionWriter;
}

/**
 * Write the choice into `.nevo/definitions/agent-archetype/<id>.yaml`. The file changes like any
 * owner edit of a definition: it is not committed here, and a run already pinned is unaffected.
 */
export async function rememberArchetypeModel(
  dependencies: RememberModelDependencies,
  archetypeId: string,
  choice: ArchetypeModelChoice,
): Promise<void> {
  if (!new RegExp(CATALOGUE_ID_PATTERN, 'u').test(archetypeId)) {
    invalid('The agent archetype id is not valid.');
  }

  const path = `${AGENT_ARCHETYPE_KIND}/${archetypeId}.yaml`;
  const read = await dependencies.source.read(path, DEFINITION_FILE_MAX_BYTES);
  if (read.state !== 'ok') {
    throw new WorkflowError(
      'WORKFLOW_NOT_CONFIGURED',
      `The agent archetype "${archetypeId}" cannot be read (${read.state}).`,
    );
  }

  const next = setArchetypeProviderModel(read.bytes.toString('utf8'), choice);
  await dependencies.writer.writeAtomic(path, new TextEncoder().encode(next));
}
