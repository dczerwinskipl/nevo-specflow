import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { describe, expect, it } from 'vitest';

import { parseDocsConfiguration } from '../config/docs-configuration';
import { initDocs, type DocsInitUi } from './docs-init';

/** Queued answers per prompt kind; an exhausted queue answers with the prompt's default. */
function scripted(answers: { select?: string[]; input?: string[] }) {
  const select = [...(answers.select ?? [])];
  const input = [...(answers.input ?? [])];
  const notes: { message: string; title?: string }[] = [];
  const ui = {
    select: (_message: string, _choices: unknown, initial?: string) =>
      Promise.resolve(select.shift() ?? initial),
    input: (_message: string, def?: string) => Promise.resolve(input.shift() ?? def ?? ''),
    note: (message: string, title?: string) => notes.push({ message, title }),
  } as unknown as DocsInitUi;

  return { ui, notes };
}

function reachable() {
  const provider = createFakeEmbeddingProvider({ dimensions: 8 });

  return { provider, createProvider: () => provider };
}

describe('initDocs', () => {
  it('writes nothing when declined (the default)', async () => {
    const { provider, createProvider } = reachable();
    const result = await initDocs({ ui: scripted({}).ui, env: {}, createProvider });

    expect(result).toEqual({
      projectConfig: {},
      localConfig: {},
      summary: ['Semantic docs search: off'],
    });
    expect(provider.calls).toEqual([]);
  });

  it('writes the defaults and reports a reachable endpoint', async () => {
    const { provider, createProvider } = reachable();
    const { ui, notes } = scripted({ select: ['yes'] });
    const result = await initDocs({ ui, env: {}, createProvider });

    expect(result.projectConfig).toEqual({ docs: { search: { semantic: true } } });
    expect(result.localConfig).toEqual({
      ai: {
        embeddings: {
          protocol: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:11434/v1',
          model: 'qwen3-embedding:0.6b',
        },
      },
    });
    expect(provider.calls).toHaveLength(1);
    expect(notes.at(-1)?.title).toBe('Embedding endpoint reachable');
    expect(result.summary).toEqual([
      'Semantic docs search: enabled (qwen3-embedding:0.6b at http://127.0.0.1:11434/v1, 8 dimensions)',
    ]);
    // What init writes loads through the shared validation entry.
    expect(
      parseDocsConfiguration({
        project: result.projectConfig,
        local: result.localConfig,
        projectLabel: 'p',
        localLabel: 'l',
      }).docs.search.semantic,
    ).toBe(true);
  });

  it('still writes the configuration when the endpoint is unreachable and re-asks an invalid answer', async () => {
    const { provider, createProvider } = reachable();
    provider.failWith({ code: 'unreachable', message: 'connect ECONNREFUSED' });
    const { ui, notes } = scripted({
      select: ['yes'],
      // A pasted key is rejected; the second round names the variable.
      input: [
        'https://embed.example.com/v1',
        'm',
        'sk-literal',
        'https://embed.example.com/v1',
        'm',
        'EMBED_KEY',
      ],
    });
    const result = await initDocs({ ui, env: { EMBED_KEY: 'secret' }, createProvider });

    expect(notes[0]?.title).toBe('Invalid embedding endpoint');
    expect(result.localConfig).toEqual({
      ai: {
        embeddings: {
          protocol: 'openai-compatible',
          baseUrl: 'https://embed.example.com/v1',
          model: 'm',
          apiKeyEnv: 'EMBED_KEY',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(notes.at(-1)?.title).toBe('Embedding endpoint not reachable');
    expect(result.summary).toEqual([
      'Semantic docs search: configured but unavailable, lexical for now (m at https://embed.example.com/v1)',
    ]);
  });
});
