# YouTube Slide Extractor — DGX Spark + Vercel

Servicio web para extraer diapositivas distintas de videos públicos de YouTube usando una NVIDIA DGX Spark como worker GPU local.

## Arquitectura

`Usuario → Vercel/Next.js → Cloudflare Tunnel → FastAPI en DGX Spark → NVDEC/CUDA → PDF → Vercel Blob`

- `web/`: frontend y API proxy para Vercel.
- `spark_worker/`: worker FastAPI y extractor GPU.
- El video se descarga y procesa únicamente en la DGX Spark.
- No utiliza LLMs ni APIs de inferencia de pago.
- Cada slide conserva procedencia: URL, título y timestamp.

## Seguridad

Nunca subir a GitHub:

- `spark_worker/.env`
- `web/.env.local`
- `SLIDEEXTRACTOR_API_KEY`
- `SPARK_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

## Estado

MVP preparado para despliegue. La parte Vercel puede desplegarse independientemente; para completar el flujo extremo a extremo es necesario arrancar el worker y Cloudflare Tunnel en la DGX Spark.

Prof. Alberto Muñoz — Robotics Computing Lab — Tecnológico de Monterrey
