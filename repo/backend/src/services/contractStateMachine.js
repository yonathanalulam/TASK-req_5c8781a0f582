const TRANSITIONS = {
  draft: ['active','voided'],
  active: ['amended','pending_renewal','terminated','expired'],
  amended: ['active'],
  pending_renewal: ['renewed','expired','terminated'],
  renewed: ['active'],
  terminated: ['reconciliation_pending','closed'],
  reconciliation_pending: ['closed','reconciliation_overdue'],
  reconciliation_overdue: ['closed'],
  expired: ['reconciliation_pending','closed'],
  closed: [],
  voided: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { TRANSITIONS, canTransition };
