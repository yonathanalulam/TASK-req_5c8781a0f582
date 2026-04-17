const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv();

// ---- Secret validation ---------------------------------------------------
// Startup must fail loudly in production/non-test mode when required secrets
// are missing, default placeholders, or too weak to be safe. Test/dev can
// fall back to ephemeral random values, never to predictable defaults.
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_TEST = NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const IS_PROD = NODE_ENV === 'production';

const KNOWN_WEAK_JWT_SECRETS = new Set([
  'dev-insecure-change-me-dev-insecure-change-me-dev-insecure-change-me',
  'replace-me-with-long-random-string-at-least-64-chars-long-abc123',
  'changeme', 'secret', 'jwt-secret', 'dev', 'test',
]);
const KNOWN_WEAK_ENC_KEYS_HEX = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '00'.repeat(32),
  'ff'.repeat(32),
]);

function isStrongJwtSecret(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 32) return false;
  if (KNOWN_WEAK_JWT_SECRETS.has(s)) return false;
  // Require at least a modest mix of character classes so trivially repetitive
  // strings like "aaaaaaaaa..." still fail.
  const classes = [/[a-z]/, /[A-Z0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(s)).length;
  return classes >= 2;
}

function isStrongEncryptionKeyHex(hex) {
  if (typeof hex !== 'string') return false;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return false;
  if (hex.length !== 64) return false; // 32 bytes (AES-256)
  if (KNOWN_WEAK_ENC_KEYS_HEX.has(hex.toLowerCase())) return false;
  // Reject keys that are a single repeating byte.
  if (/^(..)\1+$/.test(hex.toLowerCase())) return false;
  return true;
}

function generateEphemeralSecret(bytes = 48) {
  return require('crypto').randomBytes(bytes).toString('hex');
}

function resolveJwtSecret() {
  const raw = process.env.JWT_SECRET;
  if (isStrongJwtSecret(raw)) return raw;
  if (IS_TEST) return raw && raw.length ? raw : generateEphemeralSecret(48);
  if (IS_PROD) {
    throw new Error('JWT_SECRET is missing, default, or too weak. Set a strong random secret of ≥32 chars before starting in production.');
  }
  // Development: warn but allow ephemeral random to keep local dev usable.
  // NEVER fall back to a predictable literal.
  // eslint-disable-next-line no-console
  console.warn('[env] JWT_SECRET is weak/unset; using ephemeral random secret for this dev process.');
  return generateEphemeralSecret(48);
}

function resolveEncryptionKeys() {
  const keys = {};
  for (const [k, v] of Object.entries(process.env)) {
    const m = k.match(/^ENCRYPTION_KEY_V(\d+)_HEX$/);
    if (m) {
      const version = parseInt(m[1], 10);
      if (!isStrongEncryptionKeyHex(v)) {
        if (IS_PROD) {
          throw new Error(`ENCRYPTION_KEY_V${version}_HEX is default/weak. Provide a 64-char hex (32 random bytes).`);
        }
        // In test/dev skip weak keys; we'll substitute an ephemeral one below.
        continue;
      }
      keys[version] = Buffer.from(v, 'hex');
    }
  }
  if (!keys[1]) {
    if (IS_PROD) {
      throw new Error('ENCRYPTION_KEY_V1_HEX is missing or weak. A strong 32-byte hex key is required.');
    }
    // Test/dev: ephemeral random key so encryption still works but nothing predictable is embedded.
    keys[1] = require('crypto').randomBytes(32);
  }
  return keys;
}

const env = {
  nodeEnv: NODE_ENV,
  isTest: IS_TEST,
  isProd: IS_PROD,
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/offline_ops_portal',
  jwtSecret: resolveJwtSecret(),
  sessionIdleMinutes: parseInt(process.env.SESSION_IDLE_MINUTES || '30', 10),
  sessionAbsoluteHours: parseInt(process.env.SESSION_ABSOLUTE_HOURS || '24', 10),
  argonMemoryKiB: parseInt(process.env.ARGON2_MEMORY_KIB || '19456', 10),
  argonIterations: parseInt(process.env.ARGON2_ITERATIONS || '2', 10),
  argonParallelism: parseInt(process.env.ARGON2_PARALLELISM || '1', 10),
  attachmentDir: process.env.ATTACHMENT_DIR || './storage/attachments',
  exportDir: process.env.EXPORT_DIR || './storage/exports',
  timezone: process.env.TIMEZONE || 'America/New_York',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  seedAdminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMeNow!2026',
  currentKeyVersion: parseInt(process.env.CURRENT_KEY_VERSION || '1', 10),
  encryptionKeys: resolveEncryptionKeys(),
};

module.exports = env;
module.exports.isStrongJwtSecret = isStrongJwtSecret;
module.exports.isStrongEncryptionKeyHex = isStrongEncryptionKeyHex;
