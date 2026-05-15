/**
 * Shared utilities for SiteTrace API Marketplace
 */
const axios = require('axios');
const tls = require('tls');

const USER_AGENT = 'SiteTraceAPI/1.0 (+https://rapidapi.com/sitetrace)';
const DEFAULT_TIMEOUT = 12000;

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') throw new Error('URL is required');
  const value = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are supported');
  const hostname = parsed.hostname.toLowerCase();
  const blocked = ['localhost', '0.0.0.0', '127.0.0.1', '::1'];
  const privateRanges = [/^10\./, /^127\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[0-1])\./];
  if (blocked.includes(hostname) || privateRanges.some(p => p.test(hostname))) {
    throw new Error('Private/local network URLs are not supported');
  }
  return parsed;
}

async function fetchPage(urlObj, timeout = DEFAULT_TIMEOUT) {
  const start = Date.now();
  const response = await axios.get(urlObj.href, {
    timeout,
    maxRedirects: 5,
    proxy: false,
    validateStatus: () => true,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    maxContentLength: 3 * 1024 * 1024
  });
  const responseTimeMs = Date.now() - start;
  return { response, responseTimeMs };
}

async function getSslInfo(urlObj) {
  if (urlObj.protocol !== 'https:') return null;
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: urlObj.hostname, port: 443, servername: urlObj.hostname, timeout: 5000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve(null);
        const expiresAt = new Date(cert.valid_to);
        const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        resolve({
          issuer: cert.issuer && cert.issuer.O,
          subject: cert.subject && cert.subject.CN,
          expires_at: expiresAt.toISOString(),
          days_remaining: daysRemaining,
          valid: daysRemaining > 0
        });
      }
    );
    socket.on('error', () => resolve(null));
    socket.setTimeout(5000, () => { socket.destroy(); resolve(null); });
  });
}

function errorResponse(res, statusCode, message, detail = null) {
  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(detail ? { detail } : {})
  });
}

module.exports = { normalizeUrl, fetchPage, getSslInfo, errorResponse, USER_AGENT, DEFAULT_TIMEOUT };
