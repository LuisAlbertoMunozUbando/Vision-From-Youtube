#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = Path(os.getenv("JOBS_DIR", BASE_DIR / "jobs")).resolve()
JOBS_DIR.mkdir(parents=True, exist_ok=True)
API_KEY = os.getenv("SLIDEEXTRACTOR_API_KEY", "")
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "8"))
MAX_HEIGHT = int(os.getenv("MAX_HEIGHT", "1080"))
KEEP_LOCAL_RESULTS = os.getenv("KEEP_LOCAL_RESULTS", "1") == "1"
DRIVE_BRIDGE_URL = os.getenv("DRIVE_BRIDGE_URL", "").strip()
DRIVE_BRIDGE_SECRET = os.getenv("DRIVE_BRIDGE_SECRET", "").strip()

app = FastAPI(title="SlideExtractor Spark Worker", version="1.4.0")
job_queue: queue.Queue[str] = queue.Queue(maxsize=MAX_QUEUE)


class JobRequest(BaseModel):
    youtube_url: str = Field(min_length=10, max_length=500)
    email: str = Field(min_length=5, max_length=254)
    newsletter: bool = False


class JobResponse(BaseModel):
    id: str
    status: str
    progress: float = 0
    stage: Optional[str] = None
    message: Optional[str] = None
    title: Optional[str] = None
    slides: Optional[int] = None
    result_url: Optional[str] = None
    email: Optional[str] = None
    error: Optional[str] = None
    created_at: float
    updated_at: float


def require_api_key(authorization: str | None = Header(default=None)):
    if not API_KEY:
        raise HTTPException(500, "SLIDEEXTRACTOR_API_KEY is not configured on Spark")
    expected = f"Bearer {API_KEY}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, "Unauthorized")


def valid_youtube_url(url: str) -> bool:
    try:
        p = urlparse(url.strip())
    except Exception:
        return False
    host = (p.hostname or "").lower().removeprefix("www.")
    return p.scheme == "https" and host in {"youtube.com", "m.youtube.com", "youtu.be"}


def valid_email(email: str) -> bool:
    return re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip()) is not None


def safe_email_filename(email: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9@._+-]+", "_", email.strip().lower()).strip("._")
    return f"{safe or 'slides'}.pdf"


def job_dir(job_id: str) -> Path:
    return JOBS_DIR / job_id


