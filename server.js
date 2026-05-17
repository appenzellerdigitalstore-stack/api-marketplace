/**
 * server.js — SiteTrace API Suite (Consolidated)
 *
 * Single entry point for all 10 Website Intelligence API endpoints.
 * Deploy this file as one Render Web Service.
 *
 * Each API is still sold as a separate listing on RapidAPI because
 * every route has its own distinct path:
 *
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
      'POST /api/report-generator'
    ]
  });
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'SiteTrace Website Intelligence API Suite',
    health: '/health',
    docs: 'Import openapi.yaml into RapidAPI or use the endpoint paths listed at /health.',
    endpoints: [
      '/api/seo-snapshot',
      '/api/robots-analyzer',
      '/api/sitemap-analyzer',
      '/api/meta-preview',
      '/api/schema-detector',
      '/api/contact-extractor',
      '/api/tech-stack',
      '/api/security-headers',
      '/api/business-lead-score',
      '/api/report-generator'
    ]
  });
});

// ─── Mount each API app ───────────────────────────────────────────────────────
// Each sub-app registers its own route (e.g. app.post('/api/seo-snapshot', ...))
// using its local express() instance. Mounting with app.use() exposes those
// routes on the root server without any path prefix needed.

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
  console.log('Endpoints:');
  console.log(`  POST http://localhost:${PORT}/api/seo-snapshot`);
  console.log(`  POST http://localhost:${PORT}/api/robots-analyzer`);
  console.log(`  POST http://localhost:${PORT}/api/sitemap-analyzer`);
  console.log(`  POST http://localhost:${PORT}/api/meta-preview`);
  console.log(`  POST http://localhost:${PORT}/api/schema-detector`);
  console.log(`  POST http://localhost:${PORT}/api/contact-extractor`);
  console.log(`  POST http://localhost:${PORT}/api/tech-stack`);
  console.log(`  POST http://localhost:${PORT}/api/security-headers`);
  console.log(`  POST http://localhost:${PORT}/api/business-lead-score`);
  console.log(`  POST http://localhost:${PORT}/api/report-generator`);
});

module.exports = app;
