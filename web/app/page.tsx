'use client';

import { FormEvent, useEffect, useState } from 'react';

type Job = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  stage?: string | null;
  message?: string | null;
  title?: string | null;
  slides?: number | null;
  result_url?: string | null;
  error?: string | null;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    setJob(null);
    try {
      const r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: url.trim() }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || body.detail || 'No fue posible crear el trabajo');
      setJob(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${job.id}`, { cache: 'no-store' });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || body.detail || 'No se pudo consultar el estado');
        setJob(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error consultando la Spark');
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">ROBOTICS COMPUTING LAB · TEC DE MONTERREY</div>
        <h1>YouTube → Slides</h1>
        <p className="lede">
          Pega el enlace de una charla pública de YouTube. La NVIDIA DGX Spark detecta las diapositivas,
          elimina repeticiones, conserva la versión más completa de las animaciones y genera un PDF con
          procedencia y timestamp.
        </p>

        <form onSubmit={submit} className="card form">
          <label htmlFor="youtube">Enlace de YouTube</label>
          <div className="row">
            <input
              id="youtube"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button disabled={busy || !url.trim()}>{busy ? 'Enviando…' : 'Extraer slides'}</button>
          </div>
          <small>El video se procesa en la Spark; Vercel no descarga ni analiza el video.</small>
        </form>

        {error && <div className="error">{error}</div>}

        {job && (
          <section className="card status" aria-live="polite">
            <div className="statusHeader">
              <div>
                <span className={`pill ${job.status}`}>{job.status}</span>
                <h2>{job.title || 'Procesando video'}</h2>
              </div>
              <strong>{Math.round(job.progress || 0)}%</strong>
            </div>
            <div className="progress"><div style={{ width: `${job.progress || 0}%` }} /></div>
            <p>{job.message || job.stage || 'En cola'}</p>
            {typeof job.slides === 'number' && <p><b>{job.slides}</b> slides detectados.</p>}
            {job.status === 'done' && job.result_url && (
              <a className="download" href={job.result_url}>Descargar PDF</a>
            )}
            {job.status === 'failed' && <div className="error">{job.error || 'El trabajo falló.'}</div>}
          </section>
        )}

        <section className="features">
          <article><b>GPU local</b><span>NVDEC + PyTorch/CUDA en la DGX Spark.</span></article>
          <article><b>Sin LLM</b><span>Detección visual determinista, sin consumo de tokens de IA.</span></article>
          <article><b>Provenance</b><span>Cada captura conserva URL, título y tiempo exacto.</span></article>
        </section>
      </section>
      <footer>Prof. Alberto Muñoz · Robotics Computing Lab · Tecnológico de Monterrey</footer>
    </main>
  );
}
