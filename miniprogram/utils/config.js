const DEFAULT_API_BASE = 'http://127.0.0.1:3150/api/v1';
const LEGACY_API_BASE = 'http://127.0.0.1:3050/api/v1';

function normalizeApiBase(input) {
  let value = String(input || '').trim().replace(/\/+$/, '');
  if (!value) return DEFAULT_API_BASE;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  if (!/\/api\/v1$/i.test(value)) value = `${value}/api/v1`;
  return value;
}

module.exports = { DEFAULT_API_BASE, LEGACY_API_BASE, normalizeApiBase };
