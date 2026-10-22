import type { DemoSessionDetail } from '@nevo/specflow-contracts/demo';
import type { DemoSpecification } from '../../demo-catalogue';
import { buildDemoSessions } from './contribution';

/**
 * Read-only demo detail for a seeded catalogue session, so session links from the
 * workspace and navigation open a real page instead of a dead end.
 */
export function buildCatalogueSessionDetail(input: {
  record: DemoSpecification;
  sessionId: string;
  project: string;
  provider: { id: string; title: string; model: { id: string; title: string; mode: string } };
  location: DemoSessionDetail['location'];
  documents: string[];
}): DemoSessionDetail | null {
  const summary = buildDemoSessions(input.record).find((item) => item.id === input.sessionId);
  if (!summary) return null;
  const execution = input.record.currentExecutions?.find(
    (item) => item.sessionId === input.sessionId,
  );
  const profile = execution?.agentRole ?? 'Spec Writer';
  return {
    sessionId: input.sessionId,
    specId: input.record.id,
    title: summary.title,
    configuration: {
      providerId: input.provider.id,
      providerTitle: input.provider.title,
      modelId: input.provider.model.id,
      modelTitle: input.provider.model.title,
      mode: input.provider.model.mode,
      profile,
    },
    location: structuredClone(input.location),
    context: {
      project: input.project,
      specification: input.record.title,
      archetype: 'Existing demonstration specification',
      documents: [...input.documents],
      instructions: [
        profile + ' demo role',
        'Project instructions are supplied independently of your message.',
      ],
    },
  };
}
