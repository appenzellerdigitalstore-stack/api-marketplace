# Business Lead Score API

**Endpoint:** `POST /api/business-lead-score`
**Category:** Sales Intelligence / Lead Enrichment
**Version:** 1.0.0

---

## Overview

Analyzes any website and returns a B2B lead quality score (0–100) with a tier classification (Hot / Warm / Cold / Unqualified). Scores based on 5 signal categories: website health, SEO presence, contact & trust signals, social presence, and technology sophistication.

**Perfect for:** Sales prospecting tools, CRM enrichment pipelines, outbound automation, agency client scoring, account-based marketing platforms.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 25             | 2 req/min        |
| PRO    | $19.99/mo  | 3,000          | 15 req/min       |
| ULTRA  | $59.99/mo  | 20,000         | 60 req/min       |
| MEGA   | $199.99/mo | 150,000        | 300 req/min      |

> Premium pricing reflects high-value sales intelligence use case — comparable to Clearbit / Apollo enrichment APIs.

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
  "lead_score": 91,
  "tier": "Hot Lead",
  "buying_readiness": "High",
  "signals": [
    { "category": "Website Health", "signal": "Site is reachable", "points": 10, "status": "pass" },
    { "category": "Website Health", "signal": "HTTPS enabled", "points": 5, "status": "pass" },
    { "category": "Website Health", "signal": "Valid SSL certificate", "points": 5, "status": "pass" },
    { "category": "Website Health", "signal": "Fast load (521ms)", "points": 5, "status": "pass" },
    { "category": "SEO Presence", "signal": "Has a proper title tag", "points": 5, "status": "pass" },
    { "category": "SEO Presence", "signal": "Has meta description", "points": 5, "status": "pass" },
    { "category": "Contact & Trust", "signal": "Contact email found", "points": 5, "status": "pass" },
    { "category": "Contact & Trust", "signal": "Privacy policy present", "points": 4, "status": "pass" },
    { "category": "Social Presence", "signal": "3+ social profiles linked", "points": 15, "status": "pass" },
    { "category": "Tech Sophistication", "signal": "Premium tools: Stripe, Intercom", "points": 10, "status": "pass" }
  ],
  "company_info": {
    "title": "Stripe | Financial Infrastructure to Grow Your Revenue",
    "meta_description": "Stripe is a financial services platform...",
    "emails": ["support@stripe.com"],
    "has_phone": true,
    "has_address": true,
    "social_profiles": {
      "twitter": { "url": "https://twitter.com/stripe", "handle": "stripe" },
      "linkedin": { "url": "https://linkedin.com/company/stripe", "handle": "stripe" }
    },
    "ecommerce": false,
    "live_chat": true,
    "premium_tools": ["Stripe", "Intercom", "Segment"]
  },
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Lead Tiers

| Tier | Score | Buying Readiness | Description |
|------|-------|-----------------|-------------|
| Hot Lead | 80–100 | High | Strong digital presence, premium tools, complete contact info |
| Warm Lead | 60–79 | Medium | Good presence, some gaps |
| Cold Lead | 35–59 | Low | Basic web presence, limited signals |
| Unqualified | 0–34 | Very Low | Poor or incomplete digital presence |

---

## Scoring Signals (5 Categories, 100 points total)

| Category | Max Points | Signals |
|----------|-----------|---------|
| Website Health | 25 | Reachability, HTTPS, SSL, speed |
| SEO Presence | 20 | Title, meta, H1, content volume |
| Contact & Trust | 20 | Email, phone, address, privacy policy, terms |
| Social Presence | 15 | LinkedIn, Twitter, Facebook profiles |
| Tech Sophistication | 20 | Premium tools (Intercom, Stripe, HubSpot), e-commerce, live chat |

---

## Live Test Results

Tested on 2026-05-13:

| URL | Score | Tier | Emails | Premium Tools |
|-----|-------|------|--------|---------------|
| stripe.com | 91 | Hot Lead | 2 | Stripe, Intercom, Segment |
| github.com | 82 | Hot Lead | 1 | None flagged |
| example.com | 12 | Unqualified | 0 | None |

---

## Error Codes

| Code | Meaning              |
|------|----------------------|
| 400  | Invalid URL          |
| 502  | Could not fetch URL  |
