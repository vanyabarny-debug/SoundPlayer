<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2a445a7f-7424-41b8-a452-1576ddf645e4

## Run Locally

**Prerequisites:** Node.js, Python 3, ffmpeg

1. Install dependencies: `npm install`
2. Create `.env.local` from `.env.example`
3. Run frontend + API together: `npm run dev:full`
4. Open `http://localhost:3000`

## Production Deploy (Cloudflare Pages + Separate API)

### 1) Deploy API server (Docker)

This project has a Node + Python API (`server/api.ts` + `media_engine.py`) and cannot run as a static-only deployment.

- Build image with `Dockerfile.api`
- Run command: `npm run api:prod`
- Exposed port: `8787` (or `PORT` from platform)

Required API environment variables:

- `FRONTEND_ORIGIN=https://<your-pages-domain>`
- `GENIUS_ACCESS_TOKEN` (optional for richer lyrics lookup)
- `PEXELS_API_KEY` (optional)

Healthcheck endpoint: `GET /api/health`

### 2) Deploy frontend to Cloudflare Pages

Build settings:

- Build command: `npm run build`
- Build output directory: `dist`

Frontend environment variables:

- `VITE_API_BASE_URL=https://soundplayer-api.onrender.com`

In production build, app falls back to `https://soundplayer-api.onrender.com` even if `VITE_API_BASE_URL` is missing.
In local dev, keep `VITE_API_BASE_URL` empty to use relative `/api/*` via Vite proxy.
