'use strict';

const crypto = require('crypto');

function timingSafeEqual(a, b) {
    const left = Buffer.from(String(a || ''));
    const right = Buffer.from(String(b || ''));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function marketplaceAuth(req, res, next) {
    if (req.path === '/' || req.path === '/health') return next();

  const rapidSecret = process.env.RAPIDAPI_PROXY_SECRET || '';
    const internalSecret = process.env.SITETRACE_INTERNAL_SECRET || '';
    const rapidHeader = req.headers['x-rapidapi-proxy-secret'];
    const internalHeader = req.headers['x-sitetrace-internal-secret'];
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

  if (rapidSecret && timingSafeEqual(rapidHeader, rapidSecret)) {
        req.marketplaceAuth = 'rapidapi';
        return next();
  }

  if (internalSecret && (timingSafeEqual(internalHeader, internalSecret) || timingSafeEqual(bearer, internalSecret))) {
        req.marketplaceAuth = 'internal';
        return next();
  }

  if (!rapidSecret && !internalSecret && process.env.NODE_ENV !== 'production') {
        req.marketplaceAuth = 'development';
        return next();
  }

  // Allow unauthenticated requests as free-tier public access.
  // This enables multi-marketplace compatibility (Zyla Labs, api.market, etc.)
  // while RapidAPI subscribers still receive plan-appropriate access via their proxy secret.
  req.marketplaceAuth = 'public';
<<<<<<< HEAD
  return next();
=======
    return next();
>>>>>>> 8775ddd136d841be2628337fdc678ec86c8c34fc
}

module.exports = { marketplaceAuth };
