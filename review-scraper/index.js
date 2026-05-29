/**
 * /api/review-scraper
 * Scrapes product/business reviews from public review pages.
 * Primary: Trustpilot public consumer API (no auth). Fallback: HTML + schema.org.
 * Supports: Trustpilot, G2, Capterra, Product Hunt, generic schema.org reviews.
 */
const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// Trustpilot public consumer API (no auth needed)
// ──────────────────────────────────────────────

async function fetchTrustpilotAPI(urlStr) {
  try {
    const domainMatch = urlStr.match(/trustpilot\.com\/review\/([^/?#]+)/i);
    const domain = domainMatch ? domainMatch[1] : null;
    if (!domain) return null;

    const buResp = await axios.get(
      `https://www.trustpilot.com/api/categoriespages-frontend-service/business-units/find?name=${encodeURIComponent(domain)}`,
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    );
    const bu = buResp.data;
    if (!bu || !bu.id) return null;

    const score = bu.score || {};
    const aggregateRating = {
      score: score.trustScore || null,
      count: score.numberOfReviews || null,
      best: 5,
    };

    const revResp = await axios.get(
      `https://www.trustpilot.com/api/categoriespages-frontend-service/business-units/${bu.id}/reviews?perPage=20&language=en`,
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    );
    const reviews = ((revResp.data || {}).reviews || []).map(r => ({
      author: r.consumer && r.consumer.displayName ? r.consumer.displayName : 'Anonymous',
      rating: r.stars || null,
      title:  r.title || null,
      body:   (r.text || '').slice(0, 500),
      date:   r.dates && r.dates.publishedDate ? r.dates.publishedDate.split('T')[0] : null,
    }));

    return { platform: 'trustpilot', aggregateRating, reviews, businessName: bu.displayName || domain };
  } catch (e) {
    return null;
  }
}

// ──────────────────────────────────────────────
// Platform-specific HTML scrapers
// ──────────────────────────────────────────────

function scrapeTrustpilot($, html) {
  const reviews = [];
  let aggregateRating = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const data = Array.isArray(json) ? json[0] : json;
      if (data.aggregateRating) {
        aggregateRating = {
          score: parseFloat(data.aggregateRating.ratingValue) || null,
          count: parseInt(data.aggregateRating.reviewCount) || null,
          best:  parseFloat(data.aggregateRating.bestRating) || 5,
        };
      }
      if (data.review) {
        (Array.isArray(data.review) ? data.review : [data.review]).forEach(r => {
          reviews.push({
            author: r.author && r.author.name ? r.author.name : 'Anonymous',
            rating: parseFloat(r.reviewRating && r.reviewRating.ratingValue) || null,
            title:  r.name || null,
            body:   r.reviewBody || null,
            date:   r.datePublished || null,
          });
        });
      }
    } catch (_) {}
  });

  if (reviews.length === 0) {
    $('[data-service-review-card-paper], .review-card, article[class*="review"]').each((_, el) => {
      const rating = $(el).find('[data-rating], [class*="star"]').attr('data-rating') || null;
      const author = $(el).find('[class*="consumer"], [class*="author"]').first().text().trim();
      const title  = $(el).find('h2, [class*="title"]').first().text().trim();
      const body   = $(el).find('p, [class*="text"], [class*="body"]').first().text().trim();
      const date   = $(el).find('time').attr('datetime') || $(el).find('time').text().trim();
      if (author || body) reviews.push({ author: author || 'Anonymous', rating, title, body, date });
    });
  }

  return { platform: 'trustpilot', aggregateRating, reviews };
}

function scrapeG2($) {
  const reviews = [];
  let aggregateRating = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const data = Array.isArray(json) ? json[0] : json;
      if (data.aggregateRating) {
        aggregateRating = {
          score: parseFloat(data.aggregateRating.ratingValue) || null,
          count: parseInt(data.aggregateRating.reviewCount) || null,
          best: 5,
        };
      }
    } catch (_) {}
  });

  $('[itemprop="review"], .paper, [class*="review-card"]').each((_, el) => {
    const author = $(el).find('[itemprop="author"], [class*="reviewer"]').first().text().trim();
    const rating = parseFloat($(el).find('[itemprop="ratingValue"]').attr('content') || '0') || null;
    const title  = $(el).find('[itemprop="name"], [class*="title"]').first().text().trim();
    const body   = $(el).find('[itemprop="reviewBody"], p').first().text().trim().slice(0, 500);
    const date   = $(el).find('time').attr('datetime') || null;
    if (author || body) reviews.push({ author: author || 'Anonymous', rating, title, body, date });
  });

  return { platform: 'g2', aggregateRating, reviews };
}

