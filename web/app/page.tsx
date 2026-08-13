'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Job = { id:string; status:'queued'|'running'|'done'|'failed'; progress:number; stage?:string|null; message?:string|null; title?:string|null; slides?:number|null; result_url?:string|null; email?:string|null; error?:string|null };
type Lang = 'en'|'es';

const text = {
  en: {
    lede:'Paste the link to a public YouTube talk. The NVIDIA DGX Spark detects presentation slides, removes repetitions, keeps the most complete animation state, and generates a PDF with provenance and timestamps.',
    yt:'YouTube link', email:'Email to identify your PDF', send:'Extract slides', sending:'Submitting…',
    note:'Your email is used only to identify and name the PDF. No email is sent.', process:'Processing video', queue:'Queued', slides:'slides detected.',
    ready:'PDF ready', download:'Download PDF', drive:'Open Google Drive copy', delivery:'We try to start the download automatically. If your browser blocks it, click “Download PDF”.',
    gpu:'Local GPU', gpuText:'NVDEC + PyTorch/CUDA on the DGX Spark.', llm:'No LLM', llmText:'Deterministic visual detection with no AI-token consumption.',
    archive:'Drive + download', archiveText:'A secondary copy is archived while the PDF is delivered directly to the user.', failed:'The job failed.',
    createError:'The extraction job could not be created', statusError:'The job status could not be retrieved', sparkError:'Error contacting the Spark', unexpected:'Unexpected error'
  },
  es: {
    lede:'Pega el enlace de una charla pública de YouTube. La NVIDIA DGX Spark detecta las diapositivas, elimina repeticiones, conserva la versión más completa de las animaciones y genera un PDF con procedencia y timestamps.',
    yt:'Enlace de YouTube', email:'Email para identificar tu PDF', send:'Extraer slides', sending:'Enviando…',
    note:'El email se usa únicamente para identificar y nombrar tu PDF. No se envía correo.', process:'Procesando video', queue:'En cola', slides:'slides detectados.',
    ready:'PDF listo', download:'Descargar PDF', drive:'Abrir copia en Google Drive', delivery:'Intentamos iniciar la descarga automáticamente. Si el navegador la bloquea, pulsa “Descargar PDF”.',
    gpu:'GPU local', gpuText:'NVDEC + PyTorch/CUDA en la DGX Spark.', llm:'Sin LLM', llmText:'Detección visual determinista, sin consumo de tokens de IA.',
    archive:'Drive + descarga', archiveText:'Se archiva una copia secundaria mientras el PDF se entrega directamente al usuario.', failed:'El trabajo falló.',
    createError:'No fue posible crear el trabajo', statusError:'No se pudo consultar el estado', sparkError:'Error consultando la Spark', unexpected:'Error inesperado'
  }
} as const;

function readableError(body:any, fallback:string) {
  const value = body?.error ?? body?.detail ?? body?.message;
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item:any) => item?.msg || String(item)).join(' · ');
  try { return JSON.stringify(value); } catch { return String(value); }
}

const statusText = {
  en:{queued:'queued',running:'running',done:'done',failed:'failed'},
  es:{queued:'en cola',running:'procesando',done:'listo',failed:'falló'}
} as const;

