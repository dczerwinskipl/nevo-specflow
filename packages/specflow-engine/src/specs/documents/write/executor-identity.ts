// The executor identity and its dead proof belong to the durable core (they judge a lease for the
// document queue and for the manual commit alike); the writer keeps this path for its own imports.
export {
  captureExecutorIdentity,
  nodeProcessTable,
  processStartTimeOf,
  proveExecutorState,
  type ExecutorState,
  type ProcessTable,
} from '../../durable/executor-identity';
