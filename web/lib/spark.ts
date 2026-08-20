import { setDefaultResultOrder } from 'node:dns';

// Cloudflare quick tunnels publish both IPv4 and IPv6. Prefer IPv4 from
// serverless runtimes because some egress paths have unreliable IPv6.
setDefaultResultOrder('ipv4first');

export function sparkConfig() {
  const base = process.env.SPARK_API_URL?.trim().replace(/\/$/, '');
  const key = process.env.SPARK_API_KEY?.trim();

  if (!base || !key) {
    throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');
  }

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error('SPARK_API_URL is not a valid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('SPARK_API_URL must use HTTPS');
  }

  return { base, key };
}

export function fetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Spark unavailable';

  const parts = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;

  if (cause && typeof cause === 'object') {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null;
    const message = 'message' in cause && typeof cause.message === 'string' ? cause.message : null;
    if (code) parts.push(code);
    if (message && message !== error.message) parts.push(message);
  }

  return parts.filter(Boolean).join(' · ');
}

export async function sparkFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const { base, key } = sparkConfig();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);

  return fetch(`${base}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
}