export default function Home() {
  const [url,setUrl] = useState('');
  const [email,setEmail] = useState('');
  const [job,setJob] = useState<Job|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [lang,setLang] = useState<Lang>('en');
  const downloadedJob = useRef<string|null>(null);
  const t = text[lang];

  useEffect(() => {
    const saved = localStorage.getItem('slideextractor-language');
    if (saved === 'en' || saved === 'es') setLang(saved);
    else if (navigator.language.toLowerCase().startsWith('es')) setLang('es');
  },[]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('slideextractor-language',lang);
  },[lang]);

  async function submit(e:FormEvent) {
    e.preventDefault(); setError(''); setBusy(true); setJob(null); downloadedJob.current=null;
    try {
      const r = await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({youtube_url:url.trim(),email:email.trim()})});
      const body = await r.json();
      if (!r.ok) throw new Error(readableError(body,t.createError));
      setJob(body);
    } catch(e) { setError(e instanceof Error ? e.message : t.unexpected); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!job || !['queued','running'].includes(job.status)) return;
    const timer = window.setInterval(async() => {
      try {
        const r = await fetch(`/api/jobs/${job.id}`,{cache:'no-store'}); const body=await r.json();
        if (!r.ok) throw new Error(readableError(body,t.statusError)); setJob(body);
      } catch(e) { setError(e instanceof Error ? e.message : t.sparkError); }
    },2500);
    return () => clearInterval(timer);
  },[job?.id,job?.status,t.statusError,t.sparkError]);

  const msg=(job?.message||'').toLowerCase();
  const pdfReady=Boolean(job && job.status!=='failed' && (job.status==='done' || (job.progress>=100 && (msg.includes('pdf listo')||msg.includes('pdf ready')))));

  useEffect(() => {
    if (!job || !pdfReady || downloadedJob.current===job.id) return;
    downloadedJob.current=job.id;
    const link=document.createElement('a'); link.href=`/api/jobs/${job.id}/download`; link.download=''; link.hidden=true; document.body.appendChild(link); link.click(); link.remove();
  },[job?.id,pdfReady]);

  return <main className="shell">
    <section className="hero">
      <header className="topbar">
        <div className="brandMark"><span className="brandDot"/>SLIDEEXTRACTOR</div>
        <div className="languageSwitch" role="group" aria-label={lang==='en'?'Language':'Idioma'}>
          <button type="button" className={lang==='en'?'active':''} onClick={()=>setLang('en')} aria-pressed={lang==='en'}>EN</button>
          <button type="button" className={lang==='es'?'active':''} onClick={()=>setLang('es')} aria-pressed={lang==='es'}>ES</button>
        </div>
      </header>

      <div className="eyebrow">ROBOTICS COMPUTING LAB · TEC DE MONTERREY</div>
      <h1>YouTube → Slides</h1>
      <p className="lede">{t.lede}</p>

      <form onSubmit={submit} className="card form">
        <label htmlFor="youtube">{t.yt}</label>
        <input id="youtube" type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e=>setUrl(e.target.value)} required/>
        <label htmlFor="email" className="fieldLabel">{t.email}</label>
        <input id="email" type="email" inputMode="email" placeholder={lang==='en'?'name@university.edu':'nombre@universidad.edu'} value={email} onChange={e=>setEmail(e.target.value)} required/>
        <button className="submitButton" disabled={busy||!url.trim()||!email.trim()}>{busy?t.sending:t.send}</button>
        <small>{t.note}</small>
      </form>

      {error && <div className="error">{error}</div>}

      {job && <section className="card status" aria-live="polite">
        <div className="statusHeader"><div><span className={`pill ${pdfReady?'done':job.status}`}>{pdfReady?statusText[lang].done:statusText[lang][job.status]}</span><h2>{job.title||t.process}</h2></div><strong>{Math.round(job.progress||0)}%</strong></div>
        <div className="progress"><div style={{width:`${job.progress||0}%`}}/></div>
        <p>{job.message||job.stage||t.queue}</p>
        {typeof job.slides==='number' && <p><b>{job.slides}</b> {t.slides}</p>}
        {pdfReady && <><h2>✓ {t.ready}</h2><div className="downloadRow"><a className="download" href={`/api/jobs/${job.id}/download`} download>{t.download}</a>{job.result_url && <a className="download secondary" href={job.result_url} target="_blank" rel="noreferrer">{t.drive}</a>}</div><p className="deliveryNote">{t.delivery}</p></>}
        {job.status==='failed' && <div className="error">{job.error||t.failed}</div>}
      </section>}

      <section className="features">
        <article><b>{t.gpu}</b><span>{t.gpuText}</span></article>
        <article><b>{t.llm}</b><span>{t.llmText}</span></article>
        <article><b>{t.archive}</b><span>{t.archiveText}</span></article>
      </section>
    </section>
    <footer><span>Prof. Alberto Muñoz · Robotics Computing Lab · Tecnológico de Monterrey</span><span className="footerTag">NVIDIA DGX Spark · CUDA · Computer Vision</span></footer>
  </main>;
}
