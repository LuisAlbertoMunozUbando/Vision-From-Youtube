#!/usr/bin/env python3
from __future__ import annotations

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
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from vercel.blob import BlobClient

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = Path(os.getenv("JOBS_DIR", BASE_DIR / "jobs")).resolve()
JOBS_DIR.mkdir(parents=True, exist_ok=True)
API_KEY = os.getenv("SLIDEEXTRACTOR_API_KEY", "")
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "8"))
MAX_HEIGHT = int(os.getenv("MAX_HEIGHT", "1080"))
KEEP_LOCAL_RESULTS = os.getenv("KEEP_LOCAL_RESULTS", "0") == "1"
BLOB_ACCESS = os.getenv("BLOB_ACCESS", "public")

app = FastAPI(title="SlideExtractor Spark Worker", version="1.0.0")
job_queue: queue.Queue[str] = queue.Queue(maxsize=MAX_QUEUE)


class JobRequest(BaseModel):
    youtube_url: str = Field(min_length=10, max_length=500)


class JobResponse(BaseModel):
    id: str
    status: str
    progress: float = 0
    stage: Optional[str] = None
    message: Optional[str] = None
    title: Optional[str] = None
    slides: Optional[int] = None
    result_url: Optional[str] = None
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


def upload_pdf(job_id: str, pdf_path: Path) -> str:
    if not os.getenv("BLOB_READ_WRITE_TOKEN"):
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not configured on Spark")
    client = BlobClient()
    random_part = secrets.token_urlsafe(16).replace("/", "_")
    pathname = f"slideextractor/{job_id}/{random_part}-slides.pdf"
    blob = client.put(pathname, pdf_path.read_bytes(), access=BLOB_ACCESS, add_random_suffix=False)
    if isinstance(blob, dict):
        return blob.get("downloadUrl") or blob.get("download_url") or blob.get("url")
    return getattr(blob, "download_url", None) or getattr(blob, "downloadUrl", None) or getattr(blob, "url")


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
        state.update(progress=96, stage="upload", message="Subiendo PDF final a Vercel Blob",
                     title=meta.get("title"), slides=meta.get("num_slides"))
        save_state(job_id, state)
        url = upload_pdf(job_id, local_pdf)
        state.update(status="done", progress=100, stage="done", message="PDF listo",
                     title=meta.get("title"), slides=meta.get("num_slides"), result_url=url, error=None)
        save_state(job_id, state)
        if not KEEP_LOCAL_RESULTS:
            shutil.rmtree(jd / "work", ignore_errors=True)
            for p in (jd / "output").glob("*.png"):
                p.unlink(missing_ok=True)
            local_pdf.unlink(missing_ok=True)
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
    if not valid_youtube_url(url):
        raise HTTPException(400, "Only https://youtube.com and https://youtu.be URLs are accepted")
    if job_queue.full():
        raise HTTPException(429, "Spark queue is full; try again later")
    jid = uuid.uuid4().hex
    now = time.time()
    st = {"id": jid, "youtube_url": url, "status": "queued", "progress": 0,
          "stage": "queued", "message": "En cola", "title": None, "slides": None,
          "result_url": None, "error": None, "created_at": now, "updated_at": now}
    save_state(jid, st)
    job_queue.put_nowait(jid)
    return JobResponse(**st)


@app.get("/v1/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_key)])
def get_job(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(400, "Invalid job id")
    return JobResponse(**merged_state(job_id))
