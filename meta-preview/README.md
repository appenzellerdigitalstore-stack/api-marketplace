# Meta Preview API

**Endpoint:** `POST /api/meta-preview`
**Category:** SEO / Social Media
**Version:** 1.0.0

---

## Overview

Returns exactly how a URL will appear when shared on Facebook, Twitter/X, LinkedIn, and Slack. Extracts all Open Graph tags, Twitter Card metadata, and article meta — plus a completeness score and list of issues.

**Perfect for:** Social media tools, CMS preview panels, SEO checkers, link preview generators.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 200            | 10 req/min       |
| PRO    | $6.99/mo   | 10,000         | 60 req/min       |
| ULTRA  | $19.99/mo  | 60,000         | 300 req/min      |
| MEGA   | $69.99/mo  | 500,000        | 1000 req/min     |

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
  "status_code": 200,
  "completeness_score": 95,
  "basic": {
    "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "description": "Stripe is a financial services platform...",
    "canonical": "https://stripe.com/",
    "favicon": "https://stripe.com/favicon.ico"
  },
  "open_graph": {
    "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "description": "Stripe is a financial services platform...",
    "image": "https://images.stripeassets.com/.../Stripe.jpg",
    "type": "website",
    "url": "https://stripe.com/",
    "site_name": "Stripe"
  },
  "twitter_card": {
    "card": "summary_large_image",
    "title": "Stripe | Financial Infrastructure...",
    "description": "Stripe is a financial services...",
    "image": "https://images.stripeassets.com/.../Stripe.jpg",
    "site": "@stripe"
  },
  "previews": {
    "facebook": {
      "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
      "description": "Stripe is a financial services platform...",
      "image": "https://images.stripeassets.com/.../Stripe.jpg",
      "url": "https://stripe.com/",
      "site_name": "Stripe",
      "type": "website"
    },
    "twitter_x": {
      "card": "summary_large_image",
      "title": "Stripe | Financial Infrastructure...",
      "description": "Stripe is a financial services...",
      "image": "https://images.stripeassets.com/.../Stripe.jpg",
      "site": "@stripe",
      "creator": null
    },
    "linkedin": {
      "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
      "description": "Stripe is a financial services platform...",
      "image": "https://images.stripeassets.com/.../Stripe.jpg",
      "url": "https://stripe.com/"
    },
    "slack": {
      "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
      "description": "Stripe is a financial services platform...",
      "image": "https://images.stripeassets.com/.../Stripe.jpg"
    }
  },
  "issues": [],
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Live Test Results

Tested on 2026-05-13:

| URL | Status | OG Title | OG Image | Twitter Card | Score |
|-----|--------|----------|----------|--------------|-------|
| stripe.com | 200 | ✅ | ✅ | summary_large_image | 95 |
| github.com | 200 | ✅ | ✅ | summary | 90 |
| example.com | 200 | ❌ | ❌ | ❌ | 35 |

---

## Error Codes

| Code | Meaning              |
|------|----------------------|
| 400  | Invalid URL          |
| 502  | Could not fetch URL  |
