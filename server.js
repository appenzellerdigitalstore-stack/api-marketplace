/**
 * server.js — SiteTrace API Suite (Consolidated)
 *
 * Single entry point for all 20 API endpoints.
 * Deploy this file as one Render Web Service.
 *
 * Original 10 (Website Intelligence):
 *   POST /api/seo-snapshot
 *   POST /api/robots-analyzer
 *   POST /api/sitemap-analyzer
 *   POST /api/meta-preview
 *   POST /api/schema-detector
 *   POST /api/contact-extractor
 *   POST /api/tech-stack
 *   POST /api/security-headers
 *   POST /api/business-lead-score
 *   POST /api/report-generator
 *
 * New 10 (Marketplace Expansion):
 *   POST /api/email-finder
 *   POST /api/seo-audit
 *   POST /api/web-summarizer
 *   POST /api/company-intelligence
 *   POST /api/review-scraper
 *   POST /api/price-tracker
 *   POST /api/ai-content-detector
 *   POST /api/serp-scraper
 *   POST /api/linkedin-data
 *   POST /api/job-listings
 *
 *   GET  /health
 *
 * Plan-aware logic is unchanged — pass X-Plan: free|pro|ultra|mega
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const { rateLimiter } = require('./shared/rateLimiter');
const { marketplaceAuth } = require('./shared/auth');
const { requestLogger } = require('./shared/requestLogger');

const app  = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(cors());
// Accept JSON body regardless of Content-Type (needed for Zyla Labs, api.market, etc.)
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));
app.use(marketplaceAuth);
app.use(requestLogger);
app.use(rateLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'sitetrace-api-suite',
    rapidapi_proxy_secret_configured: Boolean(process.env.RAPIDAPI_PROXY_SECRET),
    internal_secret_configured: Boolean(process.env.SITETRACE_INTERNAL_SECRET),
    endpoints: [
      'POST /api/seo-snapshot',
      'POST /api/robots-analyzer',
      'POST /api/sitemap-analyzer',
      'POST /api/meta-preview',
      'POST /api/schema-detector',
      'POST /api/contact-extractor',
      'POST /api/tech-stack',
      'POST /api/security-headers',
      'POST /api/business-lead-score',
      'POST /api/report-generator',
      'POST /api/email-finder',
      'POST /api/seo-audit',
      'POST /api/web-summarizer',
      'POST /api/company-intelligence',
      'POST /api/review-scraper',
      'POST /api/price-tracker',
      'POST /api/ai-content-detector',
      'POST /api/serp-scraper',
      'POST /api/linkedin-data',
      'POST /api/job-listings'
    ]
  });
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'SiteTrace API Suite — 20 Endpoints',
    health: '/health',
    docs: 'Import openapi.yaml into RapidAPI or use the endpoint paths listed at /health.',
    endpoints: [
      '/api/seo-snapshot', '/api/robots-analyzer', '/api/sitemap-analyzer',
      '/api/meta-preview', '/api/schema-detector', '/api/contact-extractor',
      '/api/tech-stack', '/api/security-headers', '/api/business-lead-score',
      '/api/report-generator', '/api/email-finder', '/api/seo-audit',
      '/api/web-summarizer', '/api/company-intelligence', '/api/review-scraper',
      '/api/price-tracker', '/api/ai-content-detector', '/api/serp-scraper',
      '/api/linkedin-data', '/api/job-listings'
    ]
  });
});

// ─── Mount each API app ───────────────────────────────────────────────────────
// Each sub-app registers its own route (e.g. app.post('/api/seo-snapshot', ...))
// using its local express() instance. Mounting with app.use() exposes those
// routes on the root server without any path prefix needed.

// Original 10
app.use(require('./seo-snapshot/index'));
app.use(require('./robots-analyzer/index'));
app.use(require('./sitemap-analyzer/index'));
app.use(require('./meta-preview/index'));
app.use(require('./schema-detector/index'));
app.use(require('./contact-extractor/index'));
app.use(require('./tech-stack/index'));
app.use(require('./security-headers/index'));
app.use(require('./business-lead-score/index'));
app.use(require('./report-generator/index'));

// New 10 — Marketplace Expansion
app.use(require('./email-finder/index'));
app.use(require('./seo-audit/index'));
app.use(require('./web-summarizer/index'));
app.use(require('./company-intelligence/index'));
app.use(require('./review-scraper/index'));
app.use(require('./price-tracker/index'));
app.use(require('./ai-content-detector/index'));
app.use(require('./serp-scraper/index'));
app.use(require('./linkedin-data/index'));
app.use(require('./job-listings/index'));

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error:   'Endpoint not found',
    hint:    'Available endpoints are listed at GET /health'
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nSiteTrace API Suite running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health\n`);
  const routes = [
    'seo-snapshot','robots-analyzer','sitemap-analyzer','meta-preview','schema-detector',
    'contact-extractor','tech-stack','security-headers','business-lead-score','report-generator',
    'email-finder','seo-audit','web-summarizer','company-intelligence','review-scraper',
    'price-tracker','ai-content-detector','serp-scraper','linkedin-data','job-listings'
  ];
  console.log(`\n${routes.length} endpoints active:`);
  routes.forEach(r => console.log(`  POST http://localhost:${PORT}/api/${r}`));
});

module.exports = app;
