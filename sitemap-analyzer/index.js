/**
 * /api/sitemap-analyzer
 * Fetches, parses, and analyzes XML sitemaps (including sitemap index files).
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPublicUrl, errorResponse, USER_AGENT } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

async function fetchXml(url) {
  const { response } = await fetchPublicUrl(new URL(url), {
    timeout: 10000,
    accept: 'application/xml,text/xml,*/*',
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/xml,text/xml,*/*' }
  });
  return response;
}

function parseSitemapXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const isSitemapIndex = $('sitemapindex').length > 0;

  if (isSitemapIndex) {
    const childSitemaps = $('sitemap loc').map((_, el) => $(el).text().trim()).get();
    return { type: 'index', child_sitemaps: childSitemaps, urls: [] };
  }

  const urls = [];
  $('url').each((_, el) => {
    const loc = $(el).find('loc').text().trim();
    const lastmod = $(el).find('lastmod').text().trim() || null;
    const changefreq = $(el).find('changefreq').text().trim() || null;
    const priority = $(el).find('priority').text().trim() || null;
    if (loc) urls.push({ loc, lastmod, changefreq, priority: priority ? parseFloat(priority) : null });
  });

  return { type: 'urlset', child_sitemaps: [], urls };
}

app.post('/api/sitemap-analyzer', async (req, res) => {
  const plan = getPlan(req);
  const { url, max_urls = 500 } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  const candidates = [
    `${urlObj.protocol}//${urlObj.hostname}/sitemap.xml`,
    `${urlObj.protocol}//${urlObj.hostname}/sitemap_index.xml`,
    `${urlObj.protocol}//${urlObj.hostname}/sitemap-index.xml`
  ];

  try {
    const { response: robotsRes } = await fetchPublicUrl(new URL(`${urlObj.protocol}//${urlObj.hostname}/robots.txt`), {
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT }
    });
    if (robotsRes.status === 200 && typeof robotsRes.data === 'string') {
      const matches = robotsRes.data.match(/^sitemap:\s*(.+)$/gim) || [];
      for (const m of matches) {
        const sitemapUrl = m.replace(/^sitemap:\s*/i, '').trim();
        if (!candidates.includes(sitemapUrl)) candidates.unshift(sitemapUrl);
      }
    }
  } catch (_) {}

  let sitemapUrl = null;
  let rawXml = null;
  let statusCode = null;

  for (const candidate of candidates) {
    try {
      const resp = await fetchXml(candidate);
      if (resp.status === 200 && typeof resp.data === 'string' && resp.data.includes('<')) {
        sitemapUrl = candidate;
        rawXml = resp.data;
        statusCode = resp.status;
        break;
      }
    } catch (_) {}
  }

  if (!rawXml) {
    const full = {
      success: true,
      domain: urlObj.hostname,
      found: false,
      message: 'No sitemap found. Tried /sitemap.xml, /sitemap_index.xml, and robots.txt hints.',
      candidates_tried: candidates,
      analyzed_at: new Date().toISOString()
    };
    return res.json(filterByPlan(full, plan, 'sitemap-analyzer'));
  }

  const parsed = parseSitemapXml(rawXml);
  const urls = parsed.urls.slice(0, Math.min(max_urls, 2000));

  const insights = [];
  if (parsed.type === 'index') {
    insights.push({ type: 'info', message: `This is a sitemap index with ${parsed.child_sitemaps.length} child sitemap(s)` });
  }
  if (urls.length > 0) {
    const withLastmod = urls.filter(u => u.lastmod).length;
    const withPriority = urls.filter(u => u.priority !== null).length;
    insights.push({ type: 'pass', message: `${parsed.urls.length} URL(s) found in sitemap` });
    if (withLastmod < urls.length * 0.5) {
      insights.push({ type: 'warning', message: `Only ${withLastmod}/${urls.length} URLs have a lastmod date — add lastmod for better crawl efficiency` });
    }
    if (withPriority === 0) {
      insights.push({ type: 'info', message: 'No priority values set — search engines default to 0.5 for all pages' });
    }
    const uniqueDomains = [...new Set(urls.map(u => { try { return new URL(u.loc).hostname; } catch { return null; } }).filter(Boolean))];
    if (uniqueDomains.length > 1) {
      insights.push({ type: 'warning', message: `URLs span ${uniqueDomains.length} different domains — check for cross-domain sitemap entries` });
    }
  }

  const full = {
    success: true,
    domain: urlObj.hostname,
    sitemap_url: sitemapUrl,
    status_code: statusCode,
    found: true,
    type: parsed.type,
    total_urls: parsed.urls.length,
    returned_urls: urls.length,
    child_sitemaps: parsed.child_sitemaps,
    urls,
    insights,
    analyzed_at: new Date().toISOString()
  };

  return res.json(filterByPlan(full, plan, 'sitemap-analyzer'));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3003;
  app.listen(PORT, () => console.log(`sitemap-analyzer running on port ${PORT}`));
}
module.exports = app;
