import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import { message, type Message } from '../../../i18n/message';

/** A document type id as a word (`behaviour` -> `Behaviour`). */
function typeWord(id: string): string {
  const words = id.replace(/[-_.]+/g, ' ').trim();

  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/**
 * The display text the Engine derives for a document gate that declares no `label` of its own
 * (`A "behaviour" document with Acceptance, Risks`). The contract carries no required sections, so
 * this one known form is read back to say it in people's words; a declared label is shown as it is.
 */
const DERIVED_LABEL = /^A "([^"]+)" document(?: with (.+))?$/u;

interface DerivedGate {
  readonly type: string;
  readonly sections: readonly string[];
}

function derivedGate(label: string): DerivedGate | undefined {
  const match = DERIVED_LABEL.exec(label);
  if (!match) {
    return undefined;
  }

  return { type: match[1]!, sections: match[2] ? match[2].split(', ') : [] };
}

export interface GateLine {
  /** What the gate needs: "behaviour.md has an Acceptance section", or the declared label. */
  readonly label: Message | string;
  /** The label names the gate's document already: a met gate does not name it again. */
  readonly namesDocument: boolean;
  /**
   * What is still missing, the same words in Now's checklist and the Finish dialog: "not yet", with
   * the missing sections only when the label does not name exactly those ("not yet · Risks section
   * missing"); or why the gate cannot be met as things are ("its file is missing").
   */
  readonly detail?: Message;
  /** The gate is an open item (nothing is broken): no document yet, or sections still to write. */
  readonly open: boolean;
}

/**
 * What a gate needs, in people's words: "behaviour.md has an Acceptance section" (the file name when
 * the page knows it, else the document type: "A Behaviour document has …"). A declared label is
 * shown as it is.
 */
export function gateLabel(label: string, name?: string): Message | string {
  const derived = derivedGate(label);
  if (!derived) {
    return label;
  }

  const typeDocument = message('workflowExecution.gate.typeDocument', {
    type: typeWord(derived.type),
  });
  const { sections } = derived;
  if (sections.length === 0) {
    return typeDocument;
  }

  return message(
    sections.length > 1
      ? 'workflowExecution.gate.hasSections'
      : /^[aeiou]/iu.test(sections[0]!)
        ? 'workflowExecution.gate.hasSectionVowel'
        : 'workflowExecution.gate.hasSection',
    { subject: name ?? typeDocument, sections },
  );
}

/**
 * One gate as a line: its label and what is missing. `name` is the file name of the gate's document
 * (`behaviour.md`) when the page knows it; without it the document type stands in ("A Behaviour
 * document").
 */
export function gateLine(
  gate: Pick<GateStatus, 'label' | 'status' | 'reason' | 'missingSections'>,
  name?: string,
): GateLine {
  const derived = derivedGate(gate.label);
  const sections = derived?.sections ?? [];
  const label = gateLabel(gate.label, name);
  const namesDocument = derived !== undefined && sections.length > 0 && name !== undefined;

  if (gate.status === 'satisfied') {
    return { label, namesDocument, open: false };
  }

  switch (gate.reason) {
    case 'file-missing':
      return {
        label,
        namesDocument,
        detail: message('workflowExecution.gate.fileMissing'),
        open: false,
      };
    case 'unreadable':
      return {
        label,
        namesDocument,
        detail: message('workflowExecution.gate.unreadable'),
        open: false,
      };
    case 'sections-missing': {
      const missing = gate.missingSections ?? [];
      // The label names the missing sections already ("task.md has a Verification section"):
      // "not yet" says the rest. A derived label names them only when they are all it requires.
      const said = derived
        ? missing.join('\n') === sections.join('\n')
        : missing.every((section) => gate.label.toLowerCase().includes(section.toLowerCase()));

      return {
        label,
        namesDocument,
        detail:
          said || missing.length === 0
            ? message('workflowExecution.gate.notYet')
            : message(
                missing.length > 1
                  ? 'workflowExecution.gate.notYetSections'
                  : 'workflowExecution.gate.notYetSection',
                { sections: missing },
              ),
        open: true,
      };
    }

    default:
      return { label, namesDocument, detail: message('workflowExecution.gate.notYet'), open: true };
  }
}
