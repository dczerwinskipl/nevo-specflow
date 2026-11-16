/**
 * What identifies one owned provider invocation's processes after its Runtime is gone, recorded
 * durably before native dispatch (architecture.ai.provider-process-ownership, "Native-stop
 * evidence"). POSIX: the provider's process group and, on Linux, the leader's start time and the
 * boot it ran in. Windows: the Job Object bootstrap root (PID and creation time) and the Job
 * Object's name. Liveness evidence only, never a provider outcome.
 */
export type NativeProcessIdentity =
  | {
      readonly platform: 'posix';
      readonly groupId: number;
      /** Linux `/proc/sys/kernel/random/boot_id`; absent where the OS does not expose it. */
      readonly bootId?: string;
      /** Linux `/proc/<pid>/stat` start time of the group leader, in clock ticks since boot. */
      readonly leaderStart?: string;
    }
  | {
      readonly platform: 'windows';
      readonly pid: number;
      /** The root's creation time (a FILETIME as a decimal string). */
      readonly createdAt: string;
      /** The Runtime-created Job Object's name (`Local\NevoSession-<uuid>`). */
      readonly job: string;
    };

const decimal = /^[0-9]{1,24}$/;
const bootId = /^[0-9a-f-]{1,64}$/;
const jobName = /^Local\\NevoSession-[0-9a-f-]{36}$/;

/** The identity a durable record holds, or `undefined` for anything else. */
export function parseProcessIdentity(value: unknown): NativeProcessIdentity | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const item = value as Record<string, unknown>;
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  if (item.platform === 'posix') {
    const keys = Object.keys(item).every((key) =>
      ['platform', 'groupId', 'bootId', 'leaderStart'].includes(key),
    );
    if (
      keys &&
      positive(item.groupId) &&
      (item.bootId === undefined ||
        (typeof item.bootId === 'string' && bootId.test(item.bootId))) &&
      (item.leaderStart === undefined ||
        (typeof item.leaderStart === 'string' && decimal.test(item.leaderStart)))
    ) {
      return item as NativeProcessIdentity;
    }

    return undefined;
  }

  if (
    item.platform === 'windows' &&
    Object.keys(item).every((key) => ['platform', 'pid', 'createdAt', 'job'].includes(key)) &&
    positive(item.pid) &&
    typeof item.createdAt === 'string' &&
    decimal.test(item.createdAt) &&
    typeof item.job === 'string' &&
    jobName.test(item.job)
  ) {
    return item as NativeProcessIdentity;
  }

  return undefined;
}
