/**
 * /api/security-headers
 * Audits HTTP security headers and returns a grade + per-header analysis.
 * Response depth is controlled by plan: free | pro | ultra | mega
 */
const express = require('express');
const axios = require('axios');
const { normalizeUrl, getSslInfo, errorResponse, USER_AGENT } = require('../shared/utils');
const { getPlan, filterByPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json());

const HEADER_SPECS = [
  {
    name: 'Strict-Transport-Security',
    key: 'strict-transport-security',
    importance: 'critical',
    weight: 20,
    description: 'Forces browsers to use HTTPS for future visits (HSTS).',
    recommendation: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains'
  },
  {
    name: 'Content-Security-Policy',
    key: 'content-security-policy',
    importance: 'critical',
    weight: 20,
    description: 'Restricts resources the browser can load, preventing XSS attacks.',
    recommendation: "Add: Content-Security-Policy: default-src 'self'"
  },
  {
    name: 'X-Frame-Options',
    key: 'x-frame-options',
    importance: 'high',
    weight: 15,
    description: 'Prevents your site from being embedded in iframes (clickjacking protection).',
    recommendation: 'Add: X-Frame-Options: SAMEORIGIN'
  },
  {
    name: 'X-Content-Type-Options',
    key: 'x-content-type-options',
    importance: 'high',
    weight: 10,
    description: 'Prevents MIME-type sniffing attacks.',
    recommendation: 'Add: X-Content-Type-Options: nosniff'
  },
  {
    name: 'Referrer-Policy',
    key: 'referrer-policy',
    importance: 'medium',
    weight: 8,
    description: 'Controls how much referrer information is sent with requests.',
    recommendation: 'Add: Referrer-Policy: strict-origin-when-cross-origin'
  },
  {
    name: 'Permissions-Policy',
    key: 'permissions-policy',
    importance: 'medium',
    weight: 8,
    description: 'Controls access to browser features like camera, microphone, geolocation.',
    recommendation: 'Add: Permissions-Policy: geolocation=(), microphone=(), camera=()'
  },
  {
    name: 'X-XSS-Protection',
    key: 'x-xss-protection',
    importance: 'low',
    weight: 5,
    description: 'Legacy XSS filter for older browsers (largely replaced by CSP).',
    recommendation: 'Add: X-XSS-Protection: 1; mode=block'
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    key: 'cross-origin-opener-policy',
    importance: 'medium',
    weight: 7,
    description: 'Prevents cross-origin documents from gaining access to the browsing context.',
    recommendation: 'Add: Cross-Origin-Opener-Policy: same-origin'
  },
  {
    name: 'Cross-Origin-Resource-Policy',
    key: 'cross-origin-resource-policy',
    importance: 'medium',
    weight: 7,
    description: 'Prevents other websites from loading your resources.',
    recommendation: 'Add: Cross-Origin-Resource-Policy: same-origin'
  }
];

function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

app.post('/api/security-headers', async (req, res) => {
  const plan = getPlan(req);
  const { url } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const [response, ssl] = await Promise.all([
      // Try HEAD first (faster), fall back to GET if HEAD is blocked
      axios.head(urlObj.href, {
        timeout: 10000, proxy: false, maxRedirects: 5, validateStatus: () => true,
        headers: { 'User-Agent': USER_AGENT }
      }).catch(() =>
        axios.get(urlObj.href, {
          timeout: 10000, proxy: false, maxRedirects: 5, validateStatus: () => true,
          headers: { 'User-Agent': USER_AGENT }
        })
      ),
      getSslInfo(urlObj)
    ]);

    const headers = response.headers || {};
    const results = [];
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const spec of HEADER_SPECS) {
      const value = headers[spec.key] || null;
      const present = value !== null;
      totalWeight += spec.weight;
      if (present) earnedWeight += spec.weight;

      results.push({
        header: spec.name,
        importance: spec.importance,
        weight: spec.weight,
        present,
        value,
        status: present ? 'pass' : 'missing',
        description: spec.description,
        recommendation: present ? null : spec.recommendation
      });
    }

    // SSL bonus
    let sslNote = null;
    if (urlObj.protocol === 'https:') {
      if (ssl && ssl.valid) {
        earnedWeight += 5; totalWeight += 5;
        sslNote = { status: 'pass', message: `SSL valid — expires in ${ssl.days_remaining} days` };
      } else {
        totalWeight += 5;
        sslNote = { status: 'fail', message: 'SSL certificate invalid or expiring soon' };
      }
    } else {
      totalWeight += 5;
      sslNote = { status: 'fail', message: 'Site is not using HTTPS — all security headers are less effective without it' };
    }

    const score = Math.round((earnedWeight / totalWeight) * 100);
    const grade = gradeFromScore(score);

    const full = {
      success: true,
      url: urlObj.href,
      status_code: response.status,
      security_score: score,
      grade,
      ssl: ssl ? { valid: ssl.valid, issuer: ssl.issuer, expires_at: ssl.expires_at, days_remaining: ssl.days_remaining } : null,
      ssl_note: sslNote,
      headers_present: results.filter(r => r.present).length,
      headers_missing: results.filter(r => !r.present).length,
      headers: results,
      raw_response_headers: Object.fromEntries(
        Object.entries(headers).filter(([k]) =>
          HEADER_SPECS.map(s => s.key).includes(k) ||
          ['server', 'x-powered-by', 'content-type', 'cache-control'].includes(k)
        )
      ),
      analyzed_at: new Date().toISOString()
    };

    return res.json(filterByPlan(full, plan, 'security-headers'));
  } catch (err) {
    return errorResponse(res, 502, 'Failed to fetch security headers', err.message);
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3008;
  app.listen(PORT, () => console.log(`security-headers running on port ${PORT}`));
}
module.exports = app;
