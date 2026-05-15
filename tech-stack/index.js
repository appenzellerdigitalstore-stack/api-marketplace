/**
 * /api/tech-stack
 * Detects the technology stack of any website.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

const SIGNATURES = [
  // CMS
  { name: 'WordPress',    category: 'CMS',                  patterns: [/wp-content\//i, /wp-includes\//i, /\/wp-json\//i] },
  { name: 'Shopify',      category: 'E-Commerce',           patterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i, /myshopify\.com/i] },
  { name: 'Squarespace',  category: 'CMS',                  patterns: [/squarespace\.com/i, /static\.squarespace\.com/i] },
  { name: 'Wix',          category: 'CMS',                  patterns: [/wix\.com/i, /wixstatic\.com/i, /wixsite\.com/i] },
  { name: 'Webflow',      category: 'CMS',                  patterns: [/webflow\.com/i, /webflow\.io/i] },
  { name: 'Ghost',        category: 'CMS',                  patterns: [/ghost\.io/i, /ghost\/api/i] },
  { name: 'Drupal',       category: 'CMS',                  patterns: [/drupal\.js/i, /Drupal\./i, /\/sites\/default\/files\//i] },
  { name: 'Joomla',       category: 'CMS',                  patterns: [/\/media\/jui\//i, /joomla/i] },
  // JS Frameworks
  { name: 'React',        category: 'JavaScript Framework', patterns: [/__REACT/i, /react\.production\.min\.js/i, /data-reactroot/i] },
  { name: 'Vue.js',       category: 'JavaScript Framework', patterns: [/vue\.min\.js/i, /__vue__/i, /data-v-/i] },
  { name: 'Angular',      category: 'JavaScript Framework', patterns: [/angular\.js/i, /ng-version/i, /ng-app/i] },
  { name: 'Next.js',      category: 'JavaScript Framework', patterns: [/__NEXT_DATA__/i, /_next\/static\//i] },
  { name: 'Nuxt.js',      category: 'JavaScript Framework', patterns: [/__NUXT__/i, /_nuxt\//i] },
  { name: 'Svelte',       category: 'JavaScript Framework', patterns: [/svelte/i] },
  // Analytics
  { name: 'Google Analytics',  category: 'Analytics', patterns: [/google-analytics\.com/i, /gtag\(/i, /googletagmanager\.com/i] },
  { name: 'Plausible',         category: 'Analytics', patterns: [/plausible\.io/i] },
  { name: 'Hotjar',            category: 'Analytics', patterns: [/hotjar\.com/i, /hjid/i] },
  { name: 'Mixpanel',          category: 'Analytics', patterns: [/mixpanel\.com/i] },
  { name: 'Segment',           category: 'Analytics', patterns: [/cdn\.segment\.com/i] },
  { name: 'Fathom',            category: 'Analytics', patterns: [/usefathom\.com/i] },
  // CDN
  { name: 'Cloudflare',        category: 'CDN', patterns: [/cloudflare\.com/i, /cdnjs\.cloudflare\.com/i] },
  { name: 'Fastly',            category: 'CDN', patterns: [/fastly\.net/i] },
  { name: 'AWS CloudFront',    category: 'CDN', patterns: [/cloudfront\.net/i] },
  { name: 'jsDelivr',          category: 'CDN', patterns: [/cdn\.jsdelivr\.net/i] },
  { name: 'unpkg',             category: 'CDN', patterns: [/unpkg\.com/i] },
  // CSS Frameworks
  { name: 'Bootstrap',         category: 'CSS Framework', patterns: [/bootstrap\.min\.css/i, /bootstrap\.bundle/i] },
  { name: 'Tailwind CSS',      category: 'CSS Framework', patterns: [/tailwind\.css/i, /tailwindcss/i] },
  { name: 'Bulma',             category: 'CSS Framework', patterns: [/bulma\.css/i, /bulma\.min\.css/i] },
  { name: 'Foundation',        category: 'CSS Framework', patterns: [/foundation\.css/i, /zurb-foundation/i] },
  // Payment
  { name: 'Stripe',            category: 'Payment', patterns: [/js\.stripe\.com/i, /stripe\.com\/v3/i] },
  { name: 'PayPal',            category: 'Payment', patterns: [/paypal\.com/i, /paypalobjects\.com/i] },
  // Chat / Support
  { name: 'Intercom',          category: 'Chat', patterns: [/widget\.intercom\.io/i, /intercomSettings/i] },
  { name: 'Drift',             category: 'Chat', patterns: [/js\.driftt\.com/i] },
  { name: 'Zendesk',           category: 'Chat', patterns: [/static\.zdassets\.com/i, /zopim/i] },
  { name: 'Crisp',             category: 'Chat', patterns: [/client\.crisp\.chat/i] },
  // Hosting
  { name: 'Vercel',            category: 'Hosting', patterns: [/vercel\.app/i, /__vercel/i] },
  { name: 'Netlify',           category: 'Hosting', patterns: [/netlify\.app/i, /netlify\.com/i] },
  { name: 'GitHub Pages',      category: 'Hosting', patterns: [/github\.io/i] },
  { name: 'Render',            category: 'Hosting', patterns: [/onrender\.com/i] },
  // Fonts
  { name: 'Google Fonts',      category: 'Fonts', patterns: [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i] },
  { name: 'Adobe Fonts',       category: 'Fonts', patterns: [/use\.typekit\.net/i] },
  // Maps
  { name: 'Google Maps',       category: 'Maps', patterns: [/maps\.googleapis\.com/i, /maps\.google\.com/i] },
  { name: 'Mapbox',            category: 'Maps', patterns: [/api\.mapbox\.com/i] }
];

app.post('/api/tech-stack', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);
    const headers = response.headers || {};

    const detectedTech = [];
    const searchTarget = html + JSON.stringify(headers);

    for (const tech of SIGNATURES) {
      if (tech.patterns.some(p => p.test(searchTarget))) {
        detectedTech.push({ name: tech.name, category: tech.category });
      }
    }

    // Header-based hints
    const serverHeader = headers['server'] || null;
    const poweredBy = headers['x-powered-by'] || null;
    if (serverHeader) detectedTech.push({ name: serverHeader, category: 'Server', source: 'header' });
    if (poweredBy && poweredBy !== serverHeader) detectedTech.push({ name: poweredBy, category: 'Runtime', source: 'header' });

    // Generator meta tag
    const generator = $('meta[name="generator"]').attr('content') || null;
    if (generator) detectedTech.push({ name: generator, category: 'Generator', source: 'meta' });

    // Group by category
    const byCategory = {};
    for (const t of detectedTech) {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(t.name);
    }

    // Build insights (used by ultra/mega only but computed for all)
    const insights = [];
    const hasAnalytics = detectedTech.some(t => t.category === 'Analytics');
    const hasCMS = detectedTech.some(t => t.category === 'CMS');
    const hasPayment = detectedTech.some(t => t.category === 'Payment');
    if (!hasAnalytics) {
      insights.push({ type: 'info', message: 'No analytics tool detected — consider adding tracking to measure traffic' });
    }
    if (hasPayment) {
      insights.push({ type: 'info', message: 'Payment provider detected — this site likely processes transactions' });
    }
    if (byCategory['JavaScript Framework'] && byCategory['JavaScript Framework'].length > 2) {
      insights.push({ type: 'warning', message: 'Multiple JS frameworks detected — this may indicate bundle bloat' });
    }
    if (detectedTech.length === 0) {
      insights.push({ type: 'info', message: 'No technologies detected — site may use custom or obfuscated code' });
    }

    const full = {
      success: true,
      url: urlObj.href,
      status_code: response.status,
      total_detected: detectedTech.length,
      technologies: detectedTech,
      by_category: byCategory,
      server_headers: {
        server: serverHeader,
        powered_by: poweredBy,
        content_type: headers['content-type'] || null,
        cache_control: headers['cache-control'] || null
      },
      insights,
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'tech-stack'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch or analyze URL', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3007;
  app.listen(PORT, () => console.log(`tech-stack running on port ${PORT}`));
}
module.exports = app;
