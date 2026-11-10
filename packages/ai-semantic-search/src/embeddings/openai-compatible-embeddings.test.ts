import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createOpenAiCompatibleEmbeddingProvider } from './openai-compatible-embeddings';

interface Received {
  readonly url: string | undefined;
  readonly authorization: string | undefined;
  readonly body: { model: string; input: string[] };
}

type Handler = (received: Received, response: ServerResponse) => void;

const received: Received[] = [];
let handler: Handler;
let baseUrl: string;

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  let raw = '';
  request.on('data', (part: Buffer) => (raw += part.toString('utf8')));
  request.on('end', () => {
    const entry: Received = {
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(raw) as Received['body'],
    };
    received.push(entry);
    handler(entry, response);
  });
});

/** Answers with one `dimensions`-long vector per input whose first value is the input's length. */
function embeddings(dimensions: number): Handler {
  return ({ body }, response) => {
    const data = body.input.map((text, index) => ({
      index,
      embedding: Array.from({ length: dimensions }, (_, d) => (d === 0 ? text.length : 0.5)),
    }));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: data.reverse() }));
  };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received.length = 0;
  handler = embeddings(3);
});

describe('OpenAI-compatible embeddings adapter', () => {
  it('posts batches in order, sends the bearer token and prefixes queries only', async () => {
    const provider = createOpenAiCompatibleEmbeddingProvider({
      baseUrl,
      model: 'm',
      apiKey: 'secret',
      queryInstruction: 'Q: ',
      batchSize: 2,
    });

    const documents = await provider.embed(['a', 'bb', 'ccc'], 'document');
    expect(documents.ok && documents.vectors.map((vector) => vector[0])).toEqual([1, 2, 3]);
    expect(received.map((entry) => entry.body)).toEqual([
      { model: 'm', input: ['a', 'bb'] },
      { model: 'm', input: ['ccc'] },
    ]);
    expect(received[0]).toMatchObject({ url: '/v1/embeddings', authorization: 'Bearer secret' });

    const query = await provider.embed(['x'], 'query');
    expect(query.ok && query.vectors[0]![0]).toBe(4);
    expect(received.at(-1)!.body.input).toEqual(['Q: x']);
  });

  it('probes reachability, latency and the observed dimension', async () => {
    let clock = 100;
    const provider = createOpenAiCompatibleEmbeddingProvider(
      { baseUrl, model: 'm' },
      { now: () => (clock += 5) },
    );

    expect(await provider.probe()).toEqual({ ok: true, latencyMs: 5, dimensions: 3 });
    expect(provider.dimensions).toBeUndefined();
  });

  it('reports a configured dimension that differs from the observed one', async () => {
    const provider = createOpenAiCompatibleEmbeddingProvider({
      baseUrl,
      model: 'm',
      dimensions: 4,
    });

    const probe = await provider.probe();
    expect(probe).toMatchObject({ ok: false, failure: { code: 'dimension-mismatch' } });
  });

  it('maps a non-2xx answer to http-status', async () => {
    handler = (_, response) => {
      response.statusCode = 404;
      response.end('model "m" not found');
    };

    const provider = createOpenAiCompatibleEmbeddingProvider({ baseUrl, model: 'm' });

    const result = await provider.embed(['a'], 'document');
    expect(result).toMatchObject({ ok: false, failure: { code: 'http-status', status: 404 } });
    expect(!result.ok && result.failure.message).toContain('model "m" not found');
  });

  it.each([
    ['a non-JSON body', 'not json'],
    ['a missing data array', '{}'],
    ['a wrong number of embeddings', '{"data":[]}'],
    ['a non-numeric embedding', '{"data":[{"index":0,"embedding":["x"]}]}'],
  ])('maps %s to malformed-response', async (_, body) => {
    handler = (__, response) => response.end(body);
    const provider = createOpenAiCompatibleEmbeddingProvider({ baseUrl, model: 'm' });

    expect(await provider.embed(['a'], 'document')).toMatchObject({
      ok: false,
      failure: { code: 'malformed-response' },
    });
  });

  it('maps an elapsed timeout to timeout without waiting for a real timer', async () => {
    const controller = new AbortController();
    handler = () => controller.abort();
    const provider = createOpenAiCompatibleEmbeddingProvider(
      { baseUrl, model: 'm', timeoutMs: 1234 },
      { timeoutSignal: () => controller.signal },
    );

    const probe = await provider.probe();
    expect(probe).toMatchObject({ ok: false, failure: { code: 'timeout' } });
    expect(!probe.ok && probe.failure.message).toContain('1234 ms');
  });

  it('maps an abort while the body streams to timeout, not malformed-response', async () => {
    const controller = new AbortController();
    handler = (_, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"data":[');
    };

    const provider = createOpenAiCompatibleEmbeddingProvider(
      { baseUrl, model: 'm' },
      {
        timeoutSignal: () => controller.signal,
        fetch: async (...args) => {
          const response = await fetch(...args);
          controller.abort();

          return response;
        },
      },
    );

    expect(await provider.embed(['a'], 'document')).toMatchObject({
      ok: false,
      failure: { code: 'timeout' },
    });
  });

  it('keeps a query string of the base URL and hides it in messages', async () => {
    handler = (_, response) => {
      response.statusCode = 500;
      response.end();
    };

    const provider = createOpenAiCompatibleEmbeddingProvider({
      baseUrl: `${baseUrl}/?api-version=1&key=hidden`,
      model: 'm',
    });

    const result = await provider.embed(['a'], 'document');
    expect(received.at(-1)!.url).toBe('/v1/embeddings?api-version=1&key=hidden');
    expect(!result.ok && result.failure.message).not.toContain('hidden');
  });

  it('maps a connection failure to unreachable', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const provider = createOpenAiCompatibleEmbeddingProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'm',
    });

    expect(await provider.probe()).toMatchObject({ ok: false, failure: { code: 'unreachable' } });
  });

  it('rejects invalid settings at construction', () => {
    expect(() =>
      createOpenAiCompatibleEmbeddingProvider({ baseUrl: 'ftp://x', model: 'm' }),
    ).toThrow(TypeError);
    expect(() =>
      createOpenAiCompatibleEmbeddingProvider({ baseUrl: 'http://u:secret@host/v1', model: 'm' }),
    ).toThrow(/^(?!.*secret).*credentials/u);
    expect(() =>
      createOpenAiCompatibleEmbeddingProvider({ baseUrl, model: 'm', batchSize: 0 }),
    ).toThrow(RangeError);
  });
});
