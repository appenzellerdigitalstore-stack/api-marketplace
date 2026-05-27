/**
 * /api/seo-audit
 * Full on-page SEO audit for any URL.
 * Returns: title, meta, headings, images, links, page speed signals,
 *          keyword density, schema markup, open graph, canonical, robots.
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

function getHeadings($) {
  const headings = {};
  ['h1','h2','h3','h4','h5','h6'].forEach(tag => {
    headings[tag] = [];
    $(tag).each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings[tag].push(text);
    });
  });
  return headings;
}

function getImages($, baseUrl) {
  const images = { total: 0, missing_alt: 0, with_alt: 0, samples: [] };
  $('img').each((_, el) => {
    images.total++;
    const alt = $(el).attr('alt');
    const src = $(el).attr('src') || '';
    if (!alt || alt.trim() === '') {
      images.missing_alt++;
      if (images.samples.length < 5) images.samples.push({ src, alt: null });
    } else {
      images.with_alt++;
    }
  });
  images.alt_coverage = images.total > 0
    ? `${Math.round((images.with_alt / images.total) * 100)}%`
    : 'N/A';
  return images;
}

function getLinks($, baseUrl) {
  const internal = [], external = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === new URL(baseUrl).hostname) {
        internal.push(resolved.href);
      } else {
        external.push(resolved.href);
      }
    } catch {}
  });
  return {
    internal_count: internal.length,
    external_count: external.length,
    internal_sample: [...new Set(internal)].slice(0, 10),
    external_sample: [...new Set(external)].slice(0, 10)
  };
}

function getKeywordDensity(text, topN = 10) {
  const words = text.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  const stopWords = new Set(['that','this','with','from','they','have','been','were','will','your',
    'more','also','than','then','when','what','there','their','about','which','would','could','should']);
  const freq = {};
  words.forEach(w => { if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count, density: `${((count / words.length) * 100).toFixed(2)}%` }));
}

function getSchemaTypes($) {
  const types = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const type = json['@type'] || (Array.isArray(json) && json[0]?.['@type']);
      if (type) types.push(type);
    } catch {}
  });
  return types;
}

function getOpenGraph($) {
  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property').replace('og:', '');
    og[prop] = $(el).attr('content') || '';
  });
  return og;
}

function scoresSEO(data) {
  let score = 100;
  const issues = [], warnings = [], passed = [];

  // Title checks
  if (!data.title) { score -= 15; issues.push('Missing page title'); }
  else if (data.title.length < 30) { score -= 5; warnings.push(`Title is short (${data.title.length} chars, recommended 50–60)`); }
  else if (data.title.length > 60) { score -= 3; warnings.push(`Title is long (${data.title.length} chars, recommended 50–60)`); }
  else passed.push('Title length is optimal');

  // Meta description
  if (!data.meta_description) { score -= 10; issues.push('Missing meta description'); }
  else if (data.meta_description.length < 70) { score -= 5; warnings.push('Meta description is too short'); }
  else if (data.meta_description.length > 160) { score -= 3; warnings.push('Meta description is too long (>160 chars)'); }
  else passed.push('Meta description length is optimal');

  // H1
  if (!data.headings.h1 || data.headings.h1.length === 0) { score -= 10; issues.push('Missing H1 tag'); }
  else if (data.headings.h1.length > 1) { score -= 5; warnings.push(`Multiple H1 tags found (${data.headings.h1.length})`); }
  else passed.push('Single H1 tag present');

  // Images
  if (data.images.missing_alt > 0) {
    score -= Math.min(10, data.images.missing_alt * 2);
    warnings.push(`${data.images.missing_alt} images missing alt text`);
  } else if (data.images.total > 0) passed.push('All images have alt text');

  // Canonical
  if (!data.canonical) { score -= 5; warnings.push('No canonical URL specified'); }
  else passed.push('Canonical URL is set');

  // Schema
  if (data.schema_types.length === 0) { warnings.push('No structured data (schema.org) found'); score -= 5; }
  else passed.push(`Structured data found: ${data.schema_types.join(', ')}`);

  // HTTPS
  if (!data.url.startsWith('https')) { score -= 10; issues.push('Page not served over HTTPS'); }
  else passed.push('HTTPS is enabled');

  return { score: Math.max(0, score), grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F', issues, warnings, passed };
}

app.post('/api/seo-audit', async (req, res) => {
  const plan = getPlan(req);
  const { url } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const start = Date.now();
    const { response } = await fetchPage(urlObj);
    const fetchTime = Date.now() - start;
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    const data = {
      url: urlObj.href,
      title: $('title').first().text().trim() || null,
      meta_description: $('meta[name="description"]').attr('content') || null,
      meta_keywords: $('meta[name="keywords"]').attr('content') || null,
      canonical: $('link[rel="canonical"]').attr('href') || null,
      robots_meta: $('meta[name="robots"]').attr('content') || null,
      headings: getHeadings($),
      images: getImages($, urlObj.href),
      links: getLinks($, urlObj.href),
      open_graph: getOpenGraph($),
      schema_types: getSchemaTypes($),
      word_count: bodyText.split(/\s+/).filter(Boolean).length,
      fetch_time_ms: fetchTime,
      html_size_kb: Math.round(html.length / 1024),
    };

    const audit = scoresSEO(data);

    // Build response based on plan
    const result = {
      url: data.url,
      seo_score: audit.score,
      grade: audit.grade,
      issues: audit.issues,
      warnings: audit.warnings,
      passed: audit.passed,
      title: data.title,
      title_length: data.title ? data.title.length : 0,
      meta_description: data.meta_description,
      meta_description_length: data.meta_description ? data.meta_description.length : 0,
      canonical: data.canonical,
      headings: plan === 'free' ? { h1: data.headings.h1 } : data.headings,
      images: data.images,
      word_count: data.word_count,
      ...(plan !== 'free' && {
        links: data.links,
        open_graph: data.open_graph,
        schema_types: data.schema_types,
        robots_meta: data.robots_meta,
        meta_keywords: data.meta_keywords,
        fetch_time_ms: data.fetch_time_ms,
        html_size_kb: data.html_size_kb,
      }),
      ...(( plan === 'ultra' || plan === 'mega') && {
        keyword_density: getKeywordDensity(bodyText),
      }),
      plan
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[seo-audit]', err.message);
    return errorResponse(res, 500, 'Failed to audit this URL');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3012;
  app.listen(PORT, () => console.log(`seo-audit running on port ${PORT}`));
}

module.exports = app;
