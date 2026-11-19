const { ZodError } = require('zod');
const multer = require('multer');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const notFound = (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err.message && err.message.startsWith('Not allowed by CORS')) return res.status(403).json({ error: err.message });
  // Postgres errors
  if (err.code === '23505') return res.status(409).json({ error: 'Resource already exists', detail: err.detail });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced resource does not exist' });
  if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: 'Invalid value' });

  console.error('[error]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, notFound, errorHandler, asyncHandler };
