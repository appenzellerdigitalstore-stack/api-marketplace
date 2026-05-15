/**
 * /api/contact-extractor
 * Extracts emails, phone numbers, social media profiles, and addresses from any public page.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;
const FULL_PHONE_RE = /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/g;

const SOCIAL_PATTERNS = {
  twitter:   /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,50})/,
  facebook:  /facebook\.com\/(?:pages\/)?([a-zA-Z0-9._\-]+)/,
  linkedin:  /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_\-]+)/,
  instagram: /instagram\.com\/([a-zA-Z0-9._]+)/,
  youtube:   /youtube\.com\/(?:channel|user|c)\/([a-zA-Z0-9_\-]+)/,
  github:    /github\.com\/([a-zA-Z0-9_\-]+)/,
  tiktok:    /tiktok\.com\/@([a-zA-Z0-9._]+)/
};

function extractEmails(html) {
  const found = html.match(EMAIL_RE) || [];
  return [...new Set(found)].filter(e =>
    !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg') &&
    !e.includes('example.com') && !e.includes('sentry.io')
  );
}

function extractPhones(text) {
  const allMatches = [...(text.match(FULL_PHONE_RE) || []), ...(text.match(PHONE_RE) || [])];
  const found = allMatches
    .map(m => m.replace(/[^\d+\-() ]/g, '').trim())
    .filter(m => m.replace(/\D/g, '').length >= 7);
  return [...new Set(found)];
}

function extractSocials($) {
  const found = {};
  $('a[href]').each((_, el) => {
    const href = $( el).attr('href') || '';
    for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
      const m = href.match(pattern);
      if (m && !found[platform]) {
        found[platform] = {
          url: href.startsWith('http') ? href : `https:${href}`,
          handle: m[1]
        };
      }
    }
  });
  return found;
}

function extractAddresses(text) {
  const addressRe = /\d{1,5}\s+(?:[A-Z][a-zA-Z]+\s+){1,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Suite|Ste)\b[^<\n]{0,60}/g;
  return [...new Set((text.match(addressRe) || []).map(a => a.trim()))].slice(0, 5);
}

app.post('/api/contact-extractor', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    const emails = extractEmails(html);
    const phones = extractPhones(bodyText);
    const socials = extractSocials($);
    const addresses = extractAddresses(bodyText);

    // Prioritise mailto: links
    const mailtoEmails = [];
    $('a[href^="mailto:"]').each((_, el) => {
      const email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (email && !mailtoEmails.includes(email)) mailtoEmails.push(email);
    });
    const allEmails = [...new Set([...mailtoEmails, ...emails])];

    // Prioritise tel: links
    const telLinks = [];
    $('a[href^="tel:"]').each((_, el) => {
      const phone = $(el).attr('href').replace('tel:', '').trim();
      if (phone) telLinks.push(phone);
    });
    const allPhones = [...new Set([...telLinks, ...phones])];

    const insights = [];
    if (allEmails.length === 0 && allPhones.length === 0) {
      insights.push({ type: 'warning', message: 'No contact information found — consider adding a contact page or footer details' });
    }
    if (allEmails.some(e => e.includes('noreply') || e.includes('no-reply'))) {
      insights.push({ type: 'info', message: 'noreply address detected — this is automated-only and not suitable for sales outreach' });
    }
    if (Object.keys(socials).length > 0) {
      insights.push({ type: 'pass', message: `${Object.keys(socials).length} social profile(s) linked` });
    }
    if (allEmails.length > 0) {
      insights.push({ type: 'pass', message: `${allEmails.length} email address(es) found` });
    }

    const full = {
      success: true,
      url: urlObj.href,
      status_code: response.status,
      emails: allEmails,
      phones: allPhones,
      social_profiles: socials,
      addresses,
      insights,
      counts: {
        emails: allEmails.length,
        phones: allPhones.length,
        social_profiles: Object.keys(socials).length,
        addresses: addresses.length
      },
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'contact-extractor'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch or analyze URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3006;
  app.listen(PORT, () => console.log(`contact-extractor running on port ${PORT}`));
}
module.exports = app;
