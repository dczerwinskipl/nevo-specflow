/**
 * What a person reads when the repository's Git instance evidence (`.git/nevo-specflow-instance.json`)
 * blocks a new Project Home: the file, what it means and the explicit recovery. Nevo never removes or
 * replaces the file itself (two projects must never share one repository identity); the person does,
 * once they know the project it names is gone. `next` is the command that continues afterwards.
 */
export function claimedGitInstanceLines(path: string, next: string): string[] {
  return [
    `The file ${path} exists: this Git repository was already claimed as the Project Home of a Nevo SpecFlow project.`,
    'It holds only the id of that project. Nevo never reuses, replaces or removes it by itself.',
    `If that project is gone (its .nevo/local folder was deleted, or this repository is a copy of another one), move the file out of the Git folder yourself, then run: ${next}`,
    "If it is not gone, restore that project's .nevo/local folder instead.",
  ];
}
