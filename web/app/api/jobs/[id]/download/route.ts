import { fetchErrorMessage, sparkFetch } from '../../../../../lib/spark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f]{32}$/.test(id)) {
      return Response.json({ error: 'Invalid job id' }, { status: 400 });
    }

    const upstream = await sparkFetch(`/v1/jobs/${id}/pdf`, {}, 120_000);

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'text/plain' },
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set(
      'Content-Disposition',
      upstream.headers.get('content-disposition') || `attachment; filename="slides-${id.slice(0, 8)}.pdf"`,
    );
    headers.set('Cache-Control', 'private, no-store');

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = fetchErrorMessage(error);
    console.error('Spark PDF download request failed:', message);
    return Response.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
