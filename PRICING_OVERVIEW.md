# Website Intelligence API — Pricing & Plan System

> Single source of truth for plan features, per-API pricing, and bundle pricing.
> Last updated: 2026-05-13

---

## Plan Feature Matrix

The difference between plans is **not only price** — each tier unlocks a wider response.

| Feature | Free | Pro | Ultra | Mega |
|---------|------|-----|-------|------|
| Response depth | Basic only | Complete fields | Complete + analysis | Everything + reports |
| SEO score / lead score | ❌ | ❌ | ✅ | ✅ |
| Issues list | ❌ | ❌ | ✅ | ✅ |
| Recommendations | ❌ | ❌ | ✅ | ✅ |
| Report generator access | ❌ | Score only | Full sections | Full + export flags |
| Export formats | ❌ | ❌ | JSON only | JSON + HTML + PDF |
| Priority processing flag | ❌ | ❌ | ❌ | ✅ |
| Rate limit | 5 req/min | 30 req/min | 100 req/min | 500 req/min |
| Best for | Testing | Individual devs | Agencies | SaaS / high-volume |

### Upgrade path

```
Free  → test the API, basic fields only
Pro   → complete data, all normal fields, no scoring
Ultra → complete data + score + issues + recommendations
Mega  → everything + report_ready + export_formats + priority_processing
```

---

## Per-API Pricing

### SEO Snapshot `/api/seo-snapshot`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | title, description, h1_count |
| Pro | $9.99 | 5,000 | + canonical, viewport, lang, robots, images, links, social presence |
| Ultra | $24.99 | 25,000 | + seo_score, ssl, issues[], recommendations[] |
| Mega | $79.99 | 150,000 | + report_ready, export_formats, priority_processing |

### Robots Analyzer `/api/robots-analyzer`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | domain, found, robots_url |
| Pro | $4.99 | 10,000 | + groups, sitemaps, raw content |
| Ultra | $14.99 | 60,000 | + insights[] |
| Mega | $49.99 | 500,000 | + report_ready, priority_processing |

### Sitemap Analyzer `/api/sitemap-analyzer`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | domain, found, total_urls |
| Pro | $7.99 | 5,000 | + sitemap_url, type, child_sitemaps, URLs (loc only) |
| Ultra | $19.99 | 30,000 | + full URL objects (lastmod, priority, changefreq), insights[] |
| Mega | $69.99 | 200,000 | + report_ready, priority_processing |

### Meta Preview `/api/meta-preview`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | title, description, has_og_image |
| Pro | $4.99 | 10,000 | + open_graph, twitter_card, all 4 platform previews |
| Ultra | $14.99 | 60,000 | + completeness_score, article_meta, issues[] |
| Mega | $49.99 | 500,000 | + report_ready, export_formats, priority_processing |

### Schema Detector `/api/schema-detector`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | schema_count |
| Pro | $7.99 | 8,000 | + detected_types, rich_result_eligible, schemas (type only) |
| Ultra | $19.99 | 50,000 | + schemas (full data), insights[] |
| Mega | $69.99 | 400,000 | + report_ready, priority_processing |

### Contact Extractor `/api/contact-extractor`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 25 | counts only, first email masked |
| Pro | $14.99 | 5,000 | + all emails, phones, social_profiles |
| Ultra | $49.99 | 30,000 | + addresses, insights[] |
| Mega | $149.99 | 200,000 | + report_ready, export_formats, priority_processing |

### Tech Stack `/api/tech-stack`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | total_detected, technology names only |
| Pro | $9.99 | 8,000 | + technologies (with category), by_category, server_headers |
| Ultra | $29.99 | 50,000 | + insights[] |
| Mega | $99.99 | 400,000 | + report_ready, priority_processing |

### Security Headers `/api/security-headers`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 50 | grade, headers_present count |
| Pro | $7.99 | 10,000 | + security_score, SSL valid/days, header present/missing status |
| Ultra | $19.99 | 75,000 | + full SSL details, header descriptions + recommendations, raw headers |
| Mega | $69.99 | 600,000 | + report_ready, export_formats, priority_processing |

### Business Lead Score `/api/business-lead-score`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 20 | lead_score, tier |
| Pro | $19.99 | 3,000 | + buying_readiness, company basics, signal names |
| Ultra | $59.99 | 20,000 | + signal points, signals_by_category, full company_info |
| Mega | $199.99 | 150,000 | + report_ready, export_formats, priority_processing |

### Report Generator `/api/report-generator`
| Plan | Price | Requests/month | Response includes |
|------|-------|---------------|-------------------|
| Free | $0 | 10 | overall_score, overall_grade + upgrade message |
| Pro | $14.99 | 2,000 | + scores breakdown only |
| Ultra | $49.99 | 15,000 | + all sections: seo, social, performance, security, crawlability |
| Mega | $179.99 | 120,000 | + report_ready, export_formats, priority_processing |

---

## Bundle: Website Intelligence API

Access all 10 endpoints under a single subscription.

| Tier | Price | Requests/month | Rate limit | Plan tier applied |
|------|-------|---------------|------------|-------------------|
| Free | $0 | 50 | 5 req/min | free |
| Starter | $9.99 | 1,000 | 15 req/min | pro |
| Pro | $29.99 | 10,000 | 60 req/min | ultra |
| Agency | $99.99 | 50,000 | 200 req/min | mega |
| Enterprise | Custom | Custom | Custom | mega |

**Bundle endpoints:** `/seo-snapshot` · `/robots-analyzer` · `/sitemap-analyzer` · `/meta-preview` · `/schema-detector` · `/contact-extractor` · `/tech-stack` · `/security-headers` · `/business-lead-score` · `/report-generator`

---

## How Plan Detection Works

Plans are read from the request header. Set one of these:

```
X-Plan: free
X-Plan: pro
X-Plan: ultra
X-Plan: mega
```

Or use the alias header:
```
X-Sitetrace-Plan: ultra
```

Falls back to `free` if the header is absent or invalid. For RapidAPI/Zyla, configure your gateway to inject `X-Plan` based on the subscriber's active tier.

---

## RapidAPI Publish Checklist

For each individual API listing:
- [ ] API name, short description (≤160 chars)
- [ ] Category: **Data > Web Scraping** or **Tools > SEO**
- [ ] Endpoint URL pointing to your deployed service
- [ ] Authentication: `X-RapidAPI-Key` header (gateway injects `X-Plan`)
- [ ] Example request with working test URL
- [ ] README from each API's `README.md`
- [ ] 4 pricing tiers: Free / Pro / Ultra / Mega
- [ ] Thumbnail using SiteTrace branding

**Recommended publish order** (by market demand):
1. `security-headers` — broad audience, easy demo
2. `seo-snapshot` — highest search volume
3. `meta-preview` — social media teams
4. `tech-stack` — competitive intelligence
5. `robots-analyzer` — technical SEO
6. `sitemap-analyzer` — technical SEO
7. `schema-detector` — content teams
8. `contact-extractor` — lead gen (monitor for abuse)
9. `business-lead-score` — highest revenue potential
10. `report-generator` — white-label / agency
