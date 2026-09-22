import { ApiRequest, Environment } from '../types';

export interface SecretScanResult {
  confidence: 'high' | 'medium';
  reason: string;
}

export interface SecretFinding extends SecretScanResult {
  location: string;
}

const KNOWN_SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /AKIA[0-9A-Z]{16}/, reason: 'looks like an AWS access key ID' },
  { pattern: /ASIA[0-9A-Z]{16}/, reason: 'looks like an AWS temporary access key ID' },
  { pattern: /gh[pousr]_[A-Za-z0-9]{36}\b/, reason: 'looks like a GitHub token' },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/, reason: 'looks like a GitHub fine-grained personal access token' },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, reason: 'looks like a Slack token' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, reason: 'looks like a Google API key' },
  { pattern: /\b(sk|pk|rk)_live_[0-9a-zA-Z]{24,}/, reason: 'looks like a Stripe live API key' },
  { pattern: /-----BEGIN\s+((RSA|EC|DSA|OPENSSH)\s+)?PRIVATE KEY-----/, reason: 'contains a PEM private key block' },
  { pattern: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, reason: 'looks like a JWT' },
  { pattern: /^Bearer\s+[A-Za-z0-9\-_.=]{20,}$/i, reason: 'contains a hardcoded Bearer token' },
];

// Key names commonly used for secret-shaped values, even when the value itself
// doesn't match a known vendor format (e.g. an internal API key or password).
const SUSPICIOUS_KEY_NAME = /token|secret|api[_-]?key|password|passwd|credential|auth/i;

function looksLikeTemplate(value: string): boolean {
  return value.includes('{{');
}

/** Checks a raw value against known secret formats (AWS keys, JWTs, PEM blocks, etc). */
export function scanValueForSecret(value: string): SecretScanResult | null {
  if (!value || looksLikeTemplate(value)) return null;

  for (const { pattern, reason } of KNOWN_SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return { confidence: 'high', reason };
    }
  }

  return null;
}

/**
 * Checks a key/value pair for a likely secret — first against known vendor
 * formats, then (lower confidence) against a suspicious key name paired with
 * a non-empty, non-templated value.
 */
export function scanKeyValueForSecret(key: string, value: string): SecretScanResult | null {
  const knownMatch = scanValueForSecret(value);
  if (knownMatch) return knownMatch;

  if (!value || looksLikeTemplate(value)) return null;
  if (value.trim().length < 8) return null;

  if (SUSPICIOUS_KEY_NAME.test(key)) {
    return { confidence: 'medium', reason: `"${key}" looks like it should hold a secret value` };
  }

  return null;
}

/** Scans an environment's non-secret-marked variables for likely secrets. */
export function scanEnvironmentForSecrets(environment: Environment): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const v of environment.variablesArray || []) {
    if (v.isSecret) continue;
    const result = scanKeyValueForSecret(v.key, v.value);
    if (result) findings.push({ location: `variable: ${v.key}`, ...result });
  }

  return findings;
}

/**
 * Scans a request's headers (which have no secret-marking mechanism at all)
 * and non-secret-marked form-data params for likely secrets.
 */
export function scanRequestForSecrets(request: ApiRequest): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const [key, value] of Object.entries(request.headers || {})) {
    const result = scanKeyValueForSecret(key, value);
    if (result) findings.push({ location: `header: ${key}`, ...result });
  }

  for (const param of request.body?.formData || []) {
    if (param.isSecret) continue;
    const result = scanKeyValueForSecret(param.key, param.value);
    if (result) findings.push({ location: `form field: ${param.key}`, ...result });
  }

  return findings;
}
