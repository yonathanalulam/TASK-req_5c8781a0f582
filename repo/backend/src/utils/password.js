let argon2;
try { argon2 = require('argon2'); } catch { argon2 = null; }
const crypto = require('crypto');
const env = require('../config/env');

// Fallback scrypt hashing if argon2 native module is unavailable (never for prod).
async function hashScrypt(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((resolve, reject) =>
    crypto.scrypt(plain, salt, 64, { N: 16384, r: 8, p: 1 }, (err, dk) => err ? reject(err) : resolve(dk))
  );
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function verifyScrypt(plain, stored) {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await new Promise((resolve, reject) =>
    crypto.scrypt(plain, salt, 64, { N: 16384, r: 8, p: 1 }, (err, dk) => err ? reject(err) : resolve(dk))
  );
  return crypto.timingSafeEqual(expected, actual);
}

async function hashPassword(plain) {
  if (argon2) {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: env.argonMemoryKiB,
      timeCost: env.argonIterations,
      parallelism: env.argonParallelism,
    });
  }
  return hashScrypt(plain);
}

async function verifyPassword(stored, plain) {
  if (!stored) return false;
  if (stored.startsWith('$argon2')) {
    if (!argon2) return false;
    try { return await argon2.verify(stored, plain); } catch { return false; }
  }
  if (stored.startsWith('scrypt$')) {
    return verifyScrypt(plain, stored);
  }
  return false;
}

module.exports = { hashPassword, verifyPassword };
