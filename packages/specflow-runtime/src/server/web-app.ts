import type { FastifyInstance, RawServerBase } from 'fastify';

export interface RuntimeWebAppAsset {
  readonly body: Buffer;
  readonly contentType: string;
}

export interface RuntimeWebApp {
  readonly indexHtml: RuntimeWebAppAsset;
  readonly assets: ReadonlyMap<string, RuntimeWebAppAsset>;
}

export function registerRuntimeWebApp<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  webApp: RuntimeWebApp,
): void {
  app.get('/', (_request, reply) => {
    reply.type(webApp.indexHtml.contentType);
    reply.header('Cache-Control', 'no-cache');
    return reply.send(webApp.indexHtml.body);
  });
  app.get('/*', (request, reply) => {
    const pathname = request.url.split('?', 1)[0] ?? '/';

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return reply.code(404).send({
        message: `Route GET:${pathname} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const asset = webApp.assets.get(pathname);
    if (asset) {
      reply.type(asset.contentType);
      reply.header('Cache-Control', 'no-cache');
      return reply.send(asset.body);
    }

    reply.type(webApp.indexHtml.contentType);
    reply.header('Cache-Control', 'no-cache');
    return reply.send(webApp.indexHtml.body);
  });
}
