# SEO Snapshot API

**Endpoint:** `POST /api/seo-snapshot`
**Category:** SEO / Web Analysis
**Version:** 1.0.0

---

## Overview

Returns a complete on-page SEO snapshot of any public URL in a single API call. Covers title tags, meta descriptions, headings, images, links, Open Graph, canonical tags, SSL, and a calculated SEO score — everything you need to evaluate a page without opening a browser.

**Perfect for:** SEO tools, site audit dashboards, browser extensions, content management platforms.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 100            | 5 req/min        |
| PRO    | $9.99/mo   | 5,000          | 30 req/min       |
| ULTRA  | $29.99/mo  | 25,000         | 100 req/min      |
| MEGA   | $99.99/mo  | 150,000        | 500 req/min      |

---

## Request

**Method:** `POST`
**Content-Type:** `application/json`

```json
{
  "url": "https://example.com"
}
```

| Field | Type   | Required | Description                     |
|-------|--------|----------|---------------------------------|
| url   | string | Yes      | The public URL to analyze       |

---

## Response

```json
{
  "success": true,
  "url": "https://stripe.com",
  "final_url": "https://stripe.com/",
  "status_code": 200,
  "response_time_ms": 521,
  "seo_score": 87,
  "ssl": {
    "valid": true,
    "expires_at": "2025-09-12T23:59:59.000Z",
    "days_remaining": 122,
    "issuer": "DigiCert Inc"
  },
  "page": {
    "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "title_length": 54,
    "meta_description": "Stripe is a financial services platform...",
    "meta_description_length": 143,
    "h1": ["Financial Infrastructure to Grow Your Revenue"],
    "h2": ["Payments", "Billing", "Connect", ...],
    "canonical": "https://stripe.com/",
    "viewport": "width=device-width, initial-scale=1",
    "lang": "en-US",
    "robots": null,
    "word_count": 8979,
    "html_size_bytes": 184320,
    "html_size_kb": 180
  },
  "images": {
    "total": 37,
    "with_alt": 37,
    "missing_alt": 0,
    "alt_coverage_pct": 100
  },
  "links": {
    "total": 142,
    "internal": 98,
    "external": 44
  },
  "social": {
    "og_title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "og_description": "Stripe is a financial services platform...",
    "og_image": "https://images.stripeassets.com/...",
    "og_type": "website",
    "twitter_card": "summary_large_image"
  },
  "issues": [
    { "type": "warning", "field": "h1", "message": "Multiple H1 tags found (2)" }
  ],
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Live Test Results

Tested against real URLs on 2026-05-13:

| URL | Status | Response Time | SEO Score | Title | H1 Count |
|-----|--------|---------------|-----------|-------|----------|
| https://example.com | 200 | 408ms | 52 | Example Domain | 1 |
| https://github.com | 200 | 647ms | 78 | GitHub · Change is constant... | 4 |
| https://stripe.com | 200 | 521ms | 87 | Stripe \| Financial Infrastructure... | 2 |

---

## Error Codes

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 400  | Invalid or unsupported URL                        |
| 502  | Could not reach the target URL                    |
| 429  | Rate limit exceeded                               |

---

## Notes

- Max redirects followed: 5
- Timeout: 12 seconds
- Max page size: 3 MB
- Private/local network URLs are blocked
