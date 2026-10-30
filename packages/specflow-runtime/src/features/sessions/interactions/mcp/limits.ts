export const McpQuestionTransportLimits = {
  requests: 256,
  interactions: 64,
  pendingQuestions: 4,
  concurrentRequests: 8,
  requestBytes: 64 * 1024,
  receiveMs: 5000,
  deliveryMs: 5000,
  cleanupMs: 5000,
  setupMs: 10000,
  humanResponseMs: 30 * 60 * 1000,
} as const;
