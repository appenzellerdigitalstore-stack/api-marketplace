'use strict';
/**
 * planFilter.js — Plan-aware response filtering for SiteTrace APIs
 *
 * Plan resolution order:
 *   1. X-RapidAPI-Subscription header (injected by RapidAPI gateway)
 *      Maps: BASIC->free, PRO->pro, ULTRA->ultra, MEGA->mega
 *   2. X-Plan header only for trusted internal/development clients
 *   3. X-SiteTrace-Plan header only for trusted internal/development clients
 *   4. Defaults to 'free'
 */

const { planAtLeast } = require('./pricing.config');

const VALID_PLANS = new Set(['free', 'pro', 'ultra', 'mega']);

const RAPIDAPI_PLAN_MAP = {
  basic: 'free',
  pro:   'pro',
  ultra: 'ultra',
  mega:  'mega',
};

function getPlan(req) {
  const rapidapiSub = req.headers['x-rapidapi-subscription'];
  const rapidApiSecretConfigured = Boolean(process.env.RAPIDAPI_PROXY_SECRET);
  const rapidApiTrusted = req.marketplaceAuth === 'rapidapi' || !rapidApiSecretConfigured;

  if (rapidApiTrusted && rapidapiSub) {
    const mapped = RAPIDAPI_PLAN_MAP[rapidapiSub.toLowerCase().trim()];
    if (mapped) return mapped;
  }

  const internalTrusted = req.marketplaceAuth === 'internal' || req.marketplaceAuth === 'development';
  if (!internalTrusted) return 'free';

  const raw = (
    req.headers['x-plan'] ||
    req.headers['x-sitetrace-plan'] ||
    'free'
  ).toLowerCase().trim();
  return VALID_PLANS.has(raw) ? raw : 'free';
}

// ── Filter functions ──────────────────────────────────────────────────────────

function filterSeoSnapshot(full, plan) {
  const base = {
    success: full.success, url: full.url, status_code: full.status_code,
    analyzed_at: full.analyzed_at,
    page: { title: full.page.title, meta_description: full.page.meta_description, h1_count: full.page.h1.length }
  };
  if (plan === 'free') return base;

  const pro = {
    ...base, final_url: full.final_url, response_time_ms: full.response_time_ms,
    page: { ...base.page, title_length: full.page.title_length, meta_description_length: full.page.meta_description_length,
      h1: full.page.h1, h2: full.page.h2, canonical: full.page.canonical, viewport: !!full.page.viewport,
      lang: full.page.lang, robots: full.page.robots, charset: full.page.charset,
      favicon: full.page.favicon, word_count: full.page.word_count, html_size_kb: full.page.html_size_kb },
    images: { total: full.images.total, missing_alt: full.images.missing_alt },
    links: { total: full.links.total, internal: full.links.internal, external: full.links.external },
    social: { has_og_title: !!full.social.og_title, has_og_image: !!full.social.og_image, has_twitter_card: !!full.social.twitter_card }
  };
  if (plan === 'pro') return pro;

  const ultra = { ...pro, seo_score: full.seo_score, ssl: full.ssl,
    page: { ...pro.page, viewport: full.page.viewport },
    images: full.images, social: full.social, issues: full.issues, recommendations: full.recommendations };
  if (plan === 'ultra') return ultra;

  return { ...ultra, report_ready: true, export_formats: ['json','html','pdf'], priority_processing: true };
}

function filterRobotsAnalyzer(full, plan) {
  const base = { success: full.success, domain: full.domain, robots_url: full.robots_url, found: full.found, analyzed_at: full.analyzed_at };
  if (!full.found) return { ...base, message: full.message };
  if (plan === 'free') return base;
  const pro = { ...base, status_code: full.status_code, size_bytes: full.size_bytes, groups: full.groups, sitemaps: full.sitemaps, raw: full.raw };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, insights: full.insights };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json'], priority_processing: true };
}

function filterSitemapAnalyzer(full, plan) {
  const base = { success: full.success, domain: full.domain, found: full.found, analyzed_at: full.analyzed_at };
  if (!full.found) return { ...base, message: full.message, candidates_tried: full.candidates_tried };
  if (plan === 'free') return { ...base, total_urls: full.total_urls };
  const pro = { ...base, sitemap_url: full.sitemap_url, status_code: full.status_code, type: full.type,
    total_urls: full.total_urls, returned_urls: full.returned_urls, child_sitemaps: full.child_sitemaps,
    urls: (full.urls || []).map(u => ({ loc: u.loc })) };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, urls: full.urls, insights: full.insights };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json'], priority_processing: true };
}

function filterMetaPreview(full, plan) {
  const base = { success: full.success, url: full.url, status_code: full.status_code, analyzed_at: full.analyzed_at,
    basic: { title: full.basic.title, description: full.basic.description }, has_og_image: !!full.open_graph.image };
  if (plan === 'free') return base;
  const pro = { ...base, basic: full.basic, open_graph: full.open_graph, twitter_card: full.twitter_card, previews: full.previews };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, completeness_score: full.completeness_score, article_meta: full.article_meta, issues: full.issues };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json','html','pdf'], priority_processing: true };
}

