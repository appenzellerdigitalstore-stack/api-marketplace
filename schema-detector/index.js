/**
 * /api/schema-detector
 * Detects and parses all structured data (JSON-LD, Microdata, RDFa) on a page.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

const RICH_RESULT_TYPES = [
  'Article', 'NewsArticle', 'BlogPosting', 'WebPage', 'WebSite',
  'Organization', 'LocalBusiness', 'Person', 'Product', 'Offer',
  'Review', 'AggregateRating', 'FAQPage', 'HowTo', 'Recipe',
  'Event', 'BreadcrumbList', 'SiteLinksSearchBox', 'VideoObject',
  'ImageObject', 'JobPosting', 'Course', 'Book', 'MusicAlbum',
  'SoftwareApplication', 'MedicalCondition'
];

function extractJsonLd($) {
  const results = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        results.push({
          format: 'JSON-LD',
          type: item['@type'] || null,
          context: item['@context'] || null,
          data: item
        });
      }
    } catch (e) {
      results.push({ format: 'JSON-LD', type: null, parse_error: e.message, raw: raw.slice(0, 200) });
    }
  });
  return results;
}

function extractMicrodata($) {
  const results = [];
  $('[itemscope]').each((_, el) => {
    const type = $(el).attr('itemtype') || null;
    const props = {};
    $(el).find('[itemprop]').each((__, propEl) => {
      const name = $(propEl).attr('itemprop');
      const value = $(propEl).attr('content') || $(propEl).attr('href') || $(propEl).text().trim();
      if (name) props[name] = value;
    });
    results.push({ format: 'Microdata', type, properties: props });
  });
  return results;
}

app.post('/api/schema-detector', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const jsonLd = extractJsonLd($);
    const microdata = extractMicrodata($);
    const allSchemas = [...jsonLd, ...microdata];

    const detectedTypes = [...new Set(allSchemas.map(s => s.type).filter(Boolean))];
    const richResultEligible = detectedTypes.filter(t =>
      RICH_RESULT_TYPES.some(r => t === r || t.includes(r))
    );

    const insights = [];
    if (allSchemas.length === 0) {
      insights.push({ type: 'warning', message: 'No structured data found — add JSON-LD to unlock Google rich results' });
    } else {
      insights.push({ type: 'pass', message: `${allSchemas.length} schema block(s) detected` });
    }
    if (richResultEligible.length > 0) {
      insights.push({ type: 'pass', message: `Rich result eligible types: ${richResultEligible.join(', ')}` });
    }
    const parseErrors = jsonLd.filter(s => s.parse_error);
    if (parseErrors.length > 0) {
      insights.push({ type: 'fail', message: `${parseErrors.length} JSON-LD block(s) failed to parse — fix syntax errors immediately` });
    }
    const faq = jsonLd.find(s => s.type === 'FAQPage');
    if (faq) {
      const questions = (faq.data && faq.data.mainEntity) ? faq.data.mainEntity : [];
      insights.push({ type: 'info', message: `FAQPage schema found with ${questions.length} question(s)` });
    }
    if (allSchemas.length > 0 && richResultEligible.length === 0) {
      insights.push({ type: 'warning', message: 'Schema types found but none are Google rich result eligible — consider adding Product, Article, FAQPage, or Organization' });
    }

    const full = {
      success: true,
      url: urlObj.href,
      status_code: response.status,
      schema_count: allSchemas.length,
      detected_types: detectedTypes,
      rich_result_eligible: richResultEligible,
      schemas: allSchemas,
      insights,
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'schema-detector'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch or analyze URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => console.log(`schema-detector running on port ${PORT}`));
}
module.exports = app;
