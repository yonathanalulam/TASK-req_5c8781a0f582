const AuditLog = require('../models/AuditLog');
const { sha256Hex } = require('../utils/crypto');

const GENESIS_HASH = '0'.repeat(64);

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

async function getLastAudit() {
  return AuditLog.findOne({}).sort({ seq: -1 }).lean();
}

async function record(entry) {
  const last = await getLastAudit();
  const prevHash = last ? last.hash : GENESIS_HASH;
  const seq = last ? last.seq + 1 : 1;
  const timestamp = new Date();
  const payload = {
    seq,
    timestamp: timestamp.toISOString(),
    actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
    actorUsername: entry.actorUsername || null,
    action: entry.action,
    entityType: entry.entityType || null,
    entityId: entry.entityId ? String(entry.entityId) : null,
    outcome: entry.outcome || 'success',
    reason: entry.reason || null,
    ip: entry.ip || null,
    deviceDescriptor: entry.deviceDescriptor || null,
    diffSummary: entry.diffSummary || null,
    prevHash,
  };
  const hash = sha256Hex(prevHash + canonicalize(payload));
  await AuditLog.create({ ...payload, hash });
  return { seq, hash };
}

async function verifyChain({ limit = 0 } = {}) {
  const cursor = AuditLog.find({}).sort({ seq: 1 }).cursor();
  let prevHash = GENESIS_HASH;
  let checked = 0;
  let broken = null;
  for await (const doc of cursor) {
    const entry = doc.toObject();
    const payload = {
      seq: entry.seq,
      timestamp: entry.timestamp.toISOString(),
      actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
      actorUsername: entry.actorUsername || null,
      action: entry.action,
      entityType: entry.entityType || null,
      entityId: entry.entityId || null,
      outcome: entry.outcome,
      reason: entry.reason || null,
      ip: entry.ip || null,
      deviceDescriptor: entry.deviceDescriptor || null,
      diffSummary: entry.diffSummary || null,
      prevHash,
    };
    const expected = sha256Hex(prevHash + canonicalize(payload));
    if (expected !== entry.hash || entry.prevHash !== prevHash) {
      broken = { seq: entry.seq, expected, stored: entry.hash };
      break;
    }
    prevHash = entry.hash;
    checked++;
    if (limit && checked >= limit) break;
  }
  return { valid: !broken, checked, broken };
}

module.exports = { record, verifyChain, GENESIS_HASH };
