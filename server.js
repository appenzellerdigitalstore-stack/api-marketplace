/**
 * server.js - SiteTrace API Suite (Consolidated)
 * Single entry point for all 35 API endpoints.
 * Plan-aware logic: pass X-Plan: free|pro|ultra|mega
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

// Global middleware
app.use(cors());
app.use(marketplaceAuth);
app.use(requestLogger);
app.use(rateLimiter);

// Request timeout: 30s hard limit
app.use(function(req, res, next) {
  res.setTimeout(30000, function() {
    if (!res.headersSent) {
      res.status(504).json({ success: false, error: 'Request timed out. The target site took too long to respond.' });
    }
  });
  next();
});

// Health check
app.get('/health', function(_req, res) {
  res.json({
    status:  'ok',
    service: 'sitetrace-api-suite',
    rapidapi_proxy_secret_configured: Boolean(process.env.RAPIDAPI_PROXY_SECRET),
    internal_secret_configured: Boolean(process.env.SITETRACE_INTERNAL_SECRET),
    endpoints: [
      'POST /api/seo-snapshot', 'POST /api/robots-analyzer', 'POST /api/sitemap-analyzer',
      'POST /api/meta-preview', 'POST /api/schema-detector', 'POST /api/contact-extractor',
      'POST /api/tech-stack', 'POST /api/security-headers', 'POST /api/business-lead-score',
      'POST /api/report-generator', 'POST /api/email-finder', 'POST /api/seo-audit',
      'POST /api/web-summarizer', 'POST /api/company-intelligence', 'POST /api/review-scraper',
      'POST /api/price-tracker', 'POST /api/ai-content-detector', 'POST /api/serp-scraper',
      'POST /api/linkedin-data', 'POST /api/job-listings',
      'POST /api/nutrition-analyzer', 'POST /api/meal-planner', 'POST /api/food-allergen-checker',
      'POST /api/restaurant-health-inspector', 'POST /api/supplement-checker',
      'POST /api/phone-intelligence', 'POST /api/email-health', 'POST /api/contact-enricher',
      'POST /api/spam-shield', 'POST /api/identity-risk-scorer',
      'POST /api/supply-chain-monitor', 'POST /api/supplier-finder', 'POST /api/tariff-lookup',
      'POST /api/business-risk-scorer', 'POST /api/freight-estimator'
    ]
  });
});

app.get('/', function(_req, res) {
  var endpoints = [
    '/api/seo-snapshot', '/api/robots-analyzer', '/api/sitemap-analyzer',
    '/api/meta-preview', '/api/schema-detector', '/api/contact-extractor',
    '/api/tech-stack', '/api/security-headers', '/api/business-lead-score',
    '/api/report-generator', '/api/email-finder', '/api/seo-audit',
    '/api/web-summarizer', '/api/company-intelligence', '/api/review-scraper',
    '/api/price-tracker', '/api/ai-content-detector', '/api/serp-scraper',
    '/api/linkedin-data', '/api/job-listings', '/api/nutrition-analyzer',
    '/api/meal-planner', '/api/food-allergen-checker', '/api/restaurant-health-inspector',
    '/api/supplement-checker', '/api/phone-intelligence', '/api/email-health',
    '/api/contact-enricher', '/api/spam-shield', '/api/identity-risk-scorer',
    '/api/supply-chain-monitor', '/api/supplier-finder', '/api/tariff-lookup',
    '/api/business-risk-scorer', '/api/freight-estimator'
  ];

  res.json({
    success: true,
    service: 'SiteTrace API Suite - 35 Endpoints',
    health: '/health',
    docs: 'Import openapi.yaml into RapidAPI or use the endpoint paths listed at /health.',
    endpoints: endpoints
  });
});

// Mount all 35 API sub-apps
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
// Category 1: Food & Health Intelligence
app.use(require('./nutrition-analyzer/index'));
app.use(require('./meal-planner/index'));
app.use(require('./food-allergen-checker/index'));
app.use(require('./restaurant-health-inspector/index'));
app.use(require('./supplement-checker/index'));
// Category 2: Phone & Identity Intelligence
app.use(require('./phone-intelligence/index'));
app.use(require('./email-health/index'));
app.use(require('./contact-enricher/index'));
app.use(require('./spam-shield/index'));
app.use(require('./identity-risk-scorer/index'));
// Category 3: Supply Chain & Business Risk
app.use(require('./supply-chain-monitor/index'));
app.use(require('./supplier-finder/index'));
app.use(require('./tariff-lookup/index'));
app.use(require('./business-risk-scorer/index'));
app.use(require('./freight-estimator/index'));

// 404 handler
app.use(function(_req, res) {
  res.status(404).json({
    success: false,
    error:   'Endpoint not found',
    hint:    'Available endpoints are listed at GET /health'
  });
});

// Start server
app.listen(PORT, function() {
  console.log('SiteTrace API Suite running on port ' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');

  var routes = [
    'seo-snapshot','robots-analyzer','sitemap-analyzer','meta-preview','schema-detector',
    'contact-extractor','tech-stack','security-headers','business-lead-score','report-generator',
    'email-finder','seo-audit','web-summarizer','company-intelligence','review-scraper',
    'price-tracker','ai-content-detector','serp-scraper','linkedin-data','job-listings',
    'nutrition-analyzer','meal-planner','food-allergen-checker','restaurant-health-inspector','supplement-checker',
    'phone-intelligence','email-health','contact-enricher','spam-shield','identity-risk-scorer',
    'supply-chain-monitor','supplier-finder','tariff-lookup','business-risk-scorer','freight-estimator'
  ];
  console.log('\n' + routes.length + ' endpoints active:');
  routes.forEach(function(r) { console.log('  POST http://localhost:' + PORT + '/api/' + r); });

  // Keep-warm self-ping every 4 minutes to prevent Render cold starts
  var SELF_URL = process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + PORT);
  var nodeHttp  = require('http');
  var nodeHttps = require('https');
  setInterval(function() {
    try {
      var mod = SELF_URL.startsWith('https') ? nodeHttps : nodeHttp;
      mod.get(SELF_URL + '/health', function(r) { r.resume(); }).on('error', function() {});
    } catch (_) {}
  }, 4 * 60 * 1000);
});

module.exports = app;
