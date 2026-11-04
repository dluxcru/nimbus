const crypto = require('crypto');

const PROVIDERS = new Set(['google', 'wikimedia', 'pexels']);
const RIGHTS_STATES = new Set(['known', 'unknown']);

function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function assertPayload(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !PROVIDERS.has(value.provider) ||
    typeof value.providerAssetId !== 'string' ||
    typeof value.sourcePageUrl !== 'string' ||
    typeof value.imageUrl !== 'string' ||
    typeof value.title !== 'string' ||
    !RIGHTS_STATES.has(value.rightsState) ||
    !Number.isInteger(value.iat) ||
    !Number.isInteger(value.exp)
  ) {
    throw new Error('Invalid import token');
  }
  return value;
}

function createImportToken(
  payload,
  secret,
  ttlSeconds,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!secret) {
    throw new Error('Import token secret is not configured');
  }
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: nowSeconds, exp: nowSeconds + ttlSeconds }),
  ).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

function verifyImportToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof token !== 'string') {
    throw new Error('Invalid import token');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid import token');
  }
  const [body, suppliedSignature] = parts;
  const expectedSignature = sign(body, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid import token');
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid import token');
  }
  const payload = assertPayload(decoded);
  if (payload.exp < nowSeconds) {
    throw new Error('Import token expired');
  }
  return payload;
}

module.exports = { createImportToken, verifyImportToken };
