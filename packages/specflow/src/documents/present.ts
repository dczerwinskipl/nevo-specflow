import type { DocumentChangeResult } from '@nevo/specflow-engine';

import type { DocumentOperationStatus, DocumentTree } from './api';

type Commit = DocumentChangeResult['commit'];

/** The stable JSON of a write: the same facts the HTTP routes answer, from the Engine's result. */
export function writeResultJson(result: DocumentChangeResult, commit: Commit = result.commit) {
  return {
    operationId: result.operationId,
    specId: result.specId,
    action: result.action,
    documents: result.documents.map((document) => ({
      id: document.id,
      path: document.path,
      revision: document.sha256,
      ...(document.type !== undefined ? { type: document.type } : {}),
    })),
    removedDocumentIds: [...result.removedDocumentIds],
    folders: [...result.folders],
    commit,
    replayed: result.replayed,
  };
}

export function commitLine(commit: Commit): string {
  const parts: string[] = [commit.state];
  if (commit.sha !== undefined) parts.push(commit.sha.slice(0, 12));
  if (commit.reason !== undefined) parts.push(`(${commit.reason})`);
  if (commit.recoveryRequired) parts.push('[recovery required]');
  return parts.join(' ');
}

export function writeResultLines(result: DocumentChangeResult, commit: Commit): string[] {
  const lines = [`Operation: ${result.operationId}`, `Action: ${result.action}`];
  for (const document of result.documents) {
    lines.push(`Document: ${document.id} ${document.path} revision ${document.sha256}`);
  }
  for (const id of result.removedDocumentIds) lines.push(`Removed: ${id}`);
  for (const folder of result.folders) lines.push(`Folder: ${folder}`);
  lines.push(`Commit: ${commitLine(commit)}`);
  return lines;
}

export function statusLines(status: DocumentOperationStatus): string[] {
  const lines = [
    `Operation: ${status.operationId}`,
    `Action: ${status.action}`,
    `Stage: ${status.stage ?? 'unknown'}`,
    `Commit: ${commitLine(status.commit)}`,
  ];
  if (status.documentIds && status.documentIds.length > 0) {
    lines.push(`Documents: ${status.documentIds.join(', ')}`);
  }
  return lines;
}

export function treeLines(tree: DocumentTree): string[] {
  const lines = [
    `Tree revision: ${tree.revision}`,
    `Archetype: ${tree.archetype.id} v${tree.archetype.version}`,
    `Completeness: ${tree.completeness.complete ? 'complete' : 'incomplete'}`,
  ];
  if (tree.commits) {
    const { pending, failed, recoveryRequired } = tree.commits;
    lines.push(
      `Commits: ${pending} pending, ${failed} failed, ${recoveryRequired} need recovery` +
        (tree.commits.uncommitted ? `, ${tree.commits.uncommitted} uncommitted` : ''),
    );
    if (tree.commits.policy === 'manual') {
      lines.push(
        'Commit policy: manual (automatic commit is off, the default; changes stay uncommitted until "nevo-specflow commit". Enable it with git.commits.auto.documents: true)',
      );
    }
  }
  for (const folder of tree.folders) {
    if (folder.path !== '') lines.push(`folder  ${folder.path}/`);
  }
  for (const document of tree.documents) {
    const marker = document.commit ? ` [commit ${document.commit.state}]` : '';
    lines.push(
      `${document.id}  ${document.path}  ${document.type ?? 'unclassified'}  ${document.revision}${marker}`,
    );
  }
  for (const dangling of tree.dangling) {
    lines.push(`dangling  ${dangling.id}  ${dangling.path}  ${dangling.type}`);
  }
  return lines;
}

/** Issues after which Close archive refuses, or whose registration points at nothing. */
const BLOCKING_ISSUES = new Set(['dangling', 'path-case-collision', 'archive-limit']);

export interface ValidationVerdict {
  readonly valid: boolean;
  readonly complete: boolean;
  readonly requirements: DocumentTree['completeness']['requirements'];
  readonly issues: DocumentTree['issues'];
  readonly dangling: DocumentTree['dangling'];
}

export function validationOf(tree: DocumentTree): ValidationVerdict {
  const blocking =
    tree.dangling.length > 0 || tree.issues.some((issue) => BLOCKING_ISSUES.has(issue.code));
  return {
    valid: tree.completeness.complete && !blocking,
    complete: tree.completeness.complete,
    requirements: tree.completeness.requirements,
    issues: tree.issues,
    dangling: tree.dangling,
  };
}

export function validationLines(verdict: ValidationVerdict): string[] {
  const lines = [verdict.valid ? 'Valid' : 'Not valid'];
  for (const requirement of verdict.requirements) {
    lines.push(
      `${requirement.satisfied ? 'ok     ' : 'missing'} ${requirement.documentType}: ${requirement.count}/${requirement.minCount}`,
    );
  }
  for (const issue of verdict.issues) {
    lines.push(
      `issue ${issue.code}` +
        (issue.path !== undefined ? ` ${issue.path}` : '') +
        (issue.documentType !== undefined ? ` ${issue.documentType}` : ''),
    );
  }
  for (const dangling of verdict.dangling) lines.push(`dangling ${dangling.id} ${dangling.path}`);
  return lines;
}
