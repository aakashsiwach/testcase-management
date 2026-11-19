const xss = require('xss');

// Strip any HTML from user-supplied strings (defence in depth; React also escapes output).
const sanitizeOptions = { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'], escapeHtml: (s) => s };

function sanitize(value) {
  if (typeof value === 'string') return xss(value, sanitizeOptions).trim();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  }
  return value;
}

// Parses req[source] with a zod schema; the parsed, sanitized result replaces it on req.valid.
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    try {
      const parsed = schema.parse(req[source] ?? {});
      req.valid = { ...(req.valid || {}), [source]: sanitize(parsed) };
      next();
    } catch (err) {
      next(err);
    }
  };

module.exports = { validate, sanitize };
