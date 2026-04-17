const crypto = require('crypto');
const env = require('../config/env');

function getKey(version) {
  const k = env.encryptionKeys[version];
  if (!k) throw new Error(`Encryption key v${version} not configured`);
  if (k.length !== 32) throw new Error(`Encryption key v${version} must be 32 bytes`);
  return k;
}

function encryptField(plaintext) {
  if (plaintext == null) return null;
  const version = env.currentKeyVersion;
  const key = getKey(version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: version,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptField(blob) {
  if (!blob) return null;
  const key = getKey(blob.v);
  const iv = Buffer.from(blob.iv, 'base64');
  const ct = Buffer.from(blob.ct, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { encryptField, decryptField, sha256Hex, sha256OfBuffer, randomToken };
