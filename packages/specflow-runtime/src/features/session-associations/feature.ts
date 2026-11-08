import type { RuntimeFeature } from '../runtime-feature';
import {
  registerSessionErrorHandling,
  type SessionAssociations,
  type SessionsRuntime,
} from '../sessions';
import type { ProjectIdSource } from '../specs';
import type { AssociationTargets } from './targets';
import { registerCreateContextSessionRoute } from './create/endpoint';
import { registerSessionAssociationReadRoute } from './read/endpoint';

export interface SessionAssociationsFeatureOptions {
  /** The association port: the Session store (project) or the demo catalogue. */
  readonly associations: SessionAssociations;
  readonly targets: AssociationTargets;
  /** The Runtime's project; every `spec.*` check runs at `specScope(projectId, specId)`. */
  readonly projectId: ProjectIdSource;
  /** Project mode only: the managed Sessions the composed create writes to. */
  readonly sessions?: SessionsRuntime;
}

/**
 * The Session association module: which Specification (and Tasks) a Session belongs to. It owns
 * the composed create and the association read; Sessions themselves stay independent of it.
 */
export function createSessionAssociationsFeature(
  options: SessionAssociationsFeatureOptions,
): RuntimeFeature {
  return {
    // Every check uses the Session and Specification resources their features register.
    authorizationResources: [],
    register(app) {
      app.register((feature, _options, done) => {
        registerSessionErrorHandling(feature);
        registerSessionAssociationReadRoute(feature, options);
        if (options.sessions) {
          registerCreateContextSessionRoute(feature, {
            sessions: options.sessions,
            targets: options.targets,
            projectId: options.projectId,
          });
        }

        done();
      });
    },
  };
}
