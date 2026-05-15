/**
 * pricing.config.js
 * Single source of truth for all SiteTrace API plans, limits, and feature gates.
 *
 * Plans:  free | pro | ultra | mega
 * Bundle: free | starter | pro | agency | enterprise
 *
 * Plan is read from the request header: X-Plan (for self-hosted / internal)
 * or X-RapidAPI-Proxy-Secret mapped to a plan by your gateway.
 */

// ─── PLAN METADATA ──────────────────────────────────────────────────────────

const PLANS = {
  free: {
    label: 'Free',
    monthlyRequestLimit: null,       // enforced per-API below
    rateLimit: '5 req/min',
    responseDepth: 'basic',
    includesScore: false,
    includesIssues: false,
    includesRecommendations: false,
    includesReports: false,
    includesFullAudit: false,
    priorityProcessing: false,
    exportFormats: []
  },
  pro: {
    label: 'Pro',
    monthlyRequestLimit: null,
    rateLimit: '30 req/min',
    responseDepth: 'complete',
    includesScore: false,
    includesIssues: false,
    includesRecommendations: false,
    includesReports: false,
    includesFullAudit: false,
    priorityProcessing: false,
    exportFormats: []
  },
  ultra: {
    label: 'Ultra',
    monthlyRequestLimit: null,
    rateLimit: '100 req/min',
    responseDepth: 'complete+analysis',
    includesScore: true,
    includesIssues: true,
    includesRecommendations: true,
    includesReports: false,
    includesFullAudit: false,
    priorityProcessing: false,
    exportFormats: ['json']
  },
  mega: {
    label: 'Mega',
    monthlyRequestLimit: null,
    rateLimit: '500 req/min',
    responseDepth: 'complete+analysis+reports',
    includesScore: true,
    includesIssues: true,
    includesRecommendations: true,
    includesReports: true,
    includesFullAudit: true,
    priorityProcessing: true,
    exportFormats: ['json', 'html', 'pdf']
  }
};

// ─── PER-API PRICING ─────────────────────────────────────────────────────────
// monthlyRequests: null = unlimited within rate limit

const API_PRICING = {
  'seo-snapshot': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 9.99,   monthlyRequests: 5000 },
    ultra: { price: 24.99,  monthlyRequests: 25000 },
    mega:  { price: 79.99,  monthlyRequests: 150000 }
  },
  'robots-analyzer': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 4.99,   monthlyRequests: 10000 },
    ultra: { price: 14.99,  monthlyRequests: 60000 },
    mega:  { price: 49.99,  monthlyRequests: 500000 }
  },
  'sitemap-analyzer': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 7.99,   monthlyRequests: 5000 },
    ultra: { price: 19.99,  monthlyRequests: 30000 },
    mega:  { price: 69.99,  monthlyRequests: 200000 }
  },
  'meta-preview': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 4.99,   monthlyRequests: 10000 },
    ultra: { price: 14.99,  monthlyRequests: 60000 },
    mega:  { price: 49.99,  monthlyRequests: 500000 }
  },
  'schema-detector': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 7.99,   monthlyRequests: 8000 },
    ultra: { price: 19.99,  monthlyRequests: 50000 },
    mega:  { price: 69.99,  monthlyRequests: 400000 }
  },
  'contact-extractor': {
    free:  { price: 0,      monthlyRequests: 25 },
    pro:   { price: 14.99,  monthlyRequests: 5000 },
    ultra: { price: 49.99,  monthlyRequests: 30000 },
    mega:  { price: 149.99, monthlyRequests: 200000 }
  },
  'tech-stack': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 9.99,   monthlyRequests: 8000 },
    ultra: { price: 29.99,  monthlyRequests: 50000 },
    mega:  { price: 99.99,  monthlyRequests: 400000 }
  },
  'security-headers': {
    free:  { price: 0,      monthlyRequests: 50 },
    pro:   { price: 7.99,   monthlyRequests: 10000 },
    ultra: { price: 19.99,  monthlyRequests: 75000 },
    mega:  { price: 69.99,  monthlyRequests: 600000 }
  },
  'business-lead-score': {
    free:  { price: 0,      monthlyRequests: 20 },
    pro:   { price: 19.99,  monthlyRequests: 3000 },
    ultra: { price: 59.99,  monthlyRequests: 20000 },
    mega:  { price: 199.99, monthlyRequests: 150000 }
  },
  'report-generator': {
    free:  { price: 0,      monthlyRequests: 10 },
    pro:   { price: 14.99,  monthlyRequests: 2000 },
    ultra: { price: 49.99,  monthlyRequests: 15000 },
    mega:  { price: 179.99, monthlyRequests: 120000 }
  }
};

// ─── BUNDLE PRICING ──────────────────────────────────────────────────────────

const BUNDLE_PRICING = {
  free: {
    label: 'Free',
    price: 0,
    monthlyRequests: 50,
    rateLimit: '5 req/min',
    planTier: 'free'
  },
  starter: {
    label: 'Starter',
    price: 9.99,
    monthlyRequests: 1000,
    rateLimit: '15 req/min',
    planTier: 'pro'
  },
  pro: {
    label: 'Pro',
    price: 29.99,
    monthlyRequests: 10000,
    rateLimit: '60 req/min',
    planTier: 'ultra'
  },
  agency: {
    label: 'Agency',
    price: 99.99,
    monthlyRequests: 50000,
    rateLimit: '200 req/min',
    planTier: 'mega'
  },
  enterprise: {
    label: 'Enterprise',
    price: null,
    monthlyRequests: null,
    rateLimit: 'Custom',
    planTier: 'mega'
  }
};

// ─── PLAN RANK (for comparison) ──────────────────────────────────────────────

const PLAN_RANK = { free: 0, pro: 1, ultra: 2, mega: 3 };

function planAtLeast(plan, minimum) {
  return (PLAN_RANK[plan] || 0) >= (PLAN_RANK[minimum] || 0);
}

module.exports = { PLANS, API_PRICING, BUNDLE_PRICING, PLAN_RANK, planAtLeast };
