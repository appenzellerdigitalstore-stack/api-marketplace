const cheerio = require('cheerio');
const axios = require('axios');
const tls = require('tls');

// Inline the utils so no server needed
function normalizeUrl(rawUrl) {
  const value = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  return parsed;
}

async function fetchPage(urlObj) {
  const start = Date.now();
  const response = await axios.get(urlObj.href, {
    timeout: 12000, maxRedirects: 5, proxy: false, validateStatus: () => true,
    headers: { 'User-Agent': 'SiteTraceAPI/1.0', 'Accept': 'text/html' },
    maxContentLength: 3 * 1024 * 1024
  });
  return { response, responseTimeMs: Date.now() - start };
}

async function runTest(url) {
  const urlObj = normalizeUrl(url);
  const { response, responseTimeMs } = await fetchPage(urlObj);
  const html = response.data || '';
  const $ = cheerio.load(html);
  return {
    url,
    status: response.status,
    responseTimeMs,
    title: $('title').first().text().trim(),
    metaDesc: $('meta[name="description"]').attr('content') || null,
    h1Count: $('h1').length,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    viewport: !!$('meta[name="viewport"]').attr('content'),
    lang: $('html').attr('lang') || null,
    wordCount: $('body').text().replace(/\s+/g,' ').trim().split(' ').filter(Boolean).length,
    images: $('img').length,
    ogTitle: $('meta[property="og:title"]').attr('content') || null,
    ogImage: $('meta[property="og:image"]').attr('content') || null
  };
}

(async () => {
  const tests = ['https://example.com', 'https://github.com', 'https://stripe.com'];
  for (const url of tests) {
    try {
      const r = await runTest(url);
      console.log(JSON.stringify(r, null, 2));
    } catch(e) {
      console.log(`FAIL ${url}: ${e.message}`);
    }
  }
})();
