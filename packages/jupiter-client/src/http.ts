/**
 * Fetch helpers with the two properties every aggregator call here needs: a
 * hard timeout, and a typed error that keeps the upstream's status and body.
 *
 * The timeout is not optional decoration. These requests sit directly under a
 * spinner in the UI, and `fetch` without a signal waits on a stalled
 * connection indefinitely — the user would be stuck watching "Get quote"
 * spin forever with no error to act on. Ten seconds is far above Jupiter's
 * normal response time, so anything slower is treated as the failure it is.
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

export async function postJson(
  url: string | URL,
  body: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    throw new UpstreamError(response.status, errorBody);
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