function filterSchemaDetector(full, plan) {
  const base = { success: full.success, url: full.url, status_code: full.status_code, schema_count: full.schema_count, analyzed_at: full.analyzed_at };
  if (plan === 'free') return base;
  const pro = { ...base, detected_types: full.detected_types, rich_result_eligible: full.rich_result_eligible,
    schemas: (full.schemas || []).map(s => ({ format: s.format, type: s.type, context: s.context, ...(s.parse_error ? { parse_error: s.parse_error } : {}) })) };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, schemas: full.schemas, insights: full.insights };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json'], priority_processing: true };
}

function filterContactExtractor(full, plan) {
  const base = { success: full.success, url: full.url, status_code: full.status_code, analyzed_at: full.analyzed_at,
    counts: full.counts, emails_preview: full.emails.length > 0 ? [full.emails[0].replace(/(.{2}).+(@.+)/, '$1***$2')] : [] };
  if (plan === 'free') return base;
  const pro = { success: full.success, url: full.url, status_code: full.status_code, analyzed_at: full.analyzed_at,
    emails: full.emails, phones: full.phones, social_profiles: full.social_profiles, counts: full.counts };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, addresses: full.addresses, insights: full.insights };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json','html'], priority_processing: true };
}

function filterTechStack(full, plan) {
  const base = { success: full.success, url: full.url, status_code: full.status_code,
    total_detected: full.total_detected, technology_names: (full.technologies || []).map(t => t.name), analyzed_at: full.analyzed_at };
  if (plan === 'free') return base;
  const pro = { success: full.success, url: full.url, status_code: full.status_code,
    total_detected: full.total_detected, technologies: full.technologies, by_category: full.by_category,
    server_headers: full.server_headers, analyzed_at: full.analyzed_at };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, insights: full.insights || [] };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json'], priority_processing: true };
}

function filterSecurityHeaders(full, plan) {
  const base = { success: full.success, url: full.url, status_code: full.status_code, grade: full.grade,
    headers_present: full.headers_present, headers_missing: full.headers_missing, analyzed_at: full.analyzed_at };
  if (plan === 'free') return base;
  const pro = { ...base, security_score: full.security_score,
    ssl: full.ssl ? { valid: full.ssl.valid, days_remaining: full.ssl.days_remaining } : null,
    headers: (full.headers || []).map(h => ({ header: h.header, importance: h.importance, present: h.present, value: h.present ? h.value : null, status: h.status })) };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, ssl: full.ssl, ssl_note: full.ssl_note, headers: full.headers, raw_response_headers: full.raw_response_headers };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json','html','pdf'], priority_processing: true };
}

function filterBusinessLeadScore(full, plan) {
  const base = { success: full.success, url: full.url, domain: full.domain, status_code: full.status_code,
    lead_score: full.lead_score, tier: full.tier, analyzed_at: full.analyzed_at };
  if (plan === 'free') return base;
  const pro = { ...base, buying_readiness: full.buying_readiness,
    company_info: { title: full.company_info.title, meta_description: full.company_info.meta_description,
      emails: full.company_info.emails.slice(0, 3), has_phone: full.company_info.has_phone },
    signals: (full.signals || []).map(s => ({ category: s.category, signal: s.signal, status: s.status })) };
  if (plan === 'pro') return pro;
  const ultra = { ...pro, company_info: full.company_info, signals: full.signals, signals_by_category: full.signals_by_category };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json','html','pdf'], priority_processing: true };
}

function filterReportGenerator(full, plan) {
  if (plan === 'free') {
    return { success: true, url: full.url, overall_score: full.overall_score, overall_grade: full.overall_grade,
      generated_at: full.generated_at, upgrade_required: true, message: 'Upgrade to Pro or higher to access the full report.' };
  }
  if (plan === 'pro') {
    return { success: full.success, url: full.url, domain: full.domain, status_code: full.status_code,
      generated_at: full.generated_at, overall_score: full.overall_score, overall_grade: full.overall_grade, scores: full.scores };
  }
  const ultra = { success: full.success, url: full.url, domain: full.domain, status_code: full.status_code,
    generated_at: full.generated_at, overall_score: full.overall_score, overall_grade: full.overall_grade,
    scores: full.scores, seo: full.seo, social: full.social, performance: full.performance,
    security: full.security, crawlability: full.crawlability, insights: full.insights };
  if (plan === 'ultra') return ultra;
  return { ...ultra, report_ready: true, export_formats: ['json','html','pdf'], priority_processing: true };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const FILTERS = {
  'seo-snapshot':        filterSeoSnapshot,
  'robots-analyzer':     filterRobotsAnalyzer,
  'sitemap-analyzer':    filterSitemapAnalyzer,
  'meta-preview':        filterMetaPreview,
  'schema-detector':     filterSchemaDetector,
  'contact-extractor':   filterContactExtractor,
  'tech-stack':          filterTechStack,
  'security-headers':    filterSecurityHeaders,
  'business-lead-score': filterBusinessLeadScore,
  'report-generator':    filterReportGenerator,
};

function filterByPlan(fullResponse, plan, apiName) {
  const fn = FILTERS[apiName];
  if (!fn) return fullResponse;
  return fn(fullResponse, plan);
}

module.exports = { getPlan, filterByPlan };
