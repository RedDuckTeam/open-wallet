// GET a JSON body, throwing on a non-2xx so callers can classify. `onError`
// lets a caller surface the upstream's own message (e.g. LI.FI "No route").
export async function getJson(
  url: string | URL,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, headers ? { headers } : undefined);
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
