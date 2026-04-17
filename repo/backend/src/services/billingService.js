// Pure calculators for billing rule types. Inputs in cents; outputs in cents.

function calcFixed(rule, { dueDate } = {}) {
  return { amountCents: rule.fixedAmountCents || 0, dueDate };
}

function calcTiered(rule, { basisCents }) {
  if (basisCents == null) throw apiError('VALIDATION_ERROR', 'basisCents required for tiered calc', null, 422);
  const tiers = [...(rule.tiers || [])].sort((a, b) => a.minBasisCents - b.minBasisCents);
  validateTiers(tiers);
  for (const t of tiers) {
    const min = t.minBasisCents;
    const max = t.maxBasisCents == null ? Infinity : t.maxBasisCents;
    if (basisCents >= min && basisCents <= max) {
      return { amountCents: t.amountCents, matchedTier: t };
    }
  }
  throw apiError('VALIDATION_ERROR', 'basisCents outside all tiers', null, 422);
}

function validateTiers(tiers) {
  for (let i = 0; i < tiers.length - 1; i++) {
    const cur = tiers[i], nxt = tiers[i + 1];
    if (cur.maxBasisCents == null || cur.maxBasisCents < cur.minBasisCents)
      throw apiError('VALIDATION_ERROR', 'invalid tier range', null, 422);
    if (nxt.minBasisCents <= cur.maxBasisCents)
      throw apiError('VALIDATION_ERROR', 'overlapping tier ranges', null, 422);
    if (nxt.minBasisCents !== cur.maxBasisCents + 1)
      throw apiError('VALIDATION_ERROR', 'tier ranges must be contiguous', null, 422);
  }
  if (tiers.length > 0) {
    const last = tiers[tiers.length - 1];
    if (last.maxBasisCents != null && last.maxBasisCents < last.minBasisCents)
      throw apiError('VALIDATION_ERROR', 'invalid top tier', null, 422);
  }
}

function calcRevenueShare(rule, { grossRevenueCents, provisionalAmountsAlreadyBilledCents = 0 }) {
  if (grossRevenueCents == null) throw apiError('VALIDATION_ERROR', 'grossRevenueCents required', null, 422);
  if (rule.revenueShareRate == null || rule.revenueShareRate < 0 || rule.revenueShareRate > 1)
    throw apiError('VALIDATION_ERROR', 'revenueShareRate must be within [0,1]', null, 422);
  const raw = Math.round(grossRevenueCents * rule.revenueShareRate) - provisionalAmountsAlreadyBilledCents;
  const trueUp = rule.allowNegativeTrueUpAsCredit ? raw : Math.max(0, raw);
  return { amountCents: trueUp, rawCents: raw };
}

function compute(rule, input) {
  switch (rule.ruleType) {
    case 'fixed': return calcFixed(rule, input);
    case 'tiered': return calcTiered(rule, input);
    case 'revenue_share': return calcRevenueShare(rule, input);
    default: throw apiError('VALIDATION_ERROR', 'Unknown ruleType', null, 422);
  }
}

function apiError(code, message, details, status) {
  const e = new Error(message); e.apiCode = code; e.status = status; e.details = details; return e;
}

module.exports = { compute, calcFixed, calcTiered, calcRevenueShare, validateTiers };
