/**
 * /api/business-lead-score
 * Scores a website as a B2B lead based on digital presence signals.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, getSslInfo, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

const SOCIAL_PATTERNS = {
  linkedin: /linkedin\.com\/company\/([a-zA-Z0-9_\-]+)/,
  twitter:  /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,50})/,
  facebook: /facebook\.com\/([a-zA-Z0-9._\-]+)/
};

const HIGH_VALUE_TOOLS = ['Stripe', 'HubSpot', 'Salesforce', 'Intercom', 'Drift', 'Marketo', 'Pardot', 'Segment', 'Mixpanel'];
const ECOMMERCE_TOOLS  = ['Shopify', 'WooCommerce', 'Magento', 'BigCommerce'];
const CHAT_TOOLS       = ['Intercom', 'Drift', 'Crisp', 'Zendesk'];

app.post('/api/business-lead-score', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const [{ response, responseTimeMs }, ssl] = await Promise.all([
      fetchPage(urlObj),
      getSslInfo(urlObj)
    ]);

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    const signals = [];
    let score = 0;

    // ── Website Health (max 25) ───────────────────────────────────────────────
    if (response.status >= 200 && response.status < 400) {
      score += 10;
      signals.push({ category: 'Website Health', signal: 'Site is reachable', points: 10, status: 'pass' });
    } else {
      signals.push({ category: 'Website Health', signal: 'Site returned an error status', points: 0, status: 'fail' });
    }
    if (urlObj.protocol === 'https:') {
      score += 5;
      signals.push({ category: 'Website Health', signal: 'HTTPS enabled', points: 5, status: 'pass' });
    } else {
      signals.push({ category: 'Website Health', signal: 'No HTTPS — site is not secure', points: 0, status: 'fail' });
    }
    if (ssl && ssl.valid) {
      score += 5;
      signals.push({ category: 'Website Health', signal: 'Valid SSL certificate', points: 5, status: 'pass' });
    }
    if (responseTimeMs < 2000) {
      score += 5;
      signals.push({ category: 'Website Health', signal: `Fast load speed (${responseTimeMs}ms)`, points: 5, status: 'pass' });
    } else {
      signals.push({ category: 'Website Health', signal: `Slow load speed (${responseTimeMs}ms)`, points: 0, status: 'warning' });
    }

    // ── SEO Presence (max 20) ─────────────────────────────────────────────────
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1Count = $('h1').length;
    const wordCount = bodyText.split(' ').filter(Boolean).length;

    if (title && title.length > 10) { score += 5; signals.push({ category: 'SEO Presence', signal: 'Proper title tag present', points: 5, status: 'pass' }); }
    if (metaDesc.length > 50) { score += 5; signals.push({ category: 'SEO Presence', signal: 'Meta description present', points: 5, status: 'pass' }); }
    if (h1Count >= 1) { score += 5; signals.push({ category: 'SEO Presence', signal: 'H1 heading present', points: 5, status: 'pass' }); }
    if (wordCount >= 200) { score += 5; signals.push({ category: 'SEO Presence', signal: `Good content volume (${wordCount} words)`, points: 5, status: 'pass' }); }

    // ── Contact & Trust (max 20) ──────────────────────────────────────────────
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const emails = (html.match(emailRe) || []).filter(e => !e.includes('example.com') && !e.endsWith('.png'));
    const hasPhone = /(\+?[\d\s\-().]{7,20})/.test(bodyText);
    const hasAddress = /\d{1,5}\s+\w+\s+(Street|St|Ave|Blvd|Road|Rd|Drive|Dr)/i.test(bodyText);
    const hasPrivacyPolicy = /privacy\s*policy/i.test(bodyText);
    const hasTerms = /terms\s*(of\s*(service|use))?/i.test(bodyText);

    if (emails.length > 0) { score += 5; signals.push({ category: 'Contact & Trust', signal: 'Contact email found', points: 5, status: 'pass' }); }
    if (hasPhone) { score += 5; signals.push({ category: 'Contact & Trust', signal: 'Phone number found', points: 5, status: 'pass' }); }
    if (hasAddress) { score += 3; signals.push({ category: 'Contact & Trust', signal: 'Physical address found', points: 3, status: 'pass' }); }
    if (hasPrivacyPolicy) { score += 4; signals.push({ category: 'Contact & Trust', signal: 'Privacy policy present', points: 4, status: 'pass' }); }
    if (hasTerms) { score += 3; signals.push({ category: 'Contact & Trust', signal: 'Terms of service present', points: 3, status: 'pass' }); }

    // ── Social Presence (max 15) ──────────────────────────────────────────────
    const socials = {};
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
        const m = href.match(pattern);
        if (m && !socials[platform]) socials[platform] = { url: href.startsWith('http') ? href : `https:${href}`, handle: m[1] };
      }
    });
    const socialCount = Object.keys(socials).length;
    if (socialCount >= 3) {
      score += 15; signals.push({ category: 'Social Presence', signal: '3+ social profiles linked', points: 15, status: 'pass' });
    } else if (socialCount >= 1) {
      score += 8; signals.push({ category: 'Social Presence', signal: `${socialCount} social profile(s) linked`, points: 8, status: 'pass' });
    } else {
      signals.push({ category: 'Social Presence', signal: 'No social profiles found', points: 0, status: 'warning' });
    }

    // ── Tech Sophistication (max 20) ──────────────────────────────────────────
    const highValueTech = HIGH_VALUE_TOOLS.filter(t => new RegExp(t, 'i').test(html));
    const hasEcommerce  = ECOMMERCE_TOOLS.some(t => new RegExp(t, 'i').test(html));
    const hasChat       = CHAT_TOOLS.some(t => new RegExp(t, 'i').test(html));

    if (highValueTech.length > 0) {
      score += 10; signals.push({ category: 'Tech Sophistication', signal: `Premium tools: ${highValueTech.join(', ')}`, points: 10, status: 'pass' });
    }
    if (hasEcommerce) {
      score += 5; signals.push({ category: 'Tech Sophistication', signal: 'E-commerce platform detected', points: 5, status: 'pass' });
    }
    if (hasChat) {
      score += 5; signals.push({ category: 'Tech Sophistication', signal: 'Live chat tool detected', points: 5, status: 'pass' });
    }

    const finalScore = Math.min(100, score);
    const tier = finalScore >= 80 ? 'Hot Lead' : finalScore >= 60 ? 'Warm Lead' : finalScore >= 35 ? 'Cold Lead' : 'Unqualified';
    const buyingReadiness = finalScore >= 80 ? 'High' : finalScore >= 60 ? 'Medium' : finalScore >= 35 ? 'Low' : 'Very Low';

    const byCategory = {};
    for (const s of signals) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    }

    const full = {
      success: true,
      url: urlObj.href,
      domain: urlObj.hostname,
      status_code: response.status,
      lead_score: finalScore,
      tier,
      buying_readiness: buyingReadiness,
      signals,
      signals_by_category: byCategory,
      company_info: {
        title,
        meta_description: metaDesc,
        emails: emails.slice(0, 5),
        has_phone: hasPhone,
        has_address: hasAddress,
        social_profiles: socials,
        ecommerce: hasEcommerce,
        live_chat: hasChat,
        premium_tools: highValueTech
      },
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'business-lead-score'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to analyze URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`business-lead-score running on port ${PORT}`));
}
module.exports = app;