def state_path(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def extractor_status_path(job_id: str) -> Path:
    return job_dir(job_id) / "extractor_status.json"


def save_state(job_id: str, data: dict) -> None:
    p = state_path(job_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = time.time()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def load_state(job_id: str) -> dict:
    p = state_path(job_id)
    if not p.exists():
        raise HTTPException(404, "Job not found")
    return json.loads(p.read_text(encoding="utf-8"))


def merged_state(job_id: str) -> dict:
    state = load_state(job_id)
    sp = extractor_status_path(job_id)
    if state.get("status") == "running" and sp.exists():
        try:
            live = json.loads(sp.read_text(encoding="utf-8"))
            state["progress"] = live.get("progress", state.get("progress", 0))
            state["stage"] = live.get("stage")
            state["message"] = live.get("message")
            state["title"] = live.get("title", state.get("title"))
            state["slides"] = live.get("slides_detected", state.get("slides"))
        except Exception:
            pass
    return state


def publish_to_drive(job_id: str, state: dict, pdf_path: Path, meta: dict) -> Optional[str]:
    if not DRIVE_BRIDGE_URL or not DRIVE_BRIDGE_SECRET:
        raise RuntimeError("DRIVE_BRIDGE_URL/DRIVE_BRIDGE_SECRET are not configured on Spark")

    payload = {
        "secret": DRIVE_BRIDGE_SECRET,
        "job_id": job_id,
        "email": state["email"],
        "youtube_url": state["youtube_url"],
        "title": meta.get("title") or "YouTube Slides",
        "slides": int(meta.get("num_slides") or 0),
        "filename": safe_email_filename(state["email"]),
        "pdf_base64": base64.b64encode(pdf_path.read_bytes()).decode("ascii"),
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        DRIVE_BRIDGE_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as response:
            raw = response.read().decode("utf-8", errors="replace").strip()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[-1000:]
        raise RuntimeError(f"Google Drive bridge returned HTTP {e.code}: {detail}") from e
    except Exception as e:
        raise RuntimeError(f"Google Drive bridge failed: {e}") from e

    if not raw:
        return None

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Some Apps Script executions return a Google HTML wrapper after the
        # write has already completed. Drive archival is secondary to delivery.
        return None

    if not result.get("ok"):
        raise RuntimeError(f"Google Drive bridge error: {result.get('error') or result}")
    return str(result.get("url") or "") or None


def run_job(job_id: str):
    state = load_state(job_id)
    state.update(status="running", progress=1, stage="starting", message="Trabajo iniciado en DGX Spark")
    save_state(job_id, state)
    jd = job_dir(job_id)
    log_path = jd / "extractor.log"
    cmd = [
        sys.executable, str(BASE_DIR / "extractor.py"),
        "--url", state["youtube_url"],
        "--job-dir", str(jd),
        "--status-file", str(extractor_status_path(job_id)),
        "--max-height", str(MAX_HEIGHT),
    ]
    env = os.environ.copy()
    try:
        with log_path.open("w", encoding="utf-8") as log:
            proc = subprocess.run(cmd, cwd=BASE_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
        if proc.returncode != 0:
            live = {}
            try:
                live = json.loads(extractor_status_path(job_id).read_text(encoding="utf-8"))
            except Exception:
                pass
            raise RuntimeError(live.get("message") or f"Extractor exited with code {proc.returncode}. See {log_path}")

        local_pdf = jd / "output" / "slides.pdf"
        meta_file = jd / "output" / "slides.json"
        if not local_pdf.exists() or not meta_file.exists():
            raise RuntimeError("Extraction completed but expected PDF/metadata are missing")

        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        state.update(
            progress=96,
            stage="drive",
            message="PDF generado; guardando copia en Google Drive",
            title=meta.get("title"),
            slides=meta.get("num_slides"),
        )
        save_state(job_id, state)

        drive_url = None
        drive_warning = None
        try:
            drive_url = publish_to_drive(job_id, state, local_pdf, meta)
        except Exception as e:
            # Google Drive is archival only. Never block delivery of a PDF that
            # was successfully generated on Spark.
            drive_warning = str(e)

        message = "PDF listo. La descarga comenzará automáticamente."
        if drive_warning:
            message += " La copia en Drive no pudo confirmarse, pero tu PDF está listo."

        state.update(
            status="done",
            progress=100,
            stage="done",
            message=message,
            title=meta.get("title"),
            slides=meta.get("num_slides"),
            result_url=drive_url,
            error=None,
        )
        save_state(job_id, state)

        if not KEEP_LOCAL_RESULTS:
            shutil.rmtree(jd / "work", ignore_errors=True)
            for p in (jd / "output").glob("*.png"):
                p.unlink(missing_ok=True)
    except Exception as e:
        state.update(status="failed", progress=100, stage="failed", message="Error", error=str(e))
        save_state(job_id, state)


def worker_loop():
    while True:
        jid = job_queue.get()
        try:
            run_job(jid)
        finally:
            job_queue.task_done()


def recover_jobs():
    for p in JOBS_DIR.glob("*/job.json"):
        try:
            st = json.loads(p.read_text(encoding="utf-8"))
            if st.get("status") in {"queued", "running"}:
                st.update(status="failed", progress=100, stage="failed",
                          error="Worker restarted while this job was running. Submit the URL again.")
                save_state(st["id"], st)
        except Exception:
            pass


@app.on_event("startup")
def startup():
    recover_jobs()
    threading.Thread(target=worker_loop, name="slideextractor-worker", daemon=True).start()


@app.get("/health")
def health():
    return {"ok": True, "queue": job_queue.qsize(), "max_queue": MAX_QUEUE}


@app.post("/v1/jobs", response_model=JobResponse, dependencies=[Depends(require_api_key)])
def create_job(req: JobRequest):
    url = req.youtube_url.strip()
    email = req.email.strip().lower()
    if not valid_youtube_url(url):
        raise HTTPException(400, "Only https://youtube.com and https://youtu.be URLs are accepted")
    if not valid_email(email):
        raise HTTPException(400, "A valid email address is required")
    if job_queue.full():
        raise HTTPException(429, "Spark queue is full; try again later")
    jid = uuid.uuid4().hex
    now = time.time()
    st = {
        "id": jid,
        "youtube_url": url,
        "email": email,
        "newsletter": False,
        "status": "queued",
        "progress": 0,
        "stage": "queued",
        "message": "En cola",
        "title": None,
        "slides": None,
        "result_url": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    save_state(jid, st)
    job_queue.put_nowait(jid)
    return JobResponse(**st)


@app.get("/v1/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_key)])
def get_job(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(400, "Invalid job id")
    return JobResponse(**merged_state(job_id))


@app.get("/v1/jobs/{job_id}/pdf", dependencies=[Depends(require_api_key)])
def download_job_pdf(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(400, "Invalid job id")
    state = load_state(job_id)
    pdf = job_dir(job_id) / "output" / "slides.pdf"
    if state.get("status") != "done" or not pdf.exists():
        raise HTTPException(404, "PDF is not ready")
    return FileResponse(
        path=str(pdf),
        media_type="application/pdf",
        filename=safe_email_filename(state.get("email") or "slides"),
        headers={"Cache-Control": "private, no-store"},
    )
