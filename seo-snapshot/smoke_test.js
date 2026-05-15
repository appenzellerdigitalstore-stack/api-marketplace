/**
 * Smoke test: verifies plan filtering produces correct field sets
 * Uses the planFilter logic directly without spinning up a server
 */
const { filterByPlan } = require('./shared/planFilter');

// Simulate a full computed result (same shape as what index.js builds)
const mockFull = {
  success: true,
  url: 'https://stripe.com',
  final_url: 'https://stripe.com/',
  status_code: 200,
  response_time_ms: 521,
  seo_score: 87,
  ssl: { valid: true, expires_at: '2025-09-12T00:00:00.000Z', days_remaining: 122, issuer: 'DigiCert' },
  page: {
    title: 'Stripe | Financial Infrastructure',
    title_length: 32,
    meta_description: 'Stripe is a financial services platform...',
    meta_description_length: 43,
    h1: ['Financial Infrastructure'],
    h2: ['Payments', 'Billing'],
    canonical: 'https://stripe.com/',
    viewport: 'width=device-width, initial-scale=1',
    lang: 'en-US',
    robots: null,
    charset: 'utf-8',
    favicon: '/favicon.ico',
    word_count: 8979,
    html_size_bytes: 184320,
    html_size_kb: 180
  },
  images: { total: 37, with_alt: 37, missing_alt: 0, alt_coverage_pct: 100 },
  links: { total: 142, internal: 98, external: 44 },
  social: { og_title: 'Stripe', og_description: 'Platform', og_image: 'https://stripe.com/og.jpg', og_type: 'website', twitter_card: 'summary_large_image' },
  issues: [{ type: 'warning', field: 'title', message: 'Title a bit short' }],
  recommendations: ['Expand your title tag to 40+ characters for better SEO.'],
  analyzed_at: '2026-05-13T10:00:00.000Z'
};

const plans = ['free', 'pro', 'ultra', 'mega'];

for (const plan of plans) {
  const result = filterByPlan(mockFull, plan, 'seo-snapshot');
  const keys = Object.keys(result);
  const hasSslFull    = result.ssl && result.ssl.issuer !== undefined;
  const hasScore      = 'seo_score' in result;
  const hasIssues     = 'issues' in result;
  const hasRecs       = 'recommendations' in result;
  const hasReport     = 'report_ready' in result;
  const hasFinalUrl   = 'final_url' in result;
  const hasSocialFull = result.social && 'og_title' in result.social;
  const h1IsCount     = result.page && 'h1_count' in result.page && !('h1' in result.page);

  console.log(`\n[${plan.toUpperCase()}]`);
  console.log(`  Fields: ${keys.join(', ')}`);
  console.log(`  h1 as count only: ${h1IsCount}`);
  console.log(`  final_url:        ${hasFinalUrl}`);
  console.log(`  social full:      ${hasSocialFull}`);
  console.log(`  ssl.issuer:       ${hasSslFull}`);
  console.log(`  seo_score:        ${hasScore}`);
  console.log(`  issues:           ${hasIssues}`);
  console.log(`  recommendations:  ${hasRecs}`);
  console.log(`  report_ready:     ${hasReport}`);
}

// Quick check: report-generator free plan must have upgrade_required
const { filterByPlan: fp2 } = require('./shared/planFilter');
const mockReport = { success: true, url: 'https://x.com', domain: 'x.com', status_code: 200, generated_at: '2026-05-13T10:00:00.000Z', overall_score: 75, overall_grade: 'B', scores: { seo: 80, performance: 100, security: 60, content: 70 }, seo: {}, social: {}, performance: {}, security: {}, crawlability: {} };
const freeReport = fp2(mockReport, 'free', 'report-generator');
const megaReport = fp2(mockReport, 'mega', 'report-generator');
console.log('\n[REPORT-GENERATOR FREE] upgrade_required:', freeReport.upgrade_required === true);
console.log('[REPORT-GENERATOR MEGA] report_ready:', megaReport.report_ready === true);
console.log('[REPORT-GENERATOR MEGA] export_formats:', megaReport.export_formats);
