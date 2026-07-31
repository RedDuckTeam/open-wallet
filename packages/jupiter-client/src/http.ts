// GET/POST a JSON body, throwing on a non-2xx so callers can classify.
export async function getJson(url: string | URL): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new UpstreamError(response.status, body);
  }
  return response.json();
}

export async function postJson(url: string | URL, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
