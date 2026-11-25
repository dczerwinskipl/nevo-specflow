# SpecFlow brief part in the Session transcript

## Goal

The transcript shows an ad-hoc Turn's brief as a collapsed **SpecFlow brief** part above the owner's
unchanged message, never as the owner's words (ux.md, "SpecFlow brief in the transcript").

## Scope

- UI `features/sessions/managed/`: render the `brief` conversation entry (Task
  `adhoc-brief-delivery`) as a collapsed part above its Turn's request, with the `info` icon and a
  quiet tone. Expanding it shows the text as sent, paged like any entry. It has no copy action, and
  the owner's message keeps its own.
- Turns without a `brief` entry (read-only, attempt and older Turns) show no part.

## Verification

Component tests and stories:

- an ad-hoc Turn with the part collapsed, then expanded;
- a long brief that loads its remaining content;
- an attempt Turn and a read-only Turn with no part;
- no copy action on the part, while the owner's message keeps its own.

UX acceptance: an ad-hoc Turn shows the collapsed SpecFlow brief above the owner's unchanged message.

## Planning notes

Work kind: ui. Recommended profile: `nevo-agents:implementer-ui`.
