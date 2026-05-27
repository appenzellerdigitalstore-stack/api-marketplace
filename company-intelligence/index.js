/**
 * /api/company-intelligence
 * Given a company domain or name, scrapes and returns:
 * - Company description, social links, contact info
 * - Tech stack detection (via meta tags, script srcs, generator tags)
 * - Employee count signals, founding year, industry
 * - Open Graph / Twitter card info
 * - Key pages discovered (careers, blog, press, pricing)
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// Tech stack fingerprints (script src patterns + meta generator)
const TECH_SIGNATURES = [
  { name: 'WordPress',      pattern: /wp-content|wp-includes/i },
  { name: 'Shopify',        pattern: /cdn\.shopify\.com/i },
  { name: 'Wix',            pattern: /static\.wixstatic\.com/i },
  { name: 'Squarespace',    pattern: /squarespace\.com/i },
  { name: 'Webflow',        pattern: /webflow\.com/i },
  { name: 'React',          pattern: /react(?:\.min)?\.js|react-dom/i },
  { name: 'Next.js',        pattern: /_next\/static/i },
  { name: 'Vue.js',         pattern: /vue(?:\.min)?\.js/i },
  { name: 'Angular',        pattern: /angular(?:\.min)?\.js/i },
  { name: 'jQuery',         pattern: /jquery(?:\.min)?\.js/i },
  { name: 'Bootstrap',      pattern: /bootstrap(?:\.min)?\.(?:css|js)/i },
  { name: 'Tailwind CSS',   pattern: /tailwind/i },
  { name: 'Google Analytics', pattern: /google-analytics\.com|gtag\/js|ga\.js/i },
  { name: 'Google Tag Manager', pattern: /googletagmanager\.com/i },
  { name: 'HubSpot',        pattern: /hs-scripts\.com|hubspot\.com/i },
  { name: 'Intercom',       pattern: /intercom\.io|intercomcdn/i },
  { name: 'Stripe',         pattern: /js\.stripe\.com/i },
  { name: 'Cloudflare',     pattern: /cloudflare\.com/i },
  { name: 'AWS',            pattern: /amazonaws\.com/i },
  { name: 'Zendesk',        pattern: /zdassets\.com|zendesk\.com/i },
  { name: 'Salesforce',     pattern: /salesforce\.com|force\.com/i },
  { name: 'Drift',          pattern: /drift\.com/i },
  { name: 'Hotjar',         pattern: /hotjar\.com/i },
  { name: 'Segment',        pattern: /cdn\.segment\.com/i },
  { name: 'Mixpanel',       pattern: /cdn\.mxpnl\.com|mixpanel\.com/i },
];

const SOCIAL_PATTERNS = {
  twitter:   /twitter\.com\/([^/"?\s]+)/i,
  linkedin:  /linkedin\.com\/company\/([^/"?\s]+)/i,
  facebook:  /facebook\.com\/([^/"?\s]+)/i,
  instagram: /instagram\.com\/([^/"?\s]+)/i,
  youtube:   /youtube\.com\/(?:channel\/|c\/|@)([^/"?\s]+)/i,
  github:    /github\.com\/([^/"?\s]+)/i,
};

const KEY_PAGES = [
  { label: 'careers',  paths: ['/careers', '/jobs', '/work-with-us', '/join-us'] },
  { label: 'blog',     paths: ['/blog', '/news', '/articles', '/insights'] },
  { label: 'pricing',  paths: ['/pricing', '/plans', '/packages'] },
  { label: 'press',    paths: ['/press', '/media', '/newsroom'] },
  { label: 'about',    paths: ['/about', '/about-us', '/company'] },
  { label: 'contact',  paths: ['/contact', '/contact-us', '/get-in-touch'] },
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,7}/g;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)/g;

function detectTech(html) {
  return TECH_SIGNATURES
    .filter(t => t.pattern.test(html))
    .map(t => t.name);
}

function extractSocials(html, $) {
  const found = {};
  const allLinks = [];
  $('a[href]').each((_, el) => allLinks.push($(el).attr('href') || ''));
  const searchIn = allLinks.join('\n') + html.slice(0, 50000);

  for (const [platform, re] of Object.entries(SOCIAL_PATTERNS)) {
    const match = searchIn.match(re);
    if (match) {
      found[platform] = `https://${platform === 'twitter' ? 'twitter.com' :
        platform === 'linkedin' ? 'linkedin.com/company' :
        platform === 'facebook' ? 'facebook.com' :
        platform === 'instagram' ? 'instagram.com' :
        platform === 'youtube' ? 'youtube.com' :
        'github.com'}/${match[1]}`;
    }
  }
  return found;
}

function extractCompanyInfo($, html) {
  const title = $('title').first().text().trim();
  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || null;
  const siteName =
    $('meta[property="og:site_name"]').attr('content') || null;
  const logo =
    $('meta[property="og:image"]').attr('content') ||
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') || null;

  // Try to find founding year
  const yearMatch = html.match(/(?:founded|established|since|©)\s*(?:in\s+)?(\d{4})/i);
  const foundingYear = yearMatch ? parseInt(yearMatch[1]) : null;

  // Try to find employee count
  const empMatch = html.match(/(\d[\d,]+)\s*(?:\+\s*)?(?:employees?|team members?|people)/i);
  const employeeCount = empMatch ? empMatch[1].replace(/,/g, '') : null;

  // Extract emails and phones from visible text
  $('script,style,noscript').remove();
  const bodyText = $('body').text();
  const emails = [...new Set((bodyText.match(EMAIL_RE) || [])
    .filter(e => !e.includes('example.') && e.length < 60))].slice(0, 5);
  const phones = [...new Set((bodyText.match(PHONE_RE) || [])
    .map(p => p.trim())
    .filter(p => p.length >= 7))].slice(0, 3);

  return { title, description, siteName, logo, foundingYear, employeeCount, emails, phones };
}

async function checkPageExists(baseUrl, path) {
  try {
    const urlObj = normalizeUrl(baseUrl.replace(/\/$/, '') + path);
    const { response } = await fetchPage(urlObj);
    return response.status === 200;
  } catch {
    return false;
  }
}

app.post('/api/company-intelligence', async (req, res) => {
  const plan = getPlan(req);
  let { domain, url } = req.body;

  // Accept either domain or URL
  if (!domain && url) {
    try {
      const u = normalizeUrl(url);
      domain = u.hostname.replace(/^www\./, '');
    } catch {
      return errorResponse(res, 400, 'Invalid URL');
    }
  }
  if (!domain) return errorResponse(res, 400, 'domain is required');

  domain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const baseUrl = `https://${domain}`;

  try {
    const { response } = await fetchPage(normalizeUrl(baseUrl));
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const info = extractCompanyInfo($, html);
    const tech = detectTech(html);
    const socials = extractSocials(html, $);

    const og = {};
    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property').replace('og:', '');
      og[prop] = $(el).attr('content') || '';
    });

    const twitter = {};
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr('name').replace('twitter:', '');
      twitter[name] = $(el).attr('content') || '';
    });

    // Key page discovery (pro+ only, limit by plan)
    let keyPages = {};
    if (plan !== 'free') {
      const pagesToCheck = plan === 'pro' ? KEY_PAGES.slice(0, 3) : KEY_PAGES;
      for (const { label, paths } of pagesToCheck) {
        for (const path of paths) {
          if (await checkPageExists(baseUrl, path)) {
            keyPages[label] = baseUrl + path;
            break;
          }
        }
      }
    }

    const result = {
      domain,
      url: baseUrl,
      company_name: info.siteName || info.title,
      description: info.description,
      logo: info.logo,
      founding_year: info.foundingYear,
      employee_count_signal: info.employeeCount,
      contact_emails: info.emails,
      ...(plan !== 'free' && { phone_numbers: info.phones }),
      social_links: socials,
      tech_stack: tech,
      ...(plan !== 'free' && { key_pages: keyPages }),
      ...(plan === 'ultra' || plan === 'mega'
        ? { open_graph: og, twitter_card: twitter }
        : {}),
      plan,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[company-intelligence]', err.message);
    return errorResponse(res, 500, 'Failed to fetch company data');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3014;
  app.listen(PORT, () => console.log(`company-intelligence running on port ${PORT}`));
}

module.exports = app;
