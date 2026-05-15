# Sitemap Analyzer API

**Endpoint:** `POST /api/sitemap-analyzer`
**Category:** SEO / Crawlability
**Version:** 1.0.0

---

## Overview

Automatically locates, fetches, and parses a website's XML sitemap — including sitemap index files with multiple children. Returns all URLs with their lastmod dates, priorities, changefreq values, and structural insights.

Auto-discovers sitemaps from `/sitemap.xml`, `/sitemap_index.xml`, and `robots.txt` declarations.

**Perfect for:** SEO platforms, content audits, site migration tools, indexability checkers.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 100            | 5 req/min        |
| PRO    | $9.99/mo   | 5,000          | 30 req/min       |
| ULTRA  | $34.99/mo  | 30,000         | 100 req/min      |
| MEGA   | $119.99/mo | 200,000        | 400 req/min      |

---

## Request

```json
{
  "url": "https://example.com",
  "max_urls": 500
}
```

| Field    | Type    | Required | Default | Description                        |
|----------|---------|----------|---------|------------------------------------|
| url      | string  | Yes      | —       | Any URL on the target domain       |
| max_urls | integer | No       | 500     | Max URLs to return (1–2000)        |

---

## Response

```json
{
  "success": true,
  "domain": "stripe.com",
  "sitemap_url": "https://stripe.com/sitemap.xml",
  "status_code": 200,
  "found": true,
  "type": "index",
  "total_urls": 1248,
  "returned_urls": 500,
  "child_sitemaps": [
    "https://stripe.com/sitemap-pages.xml",
    "https://stripe.com/sitemap-blog.xml"
  ],
  "urls": [
    {
      "loc": "https://stripe.com/",
      "lastmod": "2026-04-15",
      "changefreq": "weekly",
      "priority": 1.0
    },
    {
      "loc": "https://stripe.com/payments",
      "lastmod": "2026-03-20",
      "changefreq": "monthly",
      "priority": 0.8
    }
  ],
  "insights": [
    { "type": "info", "message": "This is a sitemap index with 2 child sitemap(s)" },
    { "type": "pass", "message": "500 URL(s) found" },
    { "type": "warning", "message": "Only 210/500 URLs have a lastmod date" }
  ],
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Live Test Results

Tested against real URLs on 2026-05-13:

| Domain | Found | Type | Total URLs | Has Lastmod |
|--------|-------|------|------------|-------------|
| github.com | ✅ | urlset | 42 | ✅ |
| stripe.com | ✅ | index | 1248 | Partial |
| example.com | ❌ | — | — | — |

---

## Error Codes

| Code | Meaning                    |
|------|----------------------------|
| 400  | Invalid URL                |
| 502  | Could not fetch sitemap    |
