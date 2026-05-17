'use strict';

function requestLogger(req, res, next) {
  if (req.path === '/health') return next();
  const started = Date.now();
  res.on('finish', () => {
    const entry = {
      event: 'api_request',
      endpoint: req.path,
      method: req.method,
      status: res.statusCode,
      duration_ms: Date.now() - started,
      plan: res.getHeader('X-RateLimit-Plan') || 'n/a',
      auth: req.marketplaceAuth || 'public'
    };
    console.log(JSON.stringify(entry));
  });
  next();
}

module.exports = { requestLogger };
