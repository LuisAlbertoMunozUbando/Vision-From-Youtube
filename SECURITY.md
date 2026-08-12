# Security notes

- Never commit `SLIDEEXTRACTOR_API_KEY` or `BLOB_READ_WRITE_TOKEN`.
- Never prefix either secret with `NEXT_PUBLIC_`.
- The browser talks only to Vercel. Vercel talks to the Spark with a Bearer secret.
- Cloudflare Tunnel means the Spark needs no inbound port-forwarding; `cloudflared` creates outbound-only connections.
- Keep the FastAPI worker bound to `127.0.0.1:8000`, not `0.0.0.0`, when using the tunnel.
- The starter implementation uses a public Vercel Blob store with an unguessable pathname for the final PDF. For confidential source material, switch to a private store and add an authenticated download route.
- The service accepts only normal HTTPS YouTube URLs and uses `--no-playlist`.
- Set `MAX_VIDEO_MINUTES`, `MAX_QUEUE`, and an appropriate web-access policy before making the site broadly public.
