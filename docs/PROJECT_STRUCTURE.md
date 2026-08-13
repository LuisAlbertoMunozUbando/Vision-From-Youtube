# Project structure

This file describes the role of each tracked source/configuration file in SlideExtractor.

```text
Vision-From-Youtube/
├── README.md                      Project overview and quick-start documentation
├── SECURITY.md                    Security, privacy and secret-handling notes
├── .gitignore                     Excludes local secrets, environments and generated data
├── docs/
│   ├── ARCHITECTURE.md            System and data-flow design
│   ├── DEPLOYMENT.md              Deployment/configuration guide
│   └── PROJECT_STRUCTURE.md       This file
├── google_apps_script/
│   └── Code.gs                    Minimal Google Drive archive bridge
├── spark_worker/
│   ├── app.py                     FastAPI API, queue, job state, download and async Drive archive
│   ├── requirements.txt           Python dependencies
│   ├── .env.example               Spark environment template
│   ├── _parts/
│   │   ├── extractor.part01       GPU extractor source part 1
│   │   ├── extractor.part02       GPU extractor source part 2
│   │   ├── extractor.part03       GPU extractor source part 3
│   │   └── extractor.part04       GPU extractor source part 4
│   ├── scripts/install_spark.sh   Spark installation/bootstrap helper
│   ├── systemd/slideextractor-worker.service
│   │                              Persistent Uvicorn/FastAPI worker
│   └── cloudflared/config.yml.example
│                                  Named-tunnel configuration template
└── web/
    ├── package.json               Next.js project metadata/dependencies
    ├── tsconfig.json              TypeScript configuration
    ├── next-env.d.ts              Next.js TypeScript declarations
    ├── vercel.json                Vercel framework configuration
    ├── .env.example               Vercel server environment template
    └── app/
        ├── layout.tsx              Root application layout
        ├── page.tsx                URL/email UI, progress, auto-download and Download PDF button
        ├── globals.css             UI styling
        └── api/jobs/
            ├── route.ts            Create-job proxy to Spark
            └── [id]/
                ├── route.ts        Job-status proxy to Spark
                └── download/route.ts
                                      Secure PDF streaming proxy to browser
```

## Important generated/untracked files

These are runtime artifacts and should not be committed:

```text
spark_worker/.env
spark_worker/extractor.py
jobs/<job-id>/...
.venv/
web/.env.local
```

## Responsibility boundaries

- `web/` owns public user interaction and hides Spark secrets.
- `spark_worker/` owns YouTube acquisition, GPU extraction, job lifecycle and direct PDF delivery.
- `google_apps_script/` owns only secondary Google Drive archival.
- `docs/` explains how the pieces fit together and how to deploy them.

The final reliability rule is: **a generated local PDF is sufficient for `status=done`; Google Drive is never required for user delivery.**
