# Retrieval cost and contract coverage (#207)

This manual benchmark measures the actual repository `docs:search` and `docs:get --content`
CLI boundaries at three immutable revisions. It does not change search ranking or calibrate
the vector-only relevance floor (#156). The existing `docs:eval` measures ranking; this
benchmark measures the subsequent reading cost and a bounded contract checklist.

## Reproduce

Use Python 3.11+ and the repository's pinned Node/pnpm. Create **separate clean worktrees**
outside this checkout, then install and build the docs launcher **in each**:

```sh
git fetch origin e5adca56cfbb6c4b0839e6ee2a80c1f772174796
git fetch origin 0ad0449fd05a6ec780cfebbc688b728d08fd231f
git worktree add --detach ../nevo-docs-baseline e5adca56cfbb6c4b0839e6ee2a80c1f772174796
git worktree add --detach ../nevo-docs-205 0ad0449fd05a6ec780cfebbc688b728d08fd231f
git worktree add --detach ../nevo-docs-214 f62846051bbfc69b30e138fe00cf68c193e4b3a7
# In each worktree:
pnpm install --frozen-lockfile
pnpm turbo run build --filter=nevo-repo-docs --output-logs=errors-only
```

From this checkout (output must be outside all measured worktrees):

```sh
python -m pip install -r tools/docs/eval/retrieval-cost/requirements.txt
python -B -m unittest discover -s tools/docs/eval/retrieval-cost -p 'test_*.py'
python tools/docs/eval/retrieval-cost/benchmark.py \
  --checkout baseline=../nevo-docs-baseline \
  --checkout after205=../nevo-docs-205 \
  --checkout after214=../nevo-docs-214 \
  --output tools/docs/eval/retrieval-cost/results/2026-11-23-lexical
```

The script rejects tracked/untracked changes, a local config or a local embedding index.
The committed configuration enables semantic search but supplies no endpoint. Each search
must report `lexical` / `no-endpoint`; `--no-refresh` prevents embedding/index creation.
No Project Home configuration is copied. Hybrid measurements require separately prepared,
compatible fixed indexes for **each** corpus and their own report; these snapshots have none.
The lexical results say nothing about #156's vector-only cutoff. Do not mix modes when
attributing an effect to the documentation refactor.

## What is measured

- Five fixed questions from #207; top 10, default snippets, proposals excluded. JSON retains
  every result, rank, score, section id, snippet, mode and refusal reason.
- Commands execute `node tools/docs/dist/bin.js`, the exact launcher used after the build
  in `pnpm docs:search` / `pnpm docs:get`. Build and pnpm wrapper logs are excluded.
- The actual text `search` response supplies its `read all:` command. The benchmark consumes
  those references directly: complete non-reference documents, outermost matching reference
  sections, complete reference documents when their top-level heading matched. This preserves
  the launcher's duplicate-section policy rather than reimplementing it.
- Each fetch executes both text and JSON `get --content`. Cost is **text stdout**, including
  delimiters and final newline, UTF-8 with CRLF normalized to LF for platform comparability.
  JSON provides per-reference content hashes, bytes/tokens and provenance for the checklist.
  Search text cost is separate. JSON transport overhead and repeated measurement calls are
  excluded: the modeled reader performs one search and one fetch per reading phase.
- Estimated model tokens use **tiktoken 0.12.0, cl100k_base**. These are tokenizer counts,
  not billing predictions for an unspecified agent/model. No character-to-token heuristic.
- Whole authoritative owners named in the fixture are then read when not already read whole.
  This makes missing contract dependencies visible. A previous partial read and a later whole
  read are both charged. Unique documents, full/section reads, repeated document reads and
  duplicate content payloads are recorded; no cross-question cache/deduplication is assumed.
- `top1Owner` is strict membership in the declared authoritative owner set **at that revision**.
  `unexpectedDocuments` means outside that set, not automatically irrelevant. The JSON also
  records every expected owner found in top 10. Owner selection follows actual contract moves,
  not a rename guessed from search scores.

## Contract checklist and limits

Each question has five explicit evidence checks in `questions.json`. A check requires **all**
its anchors, case-insensitive and whitespace-normalized; anchors may span multiple fetched
documents. JSON records the reference and surrounding excerpt for each anchor and every
missing anchor. Coverage is reported for the initial read and for the complete authoritative
owner reads alone, so an unrelated secondary explanation cannot substitute for the owner.

The checklist covers Create's operator confirmation/pinned payload/no takeover by age;
Close's archive/shared/exclusive/whole-branch/quiescence distinctions; Task completion's run
state, exit gates, corrupt/pending state, and attempt/input requirements; queue durability,
takeover proof, content verification, uncertainty and startup replay; and Session independence,
singleton ownership, unknown dispatch, cancellation evidence and archive/delete refusals.

This is a **bounded evidence checklist**, not automated proof of semantic completeness or
code parity. Read the excerpts and their complete owners before changing an authoritative
contract. In particular, Task completion differs from Specification completion over open Tasks:
`WORKFLOW_TASKS_OPEN` belongs to the latter. Dependencies/readiness block Task _start_; exit
gates and the active attempt/finish input govern finishing it. The fixture deliberately checks
those distinctions instead of calling every Specification blocker a Task completion blocker.

Corpus Git trees and search implementation Git trees, commit SHAs, effective project/taxonomy
configuration, Node version, fixture hash, output hashes and measurement policy are in JSON.
There are no timestamps or absolute checkout paths. Run twice and compare output bytes to
check reproducibility. The benchmark never edits measured checkouts.

The `quality` CI job runs the lightweight Python tests, including controlled CLI responses
through search parsing, content fetches, coverage and JSON/Markdown generation. It does not
build historical worktrees or run the full benchmark. Empty search results are recorded as
zero initial reads, a failed top-1 match and zero initial coverage; supplementary owner reads
remain separate, so they cannot hide the discovery failure.
