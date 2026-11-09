import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import type {
  ContextFact,
  ContextSpecification,
  SessionContextTaskRef,
  SessionContextViewModel,
} from '../managed/context/sessionContextTypes';

type AssociationQuery =
  { status: 'pending' } | { status: 'error' } | { status: 'success'; data: SessionAssociationRead };

type SpecificationAssociation = Extract<
  SessionAssociationRead['association'],
  { kind: 'specification' }
>;

/**
 * The Session Context's Specification and Tasks from the association read
 * (full-session.md "Context"): a standalone Session has neither; an associated one is always
 * Specification-scoped, its Tasks fill Related Tasks (never task scope or Current execution, since
 * an association is not execution) and Attention stays absent. While the read is in flight nothing
 * shows; a failed read is one panel note.
 */
export function associationContext(query: AssociationQuery): SessionContextViewModel {
  if (query.status === 'pending') {
    return { scope: { kind: 'unknown', reason: 'loading' } };
  }

  if (query.status === 'error') {
    return { scope: { kind: 'unknown', reason: 'unreadable' } };
  }

  const { association } = query.data;
  if (association.kind === 'standalone') {
    return { scope: { kind: 'standalone' } };
  }

  const specification = specificationFact(association.specification);

  return {
    scope: { kind: 'specification' },
    specification,
    // One cause, one note: the Tasks show only beside a Specification that is there.
    ...(specification.status === 'ready' ? relatedTasks(association.tasks) : {}),
  };
}

function specificationFact(
  fact: SpecificationAssociation['specification'],
): ContextFact<ContextSpecification> {
  switch (fact.state) {
    case 'available':
      return {
        status: 'ready',
        value: {
          id: fact.value.specId,
          key: fact.value.key ?? '',
          title: fact.value.title,
          collection: fact.value.collection,
        },
      };
    case 'missing':
      return { status: 'missing', ref: { key: fact.id } };
    case 'forbidden':
      return { status: 'forbidden' };
    case 'unavailable':
      return { status: 'unreadable' };
  }
}

function relatedTasks(
  tasks: SpecificationAssociation['tasks'],
): Pick<SessionContextViewModel, 'relatedTasks' | 'relatedTasksMissing'> {
  if (tasks.some((task) => task.state === 'unavailable')) {
    return { relatedTasks: { status: 'unreadable' } };
  }

  const found: SessionContextTaskRef[] = tasks.flatMap((task) =>
    task.state === 'available'
      ? [
          {
            id: task.value.taskId,
            key: task.value.key ?? task.value.taskId,
            title: task.value.title,
          },
        ]
      : [],
  );
  const missing = tasks.filter((task) => task.state === 'missing').length;

  return {
    relatedTasks: { status: 'ready', value: found },
    ...(missing > 0 ? { relatedTasksMissing: { count: missing, total: tasks.length } } : {}),
  };
}
