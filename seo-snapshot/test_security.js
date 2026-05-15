const axios = require('axios');

async function testSecurityHeaders(url) {
  const response = await axios.head(url, {
    timeout: 8000, proxy: false, maxRedirects: 5, validateStatus: () => true,
    headers: { 'User-Agent': 'SiteTraceAPI/1.0' }
  });
  const h = response.headers;
  const specs = ['strict-transport-security','content-security-policy','x-frame-options','x-content-type-options','referrer-policy','permissions-policy'];
  const result = { url, status: response.status, headers: {} };
  for (const s of specs) result.headers[s] = h[s] ? 'PRESENT' : 'MISSING';
  const presentCount = Object.values(result.headers).filter(v => v === 'PRESENT').length;
  result.score = Math.round((presentCount / specs.length) * 100);
  result.grade = result.score >= 90 ? 'A+' : result.score >= 80 ? 'A' : result.score >= 60 ? 'B' : result.score >= 40 ? 'C' : 'F';
  return result;
}

(async () => {
  for (const url of ['https://stripe.com', 'https://github.com', 'https://example.com']) {
    const r = await testSecurityHeaders(url).catch(e => ({ url, error: e.message }));
    console.log(JSON.stringify(r, null, 2));
  }
})();
