# Security Headers API

**Endpoint:** `POST /api/security-headers`
**Category:** Security / Compliance
**Version:** 1.0.0

---

## Overview

Audits all HTTP security headers for any URL and returns a letter grade (A+ to F), a numeric score, and per-header pass/fail results with fix recommendations. Also checks SSL certificate validity.

Checks **9 security headers** based on industry best practices (OWASP, securityheaders.com standards).

**Perfect for:** Security audit tools, DevOps dashboards, compliance checkers, developer tools, web agency reporting.

---

## Pricing Tiers

| Plan   | Price      | Requests/Month | Rate Limit       |
|--------|------------|----------------|------------------|
| BASIC  | Free       | 200            | 10 req/min       |
| PRO    | $9.99/mo   | 10,000         | 60 req/min       |
| ULTRA  | $29.99/mo  | 75,000         | 300 req/min      |
| MEGA   | $99.99/mo  | 600,000        | 1200 req/min     |

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
  "security_score": 83,
  "grade": "A",
  "ssl": {
    "valid": true,
    "issuer": "DigiCert Inc",
    "expires_at": "2025-09-12T23:59:59.000Z",
    "days_remaining": 122
  },
  "ssl_note": { "status": "pass", "message": "SSL valid — expires in 122 days" },
  "headers_present": 5,
  "headers_missing": 1,
  "headers": [
    {
      "header": "Strict-Transport-Security",
      "importance": "critical",
      "weight": 20,
      "present": true,
      "value": "max-age=31536000; includeSubDomains; preload",
      "status": "pass",
      "description": "Forces browsers to use HTTPS for future visits (HSTS).",
      "recommendation": null
    },
    {
      "header": "Permissions-Policy",
      "importance": "medium",
      "weight": 8,
      "present": false,
      "value": null,
      "status": "missing",
      "description": "Controls access to browser features like camera, microphone, geolocation.",
      "recommendation": "Add: Permissions-Policy: geolocation=(), microphone=(), camera=()"
    }
  ],
  "raw_response_headers": {
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "content-security-policy": "default-src 'self' ...",
    "x-frame-options": "SAMEORIGIN",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  },
  "analyzed_at": "2026-05-13T10:00:00.000Z"
}
```

---

## Security Headers Checked

| Header | Importance | Weight |
|--------|-----------|--------|
| Strict-Transport-Security (HSTS) | Critical | 20 |
| Content-Security-Policy (CSP) | Critical | 20 |
| X-Frame-Options | High | 15 |
| X-Content-Type-Options | High | 10 |
| Referrer-Policy | Medium | 8 |
| Cross-Origin-Opener-Policy | Medium | 7 |
| Cross-Origin-Resource-Policy | Medium | 7 |
| Permissions-Policy | Medium | 8 |
| X-XSS-Protection | Low | 5 |

---

## Grading Scale

| Grade | Score Range | Meaning |
|-------|------------|---------|
| A+ | 90–100 | Excellent — all critical headers present |
| A | 80–89 | Very good — minor gaps |
| B | 70–79 | Good — some headers missing |
| C | 60–69 | Fair — notable gaps |
| D | 40–59 | Poor — significant missing headers |
| F | 0–39 | Failing — major security risks |

---

## Live Test Results

Tested on 2026-05-13:

| URL | Score | Grade | HSTS | CSP | X-Frame | XCO |
|-----|-------|-------|------|-----|---------|-----|
| stripe.com | 83 | A | ✅ | ✅ | ✅ | ✅ |
| github.com | 83 | A | ✅ | ✅ | ✅ | ✅ |
| example.com | 0 | F | ❌ | ❌ | ❌ | ❌ |

---

## Error Codes

| Code | Meaning                         |
|------|---------------------------------|
| 400  | Invalid URL                     |
| 502  | Could not fetch security headers|
