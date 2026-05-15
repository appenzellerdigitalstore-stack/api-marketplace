# Tech Stack Detector API

**Endpoint:** `POST /api/tech-stack`
**Category:** Web Intelligence / Competitive Research
**Version:** 1.0.0

---

## Overview

Detects the full technology stack of any website — CMS, JavaScript frameworks, analytics tools, CDNs, CSS frameworks, payment providers, live chat, and hosting platforms. Analyzes both the HTML source and HTTP response headers.

Covers **40+ technology signatures** across 10 categories.

**Perfect for:** Competitive intelligence tools, sales prospecting (find sites using competitor tools), agency tech audits, market research platforms.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 100            | 5 req/min        |
| PRO    | $9.99/mo   | 8,000          | 50 req/min       |
| ULTRA  | $29.99/mo  | 50,000         | 200 req/min      |
| MEGA   | $99.99/mo  | 400,000        | 800 req/min      |

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
  "total_detected": 7,
  "technologies": [
    { "name": "React", "category": "JavaScript Framework" },
    { "name": "Next.js", "category": "JavaScript Framework" },
    { "name": "Google Analytics", "category": "Analytics" },
    { "name": "Stripe", "category": "Payment" },
    { "name": "Google Fonts", "category": "Fonts" },
    { "name": "AWS CloudFront", "category": "CDN" },
    { "name": "Cloudflare", "category": "CDN" }
  ],
  "by_category": {
    "JavaScript Framework": ["React", "Next.js"],
    "Analytics": ["Google Analytics"],
    "Payment": ["Stripe"],
    "Fonts": ["Google Fonts"],
    "CDN": ["AWS CloudFront", "Cloudflare"]
  },
  "server_headers": {
    "server": "cloudflare",
    "powered_by": null,
    "content_type": "text/html; charset=utf-8",
    "cache_control": "max-age=3600"
  },
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Detected Technology Categories

| Category | Examples |
|----------|---------|
| CMS | WordPress, Shopify, Squarespace, Wix, Webflow, Ghost, Drupal |
| JavaScript Framework | React, Vue.js, Angular, Next.js, Nuxt.js, Svelte |
| Analytics | Google Analytics, Plausible, Hotjar, Mixpanel, Segment |
| CDN | Cloudflare, Fastly, AWS CloudFront, jsDelivr |
| CSS Framework | Bootstrap, Tailwind CSS, Bulma, Foundation |
| Payment | Stripe, PayPal |
| Chat | Intercom, Drift, Zendesk, Crisp |
| Hosting | Vercel, Netlify, GitHub Pages, Render |
| Fonts | Google Fonts, Adobe Fonts |
| Maps | Google Maps, Mapbox |

---

## Live Test Results

Tested on 2026-05-13:

| URL | Technologies Detected | Notable |
|-----|----------------------|---------|
| stripe.com | 7 | React, Next.js, Cloudflare, Stripe |
| github.com | 5 | React, Google Analytics, AWS CloudFront |
| example.com | 0 | Plain HTML, no frameworks |

---

## Error Codes

| Code | Meaning              |
|------|----------------------|
| 400  | Invalid URL          |
| 502  | Could not fetch URL  |
