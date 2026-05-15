'use strict';

const crypto = require('crypto');
const { getPlan } = require('./planFilter');

const WINDOW_MS = 60 * 1000;
const PLAN_LIMITS = {
  free: 5,
  pro: 30,
  ultra: 100,
  mega: 500
};

const buckets = new Map();

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function getClientId(req) {
  return (
    req.headers['x-rapidapi-user'] ||
    req.headers['x-rapidapi-key'] ||
    req.headers['x-forwarded-for'] ||
    req.ip ||
    req.socket.remoteAddress ||
    'anonymous'
  );
}

function cleanup(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function rateLimiter(req, res, next) {
  if (req.path === '/health') return next();

  const now = Date.now();
  const plan = getPlan(req);
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const clientKey = hash(getClientId(req));
  const key = `${clientKey}:${plan}:${req.path}`;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    cleanup(now);
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(limit - bucket.count, 0);
  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

  res.set({
    'X-RateLimit-Plan': plan,
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000))
  });

  if (bucket.count > limit) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      plan,
      limit,
      window_seconds: 60,
      retry_after_seconds: retryAfter
    });
  }

  return next();
}

module.exports = { rateLimiter, PLAN_LIMITS };
