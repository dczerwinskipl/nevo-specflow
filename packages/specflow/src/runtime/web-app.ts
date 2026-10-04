import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RuntimeWebApp, RuntimeWebAppAsset } from '@nevo/specflow-runtime';

export async function loadProductWebApp(root = resolveProductWebRoot()): Promise<RuntimeWebApp> {
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(
      `SpecFlow UI assets are missing at ${root}. Build @nevo/specflow-ui before starting the product.`,
    );
  }

  const files = await listFiles(root);
  const assets = new Map<string, RuntimeWebAppAsset>();
  let indexHtml: RuntimeWebAppAsset | undefined;

  for (const path of files) {
    const rel = relative(root, path);
    const asset = {
      body: await readFile(path),
      contentType: contentType(path),
    } satisfies RuntimeWebAppAsset;

    if (rel === 'index.html') {
      indexHtml = asset;
      continue;
    }

    const urlPath = `/${rel.split(sep).join('/')}`;
    assets.set(urlPath, asset);
  }

  if (!indexHtml) {
    throw new Error(`SpecFlow UI index.html is missing from ${root}.`);
  }

  return { indexHtml, assets };
}

export function resolveProductWebRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, 'ui');
  if (existsSync(join(bundled, 'index.html'))) return bundled;

  const workspace = resolve(here, '..', '..', '..', 'specflow-ui', 'dist');
  if (existsSync(join(workspace, 'index.html'))) return workspace;

  return bundled;
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        result.push(path);
      }
    }
  }

  await visit(root);
  return result;
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
