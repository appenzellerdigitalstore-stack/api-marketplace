# SiteTrace API Suite

Consolidated Node.js API service with 10 website intelligence endpoints for RapidAPI and Render.

## Endpoints

| API | Method | Path |
| --- | --- | --- |
| SEO Snapshot | POST | `/api/seo-snapshot` |
| Robots Analyzer | POST | `/api/robots-analyzer` |
| Sitemap Analyzer | POST | `/api/sitemap-analyzer` |
| Meta Preview | POST | `/api/meta-preview` |
| Schema Detector | POST | `/api/schema-detector` |
| Contact Extractor | POST | `/api/contact-extractor` |
| Tech Stack | POST | `/api/tech-stack` |
| Security Headers | POST | `/api/security-headers` |
| Business Lead Score | POST | `/api/business-lead-score` |
| Report Generator | POST | `/api/report-generator` |
| Health Check | GET | `/health` |

## Plans And Rate Limits

Plan is resolved in this order:

1. `X-RapidAPI-Subscription: BASIC | PRO | ULTRA | MEGA`
2. `X-Plan: free | pro | ultra | mega`
3. `X-SiteTrace-Plan: free | pro | ultra | mega`
4. Defaults to `free`

| RapidAPI plan | Internal plan | Rate limit |
| --- | --- | --- |
| BASIC | free | 5 requests/minute |
| PRO | pro | 30 requests/minute |
| ULTRA | ultra | 100 requests/minute |
| MEGA | mega | 500 requests/minute |

Rate limit headers are returned on API responses:

- `X-RateLimit-Plan`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` on `429`

Monthly quotas should still be configured in RapidAPI's pricing tab.

## Local Development

```bash
npm install
npm run check
npm start
```

Example:

```bash
curl -X POST http://localhost:3000/api/seo-snapshot \
  -H "Content-Type: application/json" \
  -H "X-RapidAPI-Subscription: PRO" \
  -d "{\"url\":\"https://example.com\"}"
```

## Render Deployment

This repo includes `render.yaml`.

Recommended Render settings:

- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- Runtime: Node.js
- Node version: `>=18`

## RapidAPI Setup

For each RapidAPI listing:

- Base URL: your Render service URL
- Endpoint path: one of the `/api/...` paths above
- Authentication: RapidAPI default `X-RapidAPI-Key`
- Plans:
  - BASIC: free, 50 requests/month, 5 requests/minute
  - PRO: `$9.99/mo`, 5,000 requests/month, 30 requests/minute
  - ULTRA: `$24.99/mo`, 25,000 requests/month, 100 requests/minute
  - MEGA: `$79.99/mo`, 150,000 requests/month, 500 requests/minute

Use `PRICING_OVERVIEW.md` for per-API pricing differences.
