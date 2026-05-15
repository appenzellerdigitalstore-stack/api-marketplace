# Report Generator API

**Endpoint:** `POST /api/report-generator`
**Category:** SEO / Full Site Audit
**Version:** 1.0.0

---

## Overview

Runs a full multi-dimensional audit of any URL in a single call — combining SEO analysis, security header audit, performance measurement, content evaluation, and social preview check. Returns an overall score, letter grade, and structured findings in every dimension.

This is the "all-in-one" API — equivalent to running all other SiteTrace APIs simultaneously.

**Perfect for:** White-label SEO reports, client audit tools, agency dashboards, website graders, automated reporting workflows.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 25             | 2 req/min        |
| PRO    | $14.99/mo  | 2,000          | 10 req/min       |
| ULTRA  | $49.99/mo  | 15,000         | 50 req/min       |
| MEGA   | $179.99/mo | 120,000        | 200 req/min      |

> Higher per-request cost reflects the 4 parallel checks made per call.

---

## Request

```json
{
  "url": "https://stripe.com"
}
```

---

## Response

```json
{
  "success": true,
  "url": "https://stripe.com",
  "domain": "stripe.com",
  "status_code": 200,
  "generated_at": "2026-05-13T10:00:00.000Z",
  "overall_score": 84,
  "overall_grade": "A",
  "scores": {
    "seo": 87,
    "performance": 100,
    "security": 85,
    "content": 92
  },
  "seo": {
    "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "title_length": 54,
    "meta_description": "Stripe is a financial services platform...",
    "meta_description_length": 143,
    "h1": ["Financial Infrastructure to Grow Your Revenue"],
    "canonical": "https://stripe.com/",
    "viewport": "width=device-width, initial-scale=1",
    "lang": "en-US",
    "robots_meta": null,
    "is_noindex": false,
    "images": { "total": 37, "missing_alt": 0 },
    "word_count": 8979,
    "html_size_kb": 180,
    "schema_types": ["WebSite", "Organization"],
    "issues": [
      { "level": "warning", "message": "Multiple H1 tags found (2)" }
    ]
  },
  "social": {
    "og_title": "Stripe | Financial Infrastructure...",
    "og_description": "Stripe is a financial services...",
    "og_image": "https://images.stripeassets.com/.../Stripe.jpg",
    "twitter_card": "summary_large_image",
    "has_full_og": true
  },
  "performance": {
    "response_time_ms": 521,
    "status_code": 200,
    "html_size_kb": 180
  },
  "security": {
    "https": true,
    "ssl": {
      "valid": true,
      "expires_at": "2025-09-12T23:59:59.000Z",
      "days_remaining": 122,
      "issuer": "DigiCert Inc"
    },
    "headers": {
      "hsts": true,
      "csp": true,
      "x_frame_options": true,
      "x_content_type_options": true,
      "referrer_policy": true,
      "permissions_policy": false
    },
    "headers_present": 5,
    "headers_total": 6
  },
  "crawlability": {
    "has_robots_txt": true,
    "has_sitemap": true,
    "sitemap_url": "https://stripe.com/sitemap.xml"
  }
}
```

---

## Live Test Results

Tested on 2026-05-13:

| URL | Overall Score | Grade | SEO | Performance | Security | Content |
|-----|--------------|-------|-----|-------------|----------|---------|
| stripe.com | 84 | A | 87 | 100 | 85 | 92 |
| github.com | 79 | B | 81 | 100 | 85 | 75 |
| example.com | 38 | D | 52 | 100 | 0 | 22 |

---

## Score Weighting

| Dimension | Weight | Max Points |
|-----------|--------|-----------|
| SEO | 35% | 100 |
| Performance | 25% | 100 |
| Security | 25% | 100 |
| Content | 15% | 100 |

---

## Error Codes

| Code | Meaning                   |
|------|---------------------------|
| 400  | Invalid URL               |
| 502  | Could not generate report |
