# Deployment Checklist

## Before Pushing

```bash
npm ci
npm run check
npm start
```

Confirm:

- `GET /health` returns `200`.
- All 10 `POST /api/...` endpoints return JSON.
- BASIC requests are limited after 5 requests per minute.

## GitHub

```bash
git init
git add .
git commit -m "Prepare SiteTrace API suite for Render deploy"
git branch -M main
git remote add origin <github-repo-url>
git push -u origin main
```

## Render

Use the included `render.yaml`, or create a Web Service manually:

- Environment: Node
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`

Render sets `PORT` automatically. The app reads `process.env.PORT`.

## RapidAPI

Create listings pointing to the Render base URL and each endpoint path.

Rate limits:

- BASIC: 5 requests/minute
- PRO: 30 requests/minute
- ULTRA: 100 requests/minute
- MEGA: 500 requests/minute

Monthly quotas are configured in RapidAPI. Runtime per-minute limits are enforced by this service.
