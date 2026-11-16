/**
 * The Sessions whose native Turn in a checkout (`provider_contexts.workspace`, its registered root)
 * has not settled: still running, or left `unknown` by an earlier Runtime's restart recovery. Its
 * agent may still work there, so Close does not remove that checkout. One query for the owning
 * Runtime's Worker and for the read-only probe of any other process.
 */
export const UNSETTLED_CHECKOUT_TURNS_SQL = `SELECT DISTINCT t.session AS session FROM turns t
  JOIN provider_contexts p ON p.session=t.session
  WHERE t.state!='terminal' AND p.workspace=? ORDER BY t.session`;
