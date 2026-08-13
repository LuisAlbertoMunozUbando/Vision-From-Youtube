# Deployment guide

This document describes the intended deployment of SlideExtractor across Vercel, Cloudflare Tunnel, the NVIDIA DGX Spark and Google Apps Script.

## 1. DGX Spark prerequisites

The Spark should provide:

- Python 3 virtual environment
- NVIDIA driver/CUDA visible to PyTorch
- FFmpeg with CUDA/NVDEC hardware acceleration
- yt-dlp
- cloudflared
- systemd

Typical checks:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
ffmpeg -hwaccels
cloudflared --version
```

## 2. Install the repository

```bash
git clone https://github.com/LuisAlbertoMunozUbando/Vision-From-Youtube.git ~/slideextractor
cd ~/slideextractor
bash spark_worker/scripts/install_spark.sh
```

The extractor source is stored in split parts under `spark_worker/_parts/`; the install/update process reconstructs `spark_worker/extractor.py` locally.

## 3. Configure Spark environment

Create `spark_worker/.env` from the example and keep it outside version control.

Representative configuration:

```text
SLIDEEXTRACTOR_API_KEY=<strong-random-secret>
MAX_QUEUE=8
MAX_HEIGHT=1080
KEEP_LOCAL_RESULTS=1
JOBS_DIR=/home/alberto/slideextractor/jobs
DRIVE_BRIDGE_URL=https://script.google.com/macros/s/<deployment-id>/exec
DRIVE_BRIDGE_SECRET=<independent-random-secret>
```

The systemd unit currently reads `spark_worker/.env`. Treat that file as the authoritative runtime environment unless the service definition is intentionally changed.

## 4. Install/start systemd worker

The supplied unit runs:

```text
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1
```

After installation:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now slideextractor-worker
sudo systemctl status slideextractor-worker
curl http://127.0.0.1:8000/health
```

Expected health payload:

```json
{"ok":true,"queue":0,"max_queue":8}
```

## 5. Expose Spark with Cloudflare Tunnel

For development/testing, a quick tunnel can be started with:

```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8000
```

Use the returned HTTPS hostname as `SPARK_API_URL` in Vercel.

If QUIC/UDP 7844 is blocked on the local network, HTTP/2 is a valid transport choice.

For production, use a named tunnel and run it as a managed service so the hostname is stable.

## 6. Configure Vercel

The Vercel project root directory is:

```text
web
```

Required environment variables:

```text
SPARK_API_URL=https://<cloudflare-hostname>
SPARK_API_KEY=<same value as SLIDEEXTRACTOR_API_KEY>
```

Configure them for Production and, if desired, Preview.

The Vercel deployment should be connected to the GitHub `main` branch so frontend changes redeploy automatically.

## 7. Configure Google Apps Script

`google_apps_script/Code.gs` is intentionally minimal. It should:

1. validate `DRIVE_BRIDGE_SECRET`
2. decode `pdf_base64`
3. create the PDF in the configured Drive folder
4. return JSON success

Set `DRIVE_BRIDGE_SECRET` in **Project Settings -> Script Properties**.

Deploy the script as a Web App. After the first deployment, update the existing deployment using:

```text
Deploy -> Manage deployments -> Edit -> New version -> Deploy
```

Do not create a new deployment for every code edit; editing the existing deployment preserves its `/exec` URL.

## 8. Keep Google Drive off the critical path

The user download must not wait for Apps Script. The intended worker behavior is:

```text
PDF exists locally
    -> mark job done
    -> enable browser download
    -> attempt Drive archive asynchronously
```

This is a deliberate reliability feature.

## 9. Vercel download route

The browser downloads from:

```text
/api/jobs/<job-id>/download
```

Vercel forwards the request to the Bearer-protected Spark endpoint and streams the PDF back with an attachment disposition.

## 10. Upgrade procedure

### Frontend-only update

Commit to GitHub `main`. Vercel redeploys automatically.

### Spark worker update

```bash
cd ~/slideextractor
git fetch origin main
git checkout origin/main -- spark_worker/app.py
sudo systemctl restart slideextractor-worker
curl http://127.0.0.1:8000/health
```

If local modifications are intentional, back them up before replacing tracked files.

### Apps Script update

Update `Code.gs`, save, then create a **new version of the existing deployment**.

## 11. Production hardening

Before broad public use:

- move from quick tunnel to named tunnel
- add request/rate limiting
- define video-duration limits
- monitor disk usage under `JOBS_DIR`
- rotate secrets periodically
- define retention/cleanup policy
- add structured logs/metrics
- consider authentication or institutional access controls
