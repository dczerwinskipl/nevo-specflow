---
id: product.specflow.ui.documentation-reader
type: product
title: Documentation reader UI
status: current
scope: specflow
areas: [ui, docs]
read_when:
  - choosing the reader UI contract for search, navigation or layout
  - locating documentation access and rendering behavior
summary: >-
  Entry point for workspace-scoped documentation reading, search, navigation, article rendering and failure states.
related:
  - product.specflow.ui.documentation-reader-navigation
  - product.specflow.ui.documentation-reader-search
  - product.specflow.ui.documentation-reader-layout-and-states
  - architecture.runtime.workspace-documentation-corpus
---

# Documentation reader

The Documentation reader shows the project documentation from one authorized workspace. It does not change document content or own search ranking. The Runtime provides workspace-scoped corpus, index, authorization and query results.

| Question                                            | Authoritative UI guidance                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Where do routes, Back and workspace selection lead? | [Reader navigation](documentation-reader-navigation.md)               |
| How do query, proposals and results behave?         | [Reader search](documentation-reader-search.md)                       |
| How are articles, loading and failures displayed?   | [Reader layout and states](documentation-reader-layout-and-states.md) |

## Purpose and ownership

The reader lets a person **find and read the project documentation as it is in one workspace**
(the main project folder or a linked worktree, see [vocabulary](../../shared/vocabulary.md#git-and-workspace-vocabulary)).
It is read-only. It does not edit, does not answer questions with AI, and is not the Specification
Documents screen: those are Specification documents, a different corpus with its own screen.

## User questions and first scan

1. **Which workspace's documentation am I reading?** — the workspace picker at the top of the
   tree pane, shown only when the project has more than one workspace (with one there is nothing to
   tell apart). It names the workspace on one line, with "Local changes" beside the name when the
   workspace has uncommitted changes, then one line with its kind and bound Specification
   ("Worktree · Single sign-on…", "Project folder · this Session's workspace").
2. **Where is the document I need?** — the tree of current documents, or search (primary).
3. **What does it say?** — the article (primary once open).
4. **Can I rely on it?** — a quiet note on a **proposal** (a document under a `proposals` prefix of
   `docs.yaml`: an idea or plan, not a current rule); status and type stay in Properties.
5. **Where next?** — internal links, the contents, and Related at the end of the article.

Exceptional conditions replace the article area only (the tree pane keeps its geometry and the
workspace picker), except No access, which replaces the whole surface. Skipped documents never replace anything: they are listed quietly under the workspace picker.
