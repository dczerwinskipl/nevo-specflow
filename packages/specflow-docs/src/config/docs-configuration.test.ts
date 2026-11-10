import { describe, expect, it } from 'vitest';

import { parseDocsConfiguration } from './docs-configuration';

const endpoint = {
  protocol: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'team-model',
};

function parse(project?: Record<string, unknown>, local?: Record<string, unknown>) {
  return parseDocsConfiguration({
    project,
    local,
    projectLabel: 'project.yaml',
    localLabel: 'local.yaml',
  });
}

describe('parseDocsConfiguration', () => {
  it('has no endpoint without ai.embeddings and ignores other ai keys', () => {
    expect(parse({ ai: { other: { anything: 1 } } }, {}).embeddings).toBeUndefined();
  });

  it('merges ai.embeddings per key, the local value winning; either file alone may configure it', () => {
    expect(
      parse(
        { ai: { embeddings: { ...endpoint, dimensions: 768, timeoutMs: 5000 } } },
        { ai: { embeddings: { model: 'my-model', apiKeyEnv: 'EMBEDDINGS_KEY' } } },
      ).embeddings,
    ).toEqual({
      ...endpoint,
      model: 'my-model',
      dimensions: 768,
      timeoutMs: 5000,
      apiKeyEnv: 'EMBEDDINGS_KEY',
    });
    expect(parse(undefined, { ai: { embeddings: endpoint } }).embeddings).toEqual(endpoint);
  });

  it('defaults the protocol: baseUrl and model are a complete endpoint', () => {
    const { baseUrl, model } = endpoint;
    expect(parse(undefined, { ai: { embeddings: { baseUrl, model } } }).embeddings).toEqual(
      endpoint,
    );
  });

  it.each([
    [{}, { docs: { root: 'mine' } }, /local\.yaml: documentation configuration is project-owned/],
    [
      { ai: { embeddings: { ...endpoint, apiKey: 'sk-live' } } },
      undefined,
      /project\.yaml: ai\.embeddings\.apiKey: secrets are never read from configuration/,
    ],
    [
      {},
      { ai: { embeddings: { ...endpoint, token: 'abc' } } },
      /local\.yaml: ai\.embeddings\.token: secrets are never read/,
    ],
    [
      { ai: { embeddings: { ...endpoint, apiKeyEnv: 'sk-proj-abc123' } } },
      undefined,
      /apiKeyEnv must be the name of an environment variable/,
    ],
    [
      { ai: { embeddings: { ...endpoint, baseUrl: 'https://user:pw@host/v1' } } },
      undefined,
      /must not contain credentials/,
    ],
    [
      { ai: { embeddings: { ...endpoint, baseUrl: 'https://host/v1?api-key=x' } } },
      undefined,
      /must not contain credentials, a query/,
    ],
    [
      { ai: { embeddings: { ...endpoint, baseUrl: 'ftp://host' } } },
      undefined,
      /absolute http or https URL/,
    ],
    [
      { ai: { embeddings: { ...endpoint, protocol: 'ollama' } } },
      undefined,
      /protocol must be one of: openai-compatible/,
    ],
    [
      { ai: { embeddings: { ...endpoint, dimensions: 0 } } },
      undefined,
      /dimensions must be a positive integer/,
    ],
    [
      { ai: { embeddings: { ...endpoint, modle: 'x' } } },
      undefined,
      /Unknown configuration key 'ai\.embeddings\.modle'/,
    ],
    [
      { ai: { embeddings: { protocol: endpoint.protocol } } },
      { ai: { embeddings: { model: 'm' } } },
      /project\.yaml \+ local\.yaml: ai\.embeddings\.baseUrl is required/,
    ],
    [{ ai: 'embeddings' }, undefined, /project\.yaml: ai must be an object/],
  ])('rejects %j with local %j', (project, local, message) => {
    expect(() => parse(project, local)).toThrow(message);
  });
});
