export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const base = process.env.SPARK_API_URL?.replace(/\/$/, '');
    const key = process.env.SPARK_API_KEY;
    if (!base || !key) throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');
    const { id } = await context.params;
    if (!/^[0-9a-f]{32}$/.test(id)) return Response.json({ error: 'Invalid job id' }, { status: 400 });
    const upstream = await fetch(`${base}/v1/jobs/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Spark unavailable' }, { status: 502 });
  }
}
