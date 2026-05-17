/**
 * /api/report-generator
 * Full multi-dimensional audit: SEO, security, performance, content, social.
 * This is a premium endpoint — Free gets a teaser only.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPublicUrl, fetchPage, getSslInfo, errorResponse, USER_AGENT } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

async function fetchRobots(urlObj) {
  try {
    const { response: r } = await fetchPublicUrl(new URL(`${urlObj.protocol}//${urlObj.hostname}/robots.txt`), {
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT }
    });
    return r.status === 200 && typeof r.data === 'string' ? r.data : null;
  } catch { return null; }
}

async function checkSitemap(urlObj) {
  try {
    const { response: r } = await fetchPublicUrl(new URL(`${urlObj.protocol}//${urlObj.hostname}/sitemap.xml`), {
      timeout: 5000,
      accept: 'application/xml,text/xml,*/*',
      headers: { 'User-Agent': USER_AGENT }
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

function cleanWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !['with', 'from', 'that', 'this', 'your', 'about', 'have', 'what', 'when', 'where', 'their', 'will', 'site', 'page', 'home'].includes(word));
}

function titleCase(value) {
  return String(value || '').split(/\s+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function inferTopic({ title, metaDesc, h1s, domain }) {
  const source = [h1s && h1s[0], title, metaDesc, domain].filter(Boolean).join(' ');
  const counts = new Map();
  cleanWords(source).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  return ranked.slice(0, 3).join(' ') || domain.replace(/^www\./, '').split('.')[0] || 'website';
}

function buildAuditInsights({ urlObj, title, metaDesc, h1s, wordCount, internalLinks, seoIssues, overallScore, scores }) {
  const topic = inferTopic({ title, metaDesc, h1s, domain: urlObj.hostname });
  const readableTopic = titleCase(topic);
  const criticals = seoIssues.filter((issue) => issue.level === 'fail').length;
  const warnings = seoIssues.filter((issue) => issue.level === 'warning').length;
  const priorities = seoIssues.slice(0, 5).map((issue) => ({
    priority: issue.level === 'fail' ? 'High' : 'Medium',
    area: issue.field || 'seo',
    issue: issue.message,
    action: issue.field === 'meta_description'
      ? 'Write a clear 50-165 character meta description focused on the page value.'
      : issue.field === 'title'
      ? 'Rewrite the title so it clearly combines topic, value, and brand.'
      : issue.field === 'h1'
      ? 'Use one clear H1 that matches the page purpose.'
      : 'Review this issue and apply the recommended SEO fix.'
  }));

  return {
    executive_summary: criticals
      ? `This audit found ${criticals} critical issue${criticals === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'}. Fix crawlability and snippet problems first, then improve page depth and internal linking.`
      : `This page has a ${overallScore}/100 overall score. The next improvements are likely richer content, internal linking, structured data, and stronger search snippets.`,
    page_profile: {
      likely_topic: topic,
      visible_word_count: wordCount,
      internal_links: internalLinks,
      score_breakdown: scores
    },
    top_priorities: priorities,
    quick_wins: priorities.slice(0, 3).map((item) => item.action),
    content_opportunities: [
      {
        priority: criticals || wordCount < 250 ? 'High' : 'Medium',
        title: `${readableTopic}: What Visitors Should Know Before Choosing`,
        primary_keyword: topic,
        supporting_keywords: [`${topic} guide`, `${topic} benefits`, `${topic} questions`],
        intent: 'Informational'
      },
      {
        priority: internalLinks < 3 ? 'High' : 'Medium',
        title: `How to Choose the Right ${readableTopic} Option`,
        primary_keyword: `choose ${topic}`,
        supporting_keywords: [`best ${topic}`, `${topic} comparison`, `${topic} checklist`],
        intent: 'Commercial'
      },
      {
        priority: metaDesc && title ? 'Medium' : 'High',
        title: `${readableTopic} FAQs: Answers for New Visitors`,
        primary_keyword: `${topic} faq`,
        supporting_keywords: [`what is ${topic}`, `${topic} cost`, `${topic} process`],
        intent: 'BOFU'
      }
    ],
    optional_content_plan: {
      phase_1: 'Confirm the page profile and target audience.',
      phase_2: 'Choose which opportunity rows the client wants to turn into pages or content updates.',
      phase_3: 'For each approved topic, prepare SEO title, meta description, H1, H2/H3 outline, FAQ section, internal links, CTA, and source notes.'
    }
  };
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
    const scores = {
      seo:         Math.max(0, seoScore),
      performance: performanceScore,
      security:    securityScore,
      content:     Math.min(100, Math.round(contentRaw))
    };
    const insights = buildAuditInsights({
      urlObj,
      title,
      metaDesc,
      h1s,
      wordCount,
      internalLinks: $('a[href]').length,
      seoIssues,
      overallScore: Math.min(100, overallScore),
      scores
    });

    const full = {
      success: true,
      url: urlObj.href,
      domain: urlObj.hostname,
      status_code: response.status,
      generated_at: new Date().toISOString(),
      overall_score: Math.min(100, overallScore),
      overall_grade: gradeFromScore(Math.min(100, overallScore)),
      scores,
      insights,
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
