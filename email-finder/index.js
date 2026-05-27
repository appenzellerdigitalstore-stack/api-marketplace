/**
 * /api/email-finder
 * Given a domain, discovers business email addresses through:
 *  - Multi-page crawl (home, contact, about, team pages)
 *  - Common pattern generation (info@, contact@, hello@, etc.)
 *  - MX record verification for deliverability
 *  - Confidence scoring for each result
 */
const express = require('express');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,7}/g;

const COMMON_PATTERNS = [
  'info', 'contact', 'hello', 'support', 'sales', 'admin',
  'help', 'team', 'press', 'media', 'hr', 'jobs', 'careers',
  'legal', 'privacy', 'billing', 'marketing', 'partnerships'
];

const CONTACT_PATHS = [
  '', '/contact', '/contact-us', '/about', '/about-us',
  '/team', '/company', '/support', '/help', '/get-in-touch'
];

const JUNK_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','svg','webp','ico','css','js',
  'woff','woff2','ttf','eot','pdf','zip','mp4','mp3'
]);

function cleanEmails(emails, domain) {
  return [...new Set(emails)].filter(e => {
    const ext = e.split('.').pop().toLowerCase();
    if (JUNK_EXTENSIONS.has(ext)) return false;
    if (e.includes('example.') || e.includes('yourdomain')) return false;
    if (e.includes('sentry.io') || e.includes('cloudflare')) return false;
    if (e.length > 80) return false;
    return true;
  });
}

async function crawlPageForEmails(urlStr) {
  try {
    const urlObj = normalizeUrl(urlStr);
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const found = html.match(EMAIL_RE) || [];
    return found;
  } catch {
    return [];
  }
}

async function checkMX(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

async function findEmails(domain, plan) {
  const allFound = new Set();

  // Determine how many pages to crawl per plan
  const maxPages = plan === 'free' ? 2 : plan === 'pro' ? 4 : CONTACT_PATHS.length;
  const pathsToTry = CONTACT_PATHS.slice(0, maxPages);

  // Crawl pages
  for (const path of pathsToTry) {
    const emails = await crawlPageForEmails(`https://${domain}${path}`);
    emails.forEach(e => allFound.add(e.toLowerCase()));
  }

  // Clean crawled emails
  const crawledEmails = cleanEmails([...allFound], domain).filter(e =>
    e.endsWith(`@${domain}`) || e.endsWith(`@www.${domain}`)
  );

  // MX verification
  const hasMX = await checkMX(domain);

  // Generate common pattern emails (pro+ only)
  let patternEmails = [];
  if (plan !== 'free') {
    const maxPatterns = plan === 'pro' ? 6 : COMMON_PATTERNS.length;
    patternEmails = COMMON_PATTERNS.slice(0, maxPatterns).map(p => ({
      email: `${p}@${domain}`,
      source: 'pattern',
      confidence: hasMX ? 'medium' : 'low',
      verified: false
    }));
    // Remove pattern emails that were actually found on the site
    const crawledSet = new Set(crawledEmails);
    patternEmails = patternEmails.filter(p => !crawledSet.has(p.email));
  }

  // Build crawled result objects
  const crawledResults = crawledEmails.map(e => ({
    email: e,
    source: 'crawled',
    confidence: hasMX ? 'high' : 'medium',
    verified: false
  }));

  return {
    domain,
    mx_records_found: hasMX,
    emails_found: crawledResults,
    pattern_emails: patternEmails,
    total_crawled: crawledResults.length,
    pages_checked: pathsToTry.map(p => `https://${domain}${p}`)
  };
}

app.post('/api/email-finder', async (req, res) => {
  const plan = getPlan(req);
  let { domain, url } = req.body;

  // Accept domain or URL
  if (!domain && url) {
    try {
      const u = normalizeUrl(url);
      domain = u.hostname.replace(/^www\./, '');
    } catch (e) {
      return errorResponse(res, 400, 'Invalid URL provided');
    }
  }

  if (!domain || typeof domain !== 'string') {
    return errorResponse(res, 400, 'domain is required (e.g. "example.com")');
  }

  domain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  try {
    const result = await findEmails(domain, plan);

    // Plan-based field filtering
    const response = filterByPlan({
      domain: result.domain,
      mx_records_found: result.mx_records_found,
      emails_found: result.emails_found,
      ...(plan !== 'free' && { pattern_emails: result.pattern_emails }),
      ...(plan === 'ultra' || plan === 'mega' ? { pages_checked: result.pages_checked } : {}),
      total_crawled: result.total_crawled,
      plan
    }, plan);

    res.json({ success: true, data: response });
  } catch (err) {
    console.error('[email-finder]', err.message);
    return errorResponse(res, 500, 'Failed to find emails for this domain');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3011;
  app.listen(PORT, () => console.log(`email-finder running on port ${PORT}`));
}

module.exports = app;
