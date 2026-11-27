import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where the broker listens; `dispose` removes what the endpoint created. */
export interface BrokerEndpoint {
  readonly path: string;
  dispose(): Promise<void>;
}

/**
 * A per-user local endpoint for the broker, never a TCP port (D11 point 4).
 *
 * - Unix: a domain socket in a fresh directory of mode `0700` owned by this user, so no other user
 *   can connect. The directory is verified after creation (owner, mode, not a link).
 * - Windows: a named pipe with an unguessable name. Node creates it with the default pipe security
 *   (full control for this user, SYSTEM and Administrators, read for everyone else), which lets no
 *   other non-administrator user send a request; it is the first instance of the name, so it cannot
 *   be squatted. This is the orchestrator's decision (no native ACL code); every request still needs
 *   the 256-bit capability.
 */
export async function openBrokerEndpoint(
  platform: NodeJS.Platform = process.platform,
): Promise<BrokerEndpoint> {
  if (platform === 'win32') {
    return {
      path: `\\\\.\\pipe\\nevo-specflow-agent-broker-${randomBytes(16).toString('hex')}`,
      dispose: () => Promise.resolve(),
    };
  }

  // Short base: a socket path is limited to about 104 bytes.
  const directory = await mkdtemp(join(tmpdir(), 'nevo-broker-'));
  try {
    await chmod(directory, 0o700);
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid !== undefined && stat.uid !== process.getuid())
    ) {
      throw new Error('The agent broker directory is not private to this user.');
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });

    throw error;
  }

  return {
    path: join(directory, 'broker.sock'),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
