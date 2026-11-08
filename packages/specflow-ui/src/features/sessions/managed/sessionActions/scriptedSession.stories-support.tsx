import { useState } from 'react';
import type { ComponentProps } from 'react';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { ManagedSession } from '../ManagedSession';
import { scriptedActionsApi } from './sessionActions.stories-support';

type Script = Parameters<typeof scriptedActionsApi>[1];
let current: ReturnType<typeof scriptedActionsApi> | undefined;

/** The scripted fixture of the story being played (calls made, stream pushes, held answers). */
export function scriptedFixture() {
  if (!current) {
    throw new Error('No scripted Session story is rendered.');
  }

  return current;
}

function ScriptedSession({
  args,
  snapshot,
  script,
}: {
  args: ComponentProps<typeof ManagedSession>;
  snapshot: () => SessionSnapshot;
  script: Script;
}) {
  // One fresh fixture per mount, so a replayed story starts from its first scripted answer.
  const [fixture] = useState(() => {
    const copy = Object.fromEntries(
      Object.entries(script ?? {}).map(([command, answers]) => [command, [...answers]]),
    ) as Script;
    current = scriptedActionsApi(snapshot(), copy);

    return current;
  });

  return <ManagedSession {...args} api={fixture.api} />;
}

/** A story `render` for `ManagedSession` on a scripted Session fixture. */
export function scriptedRender(snapshot: () => SessionSnapshot, script: Script = {}) {
  return (args: ComponentProps<typeof ManagedSession>) => (
    <ScriptedSession args={args} snapshot={snapshot} script={script} />
  );
}
