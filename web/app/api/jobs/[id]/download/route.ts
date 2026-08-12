export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const base = process.env.SPARK_API_URL?.replace(/\/$/, '');
    const key = process.env.SPARK_API_KEY;
    if (!base || !key) throw new Error('SPARK_API_URL/SPARK_API_KEY are not configured');

    const { id } = await context.params;
    if (!/^[0-9a-f]{32}$/.test(id)) {
      return Response.json({ error: 'Invalid job id' }, { status: 400 });
    }

    const upstream = await fetch(`${base}/v1/jobs/${id}/pdf`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(120_000),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'text/plain' },
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', upstream.headers.get('content-disposition') || `attachment; filename="slides-${id.slice(0, 8)}.pdf"`);
    headers.set('Cache-Control', 'private, no-store');

    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Spark unavailable' }, { status: 502 });
  }
}
