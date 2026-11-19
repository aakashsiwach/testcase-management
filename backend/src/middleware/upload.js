const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const { HttpError } = require('./errors');

const ALLOWED = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.log': ['text/plain', 'application/octet-stream', 'text/x-log'],
  '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
};

const MAGIC = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.mimetype)) {
      return cb(new HttpError(400, `File type not allowed: ${file.originalname}`));
    }
    cb(null, true);
  },
});

const safeFilename = (name) =>
  path
    .basename(name || 'file')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 200) || 'file';

// Verifies the file content matches its declared type; text files must not contain NUL bytes.
function checkContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const canonical = ALLOWED[ext][0];
  const magic = MAGIC[canonical];
  if (magic) {
    if (!magic.every((b, i) => file.buffer[i] === b)) {
      throw new HttpError(400, `File content does not match its type: ${file.originalname}`);
    }
    return canonical;
  }
  if (file.buffer.subarray(0, 8192).includes(0)) {
    throw new HttpError(400, `Text file contains binary content: ${file.originalname}`);
  }
  return ext === '.csv' ? 'text/csv' : 'text/plain';
}

module.exports = { upload, checkContent, safeFilename };
