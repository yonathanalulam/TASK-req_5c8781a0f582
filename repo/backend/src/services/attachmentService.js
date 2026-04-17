const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const Attachment = require('../models/Attachment');
const { sha256OfBuffer } = require('../utils/crypto');
const env = require('../config/env');

const ALLOWED = {
  'image/jpeg': { ext: 'jpg', magic: [Buffer.from([0xFF, 0xD8, 0xFF])] },
  'image/png': { ext: 'png', magic: [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])] },
};

function detectContentType(declared, buf) {
  for (const [type, cfg] of Object.entries(ALLOWED)) {
    for (const m of cfg.magic) {
      if (buf.length >= m.length && buf.slice(0, m.length).equals(m)) return type;
    }
  }
  return null;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function storeAttachment({
  buffer, declaredContentType, originalFilename, maxSizeBytes, ownerType, ownerId, uploaderUserId, context,
}) {
  if (!buffer || !buffer.length) { const e = new Error('Empty file'); e.apiCode = 'VALIDATION_ERROR'; e.status = 422; throw e; }
  if (buffer.length > maxSizeBytes) { const e = new Error(`File exceeds max size of ${maxSizeBytes} bytes`); e.apiCode = 'VALIDATION_ERROR'; e.status = 422; throw e; }
  const sniffed = detectContentType(declaredContentType, buffer);
  if (!sniffed) { const e = new Error('Unsupported or mismatched file type'); e.apiCode = 'VALIDATION_ERROR'; e.status = 422; throw e; }
  if (declaredContentType && declaredContentType !== sniffed) {
    const e = new Error('Declared content type does not match file bytes'); e.apiCode = 'VALIDATION_ERROR'; e.status = 422; throw e;
  }
  const sha = sha256OfBuffer(buffer);
  const opaqueId = uuid();
  const ext = ALLOWED[sniffed].ext;
  const subdir = sha.slice(0, 2);
  const absDir = path.resolve(env.attachmentDir, subdir);
  ensureDir(absDir);
  const storagePath = path.join(absDir, `${opaqueId}.${ext}`);
  fs.writeFileSync(storagePath, buffer);
  const att = await Attachment.create({
    opaqueId,
    ownerType, ownerId, uploaderUserId,
    originalFilename: originalFilename ? path.basename(originalFilename).slice(0, 200) : null,
    contentType: sniffed,
    sizeBytes: buffer.length,
    sha256: sha,
    storagePath,
    context,
  });
  return att;
}

async function readAttachment(opaqueId) {
  const att = await Attachment.findOne({ opaqueId, active: true });
  if (!att) return null;
  if (!fs.existsSync(att.storagePath)) return null;
  const buf = fs.readFileSync(att.storagePath);
  return { att, buffer: buf };
}

async function verifyIntegrity(att) {
  if (!fs.existsSync(att.storagePath)) { att.verifiedStatus = 'missing'; att.verifiedAt = new Date(); await att.save(); return 'missing'; }
  const buf = fs.readFileSync(att.storagePath);
  const sha = sha256OfBuffer(buf);
  if (sha !== att.sha256) { att.verifiedStatus = 'corrupt'; att.verifiedAt = new Date(); await att.save(); return 'corrupt'; }
  att.verifiedStatus = 'ok'; att.verifiedAt = new Date(); await att.save(); return 'ok';
}

module.exports = { storeAttachment, readAttachment, verifyIntegrity, ALLOWED };
