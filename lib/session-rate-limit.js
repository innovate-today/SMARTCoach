const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const attempts = new Map();

function checkSessionAttempt({ accountKey, ip }) {
  const key = limitKey(accountKey, ip);
  const now = Date.now();
  const item = currentItem(key, now);
  if (item.blockedUntil && item.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((item.blockedUntil - now) / 1000),
    };
  }
  return { allowed: true };
}

function recordSessionFailure({ accountKey, ip }) {
  const key = limitKey(accountKey, ip);
  const now = Date.now();
  const item = currentItem(key, now);
  item.count += 1;
  if (item.count >= MAX_FAILURES) {
    item.blockedUntil = now + BLOCK_MS;
  }
  attempts.set(key, item);
  return {
    blocked: !!item.blockedUntil && item.blockedUntil > now,
    retryAfterSeconds: item.blockedUntil && item.blockedUntil > now ? Math.ceil((item.blockedUntil - now) / 1000) : 0,
  };
}

function clearSessionFailures({ accountKey, ip }) {
  attempts.delete(limitKey(accountKey, ip));
}

function requestIp(req) {
  const header = (name) => String((req && req.headers && (req.headers[name] || req.headers[name.toLowerCase()])) || "").trim();
  return (
    header("x-vercel-forwarded-for").split(",")[0].trim() ||
    header("x-forwarded-for").split(",")[0].trim() ||
    header("cf-connecting-ip") ||
    header("x-real-ip") ||
    (req && req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
}

function currentItem(key, now) {
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) {
    const next = { count: 0, resetAt: now + WINDOW_MS, blockedUntil: 0 };
    attempts.set(key, next);
    return next;
  }
  return item;
}

function limitKey(accountKey, ip) {
  return `${clean(accountKey) || "default"}:${clean(ip) || "unknown"}`;
}

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

module.exports = {
  checkSessionAttempt,
  recordSessionFailure,
  clearSessionFailures,
  requestIp,
};
