export const runtime = 'nodejs';

function config() {
  const base = process.env.SPARK_API_URL?.replace(/\/$/, '');
  const key = process.env.SPARK_API_KEY;
  if (!base || !key) throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');
  return { base, key };
}

export async function POST(request: Request) {
  try {
    const { base, key } = config();
    const body = await request.json();
    const upstream = await fetch(`${base}/v1/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ youtube_url: body.youtube_url }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Spark unavailable' }, { status: 502 });
  }
}
