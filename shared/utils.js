/**
 * Shared utilities for SiteTrace API Marketplace
 */
const axios = require('axios');
const tls = require('tls');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

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

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0 ||
      parts[0] >= 224
    );
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return (
      value === '::1' ||
      value === '::' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80') ||
      value.startsWith('::ffff:127.') ||
      value.startsWith('::ffff:10.') ||
      value.startsWith('::ffff:192.168.')
    );
  }
  return true;
}

async function resolvePublicHostname(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  const publicAddresses = addresses.filter((item) => !isPrivateIp(item.address));
  if (!publicAddresses.length) {
    throw new Error('Private/local network URLs are not supported');
  }
  return publicAddresses[0];
}

async function assertPublicUrl(urlObj) {
  normalizeUrl(urlObj.href);
  return resolvePublicHostname(urlObj.hostname);
}

async function fetchPublicUrl(urlObj, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const start = Date.now();
  let current = new URL(urlObj.href);
  let response;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const pinned = await assertPublicUrl(current);
    const agentOptions = {
      lookup: (_hostname, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
          opts = {};
        }
        if (opts && opts.all) return callback(null, [{ address: pinned.address, family: pinned.family }]);
        return callback(null, pinned.address, pinned.family);
      }
    };
    const agent = current.protocol === 'https:' ? new https.Agent(agentOptions) : new http.Agent(agentOptions);

    response = await axios.request({
      url: current.href,
      method: options.method || 'GET',
      timeout,
      maxRedirects: 0,
      proxy: false,
      validateStatus: () => true,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...(options.headers || {})
      },
      maxContentLength: options.maxContentLength || 3 * 1024 * 1024,
      httpAgent: agent,
      httpsAgent: agent
    });

    response.finalUrl = current.href;
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.location) break;
    current = new URL(response.headers.location, current.href);
  }

  if (response && [301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
    throw new Error('Too many redirects');
  }

  const responseTimeMs = Date.now() - start;
  return { response, responseTimeMs };
}

async function fetchPage(urlObj, timeout = DEFAULT_TIMEOUT) {
  return fetchPublicUrl(urlObj, { timeout });
}

async function getSslInfo(urlObj) {
  if (urlObj.protocol !== 'https:') return null;
  const pinned = await assertPublicUrl(urlObj);
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: pinned.address, port: 443, servername: urlObj.hostname, timeout: 5000 },
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

module.exports = { normalizeUrl, assertPublicUrl, fetchPublicUrl, fetchPage, getSslInfo, errorResponse, USER_AGENT, DEFAULT_TIMEOUT };
