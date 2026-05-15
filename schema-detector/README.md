# Schema Detector API

**Endpoint:** `POST /api/schema-detector`
**Category:** SEO / Structured Data
**Version:** 1.0.0

---

## Overview

Detects and parses all structured data on a page — JSON-LD, Microdata, and RDFa. Identifies rich result eligibility, extracts FAQ questions, and flags syntax errors. Tells you exactly what Google can read from the page.

**Perfect for:** Schema auditing tools, Google rich result checkers, SEO platforms, content QA workflows.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 200            | 10 req/min       |
| PRO    | $8.99/mo   | 8,000          | 50 req/min       |
| ULTRA  | $24.99/mo  | 50,000         | 200 req/min      |
| MEGA   | $89.99/mo  | 400,000        | 800 req/min      |

---

## Request

```json
{
  "url": "https://example.com"
}
```

---

## Response

```json
{
  "success": true,
  "url": "https://stripe.com",
  "status_code": 200,
  "schema_count": 3,
  "detected_types": ["WebSite", "Organization", "BreadcrumbList"],
  "rich_result_eligible": ["WebSite", "Organization", "BreadcrumbList"],
  "schemas": [
    {
      "format": "JSON-LD",
      "type": "WebSite",
      "context": "https://schema.org",
      "data": {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Stripe",
        "url": "https://stripe.com"
      }
    },
    {
      "format": "JSON-LD",
      "type": "Organization",
      "context": "https://schema.org",
      "data": {
        "@type": "Organization",
        "name": "Stripe",
        "logo": "https://stripe.com/logo.png",
        "sameAs": ["https://twitter.com/stripe", "https://linkedin.com/company/stripe"]
      }
    }
  ],
  "insights": [
    { "type": "pass", "message": "3 schema block(s) detected" },
    { "type": "pass", "message": "Rich result eligible types: WebSite, Organization, BreadcrumbList" }
  ],
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Supported Schema Types (Rich Result Eligible)

Article, NewsArticle, BlogPosting, WebPage, WebSite, Organization, LocalBusiness, Person, Product, Offer, Review, AggregateRating, FAQPage, HowTo, Recipe, Event, BreadcrumbList, VideoObject, JobPosting, Course, Book, SoftwareApplication, MedicalCondition

---

## Live Test Results

Tested on 2026-05-13:

| URL | Schemas Found | Types | Rich Result Eligible |
|-----|---------------|-------|----------------------|
| stripe.com | 3 | WebSite, Organization, BreadcrumbList | ✅ |
| github.com | 2 | WebSite, Organization | ✅ |
| example.com | 0 | — | ❌ |

---

## Error Codes

| Code | Meaning              |
|------|----------------------|
| 400  | Invalid URL          |
| 502  | Could not fetch URL  |
