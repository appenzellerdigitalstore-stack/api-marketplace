/**
 * /api/meta-preview
 * Returns all social preview metadata: Open Graph, Twitter Card, LinkedIn, Slack previews.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

app.post('/api/meta-preview', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim() || null;
    const metaDesc = $('meta[name="description"]').attr('content') || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const favicon = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first().attr('href') || null;

    const og = {};
    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property').replace('og:', '');
      og[prop] = $(el).attr('content') || null;
    });

    const twitter = {};
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr('name').replace('twitter:', '');
      twitter[name] = $(el).attr('content') || null;
    });

    const article = {};
    $('meta[property^="article:"]').each((_, el) => {
      const prop = $(el).attr('property').replace('article:', '');
      article[prop] = $(el).attr('content') || null;
    });

    const resolveImage = (src) => {
      if (!src) return null;
      if (/^https?:\/\//i.test(src)) return src;
      try { return new URL(src, urlObj.href).href; } catch { return src; }
    };

    const fbPreview = {
      title: og.title || title,
      description: og.description || metaDesc,
      image: resolveImage(og.image),
      url: og.url || canonical || urlObj.href,
      site_name: og['site_name'] || urlObj.hostname,
      type: og.type || 'website'
    };
    const twitterPreview = {
      card: twitter.card || 'summary',
      title: twitter.title || og.title || title,
      description: twitter.description || og.description || metaDesc,
      image: resolveImage(twitter.image || og.image),
      site: twitter.site || null,
      creator: twitter.creator || null
    };
    const linkedinPreview = {
      title: og.title || title,
      description: og.description || metaDesc,
      image: resolveImage(og.image),
      url: og.url || urlObj.href
    };
    const slackPreview = {
      title: og.title || title,
      description: og.description || metaDesc,
      image: resolveImage(og.image)
    };

    const issues = [];
    if (!og.title) issues.push({ type: 'warning', field: 'og:title', message: 'Missing og:title — platforms will fall back to page title' });
    if (!og.description) issues.push({ type: 'warning', field: 'og:description', message: 'Missing og:description — preview snippet may look poor' });
    if (!og.image) issues.push({ type: 'fail', field: 'og:image', message: 'Missing og:image — links will share without a preview image' });
    if (!twitter.card) issues.push({ type: 'info', field: 'twitter:card', message: 'No Twitter Card type declared' });
    if (!twitter.image && !og.image) issues.push({ type: 'warning', field: 'twitter:image', message: 'No image for Twitter/X preview' });
    if (!og['site_name']) issues.push({ type: 'info', field: 'og:site_name', message: 'og:site_name not set' });

    const completenessScore = Math.max(0, 100 - issues.reduce((n, i) =>
      n + (i.type === 'fail' ? 20 : i.type === 'warning' ? 10 : 5), 0));

    const full = {
      success: true,
      url: urlObj.href,
      status_code: response.status,
      completeness_score: completenessScore,
      basic: {
        title,
        description: metaDesc,
        canonical,
        favicon: resolveImage(favicon)
      },
      open_graph: og,
      twitter_card: twitter,
      article_meta: Object.keys(article).length > 0 ? article : null,
      previews: {
        facebook: fbPreview,
        twitter_x: twitterPreview,
        linkedin: linkedinPreview,
        slack: slackPreview
      },
      issues,
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'meta-preview'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch or parse URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3004;
  app.listen(PORT, () => console.log(`meta-preview running on port ${PORT}`));
}
module.exports = app;
