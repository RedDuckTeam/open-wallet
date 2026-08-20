/**
 * How long any upstream gets to answer. Server-side this matters more than
 * it does in a client: a hung indexer without a deadline pins the incoming
 * request (and its connection) for as long as the socket survives, and
 * enough of those exhaust the server rather than one user's patience.
 */
const TIMEOUT_MS = 15_000;

// GET a JSON body, throwing on a non-2xx so callers can classify errors and
// surface the upstream's own message (e.g. LI.FI "No route").
export async function getJson(
  url: string | URL,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    ...(headers ? { headers } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new UpstreamError(response.status, body);
  }
  return response.json();
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Upstream responded ${String(status)}`);
    this.name = "UpstreamError";
  }
}
