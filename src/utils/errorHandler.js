const SENSITIVE_PATTERNS = [
  /bearer\s+[a-z0-9\-_.]+/gi,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /service_role/gi,
  /password\s*[=:]\s*\S+/gi,
  /apikey\s*[=:]\s*\S+/gi,
  /authorization\s*[=:]\s*\S+/gi,
  /refresh_token/gi,
  /access_token/gi,
  /postgres:\/\/[^\s]+/gi,
];

export function sanitizeText(text) {
  if (!text) return '';
  let clean = String(text);
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}

function extractRawCode(error) {
  if (!error) return null;
  if (typeof error === 'string') return null;
  if (error.code) return String(error.code);
  if (error.status) return String(error.status);
  if (error?.response?.status) return String(error.response.status);
  if (error?.response?.data?.code) return String(error.response.data.code);
  if (error?.data?.code) return String(error.data.code);
  return null;
}

function extractMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === 'string') return sanitizeText(error);
  const msg = error.message || error?.response?.data?.message || error?.data?.message;
  return sanitizeText(msg || fallback);
}

function classifyError(error) {
  if (!error) return 'UNKNOWN';
  const msg = String(error.message || '').toLowerCase();
  const code = error.code || error?.response?.status || error?.status;

  if (!navigator.onLine || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('loadfailed')) {
    return 'NETWORK';
  }
  if (code === 401 || msg.includes('unauthorized') || msg.includes('jwt expired')) return 'AUTH';
  if (code === 403 || msg.includes('forbidden')) return 'AUTH';
  if (code >= 500) return 'SERVER';
  return 'UNKNOWN';
}

function extractSupabaseErrorCode(error) {
  if (!error) return null;
  if (error.code && /^\d{5}$/.test(error.code)) return error.code;
  if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) return error.code;
  if (error?.details && typeof error.details === 'string') {
    const match = error.details.match(/code[:\s]+([A-Z0-9]{2,6})/i);
    if (match) return match[1];
  }
  if (typeof error.message === 'string') {
    if (error.message.includes('Insufficient stock')) return 'P0001';
    if (error.message.includes('duplicate key')) return '23505';
    if (error.message.includes('violates foreign key')) return '23503';
    if (error.message.includes('not-null')) return '23502';
    if (error.message.includes('permission denied')) return '42501';
  }
  return null;
}

/**
 * Normalize any error and return a typed toast object.
 * Return value can be spread directly into showToastTyped:
 *   showToastTyped({ type: 'error', ...normalizeAppError(error, { code, fallbackMessage }) })
 */
export function normalizeAppError(error, { code, fallbackMessage = 'Unexpected error occurred.' } = {}) {
  if (!error) {
    return { type: 'error', code: code || 'UNKNOWN_ERROR', rawCode: 'UNKNOWN', message: fallbackMessage };
  }

  const classification = classifyError(error);
  const rawCode = extractRawCode(error) || extractSupabaseErrorCode(error) || classification;
  const appCode = code || (`${classification}_ERROR`);
  const message = extractMessage(error, fallbackMessage);

  console.error(`[${appCode}]`, error);
  return { type: 'error', code: appCode, rawCode, message };
}