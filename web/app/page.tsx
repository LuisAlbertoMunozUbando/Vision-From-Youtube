'use client';

// Deployment sync marker: GitHub-connected production.
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
  email?: string | null;
  error?: string | null;
};

function readableError(body: any, fallback: string): string {
  const value = body?.error ?? body?.detail ?? body?.message;
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.msg) {
          const where = Array.isArray(item.loc) ? item.loc.filter((x: unknown) => x !== 'body').join('.') : '';
          return where ? `${where}: ${item.msg}` : item.msg;
        }
        try { return JSON.stringify(item); } catch { return String(item); }
      })
      .join(' · ');
  }
  try { return JSON.stringify(value); } catch { return String(value); }
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [newsletter, setNewsletter] = useState(false);
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
        body: JSON.stringify({
          youtube_url: url.trim(),
          email: email.trim(),
          newsletter,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(readableError(body, 'No fue posible crear el trabajo'));
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
        if (!r.ok) throw new Error(readableError(body, 'No se pudo consultar el estado'));
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
          <input
            id="youtube"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />

          <label htmlFor="email" className="fieldLabel">Email para recibir tu PDF</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            placeholder="nombre@universidad.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="checkRow">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
            />
            <span>También quiero recibir novedades del Robotics Computing Lab.</span>
          </label>

          <button className="submitButton" disabled={busy || !url.trim() || !email.trim()}>
            {busy ? 'Enviando…' : 'Extraer slides'}
          </button>
          <small>
            Usamos tu email para entregarte el PDF y registrar el uso de SlideExtractor. El consentimiento para novedades es opcional.
          </small>
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
              <>
                <a className="download" href={job.result_url} target="_blank" rel="noreferrer">Abrir / descargar PDF</a>
                <p className="deliveryNote">También enviamos este enlace a <b>{job.email || email}</b>.</p>
              </>
            )}
            {job.status === 'failed' && <div className="error">{job.error || 'El trabajo falló.'}</div>}
          </section>
        )}

        <section className="features">
          <article><b>GPU local</b><span>NVDEC + PyTorch/CUDA en la DGX Spark.</span></article>
          <article><b>Sin LLM</b><span>Detección visual determinista, sin consumo de tokens de IA.</span></article>
          <article><b>Drive + email</b><span>El PDF se publica en Google Drive y el enlace llega a tu correo.</span></article>
        </section>
      </section>
      <footer>Prof. Alberto Muñoz · Robotics Computing Lab · Tecnológico de Monterrey</footer>
    </main>
  );
}
