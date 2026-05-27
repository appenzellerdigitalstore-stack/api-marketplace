# SiteTrace — 10 New APIs: Publishing Guide
> Use this doc when adding each new API to RapidAPI, Zyla Labs, and api.market.
> Base URL for all endpoints: **https://api-marketplace-b73f.onrender.com**

---

## 1. Email Finder
**Endpoint:** `POST /api/email-finder`
**Tagline:** Find verified business email addresses for any domain
**Category:** Lead Generation / Email
**Input:** `{ "domain": "stripe.com" }` or `{ "url": "https://stripe.com" }`

**Description:**
Crawls a company's contact, about, and team pages to discover real email addresses, then generates common pattern emails (info@, contact@, sales@, etc.) and verifies MX records for deliverability. Returns confidence scores (high/medium/low) for each result.

**Plans:**
| Plan | Pages Crawled | Pattern Emails | MX Verification |
|------|--------------|---------------|-----------------|
| Free | 2 | ❌ | ✅ |
| Pro | 4 | 6 patterns | ✅ |
| Ultra | 10 | 19 patterns | ✅ + pages_checked |
| Mega | 10 | 19 patterns | ✅ + pages_checked |

---

## 2. SEO Audit
**Endpoint:** `POST /api/seo-audit`
**Tagline:** Full on-page SEO audit with 0–100 score and letter grade
**Category:** SEO / Analytics
**Input:** `{ "url": "https://example.com" }`

**Description:**
Comprehensive on-page SEO analysis returning a 0–100 score with letter grade (A–F), categorized issues/warnings/passed checks, title and meta description analysis, heading structure, image alt coverage, internal/external link counts, Open Graph, schema.org types, canonical URL, and robots meta. Ultra/Mega adds keyword density.

**Plans:**
| Plan | Headings | Links | OG + Schema | Keyword Density |
|------|----------|-------|-------------|-----------------|
| Free | H1 only | ❌ | ❌ | ❌ |
| Pro | H1–H6 | ✅ | ✅ | ❌ |
| Ultra | H1–H6 | ✅ | ✅ | ✅ (top 10) |
| Mega | H1–H6 | ✅ | ✅ | ✅ (top 10) |

---

## 3. Web Summarizer / Reader
**Endpoint:** `POST /api/web-summarizer`
**Tagline:** Extract clean article content and AI-style summary from any URL
**Category:** Content / NLP
**Input:** `{ "url": "https://example.com/blog-post" }`

**Description:**
Strips navigation, ads, and sidebars to extract clean readable article content, then returns an extractive summary, key bullet points, estimated reading time, word count, author, publish date, site name, and featured image.

**Plans:**
| Plan | Summary | Key Points | Meta Description | Raw Excerpt |
|------|---------|-----------|-----------------|-------------|
| Free | 2 sentences | ❌ | ❌ | ❌ |
| Pro | 3 sentences | 5 points | ✅ | ❌ |
| Ultra | 5 sentences | 8 points | ✅ | 1500 chars |
| Mega | 5 sentences | 8 points | ✅ | 1500 chars |

---

## 4. Company Intelligence
**Endpoint:** `POST /api/company-intelligence`
**Tagline:** Instant company profile: tech stack, socials, contacts, key pages
**Category:** Lead Generation / Business Intelligence
**Input:** `{ "domain": "stripe.com" }` or `{ "url": "https://stripe.com" }`

**Description:**
Scrapes a company homepage to build a structured intelligence report: company description, detected tech stack (30+ fingerprints including React, Shopify, HubSpot, Stripe, etc.), social media links (Twitter, LinkedIn, GitHub, etc.), contact emails and phone numbers, founding year, employee count signals, and key page discovery (careers, blog, pricing, press).

**Plans:**
| Plan | Tech Stack | Socials | Phone | Key Pages | OG + Twitter Card |
|------|-----------|---------|-------|-----------|-------------------|
| Free | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pro | ✅ | ✅ | ✅ | 3 pages | ❌ |
| Ultra | ✅ | ✅ | ✅ | All pages | ✅ |
| Mega | ✅ | ✅ | ✅ | All pages | ✅ |

---

## 5. Review Scraper
**Endpoint:** `POST /api/review-scraper`
**Tagline:** Scrape product reviews from Trustpilot, G2, Capterra & more
**Category:** Market Research / Reviews
**Input:** `{ "url": "https://www.trustpilot.com/review/example.com" }`

**Description:**
Extracts aggregate ratings and individual reviews from Trustpilot, G2, Capterra, Product Hunt, Yelp, TripAdvisor, and any site using schema.org Review markup. Returns star ratings, review text, author, date, and sentiment breakdown (positive/neutral/negative).

**Plans:**
| Plan | Reviews Returned | Sentiment Breakdown |
|------|-----------------|---------------------|
| Free | 3 | ❌ |
| Pro | 10 | ✅ |
| Ultra | 25 | ✅ |
| Mega | 25 | ✅ |

---

## 6. E-commerce Price Tracker
**Endpoint:** `POST /api/price-tracker`
**Tagline:** Extract product price, availability, and details from any e-commerce page
**Category:** E-commerce / Price Intelligence
**Input:** `{ "url": "https://store.example.com/product/widget" }`

**Description:**
Extracts structured product data from any e-commerce product page using a 3-layer approach: schema.org Product markup → Open Graph product tags → DOM heuristics. Works on Amazon, eBay, Shopify, WooCommerce, Etsy, Walmart, and generic stores. Returns price, currency, availability, brand, SKU, condition, seller, rating, and product images.