function scrapeGenericSchema($, urlStr) {
  const reviews = [];
  let aggregateRating = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const items = Array.isArray(json) ? json : [json];
      items.forEach(data => {
        if (data.aggregateRating && !aggregateRating) {
          aggregateRating = {
            score: parseFloat(data.aggregateRating.ratingValue) || null,
            count: parseInt(data.aggregateRating.reviewCount || data.aggregateRating.ratingCount) || null,
            best:  parseFloat(data.aggregateRating.bestRating) || 5,
          };
        }
        const revList = data.review || data.reviews || [];
        (Array.isArray(revList) ? revList : [revList]).forEach(r => {
          if (!r || typeof r !== 'object') return;
          reviews.push({
            author: (r.author && (r.author.name || r.author)) || 'Anonymous',
            rating: parseFloat((r.reviewRating && r.reviewRating.ratingValue) || r.ratingValue) || null,
            title:  r.name || r.headline || null,
            body:   (r.reviewBody || r.description || '').slice(0, 500),
            date:   r.datePublished || null,
          });
        });
      });
    } catch (_) {}
  });

  if (!aggregateRating) {
    const rv = $('[itemprop="ratingValue"]').first().attr('content') || $('[itemprop="ratingValue"]').first().text();
    const rc = $('[itemprop="reviewCount"]').first().attr('content') || $('[itemprop="reviewCount"]').first().text();
    if (rv) aggregateRating = { score: parseFloat(rv), count: parseInt(rc) || null, best: 5 };
  }

  let platform = 'generic';
  if (urlStr.includes('trustpilot.com'))  platform = 'trustpilot';
  else if (urlStr.includes('g2.com'))     platform = 'g2';
  else if (urlStr.includes('capterra.com'))    platform = 'capterra';
  else if (urlStr.includes('producthunt.com')) platform = 'producthunt';
  else if (urlStr.includes('yelp.com'))        platform = 'yelp';
  else if (urlStr.includes('tripadvisor.com')) platform = 'tripadvisor';

  return { platform, aggregateRating, reviews };
}

function computeSentiment(reviews) {
  let positive = 0, neutral = 0, negative = 0;
  reviews.forEach(r => {
    if (r.rating === null) return;
    if (r.rating >= 4) positive++;
    else if (r.rating >= 3) neutral++;
    else negative++;
  });
  const total = positive + neutral + negative;
  return {
    positive,
    neutral,
    negative,
    positive_pct: total > 0 ? Math.round((positive / total) * 100) + '%' : 'N/A',
  };
}

app.post('/api/review-scraper', async (req, res) => {
  const plan = getPlan(req);
  const { url } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const urlStr = urlObj.href;
    let scraped;

    // ── Try Trustpilot public API first ──────────────────────────────────────
    if (urlStr.includes('trustpilot.com')) {
      const apiResult = await fetchTrustpilotAPI(urlStr);
      if (apiResult && (apiResult.aggregateRating || apiResult.reviews.length > 0)) {
        scraped = apiResult;
      } else {
        const { response } = await fetchPage(urlObj);
        const html = typeof response.data === 'string' ? response.data : '';
        scraped = scrapeTrustpilot(cheerio.load(html), html);
      }
    } else {
      const { response } = await fetchPage(urlObj);
      const html = typeof response.data === 'string' ? response.data : '';
      const $ = cheerio.load(html);
      if (urlStr.includes('g2.com')) scraped = scrapeG2($);
      else scraped = scrapeGenericSchema($, urlStr);
    }

    const maxReviews = plan === 'free' ? 3 : plan === 'pro' ? 10 : 25;
    const reviews = scraped.reviews.slice(0, maxReviews);
    const sentiment = plan !== 'free' ? computeSentiment(scraped.reviews) : undefined;

    const result = {
      url: urlStr,
      platform: scraped.platform,
      aggregate_rating: scraped.aggregateRating,
      reviews_returned: reviews.length,
      reviews,
      ...(plan !== 'free' && { sentiment_breakdown: sentiment }),
      plan,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[review-scraper]', err.message);
    return errorResponse(res, 500, 'Failed to scrape reviews from this URL');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3015;
  app.listen(PORT, () => console.log('review-scraper running on port ' + PORT));
}

module.exports = app;
