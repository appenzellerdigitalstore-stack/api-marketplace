/**
 * /api/report-generator
 * Full multi-dimensional audit: SEO, security, performance, content, social.
 * This is a premium endpoint — Free gets a teaser only.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const axios = require('axios');
const { normalizeUrl, fetchPage, getSslInfo, errorResponse, USER_AGENT } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

async function fetchRobots(urlObj) {
  try {
    const r = await axios.get(`${urlObj.protocol}//${urlObj.hostname}/robots.txt`, {
      timeout: 5000, proxy: false, validateStatus: () => true, headers: { 'User-Agent': USER_AGENT }
    });
    return r.status === 200 && typeof r.data === 'string' ? r.data : null;
  } catch { return null; }
}

async function checkSitemap(urlObj) {
  try {
    const r = await axios.get(`${urlObj.protocol}//${urlObj.hostname}/sitemap.xml`, {
      timeout: 5000, proxy: false, validateStatus: () => true, headers: { 'User-Agent': USER_AGENT }
    });
    return r.status === 200;
  } catch { return false; }
}

function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

app.post('/api/report-generator', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const [{ response, responseTimeMs }, ssl, robotsTxt, hasSitemap] = await Promise.all([
      fetchPage(urlObj),
      getSslInfo(urlObj),
      fetchRobots(urlObj),
      checkSitemap(urlObj)
    ]);

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);
    const headers = response.headers || {};

    // ── SEO fields ────────────────────────────────────────────────────────────
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1s = $('h1').map((_, el) => $(el).text().trim()).get();
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const viewport = $('meta[name="viewport"]').attr('content') || null;
    const lang = $('html').attr('lang') || null;
    const robotsMeta = $('meta[name="robots"]').attr('content') || null;
    const isNoindex = robotsMeta && /noindex/i.test(robotsMeta);
    const totalImages = $('img').length;
    const missingAlt = $('img').filter((_, el) => !$(el).attr('alt') || !$(el).attr('alt').trim()).length;

    // Strip tags before word count
    $('script, style, noscript').remove();
    const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    const htmlSizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);

    // ── Social ────────────────────────────────────────────────────────────────
    const ogTitle = $('meta[property="og:title"]').attr('content') || null;
    const ogImage = $('meta[property="og:image"]').attr('content') || null;
    const ogDesc  = $('meta[property="og:description"]').attr('content') || null;
    const twitterCard = $('meta[name="twitter:card"]').attr('content') || null;

    // ── Schema ────────────────────────────────────────────────────────────────
    const schemaTypes = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { const d = JSON.parse($(el).html()); if (d['@type']) schemaTypes.push(d['@type']); } catch {}
    });

    // ── Security headers ──────────────────────────────────────────────────────
    const securityHeaders = {
      hsts:               !!headers['strict-transport-security'],
      csp:                !!headers['content-security-policy'],
      x_frame_options:    !!headers['x-frame-options'],
      x_content_type:     !!headers['x-content-type-options'],
      referrer_policy:    !!headers['referrer-policy'],
      permissions_policy: !!headers['permissions-policy']
    };
    const secHeadersPresent = Object.values(securityHeaders).filter(Boolean).length;
    const secHeadersTotal   = Object.keys(securityHeaders).length;

    // ── SEO Score + issues ────────────────────────────────────────────────────
    const seoIssues = [];
    let seoScore = 100;

    if (!title || title.length < 10) {
      seoIssues.push({ level: 'fail', message: !title ? 'Missing title tag' : `Title too short (${title.length} chars)` });
      seoScore -= 15;
    } else if (title.length > 70) {
      seoIssues.push({ level: 'warning', message: `Title too long (${title.length} chars, ideal ≤70)` });
      seoScore -= 5;
    }
    if (!metaDesc) {
      seoIssues.push({ level: 'fail', message: 'Missing meta description' });
      seoScore -= 10;
    } else if (metaDesc.length < 50 || metaDesc.length > 165) {
      seoIssues.push({ level: 'warning', message: `Meta description length (${metaDesc.length}) outside ideal range (50–165)` });
      seoScore -= 5;
    }
    if (h1s.length === 0) { seoIssues.push({ level: 'fail', message: 'No H1 heading' }); seoScore -= 10; }
    else if (h1s.length > 1) { seoIssues.push({ level: 'warning', message: `Multiple H1 tags (${h1s.length})` }); seoScore -= 5; }
    if (!canonical) { seoIssues.push({ level: 'warning', message: 'No canonical tag' }); seoScore -= 5; }
    if (!viewport)  { seoIssues.push({ level: 'fail',    message: 'No mobile viewport meta tag' }); seoScore -= 8; }
    if (missingAlt > 0) { seoIssues.push({ level: 'warning', message: `${missingAlt} image(s) missing ALT text` }); seoScore -= Math.min(10, missingAlt * 2); }
    if (wordCount < 100) { seoIssues.push({ level: 'warning', message: `Low word count (${wordCount} words)` }); seoScore -= 5; }
    if (isNoindex) { seoIssues.push({ level: 'fail', message: 'noindex directive — page blocked from search engines' }); seoScore -= 20; }
    if (!ogImage) { seoIssues.push({ level: 'warning', message: 'No og:image — social shares will lack a preview image' }); seoScore -= 3; }

    // ── Dimension scores ──────────────────────────────────────────────────────
    const performanceScore = responseTimeMs < 1000 ? 100 : responseTimeMs < 2000 ? 80 : responseTimeMs < 4000 ? 60 : 30;
    const securityScore    = Math.round((secHeadersPresent / secHeadersTotal) * 80) + (ssl && ssl.valid ? 20 : 0);
    const contentRaw       = Math.min(100, wordCount / 3 + (hasSitemap ? 10 : 0) + (robotsTxt ? 5 : 0) + (schemaTypes.length > 0 ? 15 : 0));
    const overallScore     = Math.round(
      (Math.max(0, seoScore) * 0.35) +
      (performanceScore       * 0.25) +
      (securityScore          * 0.25) +
      (contentRaw             * 0.15)
    );

    const full = {
      success: true,
      url: urlObj.href,
      domain: urlObj.hostname,
      status_code: response.status,
      generated_at: new Date().toISOString(),
      overall_score: Math.min(100, overallScore),
      overall_grade: gradeFromScore(Math.min(100, overallScore)),
      scores: {
        seo:         Math.max(0, seoScore),
        performance: performanceScore,
        security:    securityScore,
        content:     Math.min(100, Math.round(contentRaw))
      },
      seo: {
        title,
        title_length:              title.length,
        meta_description:          metaDesc,
        meta_description_length:   metaDesc.length,
        h1:                        h1s,
        canonical,
        viewport,
        lang,
        robots_meta:               robotsMeta,
        is_noindex:                !!isNoindex,
        images:                    { total: totalImages, missing_alt: missingAlt },
        word_count:                wordCount,
        html_size_kb:              htmlSizeKb,
        schema_types:              schemaTypes,
        issues:                    seoIssues
      },
      social: {
        og_title:    ogTitle,
        og_description: ogDesc,
        og_image:    ogImage,
        twitter_card: twitterCard,
        has_full_og: !!(ogTitle && ogDesc && ogImage)
      },
      performance: {
        response_time_ms: responseTimeMs,
        status_code:      response.status,
        html_size_kb:     htmlSizeKb
      },
      security: {
        https: urlObj.protocol === 'https:',
        ssl:   ssl ? { valid: ssl.valid, expires_at: ssl.expires_at, days_remaining: ssl.days_remaining, issuer: ssl.issuer } : null,
        headers:         securityHeaders,
        headers_present: secHeadersPresent,
        headers_total:   secHeadersTotal
      },
      crawlability: {
        has_robots_txt: !!robotsTxt,
        has_sitemap:    hasSitemap,
        sitemap_url:    hasSitemap ? `${urlObj.protocol}//${urlObj.hostname}/sitemap.xml` : null
      }
    };

    return res.json(filterByPlan(full, plan, 'report-generator'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to generate report', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3010;
  app.listen(PORT, () => console.log(`report-generator running on port ${PORT}`));
}
module.exports = app;
