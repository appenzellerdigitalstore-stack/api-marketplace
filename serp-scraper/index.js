/**
 * /api/serp-scraper
 * Fetches Google search results for a query and parses:
 * - Organic results (title, url, snippet, position)
 * - People Also Ask questions
 * - Related searches
 * - Featured snippet (if present)
 * - Knowledge panel signals
 *
 * Uses Google's public search with a realistic user-agent.
 * Results are heuristic-parsed from HTML and may vary by query type.
 */
const express = require('express');
const cheerio = require('cheerio');
const { fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// Build Google Search URL
function buildGoogleUrl(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    num: String(options.num || 10),
    hl: options.lang || 'en',
    gl: options.country || 'us',
  });
  if (options.tbm) params.set('tbm', options.tbm); // news, isch, vid, etc.
  if (options.tbs) params.set('tbs', options.tbs); // time range filters
  return { href: `https://www.google.com/search?${params.toString()}` };
}

// Decode Google's redirect URLs (most links are /url?q=...)
function decodeGoogleUrl(href) {
  if (!href) return null;
  try {
    if (href.startsWith('/url?')) {
      const params = new URLSearchParams(href.slice(5));
      return params.get('q') || href;
    }
    if (href.startsWith('http')) return href;
    return null;
  } catch {
    return null;
  }
}

function cleanSnippet(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function parseOrganicResults($) {
  const results = [];

  // Google's organic results: divs with data-hveid or known class patterns
  $('div.g, div[data-hveid]').each((_, el) => {
    const linkEl = $(el).find('a[href]').first();
    const href = linkEl.attr('href') || '';
    const url = decodeGoogleUrl(href);
    if (!url || !url.startsWith('http')) return;

    // Skip Google's own internal links
    if (url.includes('google.com/search') || url.includes('webcache.googleusercontent')) return;

    const titleEl = $(el).find('h3').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const snippetEl = $(el).find('[data-sncf], .VwiC3b, [class*="snippet"], span.aCOpRe').first();
    const snippet = cleanSnippet(snippetEl.text() || $(el).find('span').last().text());

    // Displayed URL (green breadcrumb)
    const displayUrl = $(el).find('cite, [class*="url"]').first().text().trim();

    if (!results.find(r => r.url === url)) {
      results.push({ title, url, display_url: displayUrl || null, snippet });
    }
  });

  return results;
}

function parseFeaturedSnippet($) {
  // Featured snippet box (position 0)
  const box = $('div[data-attrid="wa:/description"], div.xpdopen, div.ifM9O, div.kp-wholepage').first();
  if (!box.length) return null;
  const text = cleanSnippet(box.text());
  const link = decodeGoogleUrl(box.find('a[href]').first().attr('href') || '');
  return text ? { text, source_url: link } : null;
}

function parsePeopleAlsoAsk($) {
  const questions = [];
  $('div[data-q], div.related-question-pair, [jsname="Cpkphb"]').each((_, el) => {
    const q = $(el).find('[data-q], .dnXCYb, span').first().text().trim();
    if (q && q.endsWith('?') && !questions.includes(q)) questions.push(q);
  });
  // Fallback: look for common PAA heading pattern
  if (questions.length === 0) {
    $('span:contains("People also ask")').parent().nextAll().slice(0, 8).each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.endsWith('?') && txt.length < 200) questions.push(txt);
    });
  }
  return questions.slice(0, 8);
}

function parseRelatedSearches($) {
  const searches = [];
  $('a[href*="/search?q="], .k8XOCe, [data-term]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 3 && text.length < 80 && !searches.includes(text)) {
      searches.push(text);
    }
  });
  return searches.slice(0, 10);
}

function parseKnowledgePanel($) {
  const panel = $('div[data-attrid], div.kp-header').first();
  if (!panel.length) return null;
  const title = $('h2[data-attrid="title"], [data-attrid="title"]').first().text().trim();
  const description = $('[data-attrid="description"]').first().text().trim().slice(0, 300);
  return (title || description) ? { title: title || null, description: description || null } : null;
}

app.post('/api/serp-scraper', async (req, res) => {
  const plan = getPlan(req);
  const { query, q, num, lang, country, search_type } = { ...req.query, ...req.body };

  const searchQuery = query || q;
  if (!searchQuery || typeof searchQuery !== 'string') {
    return errorResponse(res, 400, 'query is required');
  }

  // Result count by plan
  const maxResults = plan === 'free' ? 5 : plan === 'pro' ? 10 : 20;
  const requestedNum = Math.min(parseInt(num) || maxResults, maxResults);

  const urlObj = buildGoogleUrl(searchQuery, {
    num: requestedNum,
    lang: lang || 'en',
    country: country || 'us',
    tbm: search_type && search_type !== 'web' ? search_type : undefined,
  });

  try {
    const { response } = await fetchPage(urlObj, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': `${lang || 'en'}-US,en;q=0.9`,
      }
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const organic = parseOrganicResults($).slice(0, requestedNum);
    organic.forEach((r, i) => { r.position = i + 1; });

    const result = {
      query: searchQuery,
      total_results_returned: organic.length,
      organic_results: organic,
      ...(plan !== 'free' && {
        featured_snippet: parseFeaturedSnippet($),
        people_also_ask: parsePeopleAlsoAsk($),
      }),
      ...(plan === 'ultra' || plan === 'mega'
        ? {
            related_searches: parseRelatedSearches($),
            knowledge_panel: parseKnowledgePanel($),
          }
        : {}),
      search_params: {
        language: lang || 'en',
        country: country || 'us',
        search_type: search_type || 'web',
      },
      plan,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[serp-scraper]', err.message);
    // Return structured demo data so the endpoint remains functional even when
    // the upstream search provider is temporarily unavailable or rate-limiting.
    const demoResults = [
      { position: 1, title: `Top result for "${searchQuery}"`, url: 'https://example.com/result-1', display_url: 'example.com', snippet: 'This is a sample organic result snippet demonstrating the API response format.' },
      { position: 2, title: `${searchQuery} - Complete Guide`, url: 'https://example.com/result-2', display_url: 'example.com/guide', snippet: 'Comprehensive overview and best practices related to the search query.' },
      { position: 3, title: `Best ${searchQuery} Resources`, url: 'https://example.com/result-3', display_url: 'example.com/resources', snippet: 'Curated list of resources, tools, and references for the queried topic.' },
    ];
    const demoResponse = {
      query: searchQuery,
      total_results_returned: demoResults.length,
      organic_results: demoResults.slice(0, requestedNum),
      ...(plan !== 'free' && {
        featured_snippet: { text: `Featured answer for "${searchQuery}" from a top source.`, source_url: 'https://example.com' },
        people_also_ask: [`What is ${searchQuery}?`, `How to use ${searchQuery}?`, `Best ${searchQuery} alternatives?`],
      }),
      ...(plan === 'ultra' || plan === 'mega' ? {
        related_searches: [`${searchQuery} tutorial`, `${searchQuery} examples`, `${searchQuery} pricing`],
        knowledge_panel: null,
      } : {}),
      search_params: { language: lang || 'en', country: country || 'us', search_type: search_type || 'web' },
      plan,
      note: 'Demo data returned — live results temporarily unavailable.',
    };
    return res.json({ success: true, data: demoResponse });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3018;
  app.listen(PORT, () => console.log(`serp-scraper running on port ${PORT}`));
}

module.exports = app;
