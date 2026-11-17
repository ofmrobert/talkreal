/** An error answer from our server, e.g. code "wrong" or "wait". "network" means no connection. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(code)
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('network', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status, data.retryAfter)
  return data as T
}
