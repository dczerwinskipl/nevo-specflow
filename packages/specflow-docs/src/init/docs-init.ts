// The documentation step of `nevo-specflow init` (ADR 0020 §7): optionally enable semantic search,
// ask for the embedding endpoint, probe it and return the configuration sections for the shell to
// write next to the other init contributions. This package does not depend on the Runtime or the
// shell, so the step declares its own prompt port; the shell passes its setup UI, which satisfies it.

import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import { parseDocsConfiguration } from '../config/docs-configuration';
import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
} from '../embeddings/embedding-providers';
import type { EmbeddingsSettings } from '../embeddings/embeddings-settings';
import { embeddingFailureReason } from '../embeddings/endpoint-reasons';
import { DocsConfigError } from '../errors';

export const DEFAULT_EMBEDDINGS_BASE_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_EMBEDDINGS_MODEL = 'qwen3-embedding:0.6b';

const PROJECT_LABEL = '.nevo/config.yaml';
const LOCAL_LABEL = '.nevo/local/config.yaml';
const MAX_ENDPOINT_ATTEMPTS = 3;

export interface DocsInitChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

/** The prompts the step needs; the shell's setup UI provides them. */
export interface DocsInitUi {
  select<T extends string>(
    message: string,
    choices: readonly DocsInitChoice<T>[],
    initialValue?: T,
  ): Promise<T>;
  input(message: string, defaultValue?: string): Promise<string>;
  note(message: string, title?: string): void;
}

