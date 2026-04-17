const TRANSITIONS = {
  draft: ['queued_offline','ready_to_ship','cancelled'],
  queued_offline: ['ready_to_ship','cancelled','sync_failed'],
  sync_failed: ['queued_offline','cancelled'],
  ready_to_ship: ['in_transit','cancelled'],
  in_transit: ['delivered','delivery_failed'],
  delivery_failed: ['exception_pending_signoff','ready_to_ship','returned'],
  exception_pending_signoff: ['returned','ready_to_ship','closed_exception'],
  returned: ['ready_to_ship','closed_exception'],
  delivered: ['closed'],
  closed_exception: ['closed'],
  cancelled: [],
  closed: [],
};
function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }
module.exports = { TRANSITIONS, canTransition };
