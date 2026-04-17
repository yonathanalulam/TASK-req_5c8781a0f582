const ServiceHistory = require('../models/ServiceHistory');
const CustodyEvent = require('../models/CustodyEvent');
const ServiceRequest = require('../models/ServiceRequest');

const COMPLETION_STATES = new Set(['delivered', 'picked_up', 'closed']);

// Materialize a ServiceHistory entry from the authoritative lifecycle signals on a
// ShoeProfile. Idempotent: subsequent calls for the same shoe+outcome update rather
// than duplicate.
async function recordCompletion(shoeProfile, { outcome } = {}) {
  if (!shoeProfile) return null;
  const finalOutcome = outcome || shoeProfile.status;
  if (!COMPLETION_STATES.has(finalOutcome)) return null;

  const [events, requests] = await Promise.all([
    CustodyEvent.find({ shoeProfileId: shoeProfile._id }).sort({ timestamp: 1 }).lean(),
    ServiceRequest.find({ shoeProfileId: shoeProfile._id }).lean(),
  ]);
  const serviceCodes = [];
  for (const sr of requests) for (const c of (sr.serviceCodes || [])) {
    if (!serviceCodes.includes(c)) serviceCodes.push(c);
  }
  const intakeCompletedAt = shoeProfile.intakeCompletedAt
    || (events.find(e => e.toState === 'intake_completed') || {}).timestamp
    || shoeProfile.createdAt;
  const completedAt = shoeProfile.completedAt || new Date();
  const summary = `${shoeProfile.brand || ''} ${shoeProfile.color || ''} size ${shoeProfile.size || ''} — ${finalOutcome}`.trim();

  const payload = {
    shoeProfileId: shoeProfile._id,
    barcode: shoeProfile.barcode,
    serial: shoeProfile.serial,
    ownerUserId: shoeProfile.ownerUserId,
    summary,
    serviceCodes,
    outcome: finalOutcome,
    intakeCompletedAt,
    completedAt,
    totalDurationMs: intakeCompletedAt ? (new Date(completedAt).getTime() - new Date(intakeCompletedAt).getTime()) : null,
  };
  const existing = await ServiceHistory.findOne({ shoeProfileId: shoeProfile._id, outcome: finalOutcome });
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }
  return ServiceHistory.create(payload);
}

async function findForShoe(shoeProfileId) {
  return ServiceHistory.find({ shoeProfileId }).sort({ completedAt: 1, createdAt: 1 }).lean();
}

async function findForOwner(ownerUserId) {
  return ServiceHistory.find({ ownerUserId }).sort({ completedAt: -1 }).lean();
}

module.exports = { recordCompletion, findForShoe, findForOwner, COMPLETION_STATES };
