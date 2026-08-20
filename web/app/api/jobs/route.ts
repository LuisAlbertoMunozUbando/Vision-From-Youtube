import { fetchErrorMessage, sparkFetch } from '../../../lib/spark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const body = await request.json();
    const upstream = await sparkFetch('/v1/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtube_url: body.youtube_url,
        email: body.email,
        newsletter: Boolean(body.newsletter),
      }),
    }, 30_000);

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
  } catch (error) {
    const message = fetchErrorMessage(error);
    console.error('Spark create-job request failed:', message);
    return Response.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
