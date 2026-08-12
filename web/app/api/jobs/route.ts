export const runtime = 'nodejs';

function config() {
  const base = process.env.SPARK_API_URL?.replace(/\/$/, '');
  const key = process.env.SPARK_API_KEY;
  if (!base || !key) throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');
  return { base, key };
}

function errorMessage(payload: any, fallback = 'No fue posible crear el trabajo'): string {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    const parts = payload.detail.map((item: any) => {
      const loc = Array.isArray(item?.loc) ? item.loc.filter((x: any) => x !== 'body').join('.') : '';
      const msg = typeof item?.msg === 'string' ? item.msg : JSON.stringify(item);
      return loc ? `${loc}: ${msg}` : msg;
    });
    return parts.filter(Boolean).join(' · ') || fallback;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  try {
    const { base, key } = config();
    const body = await request.json();
    const upstream = await fetch(`${base}/v1/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        youtube_url: body.youtube_url,
        email: body.email,
        newsletter: Boolean(body.newsletter),
      }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });

    const text = await upstream.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!upstream.ok) {
      return Response.json(
        { error: errorMessage(payload, `Spark respondió HTTP ${upstream.status}`) },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(payload, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Spark unavailable' }, { status: 502 });
  }
}
