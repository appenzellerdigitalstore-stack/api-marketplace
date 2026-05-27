/**
 * /api/web-summarizer
 * Given any URL, extracts clean readable content and returns an AI-style summary,
 * key points, reading time, author, publish date, and word count.
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

function extractMainContent($) {
  // Remove noise
  $('script,style,noscript,header,footer,nav,aside,[class*="sidebar"],[class*="menu"],[class*="ad-"],[id*="sidebar"],[id*="nav"]').remove();

  // Try known content containers first
  const selectors = ['article', '[role="main"]', 'main', '.post-content', '.entry-content', '.article-body', '#content', '.content'];
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el.text().replace(/\s+/g, ' ').trim();
  }
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractMeta($) {
  return {
    title: $('title').first().text().trim() ||
           $('meta[property="og:title"]').attr('content') || null,
    description: $('meta[name="description"]').attr('content') ||
                 $('meta[property="og:description"]').attr('content') || null,
    author: $('meta[name="author"]').attr('content') ||
            $('[rel="author"]').first().text().trim() ||
            $('[class*="author"]').first().text().trim().slice(0, 60) || null,
    published: $('meta[property="article:published_time"]').attr('content') ||
               $('time[datetime]').attr('datetime') ||
               $('time').first().attr('datetime') || null,
    image: $('meta[property="og:image"]').attr('content') || null,
    site_name: $('meta[property="og:site_name"]').attr('content') || null,
  };
}

function simpleSummarize(text, sentences = 3) {
  // Split into sentences and score by position + keyword richness
  const sentList = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentList.length <= sentences) return sentList.join(' ').trim();

  // Score: first sentences get priority, longer sentences score higher
  const scored = sentList.map((s, i) => ({
    text: s.trim(),
    score: (sentList.length - i) * 0.3 + s.split(' ').length * 0.7
  }));

  // Take top N by score, re-sort by original order
  const top = scored
    .filter(s => s.text.split(' ').length > 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, sentences);

  // Restore original order
  const topTexts = new Set(top.map(s => s.text));
  return sentList.filter(s => topTexts.has(s.trim())).join(' ').trim();
}

function extractKeyPoints(text, count = 5) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || [])
    .map(s => s.trim())
    .filter(s => s.split(' ').length >= 8 && s.split(' ').length <= 40);

  if (sentences.length <= count) return sentences;

  // Spread evenly through the document for diverse coverage
  const step = Math.floor(sentences.length / count);
  return Array.from({ length: count }, (_, i) => sentences[i * step]).filter(Boolean);
}

app.post('/api/web-summarizer', async (req, res) => {
  const plan = getPlan(req);
  const { url } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const meta = extractMeta($);
    const content = extractMainContent($);
    const words = content.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

    // Summary length by plan
    const summarySentences = plan === 'free' ? 2 : plan === 'pro' ? 3 : 5;
    const keyPointCount = plan === 'free' ? 3 : plan === 'pro' ? 5 : 8;

    const result = {
      url: urlObj.href,
      title: meta.title,
      summary: simpleSummarize(content, summarySentences),
      key_points: plan === 'free' ? undefined : extractKeyPoints(content, keyPointCount),
      word_count: wordCount,
      reading_time_min: readingTimeMin,
      author: meta.author,
      published_date: meta.published,
      site_name: meta.site_name,
      featured_image: meta.image,
      meta_description: plan === 'free' ? undefined : meta.description,
      raw_excerpt: (plan === 'ultra' || plan === 'mega')
        ? content.slice(0, 1500)
        : undefined,
      plan
    };

    // Clean undefined
    Object.keys(result).forEach(k => result[k] === undefined && delete result[k]);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[web-summarizer]', err.message);
    return errorResponse(res, 500, 'Failed to summarize this URL');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3013;
  app.listen(PORT, () => console.log(`web-summarizer running on port ${PORT}`));
}

module.exports = app;
