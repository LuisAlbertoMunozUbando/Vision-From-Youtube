# Security notes

SlideExtractor separates **user delivery** from **Google Drive archival**. The PDF is downloaded through Vercel from the DGX Spark; Drive is only a secondary archive and must never be required for successful delivery.

## Secrets

Never commit or expose:

- `SLIDEEXTRACTOR_API_KEY`
- `SPARK_API_KEY`
- `DRIVE_BRIDGE_SECRET`
- `spark_worker/.env`
- root/local `.env` files
- `web/.env.local`

Never prefix server-side secrets with `NEXT_PUBLIC_`.

## Network boundaries

- The browser talks only to Vercel.
- Vercel talks to the Spark using a Bearer secret.
- FastAPI should bind to `127.0.0.1:8000`, not `0.0.0.0`, when accessed through Cloudflare Tunnel.
- Cloudflare Tunnel uses outbound connections from the Spark, avoiding inbound router port-forwarding.
- Use a persistent named tunnel for production; quick-tunnel hostnames are temporary.

## Download path

Completed PDFs are streamed through the protected Spark endpoint and proxied by Vercel. The browser never receives the Spark API key.

Job identifiers are UUIDs, but UUID secrecy is not a substitute for API authentication. Spark job/status/download endpoints remain Bearer protected behind the Vercel proxy.

## Google Drive

The Apps Script bridge should perform only the minimum work required to archive a file. Avoid email delivery, public sharing and unrelated spreadsheet writes unless they are explicitly needed.

The `SlidesOut` folder can remain private. User delivery does not require an `ANYONE_WITH_LINK` permission because the PDF is downloaded from Spark/Vercel.

`DRIVE_BRIDGE_SECRET` must be stored in Apps Script Script Properties and in the Spark environment, never in source control.

## Input and resource controls

- Accept only normal HTTPS YouTube URLs.
- Keep playlist processing disabled unless explicitly required.
- Enforce queue limits and practical video-duration limits before broad public use.
- Keep generated jobs outside the Git repository.
- Consider rate limiting, CAPTCHA/authentication or institutional access controls before public launch.

## Privacy

The email field is used as an identifier/filename for the generated PDF. The current design does not send email. If logs or analytics are added later, document retention and consent separately.

## Secret rotation

If a secret is ever pasted into a public issue, commit, log or chat that is later shared, rotate it in every location where it is configured and restart/redeploy the affected services.
