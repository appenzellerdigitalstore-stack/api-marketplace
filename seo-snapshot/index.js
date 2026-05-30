/**
 * /api/seo-snapshot
 * Returns a complete on-page SEO snapshot of any public URL.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, getSslInfo, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ strict: false }));

function readPayload(req) {
  if (req.body && typeof req.body.request_body === 'string') {
    try {
      return { ...req.query, ...JSON.parse(req.body.request_body) };
    } catch (_) {
      return { ...req.query, request_body: req.body.request_body };
    }
  }
  return { ...req.query, ...(req.body || {}) };
}

app.post('/api/seo-snapshot', async (req, res) => {
  const plan = getPlan(req);
  const { url } = readPayload(req);

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const [{ response, responseTimeMs }, ssl] = await Promise.all([
      fetchPage(urlObj),
      getSslInfo(urlObj)
    ]);

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    // ── Collect all data (always compute everything; filter at the end) ──────
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1s = $('h1').map((_, el) => $(el).text().trim()).get();
    const h2s = $('h2').map((_, el) => $(el).text().trim()).get();
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const viewport = $('meta[name="viewport"]').attr('content') || null;
    const lang = $('html').attr('lang') || null;
    const robots = $('meta[name="robots"]').attr('content') || null;
    const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || null;

    const images = $('img');
    const totalImages = images.length;
    const imagesWithAlt = images.filter((_, el) => $(el).attr('alt') && $(el).attr('alt').trim() !== '').length;
    const imagesMissingAlt = totalImages - imagesWithAlt;

    const links = $('a[href]');
    const internalLinks = links.filter((_, el) => {
      const href = $(el).attr('href') || '';
      return href.startsWith('/') || href.includes(urlObj.hostname);
    }).length;
    const externalLinks = links.length - internalLinks;

    const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

    const ogTitle = $('meta[property="og:title"]').attr('content') || null;
    const ogDesc = $('meta[property="og:description"]').attr('content') || null;
    const ogImage = $('meta[property="og:image"]').attr('content') || null;
    const ogType = $('meta[property="og:type"]').attr('content') || null;
    const twitterCard = $('meta[name="twitter:card"]').attr('content') || null;

    const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || null;
    const htmlSize = Buffer.byteLength(html, 'utf8');

    // ── Score + issues ────────────────────────────────────────────────────────
    const issues = [];
    const recommendations = [];
    let score = 100;

    if (!title) {
      issues.push({ type: 'fail', field: 'title', message: 'Missing title tag' });
      recommendations.push('Add a descriptive <title> tag between 10 and 70 characters.');
      score -= 15;
    } else if (title.length < 10 || title.length > 70) {
      issues.push({ type: 'warning', field: 'title', message: `Title length is ${title.length} chars (ideal: 10–70)` });
      recommendations.push('Adjust your title tag to be between 10 and 70 characters for best SEO results.');
      score -= 5;
    }
    if (!metaDesc) {
      issues.push({ type: 'fail', field: 'meta_description', message: 'Missing meta description' });
      recommendations.push('Add a meta description between 50 and 165 characters to improve click-through rates.');
      score -= 10;
    } else if (metaDesc.length < 50 || metaDesc.length > 165) {
      issues.push({ type: 'warning', field: 'meta_description', message: `Meta description is ${metaDesc.length} chars (ideal: 50–165)` });
      recommendations.push('Resize your meta description to between 50 and 165 characters.');
      score -= 5;
    }
    if (h1s.length === 0) {
      issues.push({ type: 'fail', field: 'h1', message: 'No H1 heading found' });
      recommendations.push('Add exactly one H1 heading that clearly describes the page topic.');
      score -= 10;
    } else if (h1s.length > 1) {
      issues.push({ type: 'warning', field: 'h1', message: `Multiple H1 tags found (${h1s.length})` });
      recommendations.push('Use only one H1 per page. Convert extras to H2 or H3.');
      score -= 5;
    }
    if (!canonical) {
      issues.push({ type: 'warning', field: 'canonical', message: 'No canonical tag found' });
      recommendations.push('Add <link rel="canonical"> to prevent duplicate content issues.');
      score -= 5;
    }
    if (!viewport) {
      issues.push({ type: 'fail', field: 'viewport', message: 'Missing mobile viewport meta tag' });
      recommendations.push('Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile support.');
      score -= 8;
    }
    if (imagesMissingAlt > 0) {
      issues.push({ type: 'warning', field: 'images', message: `${imagesMissingAlt} image(s) missing ALT text` });
      recommendations.push(`Add descriptive alt attributes to the ${imagesMissingAlt} image(s) that are missing them.`);
      score -= Math.min(10, imagesMissingAlt * 2);
    }
    if (!lang) {
      issues.push({ type: 'warning', field: 'lang', message: 'Missing HTML lang attribute' });
      recommendations.push('Add a lang attribute to the <html> tag (e.g., lang="en").');
      score -= 3;
    }
    if (robots && /noindex/i.test(robots)) {
      issues.push({ type: 'fail', field: 'robots', message: 'Page has noindex directive — blocked from search engines' });
      recommendations.push('Remove the noindex directive if you want this page to appear in search results.');
      score -= 20;
    }
    if (wordCount < 100) {
      issues.push({ type: 'warning', field: 'content', message: `Low word count: ${wordCount} words` });
      recommendations.push('Add more meaningful content. Pages with under 100 words often rank poorly.');
      score -= 5;
    }
    if (!ogTitle || !ogImage) {
      issues.push({ type: 'warning', field: 'open_graph', message: 'Incomplete Open Graph tags' });
      recommendations.push('Add og:title, og:description, and og:image for better social sharing previews.');
      score -= 3;
    }

    // ── Build the full response ───────────────────────────────────────────────
    const full = {
      success: true,
      url: urlObj.href,
      final_url: response.request?.res?.responseUrl || urlObj.href,
      status_code: response.status,
      response_time_ms: responseTimeMs,
      seo_score: Math.max(0, score),
      ssl: ssl ? { valid: ssl.valid, expires_at: ssl.expires_at, days_remaining: ssl.days_remaining, issuer: ssl.issuer } : null,
      page: {
        title,
        title_length: title.length,
        meta_description: metaDesc,
        meta_description_length: metaDesc.length,
        h1: h1s,
        h2: h2s.slice(0, 10),
        canonical,
        viewport,
        lang,
        robots,
        charset: charset || null,
        favicon: favicon || null,
        word_count: wordCount,
        html_size_bytes: htmlSize,
        html_size_kb: Math.round(htmlSize / 1024)
      },
      images: {
        total: totalImages,
        with_alt: imagesWithAlt,
        missing_alt: imagesMissingAlt,
        alt_coverage_pct: totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100
      },
      links: {
        total: links.length,
        internal: internalLinks,
        external: externalLinks
      },
      social: {
        og_title: ogTitle,
        og_description: ogDesc,
        og_image: ogImage,
        og_type: ogType,
        twitter_card: twitterCard
      },
      issues,
      recommendations,
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'seo-snapshot'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch or analyze URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`seo-snapshot running on port ${PORT}`));
}

module.exports = app;
