/**
 * GET a JSON body with a hard timeout, throwing a typed error on a non-2xx so
 * callers can classify. The timeout matters: this request sits directly under
 * a spinner in the UI, and `fetch` without a signal waits on a stalled
 * connection forever. Ten seconds is far above LI.FI's normal response time,
 * so anything slower is treated as the failure it is.
 */
const TIMEOUT_MS = 10_000;

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
