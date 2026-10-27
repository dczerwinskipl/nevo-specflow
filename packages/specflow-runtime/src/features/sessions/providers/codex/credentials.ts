import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { SessionError } from '../../errors';
import { rpcObject } from './rpc';

const AUTH_BYTES = 256 * 1024;
function unavailable(): never {
  throw new SessionError(
    'PROVIDER_AUTH_REQUIRED',
    'Codex requires a supported ChatGPT CLI file login.',
  );
}
export async function regularCodexFile(path: string, maxBytes: number) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
    throw new SessionError(
      'PROVIDER_UNAVAILABLE',
      'Codex native files are outside the supported configuration.',
    );
  return stat;
}
export async function absentCodexPath(path: string) {
  try {
    await lstat(path);
    unavailable();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function physicalDirectory(path: string) {
  if (!isAbsolute(path)) unavailable();
  const root = parse(path).root;
  let current = path;
  while (current !== root) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) unavailable();
    current = dirname(current);
  }
}
async function readAuth(path: string) {
  const stat = await regularCodexFile(path, AUTH_BYTES);
  const bytes = await readFile(path);
  if (bytes.length > AUTH_BYTES) unavailable();
  const value = rpcObject(JSON.parse(bytes.toString('utf8')));
  if (
    value.last_refresh !== undefined &&
    (typeof value.last_refresh !== 'string' || value.last_refresh.length > 128)
  )
    unavailable();
  if (
    value.auth_mode !== 'chatgpt' ||
    (value.OPENAI_API_KEY != null && value.OPENAI_API_KEY !== '')
  )
    unavailable();
  const tokens = rpcObject(value.tokens);
  if (
    typeof tokens.account_id !== 'string' ||
    !tokens.account_id ||
    Buffer.byteLength(tokens.account_id) > 256
  )
    unavailable();
  for (const name of ['access_token', 'refresh_token', 'id_token']) {
    if (
      typeof tokens[name] !== 'string' ||
      !tokens[name] ||
      Buffer.byteLength(tokens[name]) > 32768
    )
      unavailable();
  }
  // This is local context binding, not JWT authentication or issuer trust.
  // Native Codex authenticates the copied login; token rotation must preserve scope.
  const parts = String(tokens.id_token).split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) unavailable();
  const claims = rpcObject(JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')));
  const auth = rpcObject(claims['https://api.openai.com/auth']);
  const userId = auth.chatgpt_user_id ?? auth.user_id;
  if (typeof userId !== 'string' || !userId || Buffer.byteLength(userId) > 256) unavailable();
  if (auth.chatgpt_account_id !== undefined && auth.chatgpt_account_id !== tokens.account_id)
    unavailable();
  return { value, tokens, stat, userId };
}

/** A private native home separates auth/history from user/project configuration.
 * Production places homeRoot in the OS user's application state, outside workspace.
 * The original CLI is the sole refresh authority. Managed invocations use its
 * current access token only; expiry requires an externally renewed CLI login. */
export async function prepareCodexCredentials(
  userHome: string,
  homeRoot: string,
  workspace: string,
) {
  if (!isAbsolute(userHome) || !isAbsolute(homeRoot)) unavailable();
  const project = await realpath(workspace);
  function outsideProject(candidate: string) {
    const offset = relative(project, candidate);
    if (!offset || (!offset.startsWith('..' + sep) && offset !== '..' && !isAbsolute(offset)))
      throw new SessionError(
        'PROVIDER_UNAVAILABLE',
        'Codex private state must remain outside the workspace.',
      );
  }
  outsideProject(resolve(homeRoot));
  await physicalDirectory(join(userHome, '.codex'));
  const source = await readAuth(join(userHome, '.codex', 'auth.json'));
  const accountScope = createHash('sha256')
    .update(JSON.stringify([source.tokens.account_id, source.userId]))
    .digest('hex');
  await mkdir(homeRoot, { recursive: true, mode: 0o700 });
  await physicalDirectory(homeRoot);
  // realpath also resolves Windows short-name aliases, which lstat's symlink
  // check cannot detect. Recheck before allocating any credential file.
  const canonicalHomeRoot = await realpath(homeRoot);
  outsideProject(canonicalHomeRoot);
  const home = join(canonicalHomeRoot, accountScope);
  await mkdir(home, { recursive: true, mode: 0o700 });
  await physicalDirectory(home);
  const authPath = join(home, 'auth.json');
  try {
    await regularCodexFile(authPath, AUTH_BYTES);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  {
    const path = join(home, 'auth-' + randomUUID() + '.tmp');
    // Copy credential fields only, never native config, hooks, plugins or skills.
    const body = {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        account_id: source.tokens.account_id,
        access_token: source.tokens.access_token,
        // Never create a second authority holding the single-use refresh token.
        refresh_token: '',
        id_token: source.tokens.id_token,
      },
      ...(source.value.last_refresh === undefined
        ? {}
        : { last_refresh: source.value.last_refresh }),
    };
    let created = false;
    try {
      await writeFile(path, JSON.stringify(body), { flag: 'wx', mode: 0o600 });
      created = true;
      await rename(path, authPath);
    } finally {
      if (created) await rm(path, { force: true });
    }
  }
  for (const name of [
    'config.toml',
    'managed_config.toml',
    'AGENTS.md',
    'hooks.json',
    'plugins',
    '.agents',
  ])
    await absentCodexPath(join(home, name));
  // Native startup materializes its bundled .system cache even without a turn.
  // It is disabled by launch policy; arbitrary user-installed skills remain refused.
  const skills = join(home, 'skills');
  try {
    await physicalDirectory(skills);
    const entries = await readdir(skills);
    if (entries.some((name) => name !== '.system')) unavailable();
    if (entries.includes('.system')) await physicalDirectory(join(skills, '.system'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {
    home,
    accountScope,
    secrets: ['access_token', 'refresh_token', 'id_token'].map((key) => String(source.tokens[key])),
  };
}
