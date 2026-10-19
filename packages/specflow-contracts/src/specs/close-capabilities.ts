import { defineResource } from '@nevo/authorization';

/** Whole-branch Git integration can publish unrelated code and project settings. */
export const ProjectGitCapabilities = defineResource({
  name: 'project-git',
  actions: { Integrate: 'integrate' },
});
