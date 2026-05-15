# Contact Extractor API

**Endpoint:** `POST /api/contact-extractor`
**Category:** Lead Generation / Data Extraction
**Version:** 1.0.0

---

## Overview

Scrapes and extracts all contact information from any public web page: email addresses, phone numbers, social media profiles, and physical addresses. Returns structured, deduplicated results in one API call.

**Perfect for:** Lead generation tools, CRM enrichment, sales prospecting pipelines, business directory builders.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 50             | 3 req/min        |
| PRO    | $14.99/mo  | 5,000          | 20 req/min       |
| ULTRA  | $49.99/mo  | 30,000         | 100 req/min      |
| MEGA   | $199.99/mo | 200,000        | 500 req/min      |

> Higher pricing reflects the premium lead generation use case.

---

## Request

```json
{
  "url": "https://example.com/contact"
}
```

---

## Response

```json
{
  "success": true,
  "url": "https://stripe.com",
  "status_code": 200,
  "emails": ["support@stripe.com", "press@stripe.com"],
  "phones": ["+1-888-888-2083"],
  "social_profiles": {
    "twitter": {
      "url": "https://twitter.com/stripe",
      "handle": "stripe"
    },
    "linkedin": {
      "url": "https://linkedin.com/company/stripe",
      "handle": "stripe"
    },
    "facebook": {
      "url": "https://facebook.com/stripetech",
      "handle": "stripetech"
    }
  },
  "addresses": ["354 Oyster Point Blvd, South San Francisco, CA 94080"],
  "insights": [
    { "type": "pass", "message": "3 social profile(s) found" }
  ],
  "counts": {
    "emails": 2,
    "phones": 1,
    "social_profiles": 3,
    "addresses": 1
  },
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Live Test Results

Tested on 2026-05-13:

| URL | Emails | Phones | Social Profiles | Addresses |
|-----|--------|--------|-----------------|-----------|
| stripe.com | 2 | 1 | 3 | 1 |
| github.com | 1 | 0 | 4 | 0 |
| example.com | 0 | 0 | 0 | 0 |

---

## Notes

- Deduplicates all results
- Follows `mailto:` and `tel:` links for more accurate extraction
- Filters out common false positives (noreply, example.com)
- Does not follow external links — analyzes the submitted page only

---

## Error Codes

| Code | Meaning              |
|------|----------------------|
| 400  | Invalid URL          |
| 502  | Could not fetch URL  |