**Plans:**
| Plan | Price + Availability | Full Details | Images |
|------|---------------------|-------------|--------|
| Free | ✅ | ❌ | ❌ |
| Pro | ✅ | ✅ (brand, SKU, rating, seller) | ❌ |
| Ultra | ✅ | ✅ | ✅ (up to 5) |
| Mega | ✅ | ✅ | ✅ (up to 5) |

---

## 7. AI Content Detector
**Endpoint:** `POST /api/ai-content-detector`
**Tagline:** Detect AI-generated text with statistical heuristics — no API key needed
**Category:** Content / NLP / AI Detection
**Input:** `{ "text": "Your text content here..." }`

**Description:**
Analyzes text for AI generation signals using 5 weighted heuristics: sentence length burstiness (human text varies more), vocabulary richness (type-token ratio), AI filler phrase density (delve into, furthermore, in today's landscape, etc.), passive voice density, and paragraph length uniformity. Returns a 0–100 probability score with label (likely_ai / possibly_ai / uncertain / likely_human). Fully self-contained — no third-party AI API required.

**Plans:**
| Plan | Max Text Length | Signal Breakdown | Interpretation |
|------|----------------|-----------------|----------------|
| Free | 1,000 chars | ❌ | ❌ |
| Pro | 5,000 chars | ✅ | ❌ |
| Ultra | 25,000 chars | ✅ | ✅ |
| Mega | 25,000 chars | ✅ | ✅ |

---

## 8. Google SERP Scraper
**Endpoint:** `POST /api/serp-scraper`
**Tagline:** Real-time Google search results with organic rankings, PAA, and featured snippets
**Category:** SEO / Market Research
**Input:** `{ "query": "best project management tools 2025", "num": 10 }`

**Description:**
Fetches live Google search results and parses organic rankings (title, URL, snippet, position), featured snippet (position 0), People Also Ask questions, related searches, and knowledge panel data. Supports language, country, and search type (web/news/images) parameters.

**Plans:**
| Plan | Results | Featured Snippet | People Also Ask | Related Searches + KP |
|------|---------|-----------------|-----------------|----------------------|
| Free | 5 | ❌ | ❌ | ❌ |
| Pro | 10 | ✅ | ✅ | ❌ |
| Ultra | 20 | ✅ | ✅ | ✅ |
| Mega | 20 | ✅ | ✅ | ✅ |

---

## 9. LinkedIn Data Extractor
**Endpoint:** `POST /api/linkedin-data`
**Tagline:** Extract public LinkedIn profile, company, and job posting data
**Category:** Lead Generation / HR / Recruiting
**Input:** `{ "url": "https://www.linkedin.com/company/stripe" }`

**Description:**
Extracts publicly visible data from LinkedIn person profiles (/in/), company pages (/company/), and job postings (/jobs/view/) using schema.org JSON-LD and Open Graph metadata. For profiles: name, headline, location, current company, connections, education. For companies: description, industry, follower count, employee count, HQ, website, founding date. For jobs: title, company, location, employment type, salary, description.

**Plans:**
| Plan | Basic Info | Full Details | Schema Type |
|------|-----------|-------------|-------------|
| Free | Name, headline, location | ❌ | ❌ |
| Pro | + education, salary, description | ✅ | ❌ |
| Ultra | Full | ✅ | ✅ |
| Mega | Full | ✅ | ✅ |

---

## 10. Job Listings Aggregator
**Endpoint:** `POST /api/job-listings`
**Tagline:** Scrape job listings from any company career page or ATS platform
**Category:** HR / Recruiting / Lead Generation
**Input:** `{ "url": "https://boards.greenhouse.io/acmecorp" }`

**Description:**
Scrapes structured job listings from company career pages and major ATS platforms: Greenhouse, Lever, Workday, BambooHR, Ashby, Smartrecruiters, and Workable. Falls back to schema.org JobPosting markup and DOM heuristics for generic pages. Returns title, department, location, employment type, apply URL, and more. Supports filtering by location, department, and remote status.

**Optional filters:** `filter_location`, `filter_department`, `filter_remote: true`

**Plans:**
| Plan | Max Jobs | Dept Breakdown | Remote Count | Filters Info |
|------|---------|---------------|--------------|-------------|
| Free | 10 | ❌ | ❌ | ❌ |
| Pro | 30 | ✅ | ✅ | ❌ |
| Ultra | 100 | ✅ | ✅ | ✅ |
| Mega | 100 | ✅ | ✅ | ✅ |

---

## Publishing Checklist (per marketplace)

### RapidAPI
- [ ] Go to rapidapi.com/provider → "Add New API"
- [ ] Name it: "SiteTrace [API Name]" (e.g. "SiteTrace Email Finder")
- [ ] Import openapi.yaml (v2.0.0) — each API gets its own listing
- [ ] Set base URL: `https://api-marketplace-b73f.onrender.com`
- [ ] Set pricing: Free (100 req/mo), Basic $9.99 (Pro, 1k req/mo), Pro $29.99 (Ultra, 10k req/mo), Ultra $79.99 (Mega, 50k req/mo)
- [ ] Add category tags
- [ ] Publish

### Zyla Labs
- [ ] Log in → Dashboard → "Add New API"
- [ ] Upload openapi.yaml or fill manually
- [ ] Set endpoint URL
- [ ] Set pricing tiers to match RapidAPI
- [ ] Submit for review

### api.market
- [ ] Log in → "List an API"
- [ ] Fill name, description, endpoint
- [ ] Set pricing (PayPal already connected ✅)
- [ ] Submit

---

*All 10 new APIs are live on the Render deployment at https://api-marketplace-b73f.onrender.com once you push to GitHub.*
