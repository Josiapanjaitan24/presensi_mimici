export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  next();
}

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 15,
  keyPrefix = "global",
  message = "Terlalu banyak percobaan. Silakan coba lagi beberapa saat.",
} = {}) {
  const hits = new Map();

  function cleanup(now) {
    if (hits.size < 500) return;
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }

  function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const ip =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    const key = `${keyPrefix}:${ip}`;
    const current = hits.get(key);

    if (!current || now >= current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message,
      });
    }

    return next();
  }

  rateLimitMiddleware.reset = () => hits.clear();
  return rateLimitMiddleware;
}

