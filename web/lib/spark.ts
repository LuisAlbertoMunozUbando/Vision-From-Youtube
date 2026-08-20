import { setDefaultResultOrder } from 'node:dns';

// Cloudflare quick tunnels publish both IPv4 and IPv6. Prefer IPv4 from
// serverless runtimes because some egress paths have unreliable IPv6.
setDefaultResultOrder('ipv4first');

export function sparkConfig() {
  const rawBase = process.env.SPARK_API_URL?.trim();
  const key = process.env.SPARK_API_KEY?.trim();

  if (!rawBase || !key) {
    throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');
  }

  // Be forgiving with dashboard input: trim quotes, repair common scheme typos,
  // allow a bare hostname, and normalize remote endpoints to HTTPS.
  let candidate = rawBase.replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
  candidate = candidate
    .replace(/^htts:\/\//i, 'https://')
    .replace(/^htps:\/\//i, 'https://')
    .replace(/^httpss:\/\//i, 'https://');

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('SPARK_API_URL is not a valid URL');
  }

  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!isLocal && parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }

  const base = parsed.toString().replace(/\/$/, '');
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
