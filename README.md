# Pivota Shopping AI

A beautiful, modern shopping assistant interface powered by AI.

## Features

- 🤖 AI-powered chat interface
- 🛍️ Product search and display
- 💳 Shopping cart management
- 📦 Order tracking
- 🎨 Beautiful gradient UI with Tailwind CSS

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

This app (the merchant portal) serves [https://merchant.pivota.cc](https://merchant.pivota.cc) from the Cloud Run
service `merchants-portal` (GCP project `pivota-prod`, region `us-west1`). The Vercel project was disconnected
from Git on 2026-09-26 and serves nothing.

Releases are two steps, so browser acceptance happens before promotion:

1. **Merge to `main`** → `Deploy candidate` builds the `infra/gcp/cloudbuild.yaml` recipe and deploys it as a
   **0%-traffic** revision tagged `candidate`, served at https://merchant-candidate.pivota.cc. Production does not move.
2. **Run `Promote`** (Actions tab) with the accepted commit's sha → 100% of merchant.pivota.cc. Passing an earlier
   release's sha is the rollback.

Build args and the `_CONSUMER_CAPTURE` opt-in live only in `infra/gcp/cloudbuild.yaml`;
`infra/gcp/docker-build-args.sh` feeds exactly those to the Actions builds. `Build` checks every PR.

Note: `agent.pivota.cc` is a different surface — the shopper-facing "Pivota Shopping AI" and canonical product pages (`agent.pivota.cc/products/sig_*`), not this portal.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons

## Brand System

This app uses Pivota Brand Kit v2.0 from `public/pivota-brand/`. Treat `public/pivota-brand/CLAUDE.md` as the local source of truth for logo, favicon, color, and brand-token usage.
