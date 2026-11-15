import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SecondaryStackDefinition } from '@nevo/ui';
import type { ContextSpecification, SessionContextViewModel } from './sessionContextTypes';

/**
 * `SessionContext` only ever passes a Work stack through to `openStack`/`navigation.openTab` —
 * it never reads its `Data`/`Pages` shape itself, so this stays deliberately generic over those
 * (a concrete `ReturnType<typeof createWorkInspector>` would force every caller, including tests,
 * to construct `WorkInspector.tsx`'s own `{api, feed, owner}` data shape just to satisfy the type).
 */
export type WorkHistoryStack = SecondaryStackDefinition<
  { sessionId: string; turnId: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  any
>;

/** What the Context stacks (the narrow runtime flow, Tasks) need from the hosting Session screen. */
export interface SessionContextSource {
  sessionId: string;
  /** The view model as it is NOW; the stacks never hold the value they were opened with. */
  value: SessionContextViewModel;
  onOpenSpecification?: (specification: ContextSpecification) => void;
  onOpenDocuments?: (specification: ContextSpecification) => void;
  onOpenDocumentation?: () => void;
  workStack?: WorkHistoryStack;
}

const SessionContextSourceContext = createContext<SessionContextSource | undefined>(undefined);

/**
 * Provided by the Session screens around their whole `AppWorkspace`, because a Secondary tab is
 * rendered by the workspace, not inside the Primary that opened it. The module-level Context stacks
 * (`sessionContextStack`, `tasksStack`, `taskStack`) read it in `useData`, so an open tab always
 * shows the live view model: a loading fact that became ready, a renamed Task, a changed choice.
 */
export function SessionContextSourceProvider({
  sessionId,
  value,
  onOpenSpecification,
  onOpenDocuments,
  onOpenDocumentation,
  workStack,
  children,
}: SessionContextSource & { children: ReactNode }) {
  const source = useMemo<SessionContextSource>(
    () => ({
      sessionId,
      value,
      onOpenSpecification,
      onOpenDocuments,
      onOpenDocumentation,
      workStack,
    }),
    [sessionId, value, onOpenSpecification, onOpenDocuments, onOpenDocumentation, workStack],
  );

  return (
    <SessionContextSourceContext.Provider value={source}>
      {children}
    </SessionContextSourceContext.Provider>
  );
}

/** The live source, or `undefined` outside a Session screen. */
export function useSessionContextSource(): SessionContextSource | undefined {
  return useContext(SessionContextSourceContext);
}
