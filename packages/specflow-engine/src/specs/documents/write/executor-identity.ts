// The executor identity and its dead proof are project infrastructure (they judge the control lock,
// a lease of the document queue and the manual commit alike); the writer keeps this path for its
// own imports.
export {
  captureExecutorIdentity,
  nodeProcessTable,
  processStartTimeOf,
  proveExecutorState,
  type ExecutorState,
  type ProcessTable,
} from '../../../project/process/executor-identity';
