# Did You Know?

**This repository is named `the-machine-of-maybe`. The product it builds is *Did You Know?*, live at
[korondy.com](https://korondy.com).**

The Machine of Maybe was the original product. It was **pivoted in place**, not retired — commit
`cfbfcad feat: pivot to "Did You Know?"` — and the deployment was reused rather than renamed. The old
name survives in the repo, the Cloud Run services, the service account and the container images. Only
the product changed.

## ⚠️ Do not rename the `mom-*` services

| Name you will see | What it actually is |
|---|---|
| repo `the-machine-of-maybe` | the Did You Know codebase |
| Cloud Run `mom-api` | the Did You Know **backend** — live, serving korondy.com |
| Cloud Run `mom-frontend` | duplicate frontend, **nothing routes to it** (see below) |
| Cloud Run `korondy-landing` | the frontend actually behind korondy.com |
| service account `sa-machine-of-maybe` | the Did You Know runtime identity |
| Firestore database `did-you-know` | the live data |

**Renaming `mom-api` breaks the product.** The frontend bakes the API URL into its build at Docker
build time (`af0d136`), so the browser calls
`https://mom-api-111237697979.us-east4.run.app` **directly**. A rename changes that URL and every
already-served bundle stops working.

**For the same reason, `allUsers` on `mom-api` is load-bearing.** It is not an oversight. Removing
public invocation takes Did You Know down for every visitor, because the call comes from the
visitor's browser and not from a server-side proxy.

## Architecture

```
korondy.com ──LB──> korondy-landing (Next.js)
                         │  browser fetches directly
                         ▼
                    mom-api (FastAPI, allUsers)
                         ├─ Anthropic  (the only model provider used)
                         └─ Firestore  did-you-know
                              ├─ daily_facts    one per day
                              ├─ dyk_facts      seeded
                              └─ chat_sessions

Cloud Scheduler  did-you-know-daily-fact  (0 6 * * *)
    └─> POST mom-api /api/fact/generate
```

## Endpoints

| Route | Auth | Calls the model |
|---|---|---|
| `GET /api/fact/today` | none | only if today's fact is missing |
| `POST /api/fact/generate` | **none** — docstring says "called by Cloud Scheduler", nothing enforces it | yes |
| `GET /api/facts/archive` | none | no |
| `POST /api/chat` | **none**, and **no rate limiting anywhere in the codebase** | yes |
| `GET /health` | none | no |

Both model-calling routes are anonymously reachable. The backstop is the spend limit on the
Anthropic workspace, not the application.

## Secrets

Only **Anthropic** is used — `anthropic.AsyncAnthropic` in `fact_engine.py` and `chat_engine.py`.

`PERPLEXITY_API_KEY` is declared in `config.py` and **never used**. `OPENAI_API_KEY` was mounted on
the Cloud Run service but is **not referenced anywhere in this repo** — not even declared. Both are
slated to be unmounted rather than rotated.

## Local development

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
cd frontend && npm install && npm run dev
```

The frontend needs the API URL at **build** time, not run time — see the Docker `ARG`.
