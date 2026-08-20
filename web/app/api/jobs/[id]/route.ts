import { fetchErrorMessage, sparkFetch } from '../../../../lib/spark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f]{32}$/.test(id)) {
      return Response.json({ error: 'Invalid job id' }, { status: 400 });
    }

    const upstream = await sparkFetch(`/v1/jobs/${id}`, {}, 20_000);
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = fetchErrorMessage(error);
    console.error('Spark job-status request failed:', message);
    return Response.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
