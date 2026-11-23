# Bounded lexical prefixes and vector floors (#156)

Measured on 2026-11-23 against the unchanged documentation corpus at
`6f112660edb93295a6214d2b16874a9619b426f1` (280 documents, 2,691 indexed chunks,
including proposals). Baseline and candidate use the same corpus, vectors, question
sets, limits and provider. The candidate is the bounded single-word policy in
`f360ceafa`; the subsequent ADR/reference prose was not indexed into this experiment.
All 686 question runs in the four saved outputs report hybrid mode; none fell back
to lexical because of an endpoint failure.

## Setup and reproduction

Local Ollama model `qwen3-embedding:0.6b`, OpenAI-compatible endpoint
`http://127.0.0.1:11434/v1`. Query instruction (literal LF, trailing space):

```text
Instruct: Given a web search query, retrieve relevant passages that answer the query
Query:
```

Build the launcher and fully index the base corpus before comparing ranking code.
Keep the documentation corpus unchanged between runs. Run baseline and candidate
sequentially against the same endpoint, not concurrently. For each implementation:

```bash
node tools/docs/dist/bin.js eval --json --min-similarity none,0.32,0.36,0.40,0.42 \
  --random 150 --random-seed 15601 > tuning.json
node tools/docs/dist/bin.js eval --json --questions tools/docs/eval/questions-holdout.yaml \
  --min-similarity none,0.36,0.42 --random 80 --random-seed 15602 > holdout.json
```

The tuning set has 60 answerable questions, 10 negatives and 168 random strings
(18 hand-written plus 150 generated). The held-out set has 20 answerable questions,
5 negatives and 80 generated strings. The held-out output was checked only after
fixing the policy; no parameter was selected from it. Questions remain outside `docs/`.

The engine opts in per consumer; documentation search enables completion for one
unknown normalized word of at least four Unicode code points, with at most 32
visible completions. Exact known words and multiword queries retain exact matching.
No global or local configured similarity threshold is changed by this patch.

An initial pilot expanded unknown words inside sentences too. In the tuning set it
reduced no-floor Recall@10 from 93.61% to 91.94%: `relese proces` was dominated by
process lifecycle results instead of release guidance. Restricting completion to
single-word queries restored that case. This scope decision precedes held-out evaluation.

## Results

Recall is the mean fraction of declared expected owners retrieved per question at
10 results; it is not the percentage of questions fully answered. MRR and per-class
metrics, result IDs and vector similarities are preserved in the raw JSON files.

| Set      | Mode / floor | Baseline Recall@10 | Prefix Recall@10 | Random vector-only FP before / after | Negative vector-only FP before / after |
| -------- | ------------ | -----------------: | ---------------: | -----------------------------------: | -------------------------------------: |
| Tuning   | lexical      |             49.17% |           55.83% |                         0 / 0 of 168 |                            0 / 0 of 10 |
| Tuning   | hybrid, none |             93.61% |           93.61% |                     167 / 167 of 168 |                            2 / 2 of 10 |
| Tuning   | hybrid, 0.36 |             86.94% |           87.78% |                       15 / 15 of 168 |                            0 / 0 of 10 |
| Tuning   | hybrid, 0.42 |             79.44% |           81.11% |                         0 / 0 of 168 |                            0 / 0 of 10 |
| Held-out | lexical      |             37.50% |           52.50% |                          0 / 0 of 80 |                             0 / 0 of 5 |
| Held-out | hybrid, none |             80.00% |           80.00% |                        79 / 79 of 80 |                             1 / 1 of 5 |
| Held-out | hybrid, 0.36 |             75.00% |           80.00% |                          8 / 8 of 80 |                             1 / 1 of 5 |
| Held-out | hybrid, 0.42 |             55.00% |           65.00% |                          0 / 0 of 80 |                             0 / 0 of 5 |

At the same floor there is no per-question Recall@10 loss in either set, not merely
an unchanged aggregate. At 0.36 the candidate recovers `provid` in tuning and `tailw`
in held-out; at 0.42 it also recovers `releas` in held-out. Partial-word lexical
Recall@10 rises from 0% to 40% in tuning and from 18.75% to 56.25% in held-out.

## Limits and issue status

This completes the bounded-prefix dependency inside #156, not answerability detection.
Even at 0.36 random queries still produce vector-only hits. Raising the floor to
0.42 eliminates those in this sample but still loses useful expected owners: held-out
Recall@10 is only 65%, versus 80% without the floor. At 0.42 lexical matches still
produce some results for 21/168 tuning random strings and 8/80 held-out random strings;
zero vector-only FP does not mean an empty search response.

No universal default follows from this one model, instruction, corpus and small
held-out set. No language/gibberish blacklist or query-specific exception was added.
#156 stays open for an independently measured answerability signal and broader
calibration; this work remains on #156 rather than creating another issue.

## Verification

At implementation checkpoint `f360ceafa`, Linux Node 24.22.1:

```bash
pnpm turbo run lint typecheck test --filter=@nevo/ai-semantic-search \
  --filter=@nevo/specflow-docs --filter=nevo-repo-docs --output-logs=errors-only
```

All 14 tasks passed. Focused host tests also passed: 26 ranking/engine tests and 26
document-search tests. Controlled embeddings prove the prefix survives a vector floor
and the original query is embedded unchanged. Tests cover bounded expansion, exact
matching, visibility filtering, proposal counts and excerpt highlighting. This is
not a claim of a full-repository `pnpm check` run on this checkpoint.
