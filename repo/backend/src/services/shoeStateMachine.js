const TRANSITIONS = {
  intake_draft: ['intake_completed','cancelled'],
  intake_completed: ['in_service_queue','exception_hold'],
  in_service_queue: ['in_service','exception_hold'],
  in_service: ['quality_check','exception_hold'],
  quality_check: ['ready_for_delivery','rework_required','exception_hold'],
  rework_required: ['in_service','exception_hold'],
  ready_for_delivery: ['shipping_prepared','picked_up','exception_hold'],
  shipping_prepared: ['in_transit','exception_hold'],
  in_transit: ['delivered','delivery_exception'],
  delivery_exception: ['shipping_prepared','returned_to_office','closed_exception'],
  picked_up: ['closed'],
  delivered: ['closed'],
  returned_to_office: ['shipping_prepared','closed_exception'],
  exception_hold: ['closed_exception'], // plus "previous operational state" restored by clearHold
  closed: [],
  cancelled: [],
  closed_exception: [],
};

function canTransition(from, to, { viaHoldClear = false, restoredFrom = null } = {}) {
  if (!(from in TRANSITIONS)) return false;
  if (viaHoldClear && from === 'exception_hold' && restoredFrom && restoredFrom in TRANSITIONS) return true;
  return TRANSITIONS[from].includes(to);
}

module.exports = { TRANSITIONS, canTransition };
