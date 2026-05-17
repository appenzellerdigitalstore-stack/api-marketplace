/**
 * /api/robots-analyzer
 * Fetches and parses the robots.txt of any domain.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const { normalizeUrl, fetchPublicUrl, errorResponse, USER_AGENT } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

function parseRobotsTxt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const groups = [];
  let current = null;

  for (const line of lines) {
    const [field, ...rest] = line.split(':');
    const key = field.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { user_agents: [], allow: [], disallow: [], crawl_delay: null, rules: [] };
        groups.push(current);
      }
      current.user_agents.push(value);
    } else if (current) {
      if (key === 'disallow' && value) { current.disallow.push(value); current.rules.push({ directive: 'Disallow', path: value }); }
      else if (key === 'allow' && value) { current.allow.push(value); current.rules.push({ directive: 'Allow', path: value }); }
      else if (key === 'crawl-delay') current.crawl_delay = parseFloat(value) || null;
    }
  }

  const sitemaps = [];
  const sitemapRegex = /^sitemap:\s*(.+)$/gim;
  let m;
  while ((m = sitemapRegex.exec(text)) !== null) sitemaps.push(m[1].trim());

  return { groups, sitemaps };
}

app.post('/api/robots-analyzer', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  const robotsUrl = `${urlObj.protocol}//${urlObj.hostname}/robots.txt`;

  try {
    const { response } = await fetchPublicUrl(new URL(robotsUrl), {
      timeout: 8000,
      headers: { 'User-Agent': USER_AGENT }
    });

    if (response.status === 404) {
      const full = {
        success: true,
        domain: urlObj.hostname,
        robots_url: robotsUrl,
        found: false,
        message: 'No robots.txt found — all crawlers are allowed by default',
        groups: [],
        sitemaps: [],
        insights: [{ type: 'warning', message: 'No robots.txt — consider adding one to guide crawlers and declare your sitemap' }],
        raw: null,
        analyzed_at: new Date().toISOString()
      };
      return res.json(filterByPlan(full, plan, 'robots-analyzer'));
    }

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const { groups, sitemaps } = parseRobotsTxt(raw);

    const insights = [];
    const wildcardGroup = groups.find(g => g.user_agents.includes('*'));
    if (wildcardGroup) {
      if (wildcardGroup.disallow.includes('/')) {
        insights.push({ type: 'fail', message: 'All crawlers are blocked from the entire site (Disallow: /)' });
      } else if (wildcardGroup.disallow.length === 0 && wildcardGroup.allow.length === 0) {
        insights.push({ type: 'info', message: 'Wildcard agent has no restrictions — full crawl allowed' });
      }
      if (wildcardGroup.crawl_delay) {
        insights.push({ type: 'info', message: `Crawl delay set to ${wildcardGroup.crawl_delay}s for all bots` });
      }
    }
    if (sitemaps.length === 0) {
      insights.push({ type: 'warning', message: 'No sitemap declared in robots.txt — add a Sitemap: directive' });
    } else {
      insights.push({ type: 'pass', message: `${sitemaps.length} sitemap(s) declared` });
    }
    const totalDisallowed = groups.reduce((n, g) => n + g.disallow.length, 0);
    if (totalDisallowed > 20) {
      insights.push({ type: 'info', message: `${totalDisallowed} disallow rules found — review for over-blocking` });
    }

    const full = {
      success: true,
      domain: urlObj.hostname,
      robots_url: robotsUrl,
      found: true,
      status_code: response.status,
      size_bytes: Buffer.byteLength(raw, 'utf8'),
      groups,
      sitemaps,
      insights,
      raw,
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'robots-analyzer'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch robots.txt', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`robots-analyzer running on port ${PORT}`));
}

module.exports = app;