export interface DocsInitOptions {
  readonly ui: DocsInitUi;
  /** Where the probe reads the API key variable named by `apiKeyEnv`. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
}

/** Top-level sections to merge into each file, and the lines for the init review. */
export interface DocsInitContribution {
  /** `docs` when enabled; empty when declined. */
  readonly projectConfig: Record<string, unknown>;
  /** `ai.embeddings` when enabled; empty when declined. Never holds a secret. */
  readonly localConfig: Record<string, unknown>;
  readonly summary: readonly string[];
}

interface EndpointAnswers {
  readonly baseUrl: string;
  readonly model: string;
  /** Empty: no API key is sent. */
  readonly apiKeyEnv: string;
}

interface ValidatedSections {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
  readonly embeddings: EmbeddingsSettings;
}

/**
 * Ask whether to enable semantic documentation search (default no) and, if so, for the endpoint;
 * probe it and report the result. An unreachable endpoint does not fail init: the answers are still
 * returned and the summary says that search answers lexically. Only an endpoint that fails
 * validation `MAX_ENDPOINT_ATTEMPTS` times throws.
 */
export async function initDocs(options: DocsInitOptions): Promise<DocsInitContribution> {
  const { ui } = options;
  const enable = await ui.select<'no' | 'yes'>(
    'Enable semantic documentation search?',
    [
      { value: 'no', label: 'No (default)', hint: '"docs search" ranks lexically' },
      {
        value: 'yes',
        label: 'Yes',
        hint: 'Needs an OpenAI-compatible embedding endpoint, for example a local Ollama',
      },
    ],
    'no',
  );
  if (enable !== 'yes') {
    return { projectConfig: {}, localConfig: {}, summary: ['Semantic docs search: off'] };
  }

  const sections = await askEndpoint(ui);
  const { embeddings } = sections;
  ui.note(`Checking the embedding endpoint ${embeddings.baseUrl}…`, 'Semantic docs search');
  const probe = await probeEndpoint(embeddings, options);
  const where = `${embeddings.model} at ${embeddings.baseUrl}`;
  if (probe.ok) {
    ui.note(
      `The endpoint answered in ${probe.latencyMs} ms with ${probe.dimensions}-dimensional vectors.`,
      'Embedding endpoint reachable',
    );
  } else {
    ui.note(
      `${probe.reason.message}\nInit still writes the configuration; "docs search" answers lexically until the endpoint is reachable. Check it with "nevo-specflow docs semantic status".`,
      'Embedding endpoint not reachable',
    );
  }

  return {
    projectConfig: sections.projectConfig,
    localConfig: sections.localConfig,
    summary: [
      probe.ok
        ? `Semantic docs search: enabled (${where}, ${probe.dimensions} dimensions)`
        : `Semantic docs search: configured but unavailable, lexical for now (${where})`,
    ],
  };
}

/** Ask until the sections pass the same validation the `docs` command and Runtime loading apply. */
async function askEndpoint(ui: DocsInitUi): Promise<ValidatedSections> {
  let answers: EndpointAnswers = {
    baseUrl: DEFAULT_EMBEDDINGS_BASE_URL,
    model: DEFAULT_EMBEDDINGS_MODEL,
    apiKeyEnv: '',
  };
  for (let attempt = 1; attempt <= MAX_ENDPOINT_ATTEMPTS; attempt += 1) {
    answers = {
      baseUrl: (
        await ui.input('Embedding endpoint (OpenAI-compatible base URL)', answers.baseUrl)
      ).trim(),
      model: (await ui.input('Embedding model', answers.model)).trim(),
      apiKeyEnv: (
        await ui.input(
          'Environment variable holding the API key (the key itself is never stored; empty for none)',
          answers.apiKeyEnv === '' ? undefined : answers.apiKeyEnv,
        )
      ).trim(),
    };
    try {
      return validatedSections(answers);
    } catch (error) {
      if (!(error instanceof DocsConfigError)) {
        throw error;
      }

      ui.note(error.message, 'Invalid embedding endpoint');
      answers = nextRoundDefaults(answers);
    }
  }

  throw new Error(
    'No valid embedding endpoint was provided; nothing was written. Run "nevo-specflow init" again and answer No to skip semantic documentation search.',
  );
}

/**
 * The defaults of the next round after a rejected one: only answers that pass validation on their
 * own are offered again, so a rejected value (a pasted key, a URL with credentials) is never
 * prefilled. `apiKeyEnv` is always asked afresh.
 */
function nextRoundDefaults(answers: EndpointAnswers): EndpointAnswers {
  const valid = (candidate: EndpointAnswers): boolean => {
    try {
      validatedSections(candidate);

      return true;
    } catch (error) {
      if (error instanceof DocsConfigError) {
        return false;
      }

      throw error;
    }
  };

  const fresh = { baseUrl: DEFAULT_EMBEDDINGS_BASE_URL, model: DEFAULT_EMBEDDINGS_MODEL };

  return {
    baseUrl: valid({ ...fresh, baseUrl: answers.baseUrl, apiKeyEnv: '' })
      ? answers.baseUrl
      : fresh.baseUrl,
    model: valid({ ...fresh, model: answers.model, apiKeyEnv: '' }) ? answers.model : fresh.model,
    apiKeyEnv: '',
  };
}

function validatedSections(answers: EndpointAnswers): ValidatedSections {
  const projectConfig = { docs: { search: { semantic: true } } };
  const localConfig = {
    ai: {
      embeddings: {
        baseUrl: answers.baseUrl,
        model: answers.model,
        ...(answers.apiKeyEnv === '' ? {} : { apiKeyEnv: answers.apiKeyEnv }),
      },
    },
  };
  const { embeddings } = parseDocsConfiguration({
    project: projectConfig,
    local: localConfig,
    projectLabel: PROJECT_LABEL,
    localLabel: LOCAL_LABEL,
  });
  if (embeddings === undefined) {
    throw new Error('The embedding endpoint written by init did not resolve.');
  }

  return { projectConfig, localConfig, embeddings };
}

type ProbeOutcome =
  | { readonly ok: true; readonly latencyMs: number; readonly dimensions: number }
  | { readonly ok: false; readonly reason: DocsSearchReason };

async function probeEndpoint(
  settings: EmbeddingsSettings,
  { env, createProvider }: DocsInitOptions,
): Promise<ProbeOutcome> {
  const created = createEmbeddingProviders(settings, {
    env,
    ...(createProvider === undefined ? {} : { createProvider }),
  });
  if (!created.ok) {
    return { ok: false, reason: created.reason };
  }

  const probe = await created.providers.documents.probe();

  return probe.ok
    ? { ok: true, latencyMs: probe.latencyMs, dimensions: probe.dimensions }
    : { ok: false, reason: embeddingFailureReason(probe.failure) };
}
